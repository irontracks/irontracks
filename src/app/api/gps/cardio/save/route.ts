import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { respondDbError } from '@/utils/api/dbError'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const routePointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  ts: z.number(),
  alt: z.number().nullable().optional(),
})

const VALID_ACTIVITY_TYPES = ['running', 'walking', 'cycling', 'swimming', 'other'] as const

const saveTrackSchema = z.object({
  workout_id: z.string().uuid().nullable().optional(),
  activity_type: z.enum(VALID_ACTIVITY_TYPES).default('running'),
  distance_meters: z.number().min(0).max(500_000), // max 500km
  duration_seconds: z.number().int().min(0).max(86_400), // max 24h
  avg_pace_min_km: z.number().nullable().optional(),
  max_speed_kmh: z.number().nullable().optional(),
  calories_estimated: z.number().int().min(0).max(50_000).optional(),
  // Frequência cardíaca: hoje só o Apple Watch mede (HKLiveWorkoutBuilder).
  // Faixa igual à do CHECK no banco — número fora dela é erro de leitura, não
  // um coração humano.
  avg_heart_rate: z.number().int().min(20).max(260).nullable().optional(),
  max_heart_rate: z.number().int().min(20).max(260).nullable().optional(),
  /** Quem mediu a sessão. Ausente = iPhone, que é o caminho histórico. */
  source: z.enum(['iphone', 'apple-watch']).nullable().optional(),
  route: z.array(routePointSchema).max(10_000), // max 10k points
  started_at: z.string().datetime(),
  finished_at: z.string().datetime(),
  /**
   * D-2 (auditoria Watch, 02/09/2026): chave de idempotência do lado cliente.
   * O cardio do Apple Watch pode chegar ao iPhone por DOIS transportes
   * (sendMessage + o reply dele) e, se o reply falhar depois de o
   * sendMessage já ter sido processado, o mesmo cardio seria salvo duas
   * vezes. `WatchSyncProvider` deriva essa chave do CONTEÚDO do resumo
   * (`buildCardioIdempotencyKey`), então os dois transportes mandam a
   * MESMA chave para o MESMO cardio.
   */
  client_id: z.string().trim().min(1).max(64).nullable().optional(),
})

// POST /api/gps/cardio/save — save a cardio track
export async function POST(req: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  // Rate limit — como as rotas irmãs de GPS. Cada save pode ter até 10k pontos
  // (JSONB); sem teto seria abuso de storage/DB.
  const ip = getRequestIp(req)
  const rl = await checkRateLimitAsync(`gps:cardio:save:${auth.user.id}:${ip}`, 20, 60_000)
  if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

  const body = await req.json().catch(() => null)
  const parsed = saveTrackSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })

  const d = parsed.data
  const cid = d.client_id ? d.client_id.trim() : null

  const baseInsert = {
    user_id: auth.user.id,
    workout_id: d.workout_id || null,
    activity_type: d.activity_type,
    distance_meters: d.distance_meters,
    duration_seconds: d.duration_seconds,
    avg_pace_min_km: d.avg_pace_min_km ?? null,
    max_speed_kmh: d.max_speed_kmh ?? null,
    calories_estimated: d.calories_estimated ?? 0,
    route: d.route,
    avg_heart_rate: d.avg_heart_rate ?? null,
    max_heart_rate: d.max_heart_rate ?? null,
    // Ausente = iPhone: é o caminho que existia antes do Watch e continua
    // sendo o de todo mundo que não tem relógio.
    source: d.source ?? 'iphone',
    started_at: d.started_at,
    finished_at: d.finished_at,
  }

  const SELECT_COLS = 'id, distance_meters, duration_seconds, avg_pace_min_km, calories_estimated, avg_heart_rate, max_heart_rate, source, created_at'

  const tryInsert = (withClientId: boolean) => {
    const payload = withClientId && cid ? { ...baseInsert, client_id: cid } : baseInsert
    return auth.supabase.from('cardio_tracks').insert(payload).select(SELECT_COLS).single()
  }

  let { data, error } = await tryInsert(true)

  if (error && cid) {
    const code = String((error as { code?: string })?.code ?? '')
    const msg = String(error.message || '')

    if (code === '23505') {
      // D-2: unique_violation em (user_id, client_id) — o MESMO cardio já foi
      // salvo (reenvio pelo outro transporte, ou retry da fila offline).
      // Busca a linha existente e devolve como sucesso idempotente, sem
      // duplicar a corrida no histórico.
      const { data: existing } = await auth.supabase
        .from('cardio_tracks')
        .select(SELECT_COLS)
        .eq('user_id', auth.user.id)
        .eq('client_id', cid)
        .maybeSingle()
      if (existing) {
        return NextResponse.json({ ok: true, track: existing, idempotent: true })
      }
    } else if (msg.toLowerCase().includes('client_id') && msg.toLowerCase().includes('does not exist')) {
      // Coluna de idempotência ainda não existe neste ambiente (migration
      // pendente — ver docs/CLAUDE.md, auditoria do Watch 02/09/2026).
      // Reinsere SEM a chave pra não travar o save do cardio, mas isso
      // DESLIGA a proteção contra duplicata: loga alto pra não passar
      // despercebido.
      logError(
        'api:gps:cardio:save:MISSING_CLIENT_ID_COLUMN',
        new Error('cardio_tracks.client_id ausente — idempotência do Watch DESLIGADA. Aplique a migration.'),
      )
      const retry = await tryInsert(false)
      data = retry.data
      error = retry.error
    }
  }

  if (error) return respondDbError('gps:cardio:save', error)
  return NextResponse.json({ ok: true, track: data })
}

// GET /api/gps/cardio/save — list cardio history
export async function GET(req: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const limit = Math.min(Number(searchParams.get('limit')) || 20, 50)

  const { data, error } = await auth.supabase
    .from('cardio_tracks')
    .select('id, workout_id, distance_meters, duration_seconds, avg_pace_min_km, max_speed_kmh, calories_estimated, avg_heart_rate, max_heart_rate, source, started_at, finished_at, created_at')
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return respondDbError('gps:cardio:list', error)
  return NextResponse.json({ ok: true, tracks: data })
}

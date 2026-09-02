import { NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { createAdminClient } from '@/utils/supabase/admin'
import { respondDbError } from '@/utils/api/dbError'
import { respondInternalError } from '@/utils/api/internalError'

export const dynamic = 'force-dynamic'

/* ──────────────────────────────────────────────────────────
 * GET /api/workouts/set-media/list?workoutId=…
 *
 * As mídias de um treino, com URL assinada (1 h) e a resposta da IA. Lê quem
 * pode ler o treino: o dono e o professor do dono (mesma regra da RLS da
 * tabela). O relatório e o painel do professor consomem daqui.
 * ────────────────────────────────────────────────────────── */

const SIGNED_URL_TTL_S = 60 * 60

export async function GET(req: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response
  const requesterId = String(auth.user.id)
  const ip = getRequestIp(req)
  const rl = await checkRateLimitAsync(`set-media:list:${requesterId}:${ip}`, 60, 60_000)
  if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
  try {
    const url = new URL(req.url)
    const workoutId = String(url.searchParams.get('workoutId') || '').trim()
    if (!/^[0-9a-f-]{36}$/i.test(workoutId)) return NextResponse.json({ ok: true, items: [] })

    const admin = createAdminClient()
    const { data: w } = await admin.from('workouts').select('id, user_id').eq('id', workoutId).maybeSingle()
    if (!w) return NextResponse.json({ ok: true, items: [] })
    const ownerId = String(w.user_id)
    if (ownerId !== requesterId) {
      const { data: s } = await admin.from('students').select('id').eq('user_id', ownerId).eq('teacher_id', requesterId).maybeSingle()
      if (!s) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    const { data: rows, error } = await admin
      .from('workout_set_media')
      .select('id, exercise_index, set_index, exercise_name, kind, bucket_id, object_path, mime_type, question, ai_status, ai_answer, ai_error, analyzed_at, created_at')
      .eq('workout_id', workoutId)
      .order('exercise_index', { ascending: true })
      .order('set_index', { ascending: true })
      .limit(60)
    if (error) return respondDbError('api:workouts:set-media:list', error)

    const items = await Promise.all((Array.isArray(rows) ? rows : []).map(async (r) => {
      const { data: signed } = await admin.storage.from(String(r.bucket_id)).createSignedUrl(String(r.object_path), SIGNED_URL_TTL_S)
      return {
        id: r.id,
        exerciseIndex: r.exercise_index,
        setIndex: r.set_index,
        exerciseName: r.exercise_name,
        kind: r.kind,
        mime: r.mime_type,
        question: r.question,
        aiStatus: r.ai_status,
        aiAnswer: r.ai_answer,
        aiError: r.ai_error,
        analyzedAt: r.analyzed_at,
        createdAt: r.created_at,
        url: signed?.signedUrl || null,
      }
    }))
    return NextResponse.json({ ok: true, items }, { headers: { 'cache-control': 'no-store, max-age=0' } })
  } catch (e: unknown) {
    return respondInternalError('api:workouts:set-media:list', e)
  }
}

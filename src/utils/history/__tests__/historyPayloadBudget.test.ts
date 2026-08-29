/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ORÇAMENTO DE PAYLOAD — GET /api/workouts/history (rota quente do boot)
 *
 * Contexto: até ago/2026 a lista de histórico baixava `workouts.notes` (a sessão
 * INTEIRA — todas as séries, pesos, RPE, check-ins) para 50-200 treinos só para
 * exibir nome/data/duração/volume. Era o maior payload do app em 4G. O PR #618
 * emagreceu a linha (`buildSlimHistoryRow`), e `slimHistoryRow.test.ts` trava a
 * função. Este arquivo trava o NÍVEL ACIMA: o payload que a ROTA devolve.
 *
 * Por que precisa dos dois: a função pode continuar magra e a rota engordar de
 * novo — basta alguém acrescentar uma coluna no `select(...)`, espalhar a linha
 * crua (`{ ...w, ...slim }`) ou voltar a mandar `notes` "só pra um caso". O guard
 * da função não vê nada disso; este vê.
 *
 * Invariantes travadas (fixtures realistas de 50 sessões, `hotRoutePayloads.ts`):
 *  1. Teto de bytes POR ITEM de treino no payload (~400 B) — média E pior caso.
 *  2. Teto independe do tamanho da sessão: 12 exercícios × 6 séries (72 logs)
 *     cabe no mesmo orçamento que 6 × 4.
 *  3. Nenhuma linha carrega `notes`, `logs`, `exercises` ou `setDetails`.
 *  4. Allowlist de chaves: campo novo na linha só entra com revisão consciente
 *     (o teste vermelho é o pedido de revisão).
 *  5. Source-guard do SELECT: coluna nova na query do histórico quebra o teste —
 *     é por ali que o payload engorda sem ninguém notar.
 *
 * Abordagem: teste COMPORTAMENTAL do handler `GET` com I/O mockado (Supabase
 * encadeável no estilo `authRole.test.ts` / `finishIdempotency.test.ts`) + um
 * source-guard no estilo `appSubscriptionExpiry.test.ts`.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildSlimHistoryRow } from '@/utils/history/slimHistoryRow'
import { makeHistoryDbRow, makeCardioDbRow } from '@/__tests__/fixtures/hotRoutePayloads'

vi.mock('next/server', () => ({
    NextResponse: {
        json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
            __body: body,
            status: init?.status ?? 200,
            headers: init?.headers,
        }),
    },
}))

vi.mock('@/utils/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/utils/cache', () => ({
    cacheGet: vi.fn(async () => null),
    cacheSet: vi.fn(async () => undefined),
}))
vi.mock('@/utils/vip/limits', () => ({
    getVipPlanLimits: vi.fn(async () => ({ limits: { history_days: null }, tier: 'elite' })),
}))
vi.mock('@/utils/zod', () => ({
    parseSearchParams: vi.fn(() => ({ data: { limit: 50 }, response: null })),
}))
vi.mock('@/utils/api/dbError', () => ({
    respondDbError: vi.fn(() => ({ __body: { ok: false, error: 'db_error' }, status: 500 })),
}))

// ─── Orçamento ───────────────────────────────────────────────────────────────
/**
 * Teto por linha de treino no payload da lista.
 *
 * Medido com as fixtures realistas: 403 B/linha (2 UUIDs de 36 ch, 4 timestamps
 * ISO, nome + título do treino). O teto de 450 dá ~12% de folga — cabe um título
 * mais longo, NÃO cabe um campo novo (o mais barato dos que sobraram, `has_ai`,
 * custa 12 B; um `notes` de sessão custa ~7 KB).
 */
const BYTES_POR_TREINO = 450
const N_SESSOES = 50

/**
 * Chaves que uma linha de TREINO pode ter (espelha `SlimHistoryRow`).
 *
 * `done_sets` entrou em 28/08/2026 por decisão consciente — que é exatamente o
 * que este guard existe para forçar. Motivo: sem ele, a lista contava LINHAS, e
 * uma sessão de 44 s aparecia como treino no resumo que o usuário lê enquanto o
 * push da semana usava o piso de `countsAsWorkout` e mostrava outro número. A
 * alternativa era rebaixar o resumo ou rebaixar o payload (voltar a trazer o
 * `notes`); um inteiro por linha é a conta mais barata das três.
 */
const CHAVES_TREINO = new Set([
    'id', 'name', 'user_id', 'date', 'created_at', 'completed_at', 'is_template',
    'workout_title', 'total_time', 'volume_kg', 'ex_count', 'session_date', 'has_ai',
    'done_sets',
])

/** Chaves que uma linha de CARDIO pode ter (shape montado na própria rota). */
const CHAVES_CARDIO = new Set([
    'id', 'kind', 'name', 'date', 'completed_at', 'created_at', 'is_template',
    'activity_type', 'distance_meters', 'duration_seconds', 'avg_pace_min_km',
    'calories_estimated', 'cardio_notes', 'perceived_effort',
])

/** Campos pesados: se aparecerem no payload, a lista voltou a baixar a sessão. */
const CAMPOS_PROIBIDOS = ['notes', 'logs', 'exercises', 'setDetails', 'reportMeta', 'preCheckin', 'postCheckin']

// ─── Supabase encadeável ─────────────────────────────────────────────────────
type Rec = Record<string, unknown>

function makeSupabase(rowsByTable: Record<string, Rec[]>) {
    const from = vi.fn((table: string) => {
        const chain: Rec = {}
        for (const m of ['select', 'eq', 'is', 'gte', 'lte', 'order', 'limit']) {
            chain[m] = vi.fn(() => chain)
        }
        chain.then = (onF: (v: { data: Rec[]; error: null }) => unknown, onR?: (e: unknown) => unknown) =>
            Promise.resolve({ data: rowsByTable[table] ?? [], error: null }).then(onF, onR)
        return chain
    })
    return {
        from,
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1', email: 'a@b.com' } } })) },
    }
}

async function callGet(rowsByTable: Record<string, Rec[]>) {
    const { createClient } = await import('@/utils/supabase/server')
    vi.mocked(createClient).mockResolvedValue(makeSupabase(rowsByTable) as never)
    const { GET } = await import('@/app/api/workouts/history/route')
    const req = { url: 'https://irontracks.com.br/api/workouts/history?limit=50' } as unknown as Request
    return (await GET(req)) as unknown as { __body: { rows: Rec[]; ok: boolean }; status: number }
}

const sessoes = Array.from({ length: N_SESSOES }, (_, i) => makeHistoryDbRow(i))
const cardios = Array.from({ length: 5 }, (_, i) => makeCardioDbRow(i))

beforeEach(() => {
    vi.clearAllMocks()
})

describe('payload do histórico — orçamento por item', () => {
    it(`${N_SESSOES} sessões reais: média por linha de treino abaixo de ${BYTES_POR_TREINO} B`, async () => {
        const res = await callGet({ workouts: sessoes, cardio_tracks: cardios })

        const treinos = res.__body.rows.filter((r) => r.kind !== 'cardio')
        expect(treinos).toHaveLength(N_SESSOES)

        const media = JSON.stringify(treinos).length / treinos.length
        expect(media).toBeLessThan(BYTES_POR_TREINO)
    })

    it('nenhuma linha isolada estoura o teto (pior caso, não só a média)', async () => {
        const res = await callGet({ workouts: sessoes, cardio_tracks: [] })

        const maior = Math.max(...res.__body.rows.map((r) => JSON.stringify(r).length))
        expect(maior).toBeLessThan(BYTES_POR_TREINO)
    })

    it('sessão gigante (12 exercícios × 6 séries) cabe no MESMO orçamento', async () => {
        const gigantes = Array.from({ length: 10 }, (_, i) =>
            makeHistoryDbRow(i, { exercises: 12, setsPerExercise: 6 }))

        const res = await callGet({ workouts: gigantes, cardio_tracks: [] })

        const maior = Math.max(...res.__body.rows.map((r) => JSON.stringify(r).length))
        expect(maior).toBeLessThan(BYTES_POR_TREINO)
        // e o volume continua sendo calculado (o resumo não virou casca vazia)
        expect(res.__body.rows.every((r) => Number(r.volume_kg) > 0)).toBe(true)
    })

    it('o payload magro é uma fração do que as linhas cruas custariam', async () => {
        const res = await callGet({ workouts: sessoes, cardio_tracks: [] })

        const magro = JSON.stringify(res.__body.rows).length
        const cru = JSON.stringify(sessoes).length
        // Hoje ~1,5%. Teto folgado: qualquer volta do `notes` estoura isso.
        expect(magro / cru).toBeLessThan(0.05)
    })
})

describe('payload do histórico — shape fechado', () => {
    it('não vaza notes/logs/exercises em nenhuma linha', async () => {
        const res = await callGet({ workouts: sessoes, cardio_tracks: cardios })

        // As barras saem antes da busca: a sessão vive como STRING JSON em
        // `notes`, então uma regressão que a repasse traz as aspas ESCAPADAS
        // (`\"logs\"`) — a busca ingênua por `"logs"` passaria por cima dela.
        const serializado = JSON.stringify(res.__body.rows).replace(/\\/g, '')
        for (const proibido of CAMPOS_PROIBIDOS) {
            expect(serializado).not.toContain(`"${proibido}"`)
        }
    })

    it('linhas de treino só têm as chaves da linha magra', async () => {
        const res = await callGet({ workouts: sessoes, cardio_tracks: [] })

        const inesperadas = new Set<string>()
        for (const row of res.__body.rows) {
            for (const k of Object.keys(row)) if (!CHAVES_TREINO.has(k)) inesperadas.add(k)
        }
        expect([...inesperadas]).toEqual([])
    })

    it('linhas de cardio só têm as chaves do resumo de cardio', async () => {
        const res = await callGet({ workouts: [], cardio_tracks: cardios })

        const inesperadas = new Set<string>()
        for (const row of res.__body.rows) {
            for (const k of Object.keys(row)) if (!CHAVES_CARDIO.has(k)) inesperadas.add(k)
        }
        expect([...inesperadas]).toEqual([])
    })

    it('o topo do payload não ganha campo novo', async () => {
        const res = await callGet({ workouts: sessoes, cardio_tracks: cardios })

        expect(Object.keys(res.__body).sort()).toEqual(['history_days', 'ok', 'rows', 'tier'])
    })
})

describe('orçamento independe da rota — a função magra sozinha', () => {
    it('cada linha construída direto da fixture respeita o teto', () => {
        for (let i = 0; i < N_SESSOES; i++) {
            const slim = buildSlimHistoryRow(makeHistoryDbRow(i))
            expect(JSON.stringify(slim).length).toBeLessThan(BYTES_POR_TREINO)
        }
    })
})

describe('source-guard: o SELECT do histórico não pode engordar', () => {
    const rota = readFileSync(join(process.cwd(), 'src/app/api/workouts/history/route.ts'), 'utf8')

    /** Colunas pedidas hoje ao `workouts` — coluna nova aqui vaza no payload. */
    const COLUNAS_WORKOUTS = [
        'id', 'name', 'user_id', 'date', 'created_at', 'completed_at', 'notes', 'is_template',
    ]

    it('a query de workouts pede exatamente as colunas conhecidas', () => {
        const selects = [...rota.matchAll(/\.select\(\s*'([^']+)'\s*\)/g)].map((m) => m[1])
        const doWorkouts = selects.find((s) => s.includes('completed_at') && s.includes('is_template'))
        expect(doWorkouts).toBeTruthy()

        const colunas = (doWorkouts as string).split(',').map((c) => c.trim()).sort()
        expect(colunas).toEqual([...COLUNAS_WORKOUTS].sort())
    })

    it('`notes` desce do banco mas NÃO é repassado — vai só pro resumo', () => {
        // A coluna é necessária (o resumo sai dela); o que não pode é a linha crua
        // ser espalhada no payload. O mapeamento tem que passar por buildSlimHistoryRow.
        expect(rota).toContain('buildSlimHistoryRow')
        expect(rota).not.toMatch(/rows:\s*\(workoutsResult\.data/)
        expect(rota).not.toMatch(/\.\.\.w\s*,/)
    })

    it('cache key versionada — payload antigo (com notes) não pode ser servido', () => {
        expect(rota).toContain('workouts:history:v2:')
    })
})

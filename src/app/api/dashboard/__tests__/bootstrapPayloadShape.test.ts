/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SHAPE E ORÇAMENTO DO PAYLOAD — GET /api/dashboard/bootstrap (rota do boot)
 *
 * É o primeiro fetch do dashboard: perfil + treinos com exercícios e séries
 * inline. Tudo que entra aqui é pago por TODO usuário em TODO cold start — foi
 * por isso que o histórico emagreceu (PR #618) e é por isso que este payload
 * precisa de um gate: campo pesado novo aqui não aparece em nenhum gráfico de
 * erro, só numa fatura de tempo de boot.
 *
 * A rota tem DOIS caminhos que produzem o mesmo payload:
 *   1. RPC `get_dashboard_bootstrap` (SQL, jsonb_build_object) — caminho normal;
 *   2. fallback em TS (SELECT + hidratação) quando a RPC não existe.
 * O guard cobre os dois, cada um pela ferramenta certa:
 *   - comportamental (Supabase encadeável) no fallback e no repasse da RPC;
 *   - source-guard nos `select(...)` da rota E nas chaves do `jsonb_build_object`
 *     da migration mais recente da RPC — porque o TS não tem como ver o SQL.
 *
 * Invariantes travadas:
 *  1. Topo do payload = { ok, user, profile, workouts } e nada além disso.
 *  2. Allowlist de chaves em workout / exercise / set (nos DOIS caminhos).
 *  3. Nenhum JSON de sessão logada (`logs`, `setDetails`, `reportMeta`) desce
 *     junto — o bootstrap serve o PLANO, não o histórico.
 *  4. Teto de bytes por template hidratado (6 exercícios × 4 séries).
 *  5. Ratchet do pior caso conhecido (usuário sem template — ver comentário no
 *     próprio teste): trava o custo de hoje para que ninguém o aumente.
 *  6. Source-guards: colunas dos SELECT e chaves da RPC são conjuntos fechados.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
    PROFILE_ROW,
    makeTemplateDbRow,
    makeTemplateExerciseRows,
    makeTemplateSetRows,
    makeHistoryDbRow,
} from '@/__tests__/fixtures/hotRoutePayloads'

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
vi.mock('@/lib/logger', () => ({
    logWarn: vi.fn(), logError: vi.fn(), logInfo: vi.fn(), logDebug: vi.fn(),
}))
vi.mock('@vercel/functions', () => ({ waitUntil: vi.fn() }))
vi.mock('@/utils/vip/trial', () => ({ maybeGrantTrial: vi.fn(async () => undefined) }))
vi.mock('@/utils/api', () => ({
    errorResponse: vi.fn((e: unknown) => ({ __body: { ok: false, error: String(e) }, status: 500 })),
}))
vi.mock('@/utils/safePgFilter', () => ({ safePg: (v: string) => v }))

// ─── Allowlists ──────────────────────────────────────────────────────────────
// União do que os DOIS caminhos produzem (a RPC devolve `date`/`muscle_group`/
// `completed` a mais; o fallback devolve o embed `exercises` dentro de cada set).
const CHAVES_TOPO = ['ok', 'profile', 'user', 'workouts']

const CHAVES_WORKOUT = new Set([
    'id', 'name', 'notes', 'is_template', 'user_id', 'created_by', 'archived_at',
    'sort_order', 'created_at', 'student_id', 'date', 'exercises',
])

const CHAVES_EXERCICIO = new Set([
    'id', 'workout_id', 'name', 'muscle_group', 'notes', 'video_url', 'rest_time',
    'cadence', 'method', 'order', 'is_unilateral', 'side_rest_time',
    'transition_time', 'sets',
    // ⚠️ `is_alternating` JÁ estava na RPC viva e nunca esteve aqui: o guard lia
    // a migration de 20260703, que ficou atrás do banco. Só apareceu em
    // 01/09/2026, quando a RPC foi reescrita a partir da definição real.
    'is_alternating',
])

const CHAVES_SERIE = new Set([
    'id', 'exercise_id', 'set_number', 'reps', 'rpe', 'weight', 'completed',
    'is_warmup', 'advanced_config', 'exercises',
    // Método salvo para ESTA série ("Salvar no plano" do seletor, 01/09/2026).
    // Decisão consciente de campo novo em rota quente — e ele não custa bytes na
    // série comum: a RPC só o emite quando NÃO é nulo (concatenação condicional,
    // ver a migration), então o payload de quem nunca usou o seletor é byte a
    // byte o de antes.
    'per_set_method',
])

/** Marcadores de sessão logada — o bootstrap serve plano, não histórico. */
const MARCADORES_DE_SESSAO = ['"logs"', '"setDetails"', '"reportMeta"', '"preCheckin"', '"postCheckin"', '"workoutTitle"']

/**
 * Teto por template hidratado (6 exercícios × 4 séries, cada série com todos os
 * campos). Medido hoje: 8,3 KB — 20 templates = ~166 KB no cold start. O teto de
 * 9,5 KB dá folga para um exercício a mais, e NÃO cabe um campo novo em todas as
 * séries (24 séries × ~20 B já comem metade da folga).
 */
const BYTES_POR_TEMPLATE = 9_500

// ─── Supabase encadeável ─────────────────────────────────────────────────────
type Rec = Record<string, unknown>

function makeSupabase(cfg: {
    rpc?: { data: unknown; error: unknown }
    rows?: Record<string, Rec[]>
    single?: Record<string, Rec | null>
}) {
    const rows = cfg.rows ?? {}
    const from = vi.fn((table: string) => {
        const chain: Rec = {}
        for (const m of ['select', 'eq', 'or', 'in', 'is', 'order', 'limit']) {
            chain[m] = vi.fn(() => chain)
        }
        chain.maybeSingle = vi.fn(async () => ({ data: cfg.single?.[table] ?? null, error: null }))
        chain.single = chain.maybeSingle
        chain.then = (onF: (v: { data: Rec[]; error: null }) => unknown, onR?: (e: unknown) => unknown) =>
            Promise.resolve({ data: rows[table] ?? [], error: null }).then(onF, onR)
        return chain
    })
    return {
        from,
        rpc: vi.fn(async () => cfg.rpc ?? { data: null, error: { message: 'function does not exist', code: '42883' } }),
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1', email: 'a@b.com' } }, error: null })) },
    }
}

async function callGet(cfg: Parameters<typeof makeSupabase>[0]) {
    const { createClient } = await import('@/utils/supabase/server')
    vi.mocked(createClient).mockResolvedValue(makeSupabase(cfg) as never)
    const { GET } = await import('@/app/api/dashboard/bootstrap/route')
    return (await GET()) as unknown as { __body: Rec; status: number }
}

// ─── Fixtures montadas ───────────────────────────────────────────────────────
const N_TEMPLATES = 20

const templates = Array.from({ length: N_TEMPLATES }, (_, i) => makeTemplateDbRow(i))
const exercicios = templates.flatMap((w, i) => makeTemplateExerciseRows(String(w.id), i))
const series = exercicios.flatMap((e) => makeTemplateSetRows(String(e.id), String(e.workout_id)))

/** Mesmo conjunto, no shape que a RPC devolve (exercises/sets inline). */
const templatesRpc = templates.map((w, i) => ({
    ...w,
    date: null,
    exercises: makeTemplateExerciseRows(String(w.id), i).map((e) => ({
        ...e,
        muscle_group: 'peito',
        sets: makeTemplateSetRows(String(e.id), String(w.id)).map((s) => {
            const { exercises: _embed, ...rest } = s as Rec & { exercises?: unknown }
            return { ...rest, completed: true }
        }),
    })),
}))

const coletarChaves = (payload: Rec) => {
    const workouts = (payload.workouts ?? []) as Rec[]
    const w = new Set<string>()
    const e = new Set<string>()
    const s = new Set<string>()
    for (const workout of workouts) {
        Object.keys(workout).forEach((k) => w.add(k))
        for (const ex of (workout.exercises ?? []) as Rec[]) {
            Object.keys(ex).forEach((k) => e.add(k))
            for (const set of (ex.sets ?? []) as Rec[]) Object.keys(set).forEach((k) => s.add(k))
        }
    }
    return { w, e, s }
}

const fora = (obtidas: Set<string>, permitidas: Set<string>) =>
    [...obtidas].filter((k) => !permitidas.has(k)).sort()

beforeEach(() => {
    vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// Caminho 1 — fallback em TS (SELECT + hidratação)
// ─────────────────────────────────────────────────────────────────────────────
describe('bootstrap (fallback TS) — shape fechado', () => {
    const cfg = {
        rows: { workouts: templates, exercises: exercicios, sets: series },
        single: { profiles: PROFILE_ROW },
    }

    it('o topo do payload não ganha campo novo', async () => {
        const res = await callGet(cfg)
        expect(Object.keys(res.__body).sort()).toEqual(CHAVES_TOPO)
    })

    it('workout / exercise / set só têm chaves da allowlist', async () => {
        const res = await callGet(cfg)
        const { w, e, s } = coletarChaves(res.__body)

        expect(fora(w, CHAVES_WORKOUT)).toEqual([])
        expect(fora(e, CHAVES_EXERCICIO)).toEqual([])
        expect(fora(s, CHAVES_SERIE)).toEqual([])
    })

    it('não desce nenhum pedaço de sessão logada', async () => {
        const res = await callGet(cfg)
        // Barras removidas de propósito: a sessão viaja como STRING JSON dentro
        // de `notes`, e aí as aspas chegam escapadas (`\"logs\"`) — sem isso o
        // teste passaria por cima justamente da regressão que ele existe pra pegar.
        const serializado = JSON.stringify(res.__body).replace(/\\/g, '')
        for (const marcador of MARCADORES_DE_SESSAO) {
            expect(serializado).not.toContain(marcador)
        }
    })

    it(`cada template hidratado cabe em ${BYTES_POR_TEMPLATE} B`, async () => {
        const res = await callGet(cfg)
        const workouts = res.__body.workouts as Rec[]

        expect(workouts).toHaveLength(N_TEMPLATES)
        const maior = Math.max(...workouts.map((w) => JSON.stringify(w).length))
        expect(maior).toBeLessThan(BYTES_POR_TEMPLATE)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Caminho 2 — RPC (o payload da RPC é repassado como veio)
// ─────────────────────────────────────────────────────────────────────────────
describe('bootstrap (RPC) — shape fechado', () => {
    const cfg = {
        rpc: { data: { ok: true, profile: PROFILE_ROW, workouts: templatesRpc }, error: null },
    }

    it('o topo do payload não ganha campo novo', async () => {
        const res = await callGet(cfg)
        expect(Object.keys(res.__body).sort()).toEqual(CHAVES_TOPO)
    })

    it('workout / exercise / set só têm chaves da allowlist', async () => {
        const res = await callGet(cfg)
        const { w, e, s } = coletarChaves(res.__body)

        expect(fora(w, CHAVES_WORKOUT)).toEqual([])
        expect(fora(e, CHAVES_EXERCICIO)).toEqual([])
        expect(fora(s, CHAVES_SERIE)).toEqual([])
    })

    it('não desce nenhum pedaço de sessão logada', async () => {
        const res = await callGet(cfg)
        const serializado = JSON.stringify(res.__body).replace(/\\/g, '')
        for (const marcador of MARCADORES_DE_SESSAO) {
            expect(serializado).not.toContain(marcador)
        }
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Ratchet do PIOR CASO CONHECIDO — dívida documentada, não invariante desejado
// ─────────────────────────────────────────────────────────────────────────────
describe('bootstrap — pior caso: usuário sem template', () => {
    /**
     * Quando o usuário não tem NENHUM template, o 2º branch (rota e RPC) cai em
     * "qualquer workout do user" — o que inclui SESSÕES CONCLUÍDAS, cujo `notes`
     * é o JSON inteiro do treino. Ou seja: o boot desse usuário baixa histórico
     * disfarçado de plano.
     *
     * Isto NÃO é o que se quer, mas é o comportamento de hoje e mexer na rota é
     * outra tarefa. O guard aqui é um RATCHET: mede o custo atual (30 sessões,
     * ~220 KB) e trava o teto. Se alguém aumentar o LIMIT, acrescentar coluna ou
     * hidratar mais coisa nesse branch, o teste fica vermelho e a conversa
     * acontece ANTES do deploy.
     */
    const sessoes = Array.from({ length: 30 }, (_, i) => makeHistoryDbRow(i))

    it('30 sessões sem template: payload não passa de 300 KB', async () => {
        const res = await callGet({
            rows: { workouts: sessoes, exercises: [], sets: [] },
            single: { profiles: PROFILE_ROW },
        })

        const bytes = JSON.stringify(res.__body).length
        expect(bytes).toBeGreaterThan(50_000) // se cair muito, o branch mudou: revisar o guard
        expect(bytes).toBeLessThan(300_000)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Source-guards — o que o teste comportamental não alcança
// ─────────────────────────────────────────────────────────────────────────────
describe('source-guard: SELECTs da rota são conjuntos fechados', () => {
    const rota = readFileSync(join(process.cwd(), 'src/app/api/dashboard/bootstrap/route.ts'), 'utf8')

    const colunasDe = (marcador: string) => {
        const selects = [...rota.matchAll(/\.select\(\s*'([^']+)'\s*\)/g)].map((m) => m[1])
        const alvo = selects.find((s) => s.includes(marcador))
        expect(alvo).toBeTruthy()
        return (alvo as string).split(',').map((c) => c.trim().replace(/"/g, '')).sort()
    }

    it('workouts: só as colunas conhecidas', () => {
        expect(colunasDe('sort_order')).toEqual([
            'archived_at', 'created_at', 'created_by', 'id', 'is_template', 'name',
            'notes', 'sort_order', 'student_id', 'user_id',
        ])
    })

    it('exercises: só as colunas conhecidas', () => {
        expect(colunasDe('transition_time')).toEqual([
            'cadence', 'id', 'is_unilateral', 'method', 'name', 'notes', 'order',
            'rest_time', 'side_rest_time', 'transition_time', 'video_url', 'workout_id',
        ])
    })

    it('sets: só as colunas conhecidas (+ embed de workout_id)', () => {
        expect(colunasDe('advanced_config')).toEqual([
            'advanced_config', 'exercise_id', 'exercises!inner(workout_id)', 'id',
            'is_warmup', 'per_set_method', 'reps', 'rpe', 'set_number', 'weight',
        ])
    })

    it('o fallback monta o payload campo a campo; o único spread é o da RPC', () => {
        expect(rota).toMatch(/const payload = \{\s*\n\s*ok: true,\s*\n\s*user: \{/)
        // Um spread de linha crua no payload é exatamente como campo pesado entra
        // sem revisão. O único permitido é o do rpcResult — cujo shape está travado
        // pelo source-guard da migration, logo abaixo.
        const spreads = [...rota.matchAll(/payload\s*=\s*\{\s*\.\.\.(\w+)/g)].map((m) => m[1])
        expect(spreads).toEqual(['rpcResult'])
    })
})

describe('source-guard: a RPC não pode ganhar chave nova', () => {
    /**
     * Lê a migration MAIS RECENTE que redefine `get_dashboard_bootstrap` — assim
     * o guard segue a função quando ela for alterada por uma migration nova, em
     * vez de apontar para um arquivo congelado.
     */
    const dir = join(process.cwd(), 'supabase/migrations')
    const arquivo = readdirSync(dir)
        .filter((f) => f.endsWith('.sql'))
        .filter((f) => readFileSync(join(dir, f), 'utf8').includes('FUNCTION public.get_dashboard_bootstrap'))
        .sort()
        .pop()

    /** Chaves de `jsonb_build_object`: `'chave',` no corpo da função. */
    const chavesDoJsonb = (sql: string) =>
        new Set([...sql.matchAll(/'([A-Za-z_][A-Za-z0-9_]*)'\s*,/g)].map((m) => m[1]))

    it('existe uma migration que define a RPC', () => {
        expect(arquivo).toBeTruthy()
    })

    it('as chaves do JSON da RPC estão todas na allowlist', () => {
        const sql = readFileSync(join(dir, arquivo as string), 'utf8')

        const permitidas = new Set([
            ...CHAVES_TOPO, ...CHAVES_WORKOUT, ...CHAVES_EXERCICIO, ...CHAVES_SERIE,
            'display_name', 'photo_url', 'role', // profile
        ])
        expect(fora(chavesDoJsonb(sql), permitidas)).toEqual([])
    })

    it('o extrator detecta chave nova (auto-teste — guard que não pega é guard falso)', () => {
        const sqlSabotado = `
      jsonb_build_object(
        'id', w.id,
        'session_notes', w.notes,
        'exercises', COALESCE(ex_agg.exercises, '[]'::jsonb)
      )`
        const permitidas = new Set([...CHAVES_WORKOUT])
        expect(fora(chavesDoJsonb(sqlSabotado), permitidas)).toEqual(['session_notes'])
    })
})

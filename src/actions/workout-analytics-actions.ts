import { createClient } from '@/utils/supabase/client'
import { logWarnRemote } from '@/lib/logger'
import { setVolume, setTopWeightReps } from '@/utils/report/setVolume'
import type { ActionResult } from '@/types/actions'
import { parseJsonWithSchema } from '@/utils/zod'
import { z } from 'zod'

// ─── Private helpers ──────────────────────────────────────────────────────────

const safeString = (v: unknown): string => String(v ?? '').trim()

const safeIso = (v: unknown): string | null => {
    try {
        if (!v) return null
        const d = v instanceof Date ? v : new Date(v as string | number)
        const t = d.getTime()
        return Number.isFinite(t) ? d.toISOString() : null
    } catch { return null }
}

const safeJsonParse = (raw: unknown): unknown => parseJsonWithSchema(raw, z.unknown())

const normalizeExerciseKey = (v: unknown): string =>
    safeString(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ')

const extractLogsStatsByExercise = (session: unknown) => {
    try {
        const s = session && typeof session === 'object' ? (session as Record<string, unknown>) : ({} as Record<string, unknown>)
        const logs = s?.logs && typeof s.logs === 'object' ? (s.logs as Record<string, unknown>) : {}
        const exercises = Array.isArray(s?.exercises) ? (s.exercises as unknown[]) : []
        const byKey = new Map<string, { exercise: string; weight: number; reps: number; volume: number }>()

        Object.entries(logs).forEach(([k, v]) => {
            const log = v && typeof v === 'object' ? (v as Record<string, unknown>) : null
            if (!log) return
            const doneRaw = log?.done ?? log?.isDone ?? log?.completed ?? null
            const done = doneRaw === true || String(doneRaw || '').toLowerCase() === 'true'
            if (!done) return
            const parts = String(k || '').split('-')
            const exIdx = Number(parts[0])
            if (!Number.isFinite(exIdx)) return
            const ex = exercises?.[exIdx]
            const exObj = ex && typeof ex === 'object' ? (ex as Record<string, unknown>) : null
            const exName = safeString(exObj?.name || '')
            if (!exName) return
            const key = normalizeExerciseKey(exName)
            if (!key) return
            // setTopWeightReps/setVolume tratam unilateral (L_/R_) além do normal.
            const { weight: w, reps: r } = setTopWeightReps(log)
            if (!w && !r) return
            const volume = setVolume(log)
            const cur = byKey.get(key) || { exercise: exName, weight: 0, reps: 0, volume: 0 }
            cur.exercise = exName
            cur.weight = Math.max(cur.weight, w)
            cur.reps = Math.max(cur.reps, r)
            cur.volume = Math.max(cur.volume, volume)
            byKey.set(key, cur)
        })
        return byKey
    } catch {
        return new Map()
    }
}

/**
 * Grava a falha do volume em `audit_events`, além do Sentry.
 *
 * Por que os DOIS: o Sentry recebe o sinal desde 09/08/2026, mas o token não
 * existe no repo nem no ambiente local — a pista fica ilegível de onde o
 * problema é investigado. Foi o mesmo impasse da Live Activity em 04/08, e a
 * saída é a mesma: `audit_events` responde a um SELECT e não expira.
 *
 * Fire-and-forget e sempre silencioso: quem abriu o dashboard quer ver o rank,
 * não saber que a telemetria falhou.
 */
const reportIronRankToAudit = (detail: {
    stage: 'rpc_error' | 'zero_com_historico'
    code?: unknown
    message?: unknown
    totalWorkouts?: unknown
    raw?: unknown
}) => {
    try {
        if (typeof fetch !== 'function') return
        const n = Number(detail.totalWorkouts)
        void fetch('/api/diag/iron-rank', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            keepalive: true,
            body: JSON.stringify({
                stage: detail.stage,
                code: detail.code != null ? String(detail.code).slice(0, 60) : undefined,
                message: detail.message != null ? String(detail.message).slice(0, 300) : undefined,
                totalWorkouts: Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined,
                raw: detail.raw != null ? String(detail.raw).slice(0, 120) : undefined,
                platform: (() => {
                    try {
                        const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } })?.Capacitor
                        return typeof cap?.getPlatform === 'function' ? String(cap.getPlatform()).slice(0, 40) : 'web'
                    } catch { return 'unknown' }
                })(),
            }),
        }).catch(() => { })
    } catch {
        // idem: telemetria nunca derruba a tela
    }
}

// ─── Exported analytics actions ───────────────────────────────────────────────

export async function getIronRankLeaderboard(limit = 100) {
    try {
        const supabase = createClient()
        const n = Math.min(300, Math.max(1, Number(limit) || 100))
        const { data, error } = await supabase.rpc('iron_rank_leaderboard', { limit_count: n })
        if (error) return { ok: false, error: error.message }
        return { ok: true, data: Array.isArray(data) ? data : [] }
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        return { ok: false, error: message }
    }
}

export async function getLatestWorkoutPrs(): Promise<ActionResult<Record<string, unknown>>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user?.id) return { ok: false, error: 'unauthorized', prs: [], workout: null } as ActionResult<Record<string, unknown>>

        const { data: latest, error: lErr } = await supabase
            .from('workouts')
            .select('id, name, date, created_at, notes')
            .eq('user_id', user.id)
            .eq('is_template', false)
            .order('date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        if (lErr) return { ok: false, error: lErr.message, prs: [], workout: null } as ActionResult<Record<string, unknown>>
        if (!latest?.id) return { ok: true, data: { prs: [], workout: { title: null, date: null } }, prs: [], workout: { title: null, date: null } } as ActionResult<Record<string, unknown>>

        const session = safeJsonParse(latest.notes)
        const currentMap = extractLogsStatsByExercise(session)

        const { data: prevRows } = await supabase
            .from('workouts')
            .select('id, notes, date, created_at')
            .eq('user_id', user.id)
            .eq('is_template', false)
            .neq('id', String(latest.id))
            .order('date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(30)

        const prevBest = new Map<string, { weight: number; reps: number; volume: number }>()
        for (const row of Array.isArray(prevRows) ? (prevRows as Array<Record<string, unknown>>) : []) {
            const prevSession = safeJsonParse(row?.notes)
            const m = extractLogsStatsByExercise(prevSession)
            for (const [k, st] of m.entries()) {
                const cur = prevBest.get(k) || { weight: 0, reps: 0, volume: 0 }
                prevBest.set(k, {
                    weight: Math.max(cur.weight, st.weight || 0),
                    reps: Math.max(cur.reps, st.reps || 0),
                    volume: Math.max(cur.volume, st.volume || 0),
                })
            }
        }

        const prs: Array<Record<string, unknown>> = []
        for (const [k, st] of currentMap.entries()) {
            const base = prevBest.get(k) || { weight: 0, reps: 0, volume: 0 }
            const improved = {
                weight: (st.weight || 0) > (base.weight || 0),
                reps: (st.reps || 0) > (base.reps || 0),
                volume: (st.volume || 0) > (base.volume || 0),
            }
            if (!improved.weight && !improved.reps && !improved.volume) continue
            prs.push({ ...st, improved })
        }
        prs.sort((a, b) => (Number(b.volume) || 0) - (Number(a.volume) || 0))

        return {
            ok: true,
            data: {
                prs: prs.slice(0, 12),
                workout: { id: String(latest.id), title: latest?.name ?? null, date: safeIso(latest?.date) || safeIso(latest?.created_at) },
            },
            prs: prs.slice(0, 12),
            workout: { id: String(latest.id), title: latest?.name ?? null, date: safeIso(latest?.date) || safeIso(latest?.created_at) },
        } as ActionResult<Record<string, unknown>>
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        return { ok: false, error: message, prs: [], workout: null } as ActionResult<Record<string, unknown>>
    }
}

export async function computeWorkoutStreakAndStats(): Promise<ActionResult<Record<string, unknown>>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user?.id) return { ok: false, error: 'unauthorized' }

        const { data: recentRaw } = await supabase
            .from('workouts')
            .select('id, date, created_at')
            .eq('user_id', user.id)
            .eq('is_template', false)
            .order('date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(180)

        const isDayKey = (s: unknown): boolean => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '').trim())
        const fmtDay = new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit' })
        const toDayKey = (v: unknown): string | null => {
            try {
                if (!v) return null
                if (typeof v === 'string') {
                    const s = v.trim()
                    if (!s) return null
                    if (isDayKey(s)) return s
                    const d = new Date(s)
                    if (!Number.isFinite(d.getTime())) return null
                    return fmtDay.format(d)
                }
                const d = v instanceof Date ? v : typeof v === 'string' || typeof v === 'number' ? new Date(v) : new Date(String(v))
                if (!Number.isFinite(d.getTime())) return null
                return fmtDay.format(d)
            } catch { return null }
        }

        const daySet = new Set<string>()
        for (const r of Array.isArray(recentRaw) ? recentRaw : []) {
            const dayKey = toDayKey(r?.date) || toDayKey(r?.created_at)
            if (!dayKey) continue
            daySet.add(dayKey)
        }
        const days = Array.from(daySet.values()).sort()
        const toDayMs = (day: unknown): number | null => {
            const t = new Date(`${day}T00:00:00.000Z`).getTime()
            return Number.isFinite(t) ? t : null
        }

        let currentStreak = 0
        let bestStreak = 0
        const todayKey = toDayKey(new Date()) || ''
        const hasToday = daySet.has(todayKey)
        const startKey = hasToday ? todayKey : toDayKey(new Date(Date.now() - 24 * 60 * 60 * 1000)) || ''
        if (daySet.has(startKey)) {
            let cursor = startKey
            while (daySet.has(cursor)) {
                currentStreak += 1
                const ms = toDayMs(cursor)
                if (!ms) break
                cursor = new Date(ms - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
            }
        }

        for (let i = 0; i < days.length; i += 1) {
            let streak = 1
            for (let j = i; j > 0; j -= 1) {
                const a = toDayMs(days[j])
                const b = toDayMs(days[j - 1])
                if (a == null || b == null) break
                if (a - b !== 24 * 60 * 60 * 1000) break
                streak += 1
            }
            bestStreak = Math.max(bestStreak, streak)
        }

        const workoutsCountRes = await supabase
            .from('workouts')
            .select('id', { head: true, count: 'exact' })
            .eq('user_id', user.id)
            .eq('is_template', false)
        const totalWorkouts = Number(workoutsCountRes.count) || 0

        // `iron_rank_my_total_volume` varre TODOS os workouts no banco (~95ms de
        // Postgres por chamada, e o card de rank chama a cada visita ao
        // dashboard — 11.750 execuções medidas em ago/2026). O volume total só
        // muda quando um treino entra/sai do histórico, então a chave do cache
        // inclui `totalWorkouts` (recém-contado acima): finalizar ou excluir
        // treino muda a contagem → chave nova → RPC fresca. O TTL de 30min
        // cobre o caso raro de EDITAR pesos de um treino antigo (conta igual,
        // volume diferente). Guard: ironRankVolumeCache.test.ts.
        let totalVolumeKg = 0
        const volCacheKey = `irontracks.ironRankVol.${user.id}.${totalWorkouts}`
        const VOL_CACHE_TTL_MS = 30 * 60 * 1000
        const cachedVol = (() => {
            try {
                if (typeof localStorage === 'undefined') return null
                const raw = localStorage.getItem(volCacheKey)
                if (!raw) return null
                const parsed = JSON.parse(raw) as { v?: unknown; exp?: unknown }
                const exp = Number(parsed?.exp)
                const v = Number(parsed?.v)
                if (!Number.isFinite(exp) || exp < Date.now() || !Number.isFinite(v)) return null
                return v
            } catch { return null }
        })()
        if (cachedVol != null) {
            totalVolumeKg = cachedVol
        } else {
            try {
                const { data: vol, error: vErr } = await supabase.rpc('iron_rank_my_total_volume')
                if (vErr) {
                    // Saída silenciosa nº1: o `if (!vErr)` original não fazia NADA
                    // aqui — nem caía no catch (erro do supabase-js vem no
                    // retorno, não como exceção). O volume ficava 0, o card
                    // mostrava "Iniciante do Ferro" para quem tem milhões de kg,
                    // e nenhum sinal era emitido em lugar nenhum.
                    logWarnRemote('workout-analytics', 'iron-rank-volume-rpc-error', {
                        code: vErr.code, message: vErr.message, totalWorkouts,
                    })
                    reportIronRankToAudit({
                        stage: 'rpc_error',
                        code: vErr.code, message: vErr.message, totalWorkouts,
                    })
                } else {
                    totalVolumeKg = Math.round(Number(String(vol ?? 0).replace(',', '.')) || 0)
                    // Volume 0 com histórico é contradição: ou o RPC regrediu, ou
                    // o parse acima comeu o número. Sem isto, o sintoma na tela
                    // é idêntico ao de um usuário novo — indistinguível.
                    const contraditorio = totalVolumeKg === 0 && totalWorkouts > 0
                    if (contraditorio) {
                        logWarnRemote('workout-analytics', 'iron-rank-volume-zero-com-historico', {
                            totalWorkouts, raw: String(vol ?? ''),
                        })
                        reportIronRankToAudit({
                            stage: 'zero_com_historico',
                            totalWorkouts, raw: String(vol ?? ''),
                        })
                    }
                    // NÃO cachear o valor contraditório. A chave é
                    // `user.id`+`totalWorkouts`, que não muda até o próximo
                    // treino: gravar o 0 transformaria uma falha momentânea
                    // (RPC lança `not_authenticated` quando `auth.uid()` vem
                    // NULL) em 30 minutos de "Iniciante do Ferro" para quem
                    // tem milhões de kg. Sem cache, a visita seguinte tenta de
                    // novo — que é o comportamento correto para um valor no
                    // qual não confiamos.
                    try {
                        if (typeof localStorage !== 'undefined' && !contraditorio) {
                            localStorage.setItem(volCacheKey, JSON.stringify({ v: totalVolumeKg, exp: Date.now() + VOL_CACHE_TTL_MS }))
                        }
                    } catch { /* storage cheio/indisponível: segue sem cache */ }
                }
                // Saída silenciosa nº2: era `logWarn`, que é NO-OP em produção
                // (`if (IS_PROD) return`) — ou seja, o único log do caminho não
                // existia justamente onde o bug acontece.
            } catch (e) { logWarnRemote('workout-analytics', 'iron-rank-volume-threw', e) }
        }

        const badges: Array<Record<string, unknown>> = []
        if (totalWorkouts > 0) badges.push({ id: 'first_workout', label: 'Primeiro treino', kind: 'milestone' })
        if (currentStreak >= 3) badges.push({ id: 'streak_3', label: '3 dias seguidos', kind: 'streak' })
        if (currentStreak >= 7) badges.push({ id: 'streak_7', label: '7 dias seguidos', kind: 'streak' })
        if (totalVolumeKg >= 5000) badges.push({ id: 'vol_5k', label: '5.000kg levantados', kind: 'volume' })
        if (totalVolumeKg >= 20000) badges.push({ id: 'vol_20k', label: '20.000kg levantados', kind: 'volume' })
        if (totalVolumeKg >= 50000) badges.push({ id: 'vol_50k', label: '50.000kg levantados', kind: 'volume' })
        if (totalVolumeKg >= 100000) badges.push({ id: 'vol_100k', label: '100.000kg levantados', kind: 'volume' })
        if (totalVolumeKg >= 500000) badges.push({ id: 'vol_500k', label: '500.000kg levantados', kind: 'volume' })
        if (totalVolumeKg >= 1000000) badges.push({ id: 'vol_1m', label: '1.000.000kg levantados', kind: 'volume' })
        if (totalVolumeKg >= 2000000) badges.push({ id: 'vol_2m', label: '2.000.000kg levantados', kind: 'volume' })
        if (totalVolumeKg >= 5000000) badges.push({ id: 'vol_5m', label: '5.000.000kg levantados', kind: 'volume' })

        // Count unique session days in the current week (Mon–Sun)
        const todayMs = Date.now()
        const dayOfWeek = new Date().getUTCDay() // 0=Sun, 1=Mon…
        const mondayMs = todayMs - ((dayOfWeek === 0 ? 6 : dayOfWeek - 1) * 86_400_000)
        const mondayKey = new Date(mondayMs).toISOString().slice(0, 10)
        let weekWorkouts = 0
        for (const dayKey of daySet) {
            if (dayKey >= mondayKey) weekWorkouts += 1
        }

        return { ok: true, data: { currentStreak, bestStreak, totalWorkouts, totalVolumeKg, badges, weekWorkouts } }
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        return { ok: false, error: message }
    }
}

import { createClient } from '@/utils/supabase/client'
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
            const wRaw = Number(String(log?.weight ?? '').replace(',', '.'))
            const rRaw = Number(String(log?.reps ?? '').replace(',', '.'))
            const w = Number.isFinite(wRaw) && wRaw > 0 ? wRaw : 0
            const r = Number.isFinite(rRaw) && rRaw > 0 ? rRaw : 0
            if (!w && !r) return
            const volume = w && r ? w * r : 0
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

        let totalVolumeKg = 0
        try {
            const { data: vol, error: vErr } = await supabase.rpc('iron_rank_my_total_volume')
            if (!vErr) totalVolumeKg = Math.round(Number(String(vol ?? 0).replace(',', '.')) || 0)
        } catch { }

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

        return { ok: true, data: { currentStreak, bestStreak, totalWorkouts, totalVolumeKg, badges } }
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        return { ok: false, error: message }
    }
}

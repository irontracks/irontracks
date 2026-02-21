import { NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'
import { getVipPlanLimits } from '@/utils/vip/limits'

export const dynamic = 'force-dynamic'

const safeJsonParse = (raw: string) => {
  try {
    const s = String(raw || '').trim()
    if (!s) return null
    return JSON.parse(s)
  } catch {
    return null
  }
}

const normalizeText = (v: unknown) => {
  return String(v || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

const extractLogsStatsByExercise = (session: unknown) => {
  try {
    const s = session && typeof session === 'object' ? (session as Record<string, unknown>) : {}
    const logs = s?.logs && typeof s.logs === 'object' ? (s.logs as Record<string, unknown>) : {}
    const exercises = Array.isArray(s?.exercises) ? (s.exercises as Record<string, unknown>[]) : []
    const byKey = new Map<string, { exercise: string; weight: number; reps: number; volume: number }>()

    Object.entries(logs).forEach(([k, v]) => {
      const log = v && typeof v === 'object' ? v : null
      if (!log) return
      const parts = String(k || '').split('-')
      const exIdx = Number(parts[0])
      if (!Number.isFinite(exIdx)) return
      const exName = String(exercises?.[exIdx]?.name || '').trim()
      if (!exName) return
      const key = normalizeText(exName)
      if (!key) return
      const w = Number(String((log as Record<string, unknown>)?.weight ?? '').replace(',', '.'))
      const r = Number(String((log as Record<string, unknown>)?.reps ?? '').replace(',', '.'))
      if (!Number.isFinite(w) || !Number.isFinite(r) || w <= 0 || r <= 0) return
      const volume = w * r
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

const computePrs = (latestNotes: unknown, prevNotesList: unknown[]) => {
  const currentMap = extractLogsStatsByExercise(latestNotes)
  const prevBest = new Map<string, { weight: number; reps: number; volume: number }>()

  for (const prevSession of Array.isArray(prevNotesList) ? prevNotesList : []) {
    const m = extractLogsStatsByExercise(prevSession)
    for (const [k, st] of Array.from(m.entries())) {
      const cur = prevBest.get(k) || { weight: 0, reps: 0, volume: 0 }
      prevBest.set(k, {
        weight: Math.max(cur.weight, (st as Record<string, number>).weight || 0),
        reps: Math.max(cur.reps, (st as Record<string, number>).reps || 0),
        volume: Math.max(cur.volume, (st as Record<string, number>).volume || 0),
      })
    }
  }

  const prs: Record<string, unknown>[] = []
  for (const [k, st] of Array.from(currentMap.entries())) {
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
  return prs.slice(0, 6)
}

const avg = (rows: Record<string, unknown>[], key: string) => {
  const vals = rows.map((r) => Number(r?.[key])).filter((n) => Number.isFinite(n))
  if (!vals.length) return null
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
}

export async function GET() {
  const auth = await requireUser()
  if (!auth.ok) return auth.response
  const supabase = auth.supabase
  const user = auth.user

  const entitlement = await getVipPlanLimits(supabase, user.id)
  if (entitlement.tier === 'free') return NextResponse.json({ ok: false, error: 'vip_required' }, { status: 403 })

  try {
    const now = Date.now()
    const startIso = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()

    const { data: weekWorkouts } = await supabase
      .from('workouts')
      .select('id, date, created_at')
      .eq('user_id', user.id)
      .eq('is_template', false)
      .gte('created_at', startIso)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(120)

    const daySet = new Set<string>()
    for (const w of Array.isArray(weekWorkouts) ? weekWorkouts : []) {
      const iso = String(w?.date || w?.created_at || '')
      if (!iso) continue
      daySet.add(iso.slice(0, 10))
    }
    const trainedDays = daySet.size

    const { data: checkins } = await supabase
      .from('workout_checkins')
      .select('id, kind, created_at, energy, mood, soreness, sleep_hours')
      .eq('user_id', user.id)
      .gte('created_at', startIso)
      .order('created_at', { ascending: false })
      .limit(60)

    const checkinsList = Array.isArray(checkins) ? checkins : []

    const { data: latest } = await supabase
      .from('workouts')
      .select('id, notes, date, created_at')
      .eq('user_id', user.id)
      .eq('is_template', false)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let prs: unknown[] = []
    if (latest?.id) {
      const { data: prevRows } = await supabase
        .from('workouts')
        .select('id, notes, date, created_at')
        .eq('user_id', user.id)
        .eq('is_template', false)
        .neq('id', String(latest.id))
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(30)
      const latestNotes = safeJsonParse(String(latest?.notes || '')) || null
      const prevNotesList = (Array.isArray(prevRows) ? prevRows : []).map((r) => safeJsonParse(String(r?.notes || ''))).filter(Boolean)
      if (latestNotes) prs = computePrs(latestNotes, prevNotesList)
    }

    const dataUsed: string[] = []
    if (trainedDays) dataUsed.push(`${trainedDays} dias treinados (últimos 7d)`)
    if (checkinsList.length) dataUsed.push(`${Math.min(checkinsList.length, 60)} check-ins (últimos 7d)`)
    if (prs.length) dataUsed.push('PRs do último treino')

    const energy = avg(checkinsList, 'energy')
    const mood = avg(checkinsList, 'mood')
    const soreness = avg(checkinsList, 'soreness')
    const sleep = avg(checkinsList, 'sleep_hours')

    const lines: string[] = []
    lines.push(`Resumo VIP • últimos 7 dias`)
    lines.push(`- Frequência: ${trainedDays} dia(s) treinado(s)`)
    if (energy != null) lines.push(`- Energia média: ${energy}/10`)
    if (mood != null) lines.push(`- Humor médio: ${mood}/10`)
    if (soreness != null) lines.push(`- Dor/fadiga média: ${soreness}/10`)
    if (sleep != null) lines.push(`- Sono médio: ${sleep}h`)
    if (prs.length) {
      const prTxt = prs
        .slice(0, 3)
        .map((p) => `${String((p as Record<string, unknown>)?.exercise || '').trim()} (${(p as Record<string, unknown>)?.weight || 0}kg x ${(p as Record<string, unknown>)?.reps || 0})`)
        .filter(Boolean)
        .join(', ')
      if (prTxt) lines.push(`- PRs recentes: ${prTxt}`)
    }

    const summaryText = lines.join('\n')

    return NextResponse.json({ ok: true, dataUsed, trainedDays, checkins: { energy, mood, soreness, sleep }, prs, summaryText })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Record<string, unknown>)?.message ?? String(e) }, { status: 500 })
  }
}

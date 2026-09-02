import { NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'
import { checkVipFeatureAccess, getVipPlanLimits } from '@/utils/vip/limits'
import { parseJsonWithSchema } from '@/utils/zod'
import { z } from 'zod'
import { cacheGet, cacheSet } from '@/utils/cache'
import { checkRateLimitAsync } from '@/utils/rateLimit'
import {
  CHECKIN_SCALES,
  averageCheckinValues,
  checkinsOfKind,
  readCheckinEnergy,
  readCheckinSatisfaction,
  readCheckinSleepHours,
  readCheckinSoreness,
} from '@/utils/checkin/metrics'
import { respondInternalError } from '@/utils/api/internalError'

export const dynamic = 'force-dynamic'

const safeJsonParse = (raw: string) => parseJsonWithSchema(raw, z.unknown())

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

// A média vive em `utils/checkin/metrics` — aqui ela era `Number(r[key])` + filtro
// por `isFinite`, e como `Number(null) === 0` todo check-in SEM aquele campo entrava
// na conta valendo zero. Ver o cabeçalho de metrics.ts para os números do caso real.

export async function GET() {
  const auth = await requireUser()
  if (!auth.ok) return auth.response
  const supabase = auth.supabase
  const user = auth.user

  // Resolve o plano UMA vez e injeta no check (antes: 2 resoluções — a do meter interno
  // + a direta). Resolver antes do meter não muda comportamento: o consumo atômico e os
  // gates (allowed + limits.analytics) seguem idênticos.
  const plan = await getVipPlanLimits(supabase, user.id)
  const access = await checkVipFeatureAccess(supabase, user.id, 'analytics', { meter: true, plan })
  if (!access.allowed) {
    return NextResponse.json({ ok: false, error: 'vip_required', upgradeRequired: true }, { status: 403 })
  }
  if (!plan?.limits?.analytics) {
    return NextResponse.json({ ok: false, error: 'vip_required', upgradeRequired: true }, { status: 403 })
  }

  // Admin / VIP Elite are exempt from the per-user rate limit. They're either
  // staff or top-tier paying users — the limiter is meant to protect Gemini
  // budget from accidental loops, not gate normal usage.
  const tier = String(plan?.tier || '').toLowerCase()
  const skipRateLimit = tier === 'vip_elite' || tier === 'admin'

  try {
    // `v2` no prefixo: o payload antigo (médias diluídas por null + campo `mood`)
    // ficaria servido por até 2 min após o deploy, mostrando o número errado.
    const cacheKey = `vip:weekly-summary:v2:${user.id}`
    const cached = await cacheGet<Record<string, unknown>>(cacheKey, (v) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null))
    if (cached) return NextResponse.json(cached)

    // Cache miss: this request will actually call the AI. Now is the time to
    // gate it on the rate limiter — checking BEFORE the cache lookup made
    // every refresh (even cached ones) tick the budget down, so users were
    // getting 429s after a handful of clicks even when nothing reached Gemini.
    //
    // Limit raised from 5/hour to 60/hour: the cache TTL is 2 min, so a user
    // hammering Refresh would still hit cache 99% of the time. The previous
    // 5/h was too tight for a button users tap repeatedly.
    if (!skipRateLimit) {
      const rl = await checkRateLimitAsync(`vip-weekly-summary:${user.id}`, 60, 3_600_000)
      if (!rl.allowed) {
        return NextResponse.json(
          { ok: false, error: 'ai_rate_limited' },
          { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
        )
      }
    }

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
      .select('id, kind, created_at, energy, mood, soreness, sleep_hours, answers')
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

    // Cada métrica sai do check-in que REALMENTE a coleta: energia e sono só
    // existem no pré, satisfação só no pós. Misturar os dois tipos (o que a média
    // antiga fazia) diluía a energia e o sono em zeros vindos das linhas de pós.
    const preCheckins = checkinsOfKind(checkinsList, 'pre')
    const postCheckins = checkinsOfKind(checkinsList, 'post')

    const energy = averageCheckinValues(preCheckins.map(readCheckinEnergy))
    const sleep = averageCheckinValues(preCheckins.map(readCheckinSleepHours))
    const soreness = averageCheckinValues(checkinsList.map(readCheckinSoreness))
    const satisfaction = averageCheckinValues(postCheckins.map(readCheckinSatisfaction))

    const lines: string[] = []
    lines.push(`Resumo VIP • últimos 7 dias`)
    lines.push(`- Frequência: ${trainedDays} dia(s) treinado(s)`)
    if (energy != null) lines.push(`- Energia média: ${energy}/${CHECKIN_SCALES.energy}`)
    if (satisfaction != null) lines.push(`- Satisfação média: ${satisfaction}/${CHECKIN_SCALES.satisfaction}`)
    if (soreness != null) lines.push(`- Dor/fadiga média: ${soreness}/${CHECKIN_SCALES.soreness}`)
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

    const payload = {
      ok: true,
      dataUsed,
      trainedDays,
      checkins: { energy, satisfaction, soreness, sleep },
      scales: CHECKIN_SCALES,
      prs,
      summaryText,
    }
    await cacheSet(cacheKey, payload, 120)
    return NextResponse.json(payload)
  } catch (e: unknown) {
    return respondInternalError('api:vip:weekly-summary', e)
  }
}

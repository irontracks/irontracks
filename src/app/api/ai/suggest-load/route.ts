import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonBody } from '@/utils/zod'

export const dynamic = 'force-dynamic'

/* ──────────────────────────────────────────────────────────
 * POST /api/ai/suggest-load
 *
 * Real-time load suggestion for a given exercise during an
 * active workout. Uses the last 3-5 sessions of the same
 * exercise to produce a data-driven recommendation.
 *
 * No Gemini call — pure math for speed (~50ms response).
 * ────────────────────────────────────────────────────────── */

const ZodBody = z.object({
  exerciseName: z.string().min(1),
  setIndex: z.number().int().min(0).default(0),
  currentWeight: z.number().optional(),
  currentReps: z.number().optional(),
}).strip()

const normalizeKey = (v: string) =>
  v.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ')

interface SetLog {
  weight: number
  reps: number
  done: boolean
  date: string
}

function computeSuggestion(history: SetLog[], currentWeight?: number, currentReps?: number): {
  suggestedWeight: number
  suggestedReps: number
  confidence: 'high' | 'medium' | 'low'
  reason: string
  trend: 'up' | 'stable' | 'down'
  lastSessions: Array<{ weight: number; reps: number; date: string }>
} | null {
  if (history.length === 0) return null

  // Group by date (session), take last 5
  const bySession = new Map<string, SetLog[]>()
  for (const log of history) {
    const key = log.date.slice(0, 10)
    const arr = bySession.get(key) || []
    arr.push(log)
    bySession.set(key, arr)
  }

  const sessions = Array.from(bySession.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 5)

  if (sessions.length === 0) return null

  // Extract best set per session (highest weight)
  const bestPerSession = sessions.map(([date, logs]) => {
    const sorted = logs.sort((a, b) => b.weight - a.weight || b.reps - a.reps)
    return { weight: sorted[0].weight, reps: sorted[0].reps, date }
  })

  const lastSessions = bestPerSession.slice(0, 5)
  const lastWeight = bestPerSession[0].weight
  const lastReps = bestPerSession[0].reps

  // Determine trend
  let trend: 'up' | 'stable' | 'down' = 'stable'
  if (bestPerSession.length >= 2) {
    const recent = bestPerSession[0].weight
    const older = bestPerSession[bestPerSession.length - 1].weight
    if (recent > older * 1.02) trend = 'up'
    else if (recent < older * 0.98) trend = 'down'
  }

  // Calculate averages
  const avgWeight = bestPerSession.reduce((s, x) => s + x.weight, 0) / bestPerSession.length
  const avgReps = bestPerSession.reduce((s, x) => s + x.reps, 0) / bestPerSession.length

  // Confidence
  const confidence = bestPerSession.length >= 3
    ? 'high'
    : bestPerSession.length >= 2
      ? 'medium'
      : 'low'

  // Suggestion logic
  let suggestedWeight: number
  let suggestedReps: number
  let reason: string

  if (trend === 'up' && bestPerSession.length >= 2) {
    // Progressive overload: suggest small increment
    const increment = lastWeight <= 20 ? 1 : lastWeight <= 50 ? 2 : 2.5
    suggestedWeight = Math.round((lastWeight + increment) * 2) / 2
    suggestedReps = Math.round(avgReps)
    reason = `Progressão ativa! Últimas ${bestPerSession.length} sessões em alta. Tente +${increment}kg.`
  } else if (trend === 'stable') {
    // If high reps, suggest weight increase + lower reps
    if (lastReps >= 12 && bestPerSession.length >= 2) {
      const increment = lastWeight <= 20 ? 1 : lastWeight <= 50 ? 2 : 2.5
      suggestedWeight = Math.round((lastWeight + increment) * 2) / 2
      suggestedReps = Math.max(6, Math.round(lastReps - 2))
      reason = `Você está estável em ${lastWeight}kg × ${lastReps}. Hora de subir carga!`
    } else {
      // Try to add 1 rep
      suggestedWeight = lastWeight
      suggestedReps = Math.min(15, Math.round(lastReps + 1))
      reason = `Mantenha ${lastWeight}kg e tente +1 rep. Você fez ${lastReps} na última.`
    }
  } else {
    // Trend down — suggest consolidation
    suggestedWeight = Math.round(avgWeight * 2) / 2
    suggestedReps = Math.round(avgReps)
    reason = `Carga caiu recentemente. Consolide em ${suggestedWeight}kg × ${suggestedReps}.`
  }

  // Override with current context if provided
  if (currentWeight && currentWeight > 0 && currentReps && currentReps > 0) {
    // If user already logged heavier, don't suggest going down
    if (currentWeight > suggestedWeight) {
      suggestedWeight = currentWeight
      suggestedReps = Math.max(suggestedReps, currentReps)
      reason = `Você já está acima do histórico! Mantenha ${currentWeight}kg.`
    }
  }

  return {
    suggestedWeight,
    suggestedReps: Math.round(suggestedReps),
    confidence,
    reason,
    trend,
    lastSessions,
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const userId = String(auth.user.id || '').trim()

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`ai:suggest-load:${userId}:${ip}`, 30, 60_000)
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: 'rate_limited' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      )
    }

    const parsed = await parseJsonBody(req, ZodBody)
    if (parsed.response) return parsed.response
    const body = parsed.data as z.infer<typeof ZodBody>

    const exerciseName = body.exerciseName
    const normalizedName = normalizeKey(exerciseName)
    if (!normalizedName) return NextResponse.json({ ok: false, error: 'exercise name required' }, { status: 400 })

    // Fetch last 30 sessions (templates excluded) to find this exercise
    const admin = createAdminClient()
    const { data: sessions, error: sErr } = await admin
      .from('workouts')
      .select('id, notes, date, created_at')
      .eq('user_id', userId)
      .eq('is_template', false)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(30)

    if (sErr) return NextResponse.json({ ok: false, error: sErr.message }, { status: 500 })

    // Parse logs from each session, find matching exercise
    const allLogs: SetLog[] = []

    for (const row of (sessions || [])) {
      const rowObj = row as Record<string, unknown>
      const notes = rowObj?.notes
      const session = (() => {
        if (!notes) return null
        if (typeof notes === 'object') return notes as Record<string, unknown>
        try { return JSON.parse(String(notes)) as Record<string, unknown> } catch { return null }
      })()
      if (!session) continue

      const exercises = Array.isArray(session.exercises) ? session.exercises as unknown[] : []
      const logs = session.logs && typeof session.logs === 'object' ? session.logs as Record<string, unknown> : {}
      const dateStr = String(rowObj.date || rowObj.created_at || '')

      for (let exIdx = 0; exIdx < exercises.length; exIdx++) {
        const ex = exercises[exIdx] as Record<string, unknown> | null
        if (!ex) continue
        const exName = normalizeKey(String(ex.name || ''))
        if (exName !== normalizedName) continue

        // Found matching exercise — extract set logs
        const setsCount = Math.max(1, Number(ex.sets || 0) || 0)
        for (let setIdx = 0; setIdx < Math.min(setsCount, 20); setIdx++) {
          const key = `${exIdx}-${setIdx}`
          const log = logs[key]
          if (!log || typeof log !== 'object') continue
          const logObj = log as Record<string, unknown>
          const weight = Number(String(logObj.weight ?? '0').replace(',', '.'))
          const reps = Number(String(logObj.reps ?? '0').replace(',', '.'))
          const done = Boolean(logObj.done)
          if (weight > 0 && reps > 0 && done) {
            allLogs.push({ weight, reps, done, date: dateStr })
          }
        }
      }
    }

    const suggestion = computeSuggestion(allLogs, body.currentWeight, body.currentReps)
    if (!suggestion) {
      return NextResponse.json({
        ok: true,
        suggestion: null,
        reason: 'Sem histórico suficiente para este exercício.',
      })
    }

    return NextResponse.json({ ok: true, suggestion })
  } catch (e: unknown) {
    const msg = (e as Record<string, unknown>)?.message
    return NextResponse.json({ ok: false, error: typeof msg === 'string' ? msg : String(e) }, { status: 500 })
  }
}

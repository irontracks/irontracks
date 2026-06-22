/**
 * GET /api/analysis/muscle-balance
 *
 * Analisa os treinos completos dos últimos 28 dias e retorna volume por grupo
 * muscular + desequilíbrios entre antagonistas.
 *
 * Fonte de músculos = `exercise_library` (catálogo GLOBAL curado) via resolver
 * anti-falhas: library → alias → heurística (fallback) → buraco logado. Nunca
 * "some" um exercício silenciosamente.
 */
import { NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { buildLibraryIndex, resolveExerciseMuscles, type LibRow } from '@/utils/exerciseMuscleResolver'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { logWarn } from '@/lib/logger'

export const dynamic = 'force-dynamic'

// Pares antagonistas na taxonomia do exercise_library (pt-BR).
const ANTAGONIST_PAIRS = [
  { a: 'peito', b: 'costas', labelA: 'Peito', labelB: 'Costas' },
  { a: 'ombros', b: 'ombros_posteriores', labelA: 'Ombro ant/lat', labelB: 'Ombro post.' },
  { a: 'biceps', b: 'triceps', labelA: 'Bíceps', labelB: 'Tríceps' },
  { a: 'quadriceps', b: 'posterior_de_coxa', labelA: 'Quadríceps', labelB: 'Posterior' },
] as const

export async function GET(req: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response
  const ip = getRequestIp(req)
  const rl = await checkRateLimitAsync(`analysis:muscle-balance:${auth.user.id}:${ip}`, 30, 60_000)
  if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

  const admin = createAdminClient()
  const since = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString()

  // Catálogo global de músculos (fonte da verdade) + índice de resolução.
  const { data: libRows } = await admin
    .from('exercise_library')
    .select('normalized_name, aliases, primary_muscle, secondary_muscles')
  const index = buildLibraryIndex((libRows || []) as LibRow[])

  // Treinos completos dos últimos 28 dias (notes JSON com exercises[] + logs{}).
  const { data: sessions } = await admin
    .from('workouts')
    .select('notes, completed_at')
    .eq('user_id', auth.user.id)
    .eq('is_template', false)
    .not('completed_at', 'is', null)
    .gte('completed_at', since)
    .limit(60)

  const setsPerMuscle = new Map<string, number>()
  const sessionDates: string[] = []
  const gaps = new Set<string>()

  for (const session of Array.isArray(sessions) ? sessions : []) {
    try {
      const notes = typeof session.notes === 'string' ? JSON.parse(session.notes) : session.notes
      if (!notes || typeof notes !== 'object') continue
      const exercises = Array.isArray(notes.exercises) ? notes.exercises : []
      const logs = notes.logs && typeof notes.logs === 'object' ? notes.logs as Record<string, unknown> : {}

      sessionDates.push(String(session.completed_at || '').slice(0, 10))

      exercises.forEach((ex: unknown, exIdx: number) => {
        const exObj = ex && typeof ex === 'object' ? ex as Record<string, unknown> : {}
        const name = String(exObj?.name || '').trim()
        if (!name) return

        // Conta séries concluídas
        const setsCount = Number(exObj?.sets) || 0
        let doneSets = 0
        for (let s = 0; s < setsCount; s++) {
          const log = logs[`${exIdx}-${s}`]
          if (log && typeof log === 'object' && (log as Record<string, unknown>).done) doneSets++
        }
        if (doneSets === 0) return

        // Resolve músculos pelo catálogo (heurística como fallback).
        const resolved = resolveExerciseMuscles(name, index, (n) => gaps.add(n))
        if (!resolved) return

        setsPerMuscle.set(resolved.primary, (setsPerMuscle.get(resolved.primary) || 0) + doneSets)
        for (const sec of resolved.secondary) {
          setsPerMuscle.set(sec, (setsPerMuscle.get(sec) || 0) + doneSets * 0.5)
        }
      })
    } catch { /* skip bad session */ }
  }

  // Auto-cura: registra os exercícios que caíram no fallback/sem-resolução
  // pra backfill posterior no exercise_library.
  if (gaps.size > 0) {
    logWarn('muscle-balance:gaps', `${gaps.size} exercício(s) sem match curado: ${[...gaps].slice(0, 30).join(' | ')}`)
  }

  // Desequilíbrios entre antagonistas (séries: primário 1x, secundário 0.5x).
  const imbalances = ANTAGONIST_PAIRS.map(pair => {
    const setsA = setsPerMuscle.get(pair.a) || 0
    const setsB = setsPerMuscle.get(pair.b) || 0
    const total = setsA + setsB
    const ratio = total > 0 ? setsA / total : 0.5
    const deviation = Math.abs(ratio - 0.5)
    return {
      muscleA: pair.a,
      muscleB: pair.b,
      labelA: pair.labelA,
      labelB: pair.labelB,
      setsA: Math.round(setsA),
      setsB: Math.round(setsB),
      ratio: Math.round(ratio * 100),
      deviation: Math.round(deviation * 100),
      balanced: deviation < 0.15, // dentro de 15% = equilibrado
    }
  })

  const muscleVolume = Array.from(setsPerMuscle.entries())
    .map(([id, sets]) => ({ id, sets: Math.round(sets) }))
    .sort((a, b) => b.sets - a.sets)

  const totalSessions = new Set(sessionDates).size

  return NextResponse.json({
    ok: true,
    totalSessions,
    muscleVolume,
    imbalances,
    periodDays: 28,
  })
}

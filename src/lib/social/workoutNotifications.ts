/**
 * src/lib/social/workoutNotifications.ts
 * Social notification logic triggered when a user finishes a workout.
 * Extracted from api/workouts/finish/route.ts to keep the route handler focused.
 */

import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { normalizeWorkoutTitle } from '@/utils/workoutTitle'
import {
  filterRecipientsByPreference,
  insertNotifications,
  listFollowerIdsOf,
  shouldThrottleBySenderType,
} from '@/lib/social/notifyFollowers'
import { parseJsonWithSchema } from '@/utils/zod'
import { logError, logWarn } from '@/lib/logger'

// ─── Helpers (moved from finish/route.ts) ─────────────────────────────────────

const parseTrainingNumberOrZero = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(String(v || '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

const getExercisePlannedSetsCount = (ex: unknown) => {
  try {
    const exObj = ex && typeof ex === 'object' ? (ex as Record<string, unknown>) : {}
    const bySets = Math.max(0, Number(exObj?.sets) || 0)
    const byDetails = Array.isArray(exObj?.setDetails)
      ? (exObj.setDetails as unknown[]).length
      : Array.isArray(exObj?.set_details)
        ? (exObj.set_details as unknown[]).length
        : 0
    return Math.max(bySets, byDetails)
  } catch {
    return 0
  }
}

export const buildBestByExerciseFromSession = (
  session: Record<string, unknown>,
  onlyNames?: Set<string>,
) => {
  const base = session && typeof session === 'object' ? session : null
  const logs =
    base?.logs && typeof base.logs === 'object'
      ? (base.logs as Record<string, unknown>)
      : {}
  const exercises = Array.isArray(base?.exercises) ? (base.exercises as unknown[]) : []
  const out = new Map<string, { weight: number; reps: number; volume: number }>()

  exercises.forEach((ex: unknown, exIdx: number) => {
    const exObj = ex && typeof ex === 'object' ? (ex as Record<string, unknown>) : {}
    const name = String(exObj?.name || '').trim()
    if (!name) return
    if (onlyNames && !onlyNames.has(name)) return

    const setsCount = getExercisePlannedSetsCount(ex)
    let bestWeight = 0
    let bestReps = 0
    let bestVolume = 0

    for (let setIdx = 0; setIdx < setsCount; setIdx += 1) {
      const key = `${exIdx}-${setIdx}`
      const log = (logs as Record<string, unknown>)?.[key]
      if (!log || typeof log !== 'object') continue
      const logObj = log as Record<string, unknown>
      if (!logObj?.done) continue
      const weight = parseTrainingNumberOrZero(logObj?.weight)
      const reps = parseTrainingNumberOrZero(logObj?.reps)
      if (Number.isFinite(weight) && weight > bestWeight) bestWeight = weight
      if (Number.isFinite(reps) && reps > bestReps) bestReps = reps
      const vol = weight * reps
      if (Number.isFinite(vol) && vol > bestVolume) bestVolume = vol
    }

    const prev = out.get(name) || { weight: 0, reps: 0, volume: 0 }
    out.set(name, {
      weight: Math.max(prev.weight, bestWeight),
      reps: Math.max(prev.reps, bestReps),
      volume: Math.max(prev.volume, bestVolume),
    })
  })

  return out
}

export const computeWorkoutStreak = (dateRows: unknown[]) => {
  const rows = Array.isArray(dateRows) ? dateRows : []
  const daySet = new Set<string>()
  rows.forEach((r) => {
    try {
      const row = r && typeof r === 'object' ? (r as Record<string, unknown>) : {}
      const d = row?.date ? new Date(String(row.date)) : null
      if (!d || Number.isNaN(d.getTime())) return
      daySet.add(d.toISOString().slice(0, 10))
    } catch (e) {
      logWarn('workoutNotifications', 'silenced', e)
    }
  })
  if (!daySet.size) return 0

  const sorted = Array.from(daySet).sort().reverse()
  let cursor = new Date(`${sorted[0]}T00:00:00.000Z`)
  let streak = 0

  while (true) {
    const key = cursor.toISOString().slice(0, 10)
    if (!daySet.has(key)) break
    streak += 1
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000)
  }
  return streak
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function notifyWorkoutFinished(
  userId: string,
  workoutId: string | null,
  sessionObj: Record<string, unknown>,
) {
  try {
    const admin = createAdminClient()
    const { data: me } = await admin
      .from('profiles')
      .select('display_name')
      .eq('id', userId)
      .maybeSingle()
    const name = String(me?.display_name || '').trim() || 'Seu amigo'

    const followerIds = await listFollowerIdsOf(userId)
    const workoutTitle = normalizeWorkoutTitle(String(sessionObj.workoutTitle || 'Treino'))

    // Workout finish notification
    const workoutRecipients = await filterRecipientsByPreference(
      followerIds,
      'notifyFriendWorkoutEvents',
    )
    if (workoutRecipients.length) {
      await insertNotifications(
        workoutRecipients.map((rid) => ({
          user_id: rid,
          recipient_id: rid,
          sender_id: userId,
          type: 'workout_finish',
          title: 'Treino finalizado',
          message: `${name} terminou um treino: ${workoutTitle}.`,
          is_read: false,
          metadata: { workout_id: workoutId, workout_title: workoutTitle, sender_id: userId },
        })),
      )
    }

    const streakMilestones = new Set([3, 7, 14, 30, 60, 100])
    const goalMilestones = new Set([10, 25, 50, 100, 200, 500])

    const [throttleStreak, throttleGoals, throttlePr] = await Promise.all([
      shouldThrottleBySenderType(userId, 'friend_streak', 12 * 60).catch(() => true),
      shouldThrottleBySenderType(userId, 'friend_goal', 12 * 60).catch(() => true),
      shouldThrottleBySenderType(userId, 'friend_pr', 60).catch(() => true),
    ])

    // Streak milestone notification
    try {
      if (!throttleStreak) {
        const { data: dates } = await admin
          .from('workouts')
          .select('date')
          .eq('user_id', userId)
          .eq('is_template', false)
          .order('date', { ascending: false })
          .limit(370)
        const streak = computeWorkoutStreak(Array.isArray(dates) ? dates : [])
        if (streak > 0 && streakMilestones.has(streak)) {
          const recipients = await filterRecipientsByPreference(followerIds, 'notifyFriendStreaks')
          if (recipients.length) {
            await insertNotifications(
              recipients.map((rid) => ({
                user_id: rid,
                recipient_id: rid,
                sender_id: userId,
                type: 'friend_streak',
                title: 'Streak de treino',
                message: `${name} completou ${streak} dia(s) seguidos treinando.`,
                is_read: false,
                metadata: { streak, sender_id: userId },
              })),
            )
          }
        }
      }
    } catch (e) {
      logError('workoutNotifications:streak', e)
    }

    // Goal milestone notification
    try {
      if (!throttleGoals) {
        const { count } = await admin
          .from('workouts')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('is_template', false)
        const total = Number(count || 0)
        if (total > 0 && goalMilestones.has(total)) {
          const recipients = await filterRecipientsByPreference(followerIds, 'notifyFriendGoals')
          if (recipients.length) {
            await insertNotifications(
              recipients.map((rid) => ({
                user_id: rid,
                recipient_id: rid,
                sender_id: userId,
                type: 'friend_goal',
                title: 'Marco atingido',
                message: `${name} completou ${total} treinos no histórico.`,
                is_read: false,
                metadata: { total_workouts: total, sender_id: userId },
              })),
            )
          }
        }
      }
    } catch (e) {
      logError('workoutNotifications:goal', e)
    }

    // PR notification
    try {
      if (!throttlePr) {
        const currentBest = buildBestByExerciseFromSession(sessionObj)
        if (currentBest.size) {
          const onlyNames = new Set(Array.from(currentBest.keys()))
          const { data: history } = await admin
            .from('workouts')
            .select('id, notes')
            .eq('user_id', userId)
            .eq('is_template', false)
            .order('created_at', { ascending: false })
            .limit(160)
          const rows = Array.isArray(history) ? history : []
          const historyBest = new Map<string, { weight: number; reps: number; volume: number }>()
          for (const row of rows) {
            try {
              if (row?.id && workoutId && String(row.id) === String(workoutId)) continue
              let sess: Record<string, unknown> | null = null
              if (typeof row?.notes === 'string')
                sess = parseJsonWithSchema(row.notes, z.record(z.unknown()))
              else if (row?.notes && typeof row.notes === 'object') sess = row.notes
              if (!sess || typeof sess !== 'object') continue
              const best = buildBestByExerciseFromSession(sess, onlyNames)
              best.forEach((v, exName) => {
                const prev = historyBest.get(exName) || { weight: 0, reps: 0, volume: 0 }
                historyBest.set(exName, {
                  weight: Math.max(prev.weight, v.weight),
                  reps: Math.max(prev.reps, v.reps),
                  volume: Math.max(prev.volume, v.volume),
                })
              })
            } catch (e) {
              logWarn('workoutNotifications', 'silenced', e)
            }
          }

          const prs: { exercise: string; label: string; value: string; score: number }[] = []
          currentBest.forEach((cur, exName) => {
            const hist = historyBest.get(exName) || { weight: 0, reps: 0, volume: 0 }
            const volumePr = cur.volume > 0 && cur.volume > hist.volume
            const weightPr = cur.weight > 0 && cur.weight > hist.weight
            const repsPr = cur.reps > 0 && cur.reps > hist.reps
            if (!volumePr && !weightPr && !repsPr) return
            if (volumePr) {
              prs.push({ exercise: exName, label: 'Volume', value: `${cur.volume.toLocaleString('pt-BR')}kg`, score: cur.volume })
              return
            }
            if (weightPr) {
              prs.push({ exercise: exName, label: 'Carga', value: `${cur.weight.toLocaleString('pt-BR')}kg`, score: cur.weight })
              return
            }
            prs.push({ exercise: exName, label: 'Reps', value: `${Math.round(cur.reps)} reps`, score: cur.reps })
          })

          prs.sort((a, b) => b.score - a.score)
          const top = prs.slice(0, 3)
          if (top.length) {
            const recipients = await filterRecipientsByPreference(followerIds, 'notifyFriendPRs')
            if (recipients.length) {
              const summary = top.map((p) => `${p.exercise}: ${p.label} ${p.value}`).join(' • ')
              await insertNotifications(
                recipients.map((rid) => ({
                  user_id: rid,
                  recipient_id: rid,
                  sender_id: userId,
                  type: 'friend_pr',
                  title: 'PR batido',
                  message: `${name} bateu PR: ${summary}.`,
                  is_read: false,
                  metadata: { prs: top, workout_id: workoutId, sender_id: userId },
                })),
              )
            }
          }
        }
      }
    } catch (e) {
      logError('workoutNotifications:pr', e)
    }
  } catch (e) {
    logError('workoutNotifications', e)
  }
}

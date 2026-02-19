import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { normalizeWorkoutTitle } from '@/utils/workoutTitle'
import { createAdminClient } from '@/utils/supabase/admin'
import { filterRecipientsByPreference, insertNotifications, listFollowerIdsOf, shouldThrottleBySenderType } from '@/lib/social/notifyFollowers'
import { parseJsonBody } from '@/utils/zod'

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

const buildBestByExerciseFromSession = (session: Record<string, unknown>, onlyNames?: Set<string>) => {
  const base = session && typeof session === 'object' ? session : null
  const logs = base?.logs && typeof base.logs === 'object' ? (base.logs as Record<string, unknown>) : {}
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
      if (!Boolean(logObj?.done)) continue
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

const computeWorkoutStreak = (dateRows: unknown[]) => {
  const rows = Array.isArray(dateRows) ? dateRows : []
  const daySet = new Set<string>()
  rows.forEach((r) => {
    try {
      const row = r && typeof r === 'object' ? (r as Record<string, unknown>) : {}
      const d = row?.date ? new Date(String(row.date)) : null
      if (!d || Number.isNaN(d.getTime())) return
      const day = d.toISOString().slice(0, 10)
      daySet.add(day)
    } catch {}
  })
  if (!daySet.size) return 0

  const sorted = Array.from(daySet).sort().reverse()
  const start = sorted[0]
  let cursor = new Date(`${start}T00:00:00.000Z`)
  let streak = 0

  while (true) {
    const key = cursor.toISOString().slice(0, 10)
    if (!daySet.has(key)) break
    streak += 1
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000)
  }
  return streak
}

const BodySchema = z
  .object({
    session: z.unknown(),
    idempotencyKey: z.string().optional(),
  })
  .passthrough()

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    
    const admin = createAdminClient()

    const parsedBody = await parseJsonBody(request, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data as Record<string, unknown>
    const session = (body as Record<string, unknown>)?.session
    if (!session) return NextResponse.json({ ok: false, error: 'missing session' }, { status: 400 })
    const sessionObj = session && typeof session === 'object' ? (session as Record<string, unknown>) : ({} as Record<string, unknown>)
    const idempotencyKey = String((body as Record<string, unknown>)?.idempotencyKey || sessionObj?.idempotencyKey || sessionObj?.finishIdempotencyKey || '').trim()
    const reqId =
      (() => {
        try {
          if (typeof crypto !== 'undefined' && 'randomUUID' in crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
        } catch {}
        return `${Date.now()}-${Math.random().toString(16).slice(2)}`
      })()

    try {
      await admin.from('user_activity_events').insert({
        user_id: user.id,
        event_name: 'workout_finish_api',
        event_type: 'api',
        path: '/api/workouts/finish',
        metadata: {
          stage: 'start',
          reqId,
          idempotencyKey: idempotencyKey || null,
          exercisesCount: Array.isArray(sessionObj?.exercises) ? (sessionObj.exercises as unknown[]).length : null,
        },
        client_ts: sessionObj?.date ? new Date(String(sessionObj.date)).toISOString() : null,
        user_agent: request.headers.get('user-agent') || null,
      })
    } catch {}

    const baseInsert = {
      user_id: user.id,
      created_by: user.id,
      name: normalizeWorkoutTitle(String(sessionObj.workoutTitle || 'Treino Realizado')),
      date: new Date(String(sessionObj?.date ?? new Date().toISOString())),
      completed_at: new Date().toISOString(),
      is_template: false,
      notes: JSON.stringify(session),
    } as Record<string, unknown>

    let saved: { id: string; [key: string]: unknown } | null = null
    let idempotent = false

    const tryInsert = async (withIdempotencyKey: boolean) => {
      const payload = withIdempotencyKey && idempotencyKey ? { ...baseInsert, finish_idempotency_key: idempotencyKey } : baseInsert
      return await supabase.from('workouts').insert(payload).select('id, created_at').single()
    }

    let insertRes = await tryInsert(true)
    if (insertRes?.error) {
      const code = String(((insertRes.error as unknown) as Record<string, unknown>)?.code ?? '')
      const msg = String(insertRes.error.message || '')
      if (code === '23505' && idempotencyKey) {
        try {
          const { data: existing } = await supabase
            .from('workouts')
            .select('id, created_at')
            .eq('user_id', user.id)
            .eq('is_template', false)
            .eq('finish_idempotency_key', idempotencyKey)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (existing?.id) {
            saved = existing as { id: string; [key: string]: unknown }
            idempotent = true
            insertRes = { data: existing, error: null } as unknown as typeof insertRes
          }
        } catch {}
      } else if (msg.toLowerCase().includes('finish_idempotency_key') && msg.toLowerCase().includes('does not exist')) {
        insertRes = await tryInsert(false)
      }
    }

    const { data, error } = insertRes
    saved = saved || (data as { id: string; [key: string]: unknown } | null)

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    try {
      await supabase.from('active_workout_sessions').delete().eq('user_id', user.id)
    } catch {}

    try {
      const { data: me } = await admin.from('profiles').select('display_name').eq('id', user.id).maybeSingle()
      const name = String(me?.display_name || '').trim() || 'Seu amigo'

      const followerIds = await listFollowerIdsOf(user.id)
      const workoutTitle = normalizeWorkoutTitle(String(sessionObj.workoutTitle || 'Treino'))

      const workoutRecipients = await filterRecipientsByPreference(followerIds, 'notifyFriendWorkoutEvents')
      if (workoutRecipients.length) {
        await insertNotifications(
          workoutRecipients.map((rid) => ({
            user_id: rid,
            recipient_id: rid,
            sender_id: user.id,
            type: 'workout_finish',
            title: 'Treino finalizado',
            message: `${name} terminou um treino: ${workoutTitle}.`,
            read: false,
            is_read: false,
            metadata: { workout_id: data?.id ?? null, workout_title: workoutTitle, sender_id: user.id },
          }))
        )
      }

      const streakMilestones = new Set([3, 7, 14, 30, 60, 100])
      const goalMilestones = new Set([10, 25, 50, 100, 200, 500])

      try {
        const throttleStreak = await shouldThrottleBySenderType(user.id, 'friend_streak', 12 * 60)
        if (!throttleStreak) {
          const { data: dates } = await admin
            .from('workouts')
            .select('date')
            .eq('user_id', user.id)
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
                  sender_id: user.id,
                  type: 'friend_streak',
                  title: 'Streak de treino',
                  message: `${name} completou ${streak} dia(s) seguidos treinando.`,
                  read: false,
                  is_read: false,
                  metadata: { streak, sender_id: user.id },
                }))
              )
            }
          }
        }
      } catch {}

      try {
        const throttleGoals = await shouldThrottleBySenderType(user.id, 'friend_goal', 12 * 60)
        if (!throttleGoals) {
          const { count } = await admin
            .from('workouts')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('is_template', false)
          const total = Number(count || 0)
          if (total > 0 && goalMilestones.has(total)) {
            const recipients = await filterRecipientsByPreference(followerIds, 'notifyFriendGoals')
            if (recipients.length) {
              await insertNotifications(
                recipients.map((rid) => ({
                  user_id: rid,
                  recipient_id: rid,
                  sender_id: user.id,
                  type: 'friend_goal',
                  title: 'Marco atingido',
                  message: `${name} completou ${total} treinos no histórico.`,
                  read: false,
                  is_read: false,
                  metadata: { total_workouts: total, sender_id: user.id },
                }))
              )
            }
          }
        }
      } catch {}

      try {
        const throttlePr = await shouldThrottleBySenderType(user.id, 'friend_pr', 60)
        if (!throttlePr) {
          const currentBest = buildBestByExerciseFromSession(sessionObj)
          if (currentBest.size) {
            const exerciseNames = Array.from(currentBest.keys())
            const prevBest = new Map<string, { weight: number; reps: number; volume: number }>()
            try {
              const { data: existing } = await admin
                .from('exercise_personal_records')
                .select('exercise_name, best_weight, best_reps, best_volume')
                .eq('user_id', user.id)
                .in('exercise_name', exerciseNames)
              const existingRows = Array.isArray(existing) ? existing : []
              for (const row of existingRows) {
                try {
                  const r = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
                  const exerciseName = String(r.exercise_name || '').trim()
                  if (!exerciseName) continue
                  prevBest.set(exerciseName, {
                    weight: Number(r.best_weight ?? 0),
                    reps: Number(r.best_reps ?? 0),
                    volume: Number(r.best_volume ?? 0),
                  })
                } catch {}
              }
            } catch {}

            const nowIso = new Date().toISOString()
            const upsertRows: Array<Record<string, unknown>> = []
            const prs: { exercise: string; label: string; value: string; score: number }[] = []
            currentBest.forEach((cur, exName) => {
              const hist = prevBest.get(exName) || { weight: 0, reps: 0, volume: 0 }
              const volumePr = cur.volume > 0 && cur.volume > hist.volume
              const weightPr = cur.weight > 0 && cur.weight > hist.weight
              const repsPr = cur.reps > 0 && cur.reps > hist.reps
              if (!volumePr && !weightPr && !repsPr) return

              upsertRows.push({
                user_id: user.id,
                exercise_name: exName,
                best_weight: Math.max(hist.weight, cur.weight),
                best_reps: Math.max(hist.reps, cur.reps),
                best_volume: Math.max(hist.volume, cur.volume),
                workout_id: saved?.id ?? null,
                achieved_at: nowIso,
                updated_at: nowIso,
              })

              if (volumePr) {
                prs.push({
                  exercise: exName,
                  label: 'Volume',
                  value: `${cur.volume.toLocaleString('pt-BR')}kg`,
                  score: cur.volume,
                })
                return
              }
              if (weightPr) {
                prs.push({
                  exercise: exName,
                  label: 'Carga',
                  value: `${cur.weight.toLocaleString('pt-BR')}kg`,
                  score: cur.weight,
                })
                return
              }
              prs.push({
                exercise: exName,
                label: 'Reps',
                value: `${Math.round(cur.reps)} reps`,
                score: cur.reps,
              })
            })

            if (upsertRows.length) {
              try {
                await admin.from('exercise_personal_records').upsert(upsertRows, {
                  onConflict: 'user_id, exercise_name',
                  ignoreDuplicates: false,
                })
              } catch {}
            }

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
                    sender_id: user.id,
                    type: 'friend_pr',
                    title: 'PR batido',
                    message: `${name} bateu PR: ${summary}.`,
                    read: false,
                    is_read: false,
                    metadata: { prs: top, workout_id: data?.id ?? null, sender_id: user.id },
                  }))
                )
              }
            }
          }
        }
      } catch {}
    } catch {}

    try {
      await admin.from('user_activity_events').insert({
        user_id: user.id,
        event_name: 'workout_finish_api',
        event_type: 'api',
        path: '/api/workouts/finish',
        metadata: {
          stage: 'success',
          reqId,
          idempotent,
          savedId: saved?.id ?? null,
        },
        user_agent: request.headers.get('user-agent') || null,
      })
    } catch {}

    return NextResponse.json({ ok: true, saved, idempotent })
  } catch (e: any) {
    const msg = (e as Record<string, unknown>)?.message
    return NextResponse.json({ ok: false, error: typeof msg === 'string' ? msg : 'unknown_error' }, { status: 500 })
  }
}

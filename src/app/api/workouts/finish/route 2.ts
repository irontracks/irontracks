import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { normalizeWorkoutTitle } from '@/utils/workoutTitle'
import { createAdminClient } from '@/utils/supabase/admin'
import { filterRecipientsByPreference, insertNotifications, listFollowerIdsOf, shouldThrottleBySenderType } from '@/lib/social/notifyFollowers'

const parseTrainingNumberOrZero = (v: any) => {
  const n = typeof v === 'number' ? v : Number(String(v || '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

const getExercisePlannedSetsCount = (ex: any) => {
  try {
    const bySets = Math.max(0, Number(ex?.sets) || 0)
    const byDetails = Array.isArray(ex?.setDetails) ? ex.setDetails.length : Array.isArray(ex?.set_details) ? ex.set_details.length : 0
    return Math.max(bySets, byDetails)
  } catch {
    return 0
  }
}

const buildBestByExerciseFromSession = (session: any, onlyNames?: Set<string>) => {
  const base = session && typeof session === 'object' ? session : null
  const logs = base?.logs && typeof base.logs === 'object' ? base.logs : {}
  const exercises = Array.isArray(base?.exercises) ? base.exercises : []
  const out = new Map<string, { weight: number; reps: number; volume: number }>()

  exercises.forEach((ex: any, exIdx: number) => {
    const name = String(ex?.name || '').trim()
    if (!name) return
    if (onlyNames && !onlyNames.has(name)) return

    const setsCount = getExercisePlannedSetsCount(ex)
    let bestWeight = 0
    let bestReps = 0
    let bestVolume = 0

    for (let setIdx = 0; setIdx < setsCount; setIdx += 1) {
      const key = `${exIdx}-${setIdx}`
      const log = (logs as any)?.[key]
      if (!log || typeof log !== 'object') continue
      if (!log?.done) continue
      const weight = parseTrainingNumberOrZero(log?.weight)
      const reps = parseTrainingNumberOrZero(log?.reps)
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

const computeWorkoutStreak = (dateRows: any[]) => {
  const rows = Array.isArray(dateRows) ? dateRows : []
  const daySet = new Set<string>()
  rows.forEach((r) => {
    try {
      const d = r?.date ? new Date(r.date) : null
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

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const session = body && typeof body === 'object' ? body.session ?? body : null
    if (!session) return NextResponse.json({ ok: false, error: 'missing session' }, { status: 400 })

    const { data, error } = await supabase
      .from('workouts')
      .insert({
        user_id: user.id,
        created_by: user.id,
        name: normalizeWorkoutTitle(session.workoutTitle || 'Treino Realizado'),
        date: new Date(session?.date ?? new Date()),
        completed_at: new Date().toISOString(),
        is_template: false,
        notes: JSON.stringify(session),
      })
      .select('id, created_at')
      .single()

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    try {
      await supabase.from('active_workout_sessions').delete().eq('user_id', user.id)
    } catch {}

    try {
      const admin = createAdminClient()
      const { data: me } = await admin.from('profiles').select('display_name').eq('id', user.id).maybeSingle()
      const name = String(me?.display_name || '').trim() || 'Seu amigo'

      const followerIds = await listFollowerIdsOf(user.id)
      const workoutTitle = normalizeWorkoutTitle(session.workoutTitle || 'Treino')

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
          })),
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
                })),
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
                })),
              )
            }
          }
        }
      } catch {}

      try {
        const throttlePr = await shouldThrottleBySenderType(user.id, 'friend_pr', 60)
        if (!throttlePr) {
          const currentBest = buildBestByExerciseFromSession(session)
          if (currentBest.size) {
            const onlyNames = new Set(Array.from(currentBest.keys()))
            const { data: history } = await admin
              .from('workouts')
              .select('id, notes')
              .eq('user_id', user.id)
              .eq('is_template', false)
              .order('created_at', { ascending: false })
              .limit(160)
            const rows = Array.isArray(history) ? history : []
            const historyBest = new Map<string, { weight: number; reps: number; volume: number }>()
            for (const row of rows) {
              try {
                if (row?.id && data?.id && String(row.id) === String(data.id)) continue
                let sess: any = null
                if (typeof row?.notes === 'string') sess = JSON.parse(row.notes)
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
              } catch {}
            }

            const prs: { exercise: string; label: string; value: string; score: number }[] = []
            currentBest.forEach((cur, exName) => {
              const hist = historyBest.get(exName) || { weight: 0, reps: 0, volume: 0 }
              const volumePr = cur.volume > 0 && cur.volume > hist.volume
              const weightPr = cur.weight > 0 && cur.weight > hist.weight
              const repsPr = cur.reps > 0 && cur.reps > hist.reps
              if (!volumePr && !weightPr && !repsPr) return
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
                  })),
                )
              }
            }
          }
        }
      } catch {}
    } catch {}

    return NextResponse.json({ ok: true, saved: data })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}


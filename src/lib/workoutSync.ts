import { createAdminClient } from '@/utils/supabase/admin'

type SyncResult = { created: number; updated: number; failed: number }

let supportsSourceWorkoutId: boolean | null = null
let supportsSubscriptions: boolean | null = null

const selectTemplate = `
  id,
  name,
  notes,
  is_template,
  created_by,
  user_id,
  exercises (
    id,
    name,
    notes,
    rest_time,
    video_url,
    method,
    cadence,
    order,
    sets (
      weight,
      reps,
      rpe,
      set_number,
      is_warmup,
      advanced_config
    )
  )
`

const safeArray = <T>(v: any): T[] => (Array.isArray(v) ? (v as T[]) : [])

const normalizeName = (name: string) =>
  String(name || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

const sortByOrder = (rows: any[]) =>
  rows.slice().sort((a, b) => (Number(a?.order) || 0) - (Number(b?.order) || 0))

const sortBySetNumber = (rows: any[]) =>
  rows.slice().sort((a, b) => (Number(a?.set_number) || 0) - (Number(b?.set_number) || 0))

const getAdmin = () => {
  try {
    return createAdminClient()
  } catch {
    return null
  }
}

const detectSupports = async (admin: any) => {
  if (supportsSourceWorkoutId === null) {
    try {
      const { error } = await admin.from('workouts').select('id, source_workout_id').limit(1)
      supportsSourceWorkoutId = !error
    } catch {
      supportsSourceWorkoutId = false
    }
  }

  if (supportsSubscriptions === null) {
    try {
      const { error } = await admin.from('workout_sync_subscriptions').select('id').limit(1)
      supportsSubscriptions = !error
    } catch {
      supportsSubscriptions = false
    }
  }
}

const upsertSyncedWorkout = async ({
  admin,
  sourceUserId,
  targetUserId,
  template,
}: {
  admin: any
  sourceUserId: string
  targetUserId: string
  template: any
}): Promise<{ created: boolean; workoutId: string } | null> => {
  await detectSupports(admin)
  const sourceWorkoutId = String(template?.id || '').trim()
  if (!sourceWorkoutId) return null

  let existingBySource: any = null
  if (supportsSourceWorkoutId) {
    const { data } = await admin
      .from('workouts')
      .select('id')
      .eq('user_id', targetUserId)
      .eq('source_workout_id', sourceWorkoutId)
      .maybeSingle()
    existingBySource = data
  }

  let targetWorkoutId = existingBySource?.id ? String(existingBySource.id) : ''

  if (!targetWorkoutId) {
    const { data: byName } = await admin
      .from('workouts')
      .select('id, name, created_at')
      .eq('user_id', targetUserId)
      .eq('is_template', true)
      .eq('created_by', sourceUserId)
      .eq('name', template?.name || '')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    targetWorkoutId = byName?.id ? String(byName.id) : ''
  }

  if (targetWorkoutId) {
    const updatePayload: any = {
      name: template?.name ?? '',
      notes: template?.notes ?? null,
      is_template: true,
      created_by: sourceUserId,
    }
    if (supportsSourceWorkoutId) updatePayload.source_workout_id = sourceWorkoutId

    await admin.from('workouts').update(updatePayload).eq('id', targetWorkoutId).eq('user_id', targetUserId)
    return { created: false, workoutId: targetWorkoutId }
  }

  const insertPayload: any = {
    user_id: targetUserId,
    name: template?.name ?? '',
    notes: template?.notes ?? null,
    is_template: true,
    created_by: sourceUserId,
  }
  if (supportsSourceWorkoutId) insertPayload.source_workout_id = sourceWorkoutId

  const { data: createdRow, error } = await admin
    .from('workouts')
    .insert(insertPayload)
    .select('id')
    .single()

  if (error || !createdRow?.id) return null
  return { created: true, workoutId: String(createdRow.id) }
}

const replaceExercisesAndSets = async ({
  admin,
  targetWorkoutId,
  template,
}: {
  admin: any
  targetWorkoutId: string
  template: any
}) => {
  const { data: oldExs } = await admin.from('exercises').select('id').eq('workout_id', targetWorkoutId)
  const oldExIds = safeArray<any>(oldExs).map((x) => x?.id).filter(Boolean)
  if (oldExIds.length > 0) await admin.from('sets').delete().in('exercise_id', oldExIds)
  await admin.from('exercises').delete().eq('workout_id', targetWorkoutId)

  const exercises = sortByOrder(safeArray<any>(template?.exercises).filter((x) => x && typeof x === 'object'))
  for (const e of exercises) {
    const { data: newEx, error } = await admin
      .from('exercises')
      .insert({
        workout_id: targetWorkoutId,
        name: e?.name ?? '',
        notes: e?.notes ?? '',
        rest_time: e?.rest_time ?? null,
        video_url: e?.video_url ?? null,
        method: e?.method ?? null,
        cadence: e?.cadence ?? null,
        order: e?.order ?? 0,
      })
      .select('id')
      .single()

    if (error || !newEx?.id) continue

    const sets = sortBySetNumber(safeArray<any>(e?.sets).filter((x) => x && typeof x === 'object'))
    if (sets.length === 0) continue
    await admin.from('sets').insert(
      sets.map((s) => ({
        exercise_id: newEx.id,
        weight: s?.weight ?? null,
        reps: s?.reps ?? null,
        rpe: s?.rpe ?? null,
        set_number: s?.set_number ?? 1,
        is_warmup: !!s?.is_warmup,
        advanced_config: s?.advanced_config ?? null,
        completed: false,
      })),
    )
  }
}

export async function syncAllTemplatesToSubscriber({
  sourceUserId,
  targetUserId,
}: {
  sourceUserId: string
  targetUserId: string
}): Promise<SyncResult> {
  const admin = getAdmin()
  if (!admin) return { created: 0, updated: 0, failed: 0 }
  await detectSupports(admin)

  let query = admin.from('workouts').select(selectTemplate).eq('is_template', true).eq('user_id', sourceUserId).order('name')
  if (supportsSourceWorkoutId) query = query.is('source_workout_id', null)
  const { data: templates, error } = await query

  if (error) return { created: 0, updated: 0, failed: 0 }

  let created = 0
  let updated = 0
  let failed = 0

  for (const t of safeArray<any>(templates)) {
    try {
      const up = await upsertSyncedWorkout({ admin, sourceUserId, targetUserId, template: t })
      if (!up?.workoutId) {
        failed++
        continue
      }
      await replaceExercisesAndSets({ admin, targetWorkoutId: up.workoutId, template: t })
      if (up.created) created++
      else updated++
    } catch {
      failed++
    }
  }

  return { created, updated, failed }
}

export async function syncTemplateToSubscribers({
  sourceUserId,
  sourceWorkoutId,
}: {
  sourceUserId: string
  sourceWorkoutId: string
}): Promise<SyncResult> {
  const admin = getAdmin()
  if (!admin) return { created: 0, updated: 0, failed: 0 }
  await detectSupports(admin)
  if (!supportsSubscriptions) return { created: 0, updated: 0, failed: 0 }

  const { data: subs } = await admin
    .from('workout_sync_subscriptions')
    .select('target_user_id')
    .eq('source_user_id', sourceUserId)
    .eq('active', true)

  const targets = safeArray<any>(subs).map((s) => String(s?.target_user_id || '')).filter(Boolean)
  if (targets.length === 0) return { created: 0, updated: 0, failed: 0 }

  const { data: template } = await admin
    .from('workouts')
    .select(selectTemplate)
    .eq('id', sourceWorkoutId)
    .eq('is_template', true)
    .eq('user_id', sourceUserId)
    .maybeSingle()

  if (!template?.id) return { created: 0, updated: 0, failed: 0 }

  let created = 0
  let updated = 0
  let failed = 0

  for (const targetUserId of targets) {
    try {
      const up = await upsertSyncedWorkout({ admin, sourceUserId, targetUserId, template })
      if (!up?.workoutId) {
        failed++
        continue
      }
      await replaceExercisesAndSets({ admin, targetWorkoutId: up.workoutId, template })
      if (up.created) created++
      else updated++
    } catch {
      failed++
    }
  }

  return { created, updated, failed }
}

export async function deleteTemplateFromSubscribers({
  sourceUserId,
  sourceWorkoutId,
}: {
  sourceUserId: string
  sourceWorkoutId: string
}) {
  const admin = getAdmin()
  if (!admin) return
  await detectSupports(admin)
  if (!supportsSourceWorkoutId) return
  await admin.from('workouts').delete().eq('source_workout_id', sourceWorkoutId).eq('created_by', sourceUserId)
}

export async function isWorkoutSyncActive({
  sourceUserId,
  targetUserId,
}: {
  sourceUserId: string
  targetUserId: string
}): Promise<boolean> {
  const admin = getAdmin()
  if (!admin) return false
  await detectSupports(admin)
  if (!supportsSubscriptions) return false
  const { data } = await admin
    .from('workout_sync_subscriptions')
    .select('id, active')
    .eq('source_user_id', sourceUserId)
    .eq('target_user_id', targetUserId)
    .maybeSingle()
  return !!data?.id && data?.active === true
}

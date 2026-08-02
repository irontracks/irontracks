import { createAdminClient } from '@/utils/supabase/admin'
import { logError } from '@/lib/logger'

type SyncResult = { created: number; updated: number; failed: number }

type SupabaseAdmin = ReturnType<typeof import('@/utils/supabase/admin').createAdminClient>

interface WorkoutTemplate {
  id: string
  name: string
  notes?: string | null
  is_template: boolean
  created_by?: string | null
  user_id?: string | null
  source_workout_id?: string | null
  exercises?: ExerciseRow[]
}

interface ExerciseRow {
  id?: string
  name: string
  notes?: string | null
  rest_time?: number | null
  video_url?: string | null
  method?: string | null
  cadence?: string | null
  order?: number
  sets?: SetRow[]
}

interface SetRow {
  id?: string
  weight?: number | null
  reps?: string | null
  rpe?: number | null
  set_number?: number
  is_warmup?: boolean | null
  advanced_config?: unknown
}

let supportsSourceWorkoutId: boolean | null = null
let supportsSubscriptions: boolean | null = null
let supportsDetectedAt = 0 // R8#2: TTL for re-detection in serverless
const SUPPORTS_TTL_MS = 5 * 60 * 1000 // 5 minutes

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

const safeArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

const sortByOrder = (rows: Array<Record<string, unknown>>) =>
  rows.slice().sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))

const sortBySetNumber = (rows: Array<Record<string, unknown>>) =>
  rows.slice().sort((a, b) => (Number(a.set_number) || 0) - (Number(b.set_number) || 0))

const normalizeText = (s: unknown): string =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

const templateSignature = (tpl: WorkoutTemplate): string => {
  const nameParts: string[] = []
  const exs = sortByOrder(
    safeArray<ExerciseRow>(tpl?.exercises ?? []) as unknown as Array<Record<string, unknown>>,
  )
  for (const row of exs) {
    const e = row as unknown as ExerciseRow
    const en = normalizeText(e?.name || '')
    const sets = sortBySetNumber(
      safeArray<SetRow>(e?.sets ?? []) as Array<Record<string, unknown>>,
    )
    const method = normalizeText(e?.method || '')
    const fallbackSets = method === 'cardio' ? 1 : 4
    const setCount = sets.length > 0 ? sets.length : fallbackSets
    nameParts.push(`${en}#${setCount}`)
  }
  return nameParts.join('|')
}

const getAdmin = (): SupabaseAdmin | null => {
  try {
    return createAdminClient()
  } catch (e) {
    logError('workoutSync.getAdmin', e)
    return null
  }
}

const detectSupports = async (admin: SupabaseAdmin): Promise<void> => {
  // R8#2: Reset cached detection after TTL to avoid stale false in serverless
  const now = Date.now()
  if (supportsDetectedAt && now - supportsDetectedAt > SUPPORTS_TTL_MS) {
    supportsSourceWorkoutId = null
    supportsSubscriptions = null
  }

  if (supportsSourceWorkoutId !== true) {
    try {
      const { error } = await admin.from('workouts').select('id, source_workout_id').limit(1)
      supportsSourceWorkoutId = !error
    } catch (e) {
      logError('workoutSync.detectSupports.sourceWorkoutId', e)
      supportsSourceWorkoutId = false
    }
  }

  if (supportsSubscriptions !== true) {
    try {
      const { error } = await admin.from('workout_sync_subscriptions').select('id').limit(1)
      supportsSubscriptions = !error
    } catch (e) {
      logError('workoutSync.detectSupports.subscriptions', e)
      supportsSubscriptions = false
    }
  }

  supportsDetectedAt = now
}

const upsertSyncedWorkout = async ({
  admin,
  sourceUserId,
  targetUserId,
  template,
}: {
  admin: SupabaseAdmin
  sourceUserId: string
  targetUserId: string
  template: WorkoutTemplate
}): Promise<{ created: boolean; workoutId: string } | null> => {
  await detectSupports(admin)
  const sourceWorkoutId = String(template?.id || '').trim()
  if (!sourceWorkoutId) return null

  let existingBySource: WorkoutTemplate | null = null
  if (supportsSourceWorkoutId) {
    const res = await admin
      .from('workouts')
      .select('id')
      .eq('user_id', targetUserId)
      .eq('source_workout_id', sourceWorkoutId)
      .maybeSingle()
    const data: unknown = res.data
    existingBySource = data && typeof data === 'object' ? (data as WorkoutTemplate) : null
  }

  let targetWorkoutId = existingBySource?.id ? String(existingBySource.id) : ''

  if (!targetWorkoutId) {
    const res = await admin
      .from('workouts')
      .select('id, name, created_at')
      .eq('user_id', targetUserId)
      .eq('is_template', true)
      .eq('created_by', sourceUserId)
      .eq('name', template?.name || '')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const byName: unknown = res.data
    targetWorkoutId = String((byName as Record<string, unknown>)?.id || '').trim()
  }

  if (targetWorkoutId) {
    const updatePayload: Record<string, unknown> = {
      name: template?.name ?? '',
      notes: template?.notes ?? null,
      is_template: true,
      created_by: sourceUserId,
    }
    if (supportsSourceWorkoutId) updatePayload.source_workout_id = sourceWorkoutId

    await admin.from('workouts').update(updatePayload).eq('id', targetWorkoutId).eq('user_id', targetUserId)
    return { created: false, workoutId: targetWorkoutId }
  }

  const insertPayload: Record<string, unknown> = {
    user_id: targetUserId,
    name: template?.name ?? '',
    notes: template?.notes ?? null,
    is_template: true,
    created_by: sourceUserId,
  }
  if (supportsSourceWorkoutId) insertPayload.source_workout_id = sourceWorkoutId

  const { data: createdRowRaw, error } = await admin
    .from('workouts')
    .insert(insertPayload)
    .select('id')
    .single()

  const createdRow: unknown = createdRowRaw
  const createdId = String((createdRow as Record<string, unknown>)?.id || '').trim()
  if (error || !createdId) return null
  return { created: true, workoutId: createdId }
}

const replaceExercisesAndSets = async ({
  admin,
  targetWorkoutId,
  template,
}: {
  admin: SupabaseAdmin
  targetWorkoutId: string
  template: WorkoutTemplate
}) => {
  const oldRes = await admin.from('exercises').select('id').eq('workout_id', targetWorkoutId)
  const oldExs: unknown = oldRes.data
  const oldExIds = safeArray<Record<string, unknown>>(oldExs)
    .map((x) => String(x?.id || '').trim())
    .filter(Boolean)
  if (oldExIds.length > 0) await admin.from('sets').delete().in('exercise_id', oldExIds)
  await admin.from('exercises').delete().eq('workout_id', targetWorkoutId)

  const exercises = sortByOrder(
    safeArray<ExerciseRow>(template?.exercises ?? [])
      .filter((x) => x && typeof x === 'object')
      .map((x) => x as unknown as Record<string, unknown>),
  )
  for (const e of exercises) {
    const ex = e as unknown as ExerciseRow
    const { data: newEx, error } = await admin
      .from('exercises')
      .insert({
        workout_id: targetWorkoutId,
        name: ex?.name ?? '',
        notes: ex?.notes ?? '',
        rest_time: ex?.rest_time ?? null,
        video_url: ex?.video_url ?? null,
        method: ex?.method ?? null,
        cadence: ex?.cadence ?? null,
        order: ex?.order ?? 0,
      })
      .select('id')
      .single()

    if (error || !newEx?.id) continue

    const sets = sortBySetNumber(
      safeArray<SetRow>(ex?.sets ?? [])
        .filter((x) => x && typeof x === 'object')
        .map((x) => x as Record<string, unknown>),
    )
    if (sets.length === 0) continue
    await admin.from('sets').insert(
      sets.map((s) => {
        const set = s as SetRow
        return {
          exercise_id: newEx.id,
          weight: set?.weight ?? null,
          reps: set?.reps ?? null,
          rpe: set?.rpe ?? null,
          set_number: set?.set_number ?? 1,
          is_warmup: !!set?.is_warmup,
          advanced_config: set?.advanced_config ?? null,
          completed: false,
        }
      }),
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

  let query = admin
    .from('workouts')
    .select(selectTemplate)
    .eq('user_id', sourceUserId)
    .eq('is_template', true)
    .order('name')
  const { data: templatesRaw, error } = await query
  const templates: unknown = templatesRaw

  if (error) return { created: 0, updated: 0, failed: 0 }

  const syncable = safeArray<WorkoutTemplate>(templates).filter((t) => t?.is_template === true)

  let existingBySource = new Map<string, WorkoutTemplate>()
  let existingBySignature = new Map<string, WorkoutTemplate>()
  if (supportsSourceWorkoutId) {
    const res = await admin
      .from('workouts')
      .select(selectTemplate)
      .eq('user_id', targetUserId)
      .eq('created_by', sourceUserId)
      .eq('is_template', true)

    const existing: unknown = res.data
    const exRows = safeArray<WorkoutTemplate>(existing)
    for (const w of exRows) {
      const sid = String(w?.source_workout_id || '').trim()
      if (sid) existingBySource.set(sid, w)
      else existingBySignature.set(templateSignature(w), w)
    }
  }

  let created = 0
  let updated = 0
  let failed = 0

  for (const t of syncable) {
    try {
      const sourceWorkoutId = String(t?.id || '').trim()
      if (supportsSourceWorkoutId && sourceWorkoutId && !existingBySource.has(sourceWorkoutId)) {
        const sig = templateSignature(t)
        const candidate = existingBySignature.get(sig)
        if (candidate?.id) {
          await admin
            .from('workouts')
            .update({
              source_workout_id: sourceWorkoutId,
              name: t?.name ?? '',
              notes: t?.notes ?? null,
              is_template: true,
              created_by: sourceUserId,
            })
            .eq('id', candidate.id)
            .eq('user_id', targetUserId)
          existingBySource.set(sourceWorkoutId, { ...candidate, source_workout_id: sourceWorkoutId })
        }
      }

      const up = await upsertSyncedWorkout({ admin, sourceUserId, targetUserId, template: t })
      if (!up?.workoutId) {
        failed++
        continue
      }
      await replaceExercisesAndSets({ admin, targetWorkoutId: up.workoutId, template: t })
      if (up.created) created++
      else updated++
    } catch (e) {
      logError('syncAllTemplatesToSubscriber', e)
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

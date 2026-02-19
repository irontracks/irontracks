import { z } from 'zod'

export const ProfileRowSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email().nullable(),
  display_name: z.string().nullable(),
  photo_url: z.string().url().nullable().or(z.literal('')).nullable(),
  last_seen: z.string().nullable(),
  role: z.enum(['user', 'teacher', 'admin']).default('user'),
})
export const ProfileSchema = ProfileRowSchema.transform((row) => ({
  id: row.id,
  email: row.email,
  displayName: row.display_name,
  photoUrl: row.photo_url,
  lastSeen: row.last_seen,
  role: row.role,
}))
export type ProfileRow = z.infer<typeof ProfileRowSchema>
export type Profile = z.infer<typeof ProfileSchema>

export const WorkoutRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  date: z.string(),
  name: z.string(),
  notes: z.string().nullable(),
  is_template: z.boolean().default(false),
  created_at: z.string(),
})
export const WorkoutSchema = WorkoutRowSchema.transform((row) => ({
  id: row.id,
  userId: row.user_id,
  date: row.date,
  name: row.name,
  notes: row.notes,
  isTemplate: row.is_template,
  createdAt: row.created_at,
}))
export type WorkoutRow = z.infer<typeof WorkoutRowSchema>
export type Workout = z.infer<typeof WorkoutSchema>

export const ExerciseRowSchema = z.object({
  id: z.string().uuid(),
  workout_id: z.string().uuid(),
  name: z.string(),
  muscle_group: z.string().nullable(),
  notes: z.string().nullable(),
  video_url: z.string().url().nullable().or(z.literal('')).nullable(),
  rest_time: z.number().int().nullable(),
  cadence: z.string().nullable(),
  method: z.string().default('Normal'),
  order: z.number().int().default(0),
})
export const ExerciseSchema = ExerciseRowSchema.transform((row) => ({
  id: row.id,
  workoutId: row.workout_id,
  name: row.name,
  muscleGroup: row.muscle_group,
  notes: row.notes,
  videoUrl: row.video_url,
  restTime: row.rest_time,
  cadence: row.cadence,
  method: row.method,
  order: row.order,
}))
export type ExerciseRow = z.infer<typeof ExerciseRowSchema>
export type Exercise = z.infer<typeof ExerciseSchema>

export const SetRowSchema = z.object({
  id: z.string().uuid(),
  exercise_id: z.string().uuid(),
  weight: z.number().nullable(),
  reps: z.string().nullable(),
  rpe: z.number().nullable(),
  set_number: z.number().int().default(1),
  completed: z.boolean().default(false),
  is_warmup: z.boolean().nullable(),
  advanced_config: z.unknown().nullable(),
})
export const SetSchema = SetRowSchema.transform((row) => ({
  id: row.id,
  exerciseId: row.exercise_id,
  weight: row.weight,
  reps: row.reps,
  rpe: row.rpe,
  setNumber: row.set_number,
  completed: row.completed,
  isWarmup: row.is_warmup,
  advancedConfig: row.advanced_config,
}))
export type SetRow = z.infer<typeof SetRowSchema>
export type Set = z.infer<typeof SetSchema>

export const AssessmentRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  date: z.string(),
  weight: z.number().nullable(),
  bf: z.number().nullable(),
  waist: z.number().nullable(),
  arm: z.number().nullable(),
  sum7: z.number().nullable(),
  notes: z.string().nullable(),
  created_at: z.string(),
})
export const AssessmentSchema = AssessmentRowSchema.transform((row) => ({
  id: row.id,
  userId: row.user_id,
  date: row.date,
  weight: row.weight,
  bf: row.bf,
  waist: row.waist,
  arm: row.arm,
  sum7: row.sum7,
  notes: row.notes,
  createdAt: row.created_at,
}))
export type AssessmentRow = z.infer<typeof AssessmentRowSchema>
export type Assessment = z.infer<typeof AssessmentSchema>

export const InviteRowSchema = z.object({
  id: z.string().uuid(),
  from_uid: z.string().uuid(),
  to_uid: z.string().uuid(),
  workout_data: z.record(z.unknown()).nullable(),
  team_session_id: z.string().uuid().nullable(),
  status: z.enum(['pending', 'accepted', 'rejected']).default('pending'),
  created_at: z.string(),
})
export const InviteSchema = InviteRowSchema.transform((row) => ({
  id: row.id,
  fromUid: row.from_uid,
  toUid: row.to_uid,
  workoutData: row.workout_data,
  teamSessionId: row.team_session_id,
  status: row.status,
  createdAt: row.created_at,
}))
export type InviteRow = z.infer<typeof InviteRowSchema>
export type Invite = z.infer<typeof InviteSchema>

export const MuscleIdSchema = z.enum([
  'chest',
  'delts_front',
  'delts_side',
  'biceps',
  'triceps',
  'abs',
  'quads',
  'calves',
  'lats',
  'upper_back',
  'delts_rear',
  'spinal_erectors',
  'glutes',
  'hamstrings',
])
export type MuscleId = z.infer<typeof MuscleIdSchema>

export const ApiMuscleSchema = z.object({
  label: z.string(),
  sets: z.number(),
  minSets: z.number(),
  maxSets: z.number(),
  ratio: z.number(),
  color: z.string(),
  view: z.enum(['front', 'back']),
})
export type ApiMuscle = z.infer<typeof ApiMuscleSchema>

import { z } from 'zod'

export const ProfileSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email().nullable(),
  display_name: z.string().nullable(),
  photo_url: z.string().url().nullable().or(z.literal('')).nullable(),
  last_seen: z.string().nullable(),
  role: z.enum(['user', 'teacher', 'admin']).default('user'),
})
export type Profile = z.infer<typeof ProfileSchema>

export const WorkoutSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  date: z.string(),
  name: z.string(),
  notes: z.string().nullable(),
  is_template: z.boolean().default(false),
  created_at: z.string(),
})
export type Workout = z.infer<typeof WorkoutSchema>

export const ExerciseSchema = z.object({
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
export type Exercise = z.infer<typeof ExerciseSchema>

export const SetSchema = z.object({
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
export type Set = z.infer<typeof SetSchema>

export const AssessmentSchema = z.object({
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
export type AssessmentRow = z.infer<typeof AssessmentSchema>

export const InviteSchema = z.object({
  id: z.string().uuid(),
  from_uid: z.string().uuid(),
  to_uid: z.string().uuid(),
  workout_data: z.record(z.unknown()).nullable(),
  team_session_id: z.string().uuid().nullable(),
  status: z.enum(['pending', 'accepted', 'rejected']).default('pending'),
  created_at: z.string(),
})
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

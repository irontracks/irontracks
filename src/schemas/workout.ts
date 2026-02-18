import { z } from 'zod'

export const SetDetailSchema = z.object({
  set_number: z.number().int().min(1),
  reps: z.union([z.string(), z.number()]).nullable().optional(),
  weight: z.number().nullable().optional(),
  rpe: z.number().min(0).max(10).nullable().optional(),
  is_warmup: z.boolean().optional(),
  completed: z.boolean().optional(),
  advanced_config: z.unknown().nullable().optional(),
})
export type SetDetail = z.infer<typeof SetDetailSchema>

export const ExerciseInputSchema = z.object({
  name: z.string().min(1, 'Nome do exercício obrigatório').max(200),
  sets: z.union([z.number().int().min(0), z.string()]).optional(),
  reps: z.union([z.string(), z.number()]).nullable().optional(),
  rpe: z.union([z.number(), z.string()]).nullable().optional(),
  method: z.string().nullable().optional(),
  rest_time: z.union([z.number(), z.string()]).nullable().optional(),
  video_url: z.string().url().nullable().optional().or(z.literal('')),
  notes: z.string().nullable().optional(),
  cadence: z.string().nullable().optional(),
  order: z.number().int().min(0).optional(),
  set_details: z.array(SetDetailSchema).optional(),
})
export type ExerciseInput = z.infer<typeof ExerciseInputSchema>

export const WorkoutInputSchema = z.object({
  name: z.string().min(1, 'Nome do treino obrigatório').max(200),
  notes: z.string().nullable().optional(),
  date: z.string().optional(),
  is_template: z.boolean().optional(),
  exercises: z.array(ExerciseInputSchema).optional(),
})
export type WorkoutInput = z.infer<typeof WorkoutInputSchema>

export const FinishWorkoutSchema = z.object({
  workout: z.record(z.unknown()),
  elapsedSeconds: z.number().int().min(0),
  logs: z.record(z.unknown()).optional(),
  ui: z.record(z.unknown()).optional(),
  postCheckin: z.record(z.unknown()).nullable().optional(),
})
export type FinishWorkoutInput = z.infer<typeof FinishWorkoutSchema>

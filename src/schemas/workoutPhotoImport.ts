/**
 * Contrato do que a IA devolve ao ler uma FICHA DE TREINO (foto/PDF).
 *
 * Herda o formato de exercício de `parse-exercise-voice` (o mais próximo: campos
 * todos anuláveis, porque a pessoa nem sempre escreve tudo), com duas diferenças
 * que vieram do domínio:
 *
 * 1. **Array de TREINOS, não de exercícios.** Uma ficha quase nunca tem um
 *    treino só — tem "Treino A/B/C" ou "Segunda/Quarta/Sexta" na mesma folha, ou
 *    uma página por dia. Extrair tudo num balaio só obrigaria o usuário a
 *    separar na mão exatamente o que a IA acabou de ler.
 *
 * 2. **`reps` é STRING, não número.** Ficha escrita à mão mistura "8-12",
 *    "10", "até a falha". Forçar número jogaria fora a faixa — que é a
 *    informação real do treino, não um detalhe de formatação.
 */
import { z } from 'zod'

/** Métodos que a IA pode marcar. Espelha o enum da voz + giant_set. */
export const PHOTO_IMPORT_METHODS = [
  'normal',
  'drop_set',
  'rest_pause',
  'super_set',
  'cluster',
  'giant_set',
] as const
export type PhotoImportMethod = (typeof PHOTO_IMPORT_METHODS)[number]

/** Tetos de tamanho — o normalizador TRUNCA neles antes do Zod julgar. */
export const PHOTO_IMPORT_LIMITS = {
  workoutTitle: 80,
  exerciseName: 120,
  reps: 24,
  cadence: 20,
  notes: 200,
  maxWorkouts: 7, // programa semanal completo
  maxExercisesPerWorkout: 25,
} as const

export const WorkoutPhotoExerciseSchema = z.object({
  name: z.string().min(1).max(PHOTO_IMPORT_LIMITS.exerciseName),
  sets: z.number().int().min(1).max(20).nullable(),
  reps: z.string().max(PHOTO_IMPORT_LIMITS.reps).nullable(),
  weightKg: z.number().min(0).max(500).nullable(),
  cadence: z.string().max(PHOTO_IMPORT_LIMITS.cadence).nullable(),
  restSeconds: z.number().int().min(0).max(600).nullable(),
  rpe: z.number().min(1).max(10).nullable(),
  method: z.enum(PHOTO_IMPORT_METHODS).nullable(),
  notes: z.string().max(PHOTO_IMPORT_LIMITS.notes).nullable(),
})
export type WorkoutPhotoExercise = z.infer<typeof WorkoutPhotoExerciseSchema>

export const WorkoutPhotoWorkoutSchema = z.object({
  title: z.string().min(1).max(PHOTO_IMPORT_LIMITS.workoutTitle),
  exercises: z.array(WorkoutPhotoExerciseSchema).min(1).max(PHOTO_IMPORT_LIMITS.maxExercisesPerWorkout),
})
export type WorkoutPhotoWorkout = z.infer<typeof WorkoutPhotoWorkoutSchema>

export const WorkoutPhotoExtractedSchema = z.object({
  workouts: z.array(WorkoutPhotoWorkoutSchema).min(1).max(PHOTO_IMPORT_LIMITS.maxWorkouts),
})
export type WorkoutPhotoExtracted = z.infer<typeof WorkoutPhotoExtractedSchema>

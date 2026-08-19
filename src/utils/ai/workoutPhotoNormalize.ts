/**
 * Normalização do que a IA devolve ao ler uma ficha de treino.
 *
 * Doutrina do repo: **normaliza, DEPOIS valida**. `responseSchema` não garante
 * `maxLength` nem `maxItems` (medido em produção), e um `safeParse` direto no
 * cru joga fora a ficha inteira por causa de um campo estourado. Aqui tudo é
 * truncado/clampado para o contrato — se o Zod ainda reprovar depois disto, é
 * erro de verdade.
 *
 * Este módulo também é onde a ficha vira vocabulário do app:
 * · o nome do exercício passa por `resolveCanonicalExerciseName` — sem isso,
 *   "Supino Retão" viraria um exercício NOVO e o motor de carga automática não
 *   acharia o histórico do supino (o histórico casa por nome);
 * · o método em snake_case da IA vira a grafia do editor ("drop_set" →
 *   "Drop-set"), porque um `ex.method` fora do dropdown cai em "Normal" ao
 *   abrir o editor e o método se perde ao salvar.
 */
import { clampNumber, clampText, pickEnum } from '@/utils/ai/coerce'
import { resolveCanonicalExerciseName } from '@/utils/exerciseCanonical'
import {
  PHOTO_IMPORT_LIMITS,
  PHOTO_IMPORT_METHODS,
  type PhotoImportMethod,
} from '@/schemas/workoutPhotoImport'

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

/**
 * Método da IA → grafia do editor (`EDITOR_METHODS`).
 *
 * `giant_set` não existe no dropdown; vira Bi-Set (o parente mais próximo que o
 * app sabe agrupar) e o nome original vai para as notas na rota. Inventar uma
 * opção nova aqui deixaria o select em branco.
 */
export const METHOD_TO_EDITOR: Record<PhotoImportMethod, string | null> = {
  normal: null,
  drop_set: 'Drop-set',
  rest_pause: 'Rest-Pause',
  super_set: 'Bi-Set',
  cluster: 'Cluster',
  giant_set: 'Bi-Set',
}

/** Número anulável: string vazia/lixo vira null em vez de 0. */
function nullableNumber(raw: unknown, min: number, max: number, round = false): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const n = clampNumber(raw, min, max, Number.NaN, round)
  return Number.isFinite(n) ? n : null
}

/** Texto anulável: preserva null em vez de virar ''. */
function nullableText(raw: unknown, max: number): string | null {
  if (raw === null || raw === undefined) return null
  const s = clampText(raw, max, '')
  return s || null
}

/**
 * `reps` chega como "8-12", "10", "até a falha" — ou como NÚMERO, quando o
 * modelo ignora o tipo do schema. Number vira string em vez de virar null.
 */
function normalizeReps(raw: unknown): string | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(Math.round(raw))
  return nullableText(raw, PHOTO_IMPORT_LIMITS.reps)
}

export interface NormalizedExercise {
  name: string
  sets: number | null
  reps: string | null
  weightKg: number | null
  cadence: string | null
  restSeconds: number | null
  rpe: number | null
  method: PhotoImportMethod | null
  notes: string | null
  /** Nome como estava na ficha, quando a canonização mudou. Para a UI mostrar. */
  originalName?: string
}

export interface NormalizedWorkout {
  title: string
  exercises: NormalizedExercise[]
}

function normalizeExercise(raw: unknown): NormalizedExercise | null {
  if (!isRecord(raw)) return null
  const rawName = clampText(raw.name, PHOTO_IMPORT_LIMITS.exerciseName, '')
  if (!rawName) return null // exercício sem nome não é exercício

  const canon = resolveCanonicalExerciseName(rawName)
  const name = canon?.canonical?.trim() || rawName

  const methodRaw = raw.method == null ? null : pickEnum(raw.method, PHOTO_IMPORT_METHODS, 'normal')

  return {
    name,
    ...(canon?.changed && canon.canonical !== rawName ? { originalName: rawName } : {}),
    sets: nullableNumber(raw.sets, 1, 20, true),
    reps: normalizeReps(raw.reps),
    weightKg: nullableNumber(raw.weightKg, 0, 500),
    cadence: nullableText(raw.cadence, PHOTO_IMPORT_LIMITS.cadence),
    restSeconds: nullableNumber(raw.restSeconds, 0, 600, true),
    rpe: nullableNumber(raw.rpe, 1, 10),
    method: methodRaw,
    notes: nullableText(raw.notes, PHOTO_IMPORT_LIMITS.notes),
  }
}

/**
 * Cru da IA → estrutura pronta para o Zod julgar.
 *
 * Devolve `{ workouts: [] }` quando não sobrou nada aproveitável — a rota trata
 * isso como "não consegui ler esta ficha", que é uma resposta honesta e bem
 * diferente de devolver um treino vazio para o usuário revisar.
 */
export function normalizeExtractedWorkouts(raw: unknown): { workouts: NormalizedWorkout[] } {
  const root = isRecord(raw) ? raw : {}
  const list = Array.isArray(root.workouts) ? root.workouts : []

  const workouts = list
    .slice(0, PHOTO_IMPORT_LIMITS.maxWorkouts)
    .map((w, idx): NormalizedWorkout | null => {
      if (!isRecord(w)) return null
      const exercises = (Array.isArray(w.exercises) ? w.exercises : [])
        .slice(0, PHOTO_IMPORT_LIMITS.maxExercisesPerWorkout)
        .map(normalizeExercise)
        .filter((e): e is NormalizedExercise => e !== null)
      if (!exercises.length) return null // treino sem exercício não vale a viagem
      return {
        // Ficha sem título é comum (só a lista de exercícios). Numerar é melhor
        // que deixar vazio — o usuário renomeia na revisão.
        title: clampText(w.title, PHOTO_IMPORT_LIMITS.workoutTitle, '') || `Treino ${idx + 1}`,
        exercises,
      }
    })
    .filter((w): w is NormalizedWorkout => w !== null)

  return { workouts }
}

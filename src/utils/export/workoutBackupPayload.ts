/**
 * @module workoutBackupPayload
 *
 * O que entra e o que sai de um backup de treinos (.json).
 *
 * O formato anterior guardava, por exercício, só
 * `name, sets, reps, rpe, cadence, restTime, method, videoUrl, notes` — e `sets`
 * era a CONTAGEM, `reps` um valor agregado. Ficavam de fora peso, reps e RPE de
 * cada série, o tipo de série e — o que mais dói — o `advanced_config`, que é
 * onde moram as etapas do Drop-set, os blocos do Cluster e as mini-séries do
 * Rest-Pause. Restaurar aquele backup devolvia o esqueleto do treino, não o
 * treino (auditoria de 19/08/2026).
 *
 * O formato v2 leva `setDetails` inteiro. Não é invenção nova: é exatamente a
 * forma que o `buildExercisesPayload` do save já consome, então o import volta a
 * gravar o que foi exportado sem nenhuma tradução no meio.
 *
 * **Ler backup antigo continua funcionando** — `parseWorkoutBackup` aceita os
 * dois. Backup é a única cópia de quem já exportou; quebrar a leitura seria
 * transformar o conserto em perda de dado.
 */

import { perSetMethodField } from '@/lib/workout/perSetMethodField'

export const WORKOUT_BACKUP_VERSION = 2

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

const num = (v: unknown): number | null => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export type BackupSet = {
  set_number: number
  weight: unknown
  reps: unknown
  rpe: unknown
  set_type: string
  is_warmup: boolean
  advanced_config: unknown
  /** Método escolhido para esta série; `null` = infere pelo exercício/nota. */
  per_set_method: string | null
}

export type BackupExercise = {
  name: string
  sets: number
  reps: unknown
  rpe: unknown
  cadence: unknown
  restTime: unknown
  method: unknown
  videoUrl: unknown
  notes: unknown
  isUnilateral: boolean
  sideRestTime: number | null
  transitionTime: number | null
  isAlternating: boolean
  setDetails: BackupSet[]
}

export type BackupWorkout = {
  id: unknown
  title: unknown
  notes: unknown
  is_template: true
  archived: boolean
  exercises: BackupExercise[]
}

export type WorkoutBackup = {
  version: number
  exportedAt: string
  user: { id: string; email: string }
  workouts: BackupWorkout[]
}

/** Série do cliente (setDetails) → série do backup. */
const toBackupSet = (raw: unknown, idx: number, ex: Record<string, unknown>): BackupSet => {
  const s = isRecord(raw) ? raw : {}
  const rawType = (s.set_type ?? s.setType) as string | undefined
  const set_type =
    rawType === 'warmup' || rawType === 'feeler' || rawType === 'working'
      ? rawType
      : (s.is_warmup ?? s.isWarmup) ? 'warmup' : 'working'
  return {
    set_number: num(s.set_number ?? s.setNumber) ?? idx + 1,
    weight: s.weight ?? null,
    // Herda do cabeçalho do exercício quando a série não tem valor próprio —
    // mesma regra do save, para o backup não nascer mais pobre que o template.
    reps: s.reps ?? ex.reps ?? null,
    rpe: s.rpe ?? ex.rpe ?? null,
    set_type,
    is_warmup: set_type === 'warmup',
    advanced_config: (s.advanced_config ?? s.advancedConfig) ?? null,
    ...perSetMethodField(s),
  }
}

const toBackupExercise = (raw: unknown): BackupExercise => {
  const e = isRecord(raw) ? raw : {}
  const detailsRaw = Array.isArray(e.setDetails)
    ? (e.setDetails as unknown[])
    : Array.isArray(e.set_details)
      ? (e.set_details as unknown[])
      : []
  const headerSets = num(e.sets) ?? 0
  const count = Math.max(Math.floor(headerSets) || 0, detailsRaw.length)
  const setDetails = Array.from({ length: count }).map((_, i) => toBackupSet(detailsRaw[i], i, e))
  const side = num(e.sideRestTime ?? e.side_rest_time)
  const transition = num(e.transitionTime ?? e.transition_time)
  return {
    name: String(e.name ?? '').trim(),
    sets: count,
    reps: e.reps ?? null,
    rpe: e.rpe ?? null,
    cadence: e.cadence ?? null,
    restTime: (e.restTime ?? e.rest_time) ?? null,
    method: e.method ?? null,
    videoUrl: (e.videoUrl ?? e.video_url) ?? null,
    notes: e.notes ?? null,
    isUnilateral: !!(e.isUnilateral ?? e.is_unilateral),
    sideRestTime: side && side > 0 ? side : null,
    transitionTime: transition && transition > 0 ? transition : null,
    isAlternating: !!(e.isAlternating ?? e.is_alternating),
    setDetails,
  }
}

export function buildWorkoutBackup(
  user: { id?: string | null; email?: string | null } | null,
  workouts: unknown,
  exportedAt: string,
): WorkoutBackup {
  const list = Array.isArray(workouts) ? workouts : []
  return {
    version: WORKOUT_BACKUP_VERSION,
    exportedAt,
    user: { id: String(user?.id || ''), email: String(user?.email || '') },
    workouts: list.filter(isRecord).map((w) => ({
      id: w.id ?? null,
      title: w.title ?? w.name ?? 'Treino',
      notes: w.notes ?? '',
      is_template: true as const,
      // Guardado para o backup ser fiel; o import de hoje recria tudo ativo
      // (arquivar de volta é um clique, e perder um treino não é).
      archived: !!(w.archived_at ?? w.archived),
      exercises: (Array.isArray(w.exercises) ? (w.exercises as unknown[]) : []).map(toBackupExercise),
    })),
  }
}

/** Backup de UM treino (menu "…" do card). Mesmo formato, uma linha só. */
export function buildSingleWorkoutBackup(
  user: { id?: string | null; email?: string | null } | null,
  workout: unknown,
  exportedAt: string,
): WorkoutBackup {
  return buildWorkoutBackup(user, [workout], exportedAt)
}

/**
 * Lê backup v1 (antigo) ou v2 e devolve treinos prontos para `createWorkout`.
 * Como v1 não tem `setDetails`, o treino restaurado dali continua raso — mas
 * continua sendo lido, que é o ponto.
 */
export function parseWorkoutBackup(payload: unknown): { workouts: Record<string, unknown>[]; version: number } {
  const p = isRecord(payload) ? payload : {}
  const version = num(p.version) ?? 1
  const list = Array.isArray(p.workouts) ? (p.workouts as unknown[]) : []
  const workouts = list.filter(isRecord).map((w) => {
    const exercises = (Array.isArray(w.exercises) ? (w.exercises as unknown[]) : []).map((raw) => {
      const e = isRecord(raw) ? raw : {}
      const details = Array.isArray(e.setDetails) ? (e.setDetails as unknown[]) : []
      return {
        ...e,
        // v1 chega sem setDetails: o save deriva as séries do cabeçalho, que é
        // o comportamento que aquele backup sempre teve.
        ...(details.length ? { setDetails: details } : {}),
      }
    })
    return {
      title: w.title ?? w.name ?? 'Treino',
      notes: w.notes ?? '',
      exercises,
    }
  })
  return { workouts, version }
}

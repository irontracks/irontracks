import { workoutTitleKey } from '@/utils/workoutTitle'

const titleOf = (w: unknown): unknown => {
  const o = w && typeof w === 'object' ? (w as Record<string, unknown>) : {}
  return o.title ?? o.name ?? ''
}

/**
 * Chave de dedup do treino de um convite de dupla: título normalizado (sem
 * caixa/acento, ignorando o prefixo de dia "A -"/"B -"). Vazia quando não há
 * título — aí não dá pra afirmar que já existe.
 */
export function inviteWorkoutKey(workout: unknown): string {
  return workoutTitleKey(titleOf(workout))
}

/**
 * True se o usuário JÁ tem um treino salvo equivalente (mesma chave de título).
 * Usado pra esconder a opção "salvar este treino" no convite quando é redundante.
 * Sem título no convite → false (melhor oferecer salvar do que esconder por engano).
 */
export function isInviteWorkoutAlreadySaved(inviteWorkout: unknown, savedWorkouts: unknown): boolean {
  const key = inviteWorkoutKey(inviteWorkout)
  if (!key) return false
  const list = Array.isArray(savedWorkouts) ? savedWorkouts : []
  return list.some((w) => inviteWorkoutKey(w) === key)
}

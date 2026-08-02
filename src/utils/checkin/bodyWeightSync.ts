/**
 * Peso informado no check-in pré-treino → peso do perfil.
 *
 * Antes, o peso digitado no check-in morria dentro de `workout_checkins.answers`:
 * o perfil (`user_settings.bodyWeightKg`) seguia com o valor antigo. E como o
 * cálculo de calorias prioriza o perfil sobre o check-in (`sessionKcal.ts` —
 * "profile (opts) first"), o peso que o usuário acabou de informar era
 * literalmente IGNORADO na estimativa de kcal. Sincronizar o perfil conserta os
 * dois de uma vez.
 */

/** Faixa aceita — a mesma validada antes de gravar em `workout_checkins`. */
export const MIN_BODY_WEIGHT_KG = 20
export const MAX_BODY_WEIGHT_KG = 300

/** Aceita "97,8" (pt-BR) e "97.8". Retorna null se fora da faixa/inválido. */
export function parseCheckinWeightKg(raw: unknown): number | null {
  if (raw == null || raw === '') return null
  const n = Number(String(raw).replace(',', '.').trim())
  if (!Number.isFinite(n) || n < MIN_BODY_WEIGHT_KG || n > MAX_BODY_WEIGHT_KG) return null
  return Math.round(n * 10) / 10
}

/**
 * O peso do perfil deve ser reescrito? Só quando o valor é válido E de fato
 * mudou — o campo vem PRÉ-PREENCHIDO com o peso do perfil, então a esmagadora
 * maioria dos check-ins confirma o mesmo número. Sem esta guarda, todo início de
 * treino dispararia uma escrita inútil em user_settings.
 *
 * Tolerância de 0.05 kg: o campo tem 1 casa decimal, então qualquer diferença
 * real é >= 0.1.
 */
export function shouldSyncProfileWeight(checkinWeightKg: number | null, profileWeightKg: unknown): boolean {
  if (checkinWeightKg == null) return false
  const current = Number(profileWeightKg)
  if (!Number.isFinite(current) || current <= 0) return true // perfil sem peso → grava
  return Math.abs(current - checkinWeightKg) >= 0.05
}

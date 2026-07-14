// Decide se uma métrica de PR (peso/reps/volume) deve ser exibida. Cardio e
// peso-corporal têm peso/volume = 0 — mostrar "0kg" polui os Novos Recordes.
// Regra: exibe só quando o valor é real (>0) OU foi um recorde batido (improved).
export function showPrMetric(value: unknown, improved: unknown): boolean {
  return Number(value) > 0 || Boolean(improved)
}

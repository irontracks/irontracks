// Pluralização simples pt-BR — evita o "N treino(s)" com cara de template.

/** Retorna a palavra no singular/plural conforme a quantidade (|n| === 1 → singular). */
export function plural(count: number, singular: string, pluralForm?: string): string {
  const n = Number(count) || 0
  return Math.abs(n) === 1 ? singular : (pluralForm ?? `${singular}s`)
}

/** Junta número + palavra já flexionada: pluralize(1,'treino') → "1 treino". */
export function pluralize(count: number, singular: string, pluralForm?: string): string {
  const n = Math.trunc(Number(count) || 0)
  return `${n} ${plural(n, singular, pluralForm)}`
}

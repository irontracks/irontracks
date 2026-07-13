/**
 * Métodos oferecidos no dropdown do editor de exercício (Modals) e a normalização
 * do `ex.method` pra casar com eles.
 *
 * Bug que isto resolve: treinos gerados/importados gravam `ex.method` com grafia
 * diferente da do dropdown (ex.: "Drop-Set" com S maiúsculo vs a option
 * "Drop-set"). Um `<select>` cujo `value` não casa com nenhuma `<option>` cai na
 * PRIMEIRA opção ("Normal") — então o editor mostrava "Normal" num drop-set, e
 * salvar assim PERDIA o método. Normalizamos a grafia dos métodos do dropdown e,
 * pra métodos avançados fora dele (FST-7, Sistema 21, …), preservamos o valor
 * original (o dropdown o inclui como opção extra pra não sumir ao salvar).
 */
export const EDITOR_METHODS = ['Normal', 'Drop-set', 'Rest-Pause', 'Cluster', 'Bi-Set', 'Cardio'] as const

/** Normaliza `ex.method` pro valor canônico do dropdown (case-insensitive). */
export const canonicalEditorMethod = (method: unknown): string => {
  const s = String(method ?? '').trim()
  if (!s) return 'Normal'
  const lower = s.toLowerCase()
  const hit = EDITOR_METHODS.find((opt) => opt.toLowerCase() === lower)
  if (hit) return hit
  // Variações de drop-set: "Drop-Set", "dropset", "drop set" → "Drop-set".
  if (/^drop[-\s]?set$/.test(lower)) return 'Drop-set'
  // Método avançado fora do dropdown (FST-7, Sistema 21, Onda, …): mantém o valor
  // original — o select o adiciona como opção extra pra não perder ao salvar.
  return s
}

/** True se o método NÃO é um dos padrões do dropdown (precisa de opção extra). */
export const isNonStandardEditorMethod = (method: unknown): boolean => {
  const canon = canonicalEditorMethod(method)
  return !EDITOR_METHODS.some((opt) => opt === canon)
}

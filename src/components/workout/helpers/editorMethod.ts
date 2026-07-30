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
import type { AdvancedConfig } from '@/components/ExerciseEditor/types'

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

/**
 * Configuração PADRÃO das etapas de um método avançado — fonte única.
 *
 * Existiam dois controles independentes no editor: o dropdown de método do
 * exercício (topo) e um segundo seletor escondido dentro de cada linha "Série N".
 * Só o segundo criava `advanced_config`; o do topo gravava `null`. Como quase
 * ninguém acha o segundo, o método virava só um RÓTULO: o app sabia que a série
 * era drop-set/rest-pause, mas chegava sem etapa nenhuma e o usuário tinha de
 * preencher tudo à mão em todo treino (queixa do dono, 30/07).
 *
 * Devolve sempre um objeto NOVO — o mesmo default vai para várias séries, e
 * compartilhar a referência faria editar uma série mexer nas outras.
 */
export const defaultAdvancedConfigForMethod = (
  method: unknown,
): AdvancedConfig | AdvancedConfig[] | null => {
  switch (canonicalEditorMethod(method)) {
    // Uma queda além da série principal (mesmo default que o seletor por-série
    // já usava — os dois caminhos precisam concordar).
    case 'Drop-set':
      return [{ weight: null, reps: '' }]
    case 'Rest-Pause':
      return { initial_reps: 10, mini_sets: 2, rest_time_sec: 20 }
    // Cluster nem existia no seletor por-série: não havia como criar do zero pela
    // UI, só editando um treino que já tivesse a config.
    case 'Cluster':
      return { total_reps: 12, cluster_size: 3, intra_rest_sec: 15 }
    default:
      return null
  }
}

/** Métodos cujas séries têm etapas para configurar. */
export const methodHasStages = (method: unknown): boolean =>
  defaultAdvancedConfigForMethod(method) !== null

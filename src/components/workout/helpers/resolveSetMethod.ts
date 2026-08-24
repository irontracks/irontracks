/**
 * @module resolveSetMethod
 *
 * Qual método uma série está usando AGORA — a mesma decisão que o
 * `ExerciseCard.renderSet` toma para escolher entre os 14 renderers, extraída
 * para poder ser usada também pelo seletor de método.
 *
 * Existe por causa de um bug de 24/08/2026: o seletor só vivia no renderer
 * NORMAL, então a série que virava avançada perdia a única forma de voltar. Ao
 * içar o seletor para o card, ele precisa RÓTULAR a série corretamente — e um
 * rótulo por palpite seria pior que nenhum (o app diria "Normal" numa série
 * desenhada como DROP).
 *
 * ⚠️ A ordem das condições é a do `renderSet` e **precisa continuar sendo**:
 * `per_set_method` vence tudo, depois a inferência por nota/config, e o método
 * do exercício por último. Guard: `__tests__/resolveSetMethod.test.ts`.
 */
import { isObject } from '../utils'

type UnknownRecord = Record<string, unknown>

export const GROUP_METHODS = ['Bi-Set', 'Super-Set', 'Tri-Set', 'Giant-Set', 'Pré-exaustão', 'Pós-exaustão'] as const

/**
 * Métodos que o seletor rápido NÃO oferece trocar: cardio e prancha não têm
 * peso/reps, então nenhum dos outros 12 faz sentido ali.
 *
 * Grupo (Bi-Set, Super-Set…) CONTINUA podendo trocar — o `groupMethodSet` já
 * oferecia isso com um picker próprio, e tirar seria remover função existente.
 */
export const METHODS_SEM_TROCA_RAPIDA = new Set(['Cardio', 'Prancha'])

export type ResolveSetMethodInput = {
  /** `ex.method` — o método do EXERCÍCIO. */
  exerciseMethod?: unknown
  /** O log da série (`logs["exIdx-setIdx"]`). */
  log?: unknown
  /** `advanced_config` resolvido do plano (já com a inferência por nota). */
  plannedConfig?: unknown
  /** `true` quando a nota do exercício injeta SST nesta série. */
  sstFromNotes?: boolean
  /** `true`/`false` de `isClusterConfig`/`isRestPauseConfig` sobre o plano. */
  isClusterConfig?: boolean
  isRestPauseConfig?: boolean
}

/**
 * Rótulo do método efetivo. `''` significa Normal.
 *
 * O ponto que o bug expôs: o drop pode não estar em lugar NENHUM da série — a
 * nota "DROP-SET na última série" faz `getPlannedSet` injetar os estágios. Daí
 * `plannedConfig` entrar aqui: sem ele, a última série apareceria como Normal.
 */
export function resolveSetMethodLabel(input: ResolveSetMethodInput): string {
  const log = isObject(input.log) ? (input.log as UnknownRecord) : {}
  const method = String(input.exerciseMethod || '').trim()

  // 1. Escolha explícita do usuário vence tudo.
  const perSet = String(log.per_set_method || '').trim()
  if (perSet) return perSet

  if (method.toLowerCase() === 'cardio') return 'Cardio'

  // 2. Inferência por nota (SST) — o card já a resolve e passa pronta.
  if (input.sstFromNotes) return 'SST'

  // 3. Drop: config em array (inclusive a INJETADA pela nota), estágios salvos
  //    ou o método do exercício.
  const dropSet = isObject(log.drop_set) ? (log.drop_set as UnknownRecord) : null
  const dropStages = dropSet && Array.isArray(dropSet.stages) ? (dropSet.stages as unknown[]) : []
  if (Array.isArray(input.plannedConfig) || dropStages.length > 0 || /^drop-?set$/i.test(method)) return 'Drop-Set'

  const stripping = isObject(log.stripping) ? (log.stripping as UnknownRecord) : null
  const strippingStages = stripping && Array.isArray(stripping.stages) ? (stripping.stages as unknown[]) : []
  if (method === 'Stripping' || strippingStages.length > 0) return 'Stripping'

  if (method === 'FST-7' || isObject(log.fst7)) return 'FST-7'
  if (method === 'Heavy Duty' || isObject(log.heavy_duty)) return 'Heavy Duty'
  if (method === 'Ponto Zero' || isObject(log.ponto_zero)) return 'Ponto Zero'
  if (method === 'Repetições Forçadas' || isObject(log.forced_reps)) return 'Repetições Forçadas'
  if (method === 'Repetições Negativas' || isObject(log.negative_reps)) return 'Repetições Negativas'
  if (method === 'Repetições Parciais' || isObject(log.partial_reps)) return 'Repetições Parciais'
  if (method === 'Sistema 21' || isObject(log.sistema21)) return 'Sistema 21'
  if (method === 'Onda' || isObject(log.wave)) return 'Onda'
  if ((GROUP_METHODS as readonly string[]).includes(method)) return method

  if (input.isClusterConfig || method === 'Cluster') return 'Cluster'
  if (input.isRestPauseConfig || method === 'Rest-Pause') return 'Rest-Pause'

  return ''
}

/** O seletor rápido aparece? Cardio, prancha e métodos de GRUPO ficam fora. */
export function podeTrocarMetodoRapido(label: string, isPlank: boolean): boolean {
  if (isPlank) return false
  return !METHODS_SEM_TROCA_RAPIDA.has(String(label || '').trim())
}

/**
 * `'Normal'` explícito — NÃO string vazia.
 *
 * Pegadinha que quase me escapou: o seletor antigo gravava `per_set_method: ''`
 * para Normal, e `''` cai de volta na inferência. Ou seja, escolher "Normal"
 * numa série cujo drop vem da nota **não desfazia nada**. Só um valor explícito
 * vence a regra derivada, porque `resolveSetMethodLabel` devolve `per_set_method`
 * antes de olhar qualquer outra coisa.
 */
export const METODO_NORMAL_EXPLICITO = 'Normal'

/**
 * A série precisa ter o método CONGELADO antes de uma remoção?
 *
 * Sim sempre que ela não tem marcação explícita — inclusive quando hoje é
 * Normal. Esse é justamente o caso que causou o bug: com "DROP-SET na última
 * série" na nota, a série 2 é normal HOJE e vira drop assim que a 3 sai. Sem
 * gravar o `Normal` dela, o drop escorrega e parece que o app apagou a série
 * errada (relato do dono, 24/08/2026).
 */
export function precisaCongelarMetodo(input: ResolveSetMethodInput): boolean {
  const log = isObject(input.log) ? (input.log as UnknownRecord) : {}
  return !String(log.per_set_method || '').trim()
}

/** O que gravar ao congelar: o rótulo efetivo, ou `Normal` quando não há método. */
export function metodoParaCongelar(input: ResolveSetMethodInput): string {
  return resolveSetMethodLabel(input) || METODO_NORMAL_EXPLICITO
}

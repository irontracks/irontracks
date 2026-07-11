/**
 * Reconciliação da edição completa DURANTE um treino ativo.
 *
 * O editor completo (ExerciseEditor) permite adicionar, apagar, reordenar e
 * editar exercícios livremente — mas gera objetos NOVOS a cada mudança, então a
 * identidade por referência se perde. E os registros de séries (logs) são presos
 * ao ÍNDICE do exercício (chave "exIdx-setKey"). Se um exercício muda de posição
 * (ou é removido), os logs precisam acompanhar, senão cada card passa a mostrar o
 * registro de OUTRO exercício.
 *
 * Solução: antes de abrir o editor, etiquetamos cada exercício com uma chave
 * estável (__logKey). O editor preserva a chave (spread `...ex`) nos exercícios
 * existentes; novos exercícios não têm chave. Ao salvar, casamos por essa chave
 * pra remapear os logs (índice antigo → novo), descartar os de exercícios
 * removidos e deixar os novos sem log.
 */

export const EDIT_LOG_KEY = '__logKey'

type ExRecord = Record<string, unknown>

export interface ReconcileResult {
  /** Exercícios editados, já sem a chave temporária (prontos pra sessão/template). */
  exercises: ExRecord[]
  /** Logs remapeados pro novo layout de índices. */
  logs: Record<string, unknown>
  /** Índice antigo → índice novo, apenas dos exercícios que sobreviveram. */
  remap: Map<number, number>
}

/**
 * Etiqueta cada exercício com uma chave estável por índice atual. Chamar ANTES de
 * abrir o editor. Retorna cópias (não muta o array original).
 */
export function tagExercisesForEdit(exercises: unknown): ExRecord[] {
  const arr = Array.isArray(exercises) ? exercises : []
  return arr.map((ex, i) => ({
    ...(ex && typeof ex === 'object' ? (ex as ExRecord) : {}),
    [EDIT_LOG_KEY]: `orig-${i}`,
  }))
}

/**
 * Reconcilia a saída do editor com a sessão ativa, remapeando os logs.
 * `originalExercises` deve ser o array etiquetado (via tagExercisesForEdit).
 */
export function reconcileEditedExercises(
  originalExercises: unknown,
  editedExercises: unknown,
  logs: unknown,
): ReconcileResult {
  const orig = Array.isArray(originalExercises) ? (originalExercises as ExRecord[]) : []
  const edited = Array.isArray(editedExercises) ? (editedExercises as ExRecord[]) : []

  // Índice antigo por chave.
  const oldIdxByKey = new Map<string, number>()
  orig.forEach((ex, i) => {
    const k = ex && typeof ex === 'object' ? String(ex[EDIT_LOG_KEY] ?? '') : ''
    if (k) oldIdxByKey.set(k, i)
  })

  const remap = new Map<number, number>()
  const usedKeys = new Set<string>()

  // Contagem de séries de cada exercício editado (mesma fórmula do controller:
  // header `sets` vs. tamanho de setDetails, o MAIOR). Usada pra podar logs de
  // séries que deixaram de existir ao reduzir o nº de séries no editor. 0 = contagem
  // desconhecida (exercício sem sets/setDetails) → não poda (não inventa range).
  const setCountByNewIdx: number[] = edited.map((exRaw) => {
    const ex: ExRecord = exRaw && typeof exRaw === 'object' ? (exRaw as ExRecord) : {}
    const header = Math.max(0, Number.parseInt(String(ex.sets ?? '0'), 10) || 0)
    const sd = Array.isArray(ex.setDetails) ? ex.setDetails : Array.isArray(ex.set_details) ? ex.set_details : []
    return Math.max(header, sd.length)
  })

  const cleaned: ExRecord[] = edited.map((exRaw, newIdx) => {
    const ex: ExRecord = exRaw && typeof exRaw === 'object' ? { ...exRaw } : {}
    const k = String(ex[EDIT_LOG_KEY] ?? '')
    // Sobrevivente: chave conhecida e ainda não usada (duplicatas viram "novo").
    if (k && oldIdxByKey.has(k) && !usedKeys.has(k)) {
      usedKeys.add(k)
      remap.set(oldIdxByKey.get(k) as number, newIdx)
    }
    delete ex[EDIT_LOG_KEY]
    return ex
  })

  // Remapeia os logs: o prefixo antes do primeiro '-' é o índice do exercício; o
  // sufixo é a série. Além de reescrever o prefixo (índice antigo → novo), poda os
  // logs cujo índice de série já não existe no novo nº de séries do exercício.
  const nextLogs: Record<string, unknown> = {}
  const logObj = logs && typeof logs === 'object' ? (logs as Record<string, unknown>) : {}
  for (const [key, val] of Object.entries(logObj)) {
    const dash = key.indexOf('-')
    if (dash === -1) { nextLogs[key] = val; continue }
    const exI = parseInt(key.slice(0, dash), 10)
    if (Number.isNaN(exI)) { nextLogs[key] = val; continue }
    if (!remap.has(exI)) continue // exercício removido → descarta os logs dele
    const newExI = remap.get(exI) as number
    // Poda séries órfãs: só quando o sufixo é um índice de série PURO (numérico) e a
    // contagem nova é conhecida (>0). Sufixos não-numéricos (ex.: unilateral L_/R_)
    // ficam de fora — não dá pra inferir o índice com segurança, melhor preservar.
    const suffix = key.slice(dash + 1)
    const setI = Number.parseInt(suffix, 10)
    const setCount = setCountByNewIdx[newExI] ?? 0
    if (String(setI) === suffix && setCount > 0 && setI >= setCount) continue
    nextLogs[`${newExI}${key.slice(dash)}`] = val
  }

  return { exercises: cleaned, logs: nextLogs, remap }
}

/**
 * Aplica o remap (índice antigo → novo) a um conjunto de índices (collapsed,
 * linked-weights). Índices de exercícios removidos são descartados.
 */
export function remapIndexSet(set: Set<number>, remap: Map<number, number>): Set<number> {
  const next = new Set<number>()
  for (const i of set) {
    if (remap.has(i)) next.add(remap.get(i) as number)
  }
  return next
}

/**
 * Remapeia o índice do exercício atual (rodapé/Ilha Dinâmica). Se o atual foi
 * removido, cai no vizinho válido mais próximo (clamp no tamanho da lista nova).
 */
export function remapCurrentIndex(current: number, remap: Map<number, number>, newLength: number): number {
  if (remap.has(current)) return remap.get(current) as number
  if (newLength <= 0) return 0
  return Math.max(0, Math.min(current, newLength - 1))
}

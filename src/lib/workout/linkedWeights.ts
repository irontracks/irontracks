/**
 * Sincronizar pesos (botão 🔗 do card do exercício) — a decisão inteira mora aqui.
 *
 * Três defeitos viviam dentro do `updateLog` do controlador, e o teste que devia
 * travá-los testava uma CÓPIA da lógica escrita no próprio arquivo de teste — por
 * isso passava com o código real quebrado:
 *
 * 1. **O lado R congelava na primeira tecla** (relato do dono, 24/09/2026: L=23,
 *    R=2 em todas as séries). O outro lado só era preenchido "onde estava vazio",
 *    e isso era avaliado A CADA TECLA: digitar "2" preenchia R com "2", e no "3"
 *    o R já não estava vazio. Hoje o outro lado acompanha enquanto for ESPELHO
 *    (`weightMirroredSide`), e deixa de acompanhar no momento em que o usuário
 *    digita nele — é assim que cargas diferentes em L e R continuam possíveis.
 *
 * 2. **A carga automática e a sincronização se sobrescreviam.** Toda escrita de
 *    peso disparava a réplica — inclusive a do MOTOR (`weightSource: 'auto'`), que
 *    passava por cima do peso digitado nas outras séries. E as séries que recebiam
 *    a réplica ficavam com a fonte antiga ('auto'), então o motor as "corrigia" de
 *    volta para a sugestão, e essa correção era replicada de novo — inclusive para
 *    a série que o usuário acabou de digitar. É o "não deixa trocar o peso" de
 *    22/08/2026 por outra porta. Hoje só a escrita do USUÁRIO sincroniza, e quem
 *    recebe a réplica passa a ser do usuário.
 *
 * 3. **Concluir série também sincronizava.** O patch de conclusão carrega o peso
 *    (proteção contra tecla perdida), então concluir uma série SEM peso apagava o
 *    peso de todas as outras, e concluir uma série antiga reescrevia as pendentes.
 *    Conclusão não é edição de peso — não tem `weightSource: 'user'`.
 *
 * E uma regra nova, pelo mesmo motivo: **série já concluída não é reescrita** pela
 * réplica. O peso dela é o que foi levantado; mudá-lo depois falsifica volume,
 * e1RM e o histórico que o motor lê na próxima sessão.
 */

export type LogLike = Record<string, unknown>

const LADOS = ['L_weight', 'R_weight'] as const
type Lado = (typeof LADOS)[number]

const outroLado = (lado: Lado): Lado => (lado === 'L_weight' ? 'R_weight' : 'L_weight')
const conclusaoDoLado = (lado: Lado) => (lado === 'L_weight' ? 'L_done' : 'R_done')
const vazio = (v: unknown) => v == null || String(v).trim() === ''

/**
 * A escrita que a sincronização replica: peso editado PELO USUÁRIO. Digitação,
 * voz, calculadora de anilhas e os modais de método marcam `weightSource: 'user'`
 * (há guard de classe para isso nos renderers). O motor marca 'auto', e o patch
 * de conclusão não marca nada — nenhum dos dois é o usuário decidindo a carga.
 */
export function isUserWeightEdit(patch: LogLike): boolean {
  if (patch.weightSource !== 'user') return false
  return 'weight' in patch || 'L_weight' in patch || 'R_weight' in patch
}

/**
 * Quando o usuário digita DIRETO num lado, esse lado deixa de ser espelho — sem
 * isso, digitar R com a sincronização desligada e religá-la depois faria o R ser
 * atropelado pela próxima edição do L. Vale com a sincronização ligada ou não.
 */
export function espelhoAposEdicaoDireta(prev: LogLike, patch: LogLike): LogLike {
  const espelho = prev.weightMirroredSide
  if (!isUserWeightEdit(patch)) return {}
  if (espelho === 'L_weight' || espelho === 'R_weight') {
    if (espelho in patch) return { weightMirroredSide: null }
  }
  return {}
}

/** O outro lado acompanha enquanto não for uma carga que o usuário escolheu. */
function outroLadoAcompanha(prev: LogLike, outro: Lado): boolean {
  if (vazio(prev[outro])) return true
  if (prev.weightMirroredSide === outro) return true
  // Preenchido pelo motor (os dois lados recebem a mesma sugestão): não é uma
  // decisão do usuário, então não merece ser preservado contra a edição dele.
  return prev.weightSource === 'auto'
}

/**
 * Planeja a réplica. Devolve `null` quando a escrita NÃO é de sincronização
 * (quem chama segue o caminho normal); senão, a lista de séries a gravar — a
 * série editada sempre primeiro, com o patch completo por cima do peso.
 */
export function planLinkedWeightSync(args: {
  patch: LogLike
  sIdx: number
  setsCount: number
  getLog: (setIdx: number) => LogLike
}): Array<{ setIdx: number; next: LogLike }> | null {
  const { patch, sIdx, setsCount, getLog } = args
  if (!isUserWeightEdit(patch)) return null

  const ladosNoPatch = LADOS.filter((l) => l in patch)
  const plano: Array<{ setIdx: number; next: LogLike }> = []

  const pesoPara = (prev: LogLike, ehAtual: boolean): LogLike | null => {
    // Série já feita: só a própria série editada é tocada (o usuário corrigindo o
    // que levantou). As outras concluídas ficam como foram registradas.
    if (!ehAtual && prev.done === true) return null

    if (ladosNoPatch.length === 0) {
      return { weight: patch.weight, weightSource: 'user' }
    }

    const out: LogLike = { weightSource: 'user' }
    if (ladosNoPatch.length === 2) {
      // Voz grava os dois lados de uma vez: os dois são explícitos, nenhum espelho.
      for (const lado of LADOS) {
        if (ehAtual || prev[conclusaoDoLado(lado)] !== true) out[lado] = patch[lado]
      }
      out.weightMirroredSide = null
      return out
    }

    const lado = ladosNoPatch[0]
    const outro = outroLado(lado)
    const valor = patch[lado]
    if (ehAtual || prev[conclusaoDoLado(lado)] !== true) out[lado] = valor

    const outroFeito = !ehAtual && prev[conclusaoDoLado(outro)] === true
    if (!outroFeito && outroLadoAcompanha(prev, outro)) {
      out[outro] = valor
      out.weightMirroredSide = outro
    } else {
      out.weightMirroredSide = null
    }
    return out
  }

  const atual = getLog(sIdx)
  // O patch vai por cima (done/reps/notas digitados junto), mas ele não traz
  // `weightMirroredSide` — então a decisão do espelho sobrevive ao spread.
  plano.push({ setIdx: sIdx, next: { ...atual, ...(pesoPara(atual, true) as LogLike), ...patch } })

  for (let setIdx = 0; setIdx < setsCount; setIdx++) {
    if (setIdx === sIdx) continue
    const prev = getLog(setIdx)
    const peso = pesoPara(prev, false)
    if (!peso) continue
    plano.push({ setIdx, next: { ...prev, ...peso } })
  }

  return plano
}

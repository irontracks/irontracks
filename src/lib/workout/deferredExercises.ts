/**
 * "Pular — fazer depois": exercícios adiados DENTRO da sessão.
 *
 * O pedido veio do dono (28/08/2026): fazer os exercícios fora da ordem num dia
 * pontual. Editar o treino seria errado — a ordem do TEMPLATE não mudou, só a
 * execução de hoje. Daí um estado de sessão: o exercício continua no lugar, com
 * selo "FAZER DEPOIS", e o app segue para o próximo pendente (o que também move
 * a Ilha Dinâmica / tela bloqueada, que lê `currentExerciseIdx`).
 *
 * Este módulo é PURO de propósito: a decisão de "qual é o próximo" e "o que
 * conta como pendente" é exercitável sem React, sem DOM e sem Supabase — as
 * três coisas que tornam guard de treino ativo caro de escrever.
 *
 * ⚠️ Adiar NÃO é concluir. Um exercício adiado continua sem série marcada, então
 * ele segue contando como pendente em `remainingSets` e no relatório. O que o
 * adiamento muda é só para onde o app leva o usuário em seguida.
 */

export interface DeferralContext {
  /** Array de exercícios da sessão (mesma ordem dos índices dos logs). */
  exercises: readonly unknown[]
  /** Mapa de logs, chaveado por `"<exIdx>-<setIdx>"`. */
  logs: Readonly<Record<string, unknown>>
  /** Índices adiados nesta sessão. */
  deferred: ReadonlySet<number>
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

/**
 * Quantas séries o exercício tem. Mesma conta que ExerciseList/ExerciseCard já
 * faziam: o cabeçalho `sets` e o array de detalhes podem divergir (série extra
 * adicionada no meio da sessão), e quem manda é o MAIOR dos dois.
 */
export function setsCountOfExercise(ex: unknown): number {
  if (!isObj(ex)) return 0
  const header = Math.max(0, Number.parseInt(String(ex.sets ?? '0'), 10) || 0)
  const sd = Array.isArray(ex.setDetails)
    ? ex.setDetails
    : Array.isArray(ex.set_details)
      ? (ex.set_details as unknown[])
      : []
  return Math.max(header, sd.length)
}

/** Séries concluídas do exercício. */
export function doneCountOfExercise(
  logs: Readonly<Record<string, unknown>>,
  exIdx: number,
  setsCount: number,
): number {
  let done = 0
  for (let i = 0; i < setsCount; i++) {
    const log = logs[`${exIdx}-${i}`]
    if (isObj(log) && log.done === true) done++
  }
  return done
}

/**
 * O exercício já está fechado (todas as séries concluídas).
 *
 * Exercício sem série nenhuma (`setsCount === 0`) NÃO conta como concluído: ele
 * não tem nada a fazer, mas também não foi feito — tratá-lo como completo faria
 * o "próximo pendente" pular por cima de um card que o usuário ainda vê aberto.
 */
export function isExerciseComplete(ctx: DeferralContext, exIdx: number): boolean {
  const count = setsCountOfExercise(ctx.exercises[exIdx])
  if (count <= 0) return false
  return doneCountOfExercise(ctx.logs, exIdx, count) >= count
}

/**
 * Índice do próximo exercício que ainda pede trabalho, olhando para FRENTE a
 * partir de `fromIdx` e dando a volta na lista.
 *
 * Pendente = não concluído E não adiado. A volta na lista existe porque adiar o
 * último exercício não pode deixar o usuário sem destino: ele volta ao primeiro
 * que ficou para trás. Devolve `null` quando não sobrou nada — aí o treino ou
 * acabou, ou só tem adiados (e nesse caso quem decide é o usuário, pelo atalho
 * do rodapé, não o app escolhendo por ele).
 */
export function nextPendingExercise(ctx: DeferralContext, fromIdx: number): number | null {
  const total = ctx.exercises.length
  if (total <= 0) return null
  const start = Number.isFinite(fromIdx) ? Math.max(0, Math.min(Math.trunc(fromIdx), total - 1)) : 0
  for (let step = 1; step <= total; step++) {
    const idx = (start + step) % total
    if (ctx.deferred.has(idx)) continue
    if (isExerciseComplete(ctx, idx)) continue
    return idx
  }
  return null
}

/**
 * Adiados que ainda importam: os que continuam sem estar concluídos.
 *
 * Um adiado que depois foi RETOMADO e concluído sem sair da lista (o usuário
 * pode simplesmente voltar e marcar as séries) não deve seguir cobrando atenção
 * no rodapé nem no aviso de finalizar — senão o app pediria para "fazer depois"
 * algo que já foi feito.
 */
export function pendingDeferred(ctx: DeferralContext): number[] {
  const out: number[] = []
  for (const idx of ctx.deferred) {
    if (idx < 0 || idx >= ctx.exercises.length) continue
    if (isExerciseComplete(ctx, idx)) continue
    out.push(idx)
  }
  return out.sort((a, b) => a - b)
}

/** Nome legível do exercício, para o aviso de finalizar. */
export function exerciseNameAt(exercises: readonly unknown[], exIdx: number): string {
  const ex = exercises[exIdx]
  const name = isObj(ex) ? String(ex.name ?? '').trim() : ''
  return name || `Exercício ${exIdx + 1}`
}

/**
 * Quais índices são adiados JUNTO com `exIdx`.
 *
 * Bi-Set / Super-Set / Tri-Set encadeiam exercícios que só existem em par: o
 * enunciado do método é "sem descanso entre eles". Adiar metade de um Bi-Set
 * deixaria o outro membro sozinho, alternando com um card que o usuário mandou
 * embora — o app faria uma coisa que o método não permite. Então o grupo inteiro
 * vai junto.
 */
export function exercisesToDefer(
  exIdx: number,
  groups: ReadonlyMap<number, { members: number[] }> | null | undefined,
): number[] {
  const g = groups?.get(exIdx)
  if (g && Array.isArray(g.members) && g.members.length > 1) return [...g.members]
  return [exIdx]
}

/**
 * A pergunta do diálogo de finalizar.
 *
 * Quem adiou um exercício adiou para FAZER, não para esquecer — e é justamente
 * por ter saído do caminho que ele some do campo de visão. O aviso entra no
 * MESMO diálogo em vez de um segundo confirm em sequência: dois diálogos
 * empilhados viram um "sim, sim" automático e deixam de avisar qualquer coisa.
 *
 * Os NOMES vão no texto, não só a contagem: "2 exercícios" faz o usuário sair
 * do diálogo para descobrir quais são, e a resposta que ele quer dar depende
 * exatamente disso.
 */
export const FINISH_QUESTION_DEFAULT = 'Deseja finalizar o treino?'

export function buildFinishQuestion(deferredNames: readonly string[] | null | undefined): string {
  const nomes = (Array.isArray(deferredNames) ? deferredNames : [])
    .filter((n): n is string => typeof n === 'string' && n.trim() !== '')
    .map((n) => n.trim())
  if (nomes.length === 0) return FINISH_QUESTION_DEFAULT
  const cabeca = nomes.length === 1
    ? 'Você guardou 1 exercício para fazer depois'
    : `Você guardou ${nomes.length} exercícios para fazer depois`
  return `${cabeca}: ${nomes.join(', ')}.\n\nFinalizar o treino mesmo assim?`
}

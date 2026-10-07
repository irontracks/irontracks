/**
 * Decisão PURA de como um campo de série reage quando o valor persistido muda.
 *
 * O input de série tem estado LOCAL porque o ticker de 1 s re-renderiza o treino
 * inteiro e um input controlado perderia tecla. O preço é este: sempre que o valor
 * externo muda, alguém precisa decidir se o local acompanha ou resiste.
 *
 * Três saídas:
 *  - `keep`    — segura o valor local (digitação recente; o externo ainda não chegou)
 *  - `restore` — o valor sumiu do log sem o usuário mexer: devolve ao log
 *  - `accept`  — acompanha o externo (caso normal)
 *
 * Por que `restore` existe: em 31/07/2026 o Sentry mostrou
 * `{ field: "L_reps", typed: "2", sinceTypedMs: null, sinceBlurMs: null,
 * focused: false }` — os dois carimbos em ZERO. Um valor que nunca foi digitado
 * nem sofreu blur naquele campo só pode ter vindo do log PERSISTIDO. Ou seja, não
 * era corrida de digitação (o diagnóstico que o rótulo antigo sugeria): era o dado
 * gravado indo de "2" para vazio sozinho, com o input só refletindo a perda. Este
 * campo é a última camada que ainda tem o valor em mãos quando isso acontece.
 */

export type InputSyncInput = {
  /** Valor que o campo mostra agora. */
  localValue: string
  /** Valor que chegou do log persistido. */
  externalValue: string
  /** O usuário está com o cursor no campo. */
  isFocused: boolean
  /** Epoch ms do último blur (0 = nunca). */
  blurredAt: number
  /** Epoch ms da última digitação (0 = nunca). */
  typedAt: number
  /** Agora (injetado para o teste ser determinístico). */
  now: number
  /** Janela em que uma digitação recente ainda protege o valor. */
  graceMs: number
  /** Já restauramos uma vez neste campo (trava anti-loop). */
  alreadyRestored: boolean
  /**
   * O campo está NA TELA. Padrão true. A série normal monta os campos dos dois
   * modos (bilateral e L_/R_) e só desenha um deles; o invisível nunca pode
   * restaurar — ele não tem dono, só espelha o compartilhado.
   */
  visivel?: boolean
}

export type InputSyncDecision = 'keep' | 'restore' | 'accept'

export function decideExternalSync(input: InputSyncInput): InputSyncDecision {
  // Campo invisível só acompanha. Em 06/10/2026 os avisos "L_rpe sumiu do log"
  // eram TODOS de série BILATERAL: o L_rpe escondido espelha `log.rpe`
  // (`L_rpe ?? rpe`), o usuário apagava o RPE e o campo escondido "restaurava"
  // L_rpe/R_rpe na série bilateral. Medido em produção: 465 séries bilaterais
  // com campos de lado, e `setTotalReps` somando L+R no lugar de `reps`.
  if (input.visivel === false) return 'accept'

  // Cursor no campo: o usuário manda, sempre. Nem o autoload interrompe digitação.
  if (input.isFocused) return 'keep'

  const perdendoValor = Boolean(input.localValue) && !input.externalValue
  if (!perdendoValor) return 'accept'

  const ultimaInteracao = Math.max(input.blurredAt, input.typedAt)

  // Digitou/saiu do campo há pouco: o externo ainda não alcançou a tecla.
  if (ultimaInteracao > 0 && input.now - ultimaInteracao < input.graceMs) return 'keep'

  // Nunca tocado E sumindo: o valor veio do log e o log o perdeu. Devolve — uma vez.
  // Na segunda, aceita: se o estado de cima insiste em vazio, ficar num vai-e-volta
  // infinito é pior que perder o campo.
  if (ultimaInteracao === 0 && !input.alreadyRestored) return 'restore'

  return 'accept'
}

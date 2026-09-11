/**
 * Encadeamento automático dos BLOCOS de cardio — a decisão, em função pura.
 *
 * Um cardio com blocos ("5 min a 4 km/h, depois 10 min a 5 km/h, depois 15 min a
 * 6 km/h") é executado como N séries independentes, cada uma com o próprio botão
 * "Iniciar". Na esteira isso significa tocar na tela suado, no meio da passada,
 * três vezes — e quem não toca fica com o cronômetro parado no bloco 1.
 *
 * Com o encadeamento ligado, o bloco N carimba em `autoStartAtMs` do bloco N+1 o
 * instante em que ele deve começar (agora, ou depois do descanso configurado), e
 * cada bloco decide sozinho o que fazer com esse carimbo. Toda a aritmética mora
 * aqui porque ela precisa valer nos DOIS mundos:
 *
 * - **ao vivo**, com o app na frente e o relógio andando; e
 * - **na volta de um congelamento**, que é o caso que um `setTimeout` não cobre.
 *   Com a tela bloqueada o WKWebView é SUSPENSO e nenhum JS roda (medido no
 *   próprio cardio GPS e no timer de descanso — ver `restAutoAdvance.ts`). Quem
 *   guarda a passagem do tempo é o CARIMBO, não um timer vivo: ao acordar, o app
 *   compara `autoStartAtMs` com o relógio e reconstrói o que teria acontecido.
 *
 * ⚠️ **A reconstrução tem um teto, e ele existe para não inventar treino.**
 * Concluir um bloco cujo fim já passou é assumir que a pessoa continuou andando
 * enquanto o app dormia. Isso é razoável por alguns minutos e deixa de ser: um
 * celular esquecido no bolso por meia hora não prova esteira nenhuma. Passado
 * `LIMITE_DE_RECONSTRUCAO_MS`, a cadeia desiste e devolve a decisão ao usuário —
 * é a mesma régua de 20 min que o cronômetro do treino já usa para separar
 * "treinando" de "ausente" (`LONG_GAP_MS`, em `WorkoutTimerContext`).
 */

/**
 * Folga entre o fim planejado do bloco e o instante em que o app percebeu.
 *
 * O overlay tica de 250 em 250 ms e o card de 1 em 1 s; somando render e o
 * throttle que o iOS aplica a uma aba que perdeu o foco por um instante, alguns
 * segundos de atraso são vida normal e NÃO significam que o app esteve fora.
 * Acima disso, esteve — e a conclusão passa a ser reconstrução, não medição.
 */
export const TOLERANCIA_AO_VIVO_MS = 5_000

/**
 * Até quando vale reconstruir um bloco que terminou enquanto o app dormia.
 *
 * Mesmo valor de `LONG_GAP_MS` (20 min), e pela mesma razão: acima disso o app
 * não está mais olhando um treino em andamento, está voltando de uma ausência.
 * Repetido aqui como literal de propósito — importar de `WorkoutTimerContext`
 * arrastaria um módulo de React para dentro de uma função pura.
 */
export const LIMITE_DE_RECONSTRUCAO_MS = 20 * 60 * 1000

export interface EntradaDoBloco {
  /**
   * Instante em que este bloco DEVE começar sozinho, carimbado pelo bloco
   * anterior. `0`/ausente = ninguém o agendou (o usuário toca "Iniciar" à mão).
   */
  autoStartAtMs: number
  /** Duração planejada do bloco, em segundos. */
  targetSeconds: number
  /** Relógio. Injetado para o teste poder fixá-lo. */
  agoraMs: number
}

export type DecisaoDoBloco =
  /** Não há nada agendado para este bloco. */
  | { acao: 'nada' }
  /** A vez dele ainda não chegou (está no descanso entre blocos). */
  | { acao: 'aguardar'; emMs: number }
  /** Começa agora — o cronômetro conta desde `startedAtMs`, não desde já. */
  | { acao: 'iniciar'; startedAtMs: number }
  /**
   * O fim dele já passou. `reconstruido` separa o encadeamento ao vivo (o
   * cronômetro zerou com o app na frente) da conclusão deduzida de carimbo
   * depois de o app acordar — quem exibe precisa DIZER a diferença.
   */
  | { acao: 'concluir'; duracaoSegundos: number; terminouEmMs: number; reconstruido: boolean }
  /**
   * O fim passou faz tempo demais para deduzir qualquer coisa. O bloco fica
   * pendente e a cadeia para aqui.
   */
  | { acao: 'expirado' }

const numeroFinito = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * O que este bloco deve fazer agora, dado o carimbo que o bloco anterior deixou.
 *
 * Determinística e sem relógio próprio: o mesmo par (carimbo, agora) sempre
 * devolve a mesma decisão, esteja o app acordado há uma hora ou há um frame.
 */
export function decidirBlocoAutomatico(entrada: EntradaDoBloco): DecisaoDoBloco {
  const autoStartAtMs = numeroFinito(entrada?.autoStartAtMs)
  const targetSeconds = numeroFinito(entrada?.targetSeconds)
  const agoraMs = numeroFinito(entrada?.agoraMs)

  if (autoStartAtMs <= 0 || targetSeconds <= 0 || agoraMs <= 0) return { acao: 'nada' }

  if (agoraMs < autoStartAtMs) return { acao: 'aguardar', emMs: autoStartAtMs - agoraMs }

  const fimMs = autoStartAtMs + targetSeconds * 1000
  if (agoraMs < fimMs) return { acao: 'iniciar', startedAtMs: autoStartAtMs }

  const atrasoMs = agoraMs - fimMs
  if (atrasoMs > LIMITE_DE_RECONSTRUCAO_MS) return { acao: 'expirado' }

  return {
    acao: 'concluir',
    duracaoSegundos: Math.round(targetSeconds),
    terminouEmMs: fimMs,
    reconstruido: atrasoMs > TOLERANCIA_AO_VIVO_MS,
  }
}

/**
 * Quando o bloco SEGUINTE deve começar, dado o fim deste e o descanso do exercício.
 *
 * O carimbo é FUTURO quando há descanso configurado — é ele que faz o próximo
 * bloco esperar sem depender de nenhum timer vivo, e é o que permite acertar a
 * conta se o app dormir durante o intervalo.
 */
export function proximoBlocoComecaEmMs(terminouEmMs: number, restSeconds: number): number {
  const fim = numeroFinito(terminouEmMs)
  if (fim <= 0) return 0
  const descanso = Math.max(0, numeroFinito(restSeconds))
  return fim + descanso * 1000
}

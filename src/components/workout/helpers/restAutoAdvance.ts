/**
 * Decisão PURA do auto-advance do timer de descanso.
 *
 * Extraída do RestTimerOverlay pra travar por teste o invariante que regrediu em
 * 2026-07-24: "com o AUTO desligado, o START NUNCA dispara sozinho". Na época o
 * overlay guardava um estado próprio em localStorage, desconectado da preferência
 * `restTimerAutoStart` das Configurações — o liga/desliga não era obedecido.
 *
 * Regra: só auto-avança quando o descanso REALMENTE terminou (isFinished) E o
 * auto-start está LIGADO (autoOn, espelho de `restTimerAutoStart`). O lock por-rest
 * (não disparar duas vezes) e o atraso de 500 ms continuam no componente — aqui é só
 * a porta lógica, determinística e trivial de exercitar.
 */
export interface AutoAdvanceInput {
  /** O countdown do descanso chegou a zero. */
  isFinished: boolean
  /** Auto-start ligado (preferência `restTimerAutoStart`). */
  autoOn: boolean
}

export function shouldAutoAdvanceRest(input: AutoAdvanceInput): boolean {
  return input.isFinished === true && input.autoOn === true
}

/**
 * Quanto o auto-advance espera antes de iniciar a próxima série.
 *
 * INCIDENTE (2026-07-31, relatado pelo dono DURANTE o treino): "o apito de fim de
 * descanso não funciona com o app ligado" e "às vezes não vai pro descanso, começa
 * a contar a outra série direto".
 *
 * Eram o MESMO bug. Com o AUTO ligado, o avanço disparava 500 ms depois de o
 * descanso zerar e a primeira coisa que fazia era `stopAlarm(true)` — matando som
 * e vibração. O alarme (`playTimerFinishSound`) leva ~550 ms só para tocar os três
 * tons, e a vibração de repetição nunca chegava a rodar: o aviso morria antes de
 * avisar. Com a tela BLOQUEADA o WebView congela, o timer de 500 ms não roda, o
 * avanço não acontece — e a notificação nativa (agendada à parte, no início do
 * descanso) tocava normal. Daí o sintoma parecer "só falha com o app aberto".
 *
 * O valor precisa cobrir um ciclo INTEIRO do alarme. Não é cosmético: é a diferença
 * entre o usuário ser avisado e não ser.
 */
export const REST_ALARM_FULL_CYCLE_MS = 1500

/**
 * Depois de quanto tempo ALÉM do planejado o descanso desiste sozinho.
 *
 * O contador de "além do planejado" não tinha teto: no teste de 10 passos
 * (15/08/2026) a barra exibia **"+286:32 além do planejado"** — quase cinco
 * horas — em VERDE, a cor de coisa boa, ocupando o rodapé. Nos primeiros
 * minutos o extra informa ("você demorou 40 s a mais"); passando disso não há
 * nada a informar, e a barra ainda empurra o rodapé do treino para cima
 * (`--it-rest-bar-h`), comendo tela.
 *
 * 15 minutos porque ninguém descansa 15 minutos ENTRE SÉRIES. Passou disso, o
 * descanso acabou de fato — o usuário está treinando outra coisa, guardou o
 * celular ou saiu.
 */
export const REST_ABANDON_EXTRA_SECONDS = 15 * 60

export interface AbandonRestInput {
  /** Segundos ALÉM do planejado (0 enquanto o descanso não estourou). */
  extraSeconds: number
  /**
   * Timer de EXERCÍCIO (prancha, cardio) em vez de descanso.
   *
   * A distinção não é detalhe: uma corrida de 40 min é um uso legítimo e
   * esperado do cronômetro. Encerrá-la por "tempo demais" apagaria a medição
   * de um exercício em andamento — dano real, não incômodo.
   */
  isExerciseTimer: boolean
}

export function shouldAbandonRest(input: AbandonRestInput): boolean {
  if (input.isExerciseTimer === true) return false
  const extra = Number(input.extraSeconds)
  if (!Number.isFinite(extra)) return false
  return extra >= REST_ABANDON_EXTRA_SECONDS
}

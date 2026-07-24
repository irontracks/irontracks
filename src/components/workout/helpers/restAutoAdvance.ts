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

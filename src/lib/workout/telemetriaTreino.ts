/**
 * Telemetria do TREINO ATIVO — o que o usuário faz dentro da tela mais
 * importante do app, gravado em `user_activity_events`.
 *
 * Por que existe: a auditoria de 05–06/09/2026 mostrou que o funil do produto
 * é medido até o `/dashboard` e o wizard de criação, e a partir daí o app fica
 * cego. Perguntas como "quantos usam a troca de exercício?", "o seletor de
 * método é encontrado?", "quem conclui série sem reps?" só tinham resposta por
 * SQL no JSON de `workouts.notes` — caro e indireto.
 *
 * Regras:
 *  - **Nomes só daqui.** O guard (`__tests__/telemetriaTreino.test.ts`) reprova
 *    string solta em `trackUserEvent('workout_…')` fora deste módulo — nome
 *    digitado à mão em cada ponto é como a instrumentação vira ruído
 *    (`metadata.ms` vs `dwellMs`, ver CLAUDE.md "os nomes que enganam").
 *  - **Nunca lança.** É chamada dentro de handlers de toque no meio da série;
 *    um throw aqui derrubaria o `updateLog` que o cercou.
 *  - **Sem PII e sem o conteúdo.** Nome do exercício não vai (é dado do
 *    usuário); vai o método, a contagem, o booleano.
 */
import { trackUserEvent } from '@/lib/telemetry/userActivity'

export const EVENTOS_TREINO = {
  /** Série concluída. `exerciseComplete` = fechou o exercício; `hasReps` = tinha reps. */
  serieConcluida: 'workout_set_done',
  /** Toque em INICIAR na tela do descanso. `antecipado` = antes do tempo acabar (pulou). */
  descansoIniciar: 'workout_rest_start',
  /** Abriu as alternativas de troca de exercício (grafo/IA). */
  trocaAbrir: 'workout_exercise_swap_open',
  /** Aplicou uma troca de exercício. */
  trocaAplicar: 'workout_exercise_swap_apply',
  /** Trocou o método de uma série pelo seletor do card. */
  metodoDaSerie: 'workout_set_method_change',
  /** Abriu o campo de observação de uma série. */
  notaAbrir: 'workout_set_note_open',
  /** Mandou um exercício para depois. */
  exercicioAdiar: 'workout_exercise_defer',
  /**
   * A voz do cardio tentou falar. `resultado` diz o que ACONTECEU, não o que
   * foi pedido — 'iniciou' é a única prova de som; 'nao_comecou' significa que
   * o WebView aceitou e engoliu. Um por exercício, não por marco: o que se quer
   * medir é "a voz funciona neste aparelho?", e isso a primeira fala responde.
   */
  vozDoCardio: 'workout_cardio_voice',
  /**
   * Um bloco de cardio começou SOZINHO. `reconstruido` separa o encadeamento ao
   * vivo da conclusão deduzida depois de o app acordar — se a segunda for a
   * maioria, o desenho está errado para o uso real.
   */
  blocoAutomatico: 'workout_cardio_chain',
} as const

export type EventoTreino = (typeof EVENTOS_TREINO)[keyof typeof EVENTOS_TREINO]

export function rastrearTreino(nome: EventoTreino, metadata?: Record<string, unknown>): void {
  try {
    trackUserEvent(nome, { type: 'workout', screen: 'active_workout', metadata })
  } catch {
    /* telemetria nunca derruba o treino */
  }
}

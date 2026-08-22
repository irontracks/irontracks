/**
 * @module workoutKey
 *
 * Chave normalizada do treino EM CURSO — a mesma identidade que o histórico já
 * grava em `ReportHistoryItem.workoutKey`.
 *
 * Existe porque as duas pontas liam campos DIFERENTES e ninguém percebeu:
 *
 *  - o **histórico** (`useWorkoutDeload`) lê a linha crua de `workouts`, cuja
 *    coluna é `name` — e grava a chave certa;
 *  - a **sessão ativa** carrega o objeto já mapeado por `mapWorkoutRow`, que faz
 *    `title: String(workout.name)`. **`name` não existe ali.** Quem lia
 *    `workout?.name ?? session?.name ?? ''` recebia string vazia, sempre.
 *
 * Dois efeitos, os dois confirmados em 22/08/2026:
 *
 * 1. **O botão "Descarga do treino" ficava travado em DESLIGADA** e não ligava.
 *    `workoutDeloadEnabled` exige `!!key`, e `toggleWorkoutDeload` começa com
 *    `if (!key) return` — com a chave vazia, o botão desenhava o estado
 *    desligado e o toque não fazia nada. Foi assim que o dono achou: o banco
 *    mostrava `autoLoadDeloadOffWorkouts: []` nas duas contas, e lista vazia
 *    com chave válida teria que exibir LIGADA.
 * 2. **A priorização de histórico POR TREINO nunca rodou.** `pickUsableHistory`
 *    só prioriza `if (wanted)`; com `wanted = ''` o motor caía direto no pool
 *    global e ancorava a sugestão em sessão de OUTRO treino — o cenário que o
 *    próprio código descreve como carga errada ("Remada na máquina vai de 40 a
 *    110 kg conforme o treino").
 *
 * Fonte única para as duas leituras não voltarem a divergir. `title` primeiro
 * porque é o campo que o app de fato usa (é o que o `WorkoutHeader` exibe);
 * `name` continua aceito para o caminho legado e para objetos crus do banco.
 */
import { normalizeExerciseKey } from '@/utils/report/formatters'

const pick = (source: unknown, field: string): string => {
  if (!source || typeof source !== 'object') return ''
  const value = (source as Record<string, unknown>)[field]
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Chave do treino a partir do objeto de treino e/ou da sessão ativa.
 * String vazia quando não há nome — o chamador decide o que fazer com isso.
 */
export function resolveWorkoutKey(workout: unknown, session?: unknown): string {
  const raw =
    pick(workout, 'title') ||
    pick(workout, 'name') ||
    pick(session, 'title') ||
    pick(session, 'name') ||
    // `session.workout` aninhado: alguns caminhos passam a sessão inteira.
    pick((session as { workout?: unknown } | null)?.workout, 'title') ||
    pick((session as { workout?: unknown } | null)?.workout, 'name')
  return normalizeExerciseKey(raw)
}

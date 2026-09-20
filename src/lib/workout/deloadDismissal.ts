/**
 * @module deloadDismissal
 *
 * "Dispensei a sugestão de descarga" — e isso PRECISA sobreviver a remontar o
 * componente. Até 19/09/2026 vivia em `useState(false)` dentro de
 * `SessionDeloadBanner`, com o comentário "não persiste de propósito — se o
 * treino for reaberto, o aviso volta". Na prática o card reaparecia sempre que
 * o `ActiveWorkout` desmontava e remontava — sair da tela e voltar, editar o
 * treino, qualquer coisa que refizesse a árvore — não só "reabrir o app".
 * Relato do dono: *"essa parte do deload aparecendo toda hora está me
 * incomodando"*.
 *
 * A chave é (treino, DIA em BRT): dispensar hoje não esconde a sugestão para
 * sempre — amanhã, se a condição persistir, é uma sugestão NOVA para aquele
 * dia, e esconder por mais tempo faria o app ficar calado sobre uma regressão
 * real. `workoutKey` (não o texto do alerta) porque o diagnóstico já é
 * escopado por treino (`currentWorkoutKey`, em `useWorkoutDeload.ts`).
 */
import { brtDateKey } from '@/utils/cron/dateBrt'

const PREFIXO = 'it.deload.dispensado.v1'

const chave = (workoutKey: string): string =>
  `${PREFIXO}:${workoutKey || 'sem-treino'}:${brtDateKey()}`

export function deloadFoiDispensadoHoje(workoutKey: string): boolean {
  try {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(chave(workoutKey)) === '1'
  } catch {
    return false
  }
}

export function dispensarDeloadHoje(workoutKey: string): void {
  try {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(chave(workoutKey), '1')
  } catch { /* melhor esforço — pior caso, o card volta a aparecer */ }
}

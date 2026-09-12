/**
 * O que o PROFESSOR precisa saber de relance enquanto controla o treino:
 * quanto já foi anotado, há quanto tempo o aluno está treinando, e qual
 * exercício é o da vez.
 *
 * Pedido do dono (12/09/2026): "não dá para saber onde o aluno está" — o painel
 * listava dez exercícios abertos, sem progresso, sem tempo e sem foco, e o
 * professor rolava procurando.
 *
 * ⚠️ **"Feita" é `done === true` e nada mais.** O painel grava peso com
 * `{ weight: '80' }` — sem `done` e sem `weightSource` —, e `isLogDone` trata
 * log legado assim como FEITO: usá-lo aqui faria o contador subir quando o
 * professor apenas digitasse a carga, inflando o progresso do aluno. Quem conta
 * é `progressoDoTreino`, que exige `done === true` (a mesma régua do diálogo de
 * finalizar e da tira de navegação do aluno — três telas, um número).
 *
 * ⚠️ **O tempo é de PAREDE e é rotulado como tal.** O cronômetro que o aluno vê
 * desconta pausa manual e gap longo de background (`pausedMs`/`recuperacaoMs`),
 * e nenhum dos dois é persistido no state — daqui eles são invisíveis. Tentar
 * aproximar o desconto pelo último carimbo de atividade faria o número RECUAR
 * quando o professor ficasse um tempo sem editar, que é pior que um número
 * honestamente diferente. Por isso o rótulo na tela diz "desde o início", não
 * "tempo de treino".
 *
 * ⚠️ **Durante o controle, o app do aluno não escreve** (`suppressLocalWrites`
 * fica ligado enquanto `control_status = 'active'`). Logo este resumo reflete o
 * que está ANOTADO na sessão — que, com o controle ativo, é o que o professor
 * anotou. Não é um espelho ao vivo dos toques do aluno, e a tela não deve
 * prometer isso.
 */
import { progressoDoTreino, setsCountOfExercise } from './deferredExercises'

const ehObjeto = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v)

/** Minutos completos; abaixo de um minuto é 0 (e a tela mostra "agora"). */
export function minutosDesde(inicioMs: unknown, agoraMs: number): number | null {
    const inicio = Number(inicioMs)
    const agora = Number(agoraMs)
    if (!Number.isFinite(inicio) || inicio <= 0) return null
    if (!Number.isFinite(agora) || agora <= 0) return null
    if (agora < inicio) return 0
    return Math.floor((agora - inicio) / 60000)
}

/** "1h12" / "47min" / "agora" — o formato curto do cabeçalho. */
export function formatarDuracaoCurta(minutos: number | null): string {
    if (minutos == null) return ''
    if (minutos <= 0) return 'agora'
    if (minutos < 60) return `${minutos}min`
    const h = Math.floor(minutos / 60)
    const m = minutos % 60
    return m === 0 ? `${h}h` : `${h}h${m < 10 ? '0' : ''}${m}`
}

export interface ResumoDoControle {
    /** Séries com `done === true`. */
    feitas: number
    total: number
    /** Exercícios sem nenhuma série concluída. */
    exerciciosSemSerie: number
    /**
     * Índice do exercício da vez, ou `null` quando não dá para saber.
     *
     * Prioridade: a execução em curso (`ui.activeExecution`, que o START carimba
     * e VIAJA no state) vence, porque é a série que o aluno está fazendo AGORA.
     * Sem ela, o primeiro exercício com série pendente — o mesmo critério de
     * "fazer depois" do app do aluno. Treino todo concluído devolve `null`: não
     * existe "da vez" quando não falta nada.
     */
    exercicioAtualIdx: number | null
    /** Minutos desde `startedAt` (tempo de PAREDE — ver o cabeçalho do módulo). */
    minutosDesdeInicio: number | null
}

export function resumoDoControle(session: unknown, agoraMs: number): ResumoDoControle {
    const s = ehObjeto(session) ? session : {}
    const workout = ehObjeto(s.workout) ? s.workout : {}
    const exercises = Array.isArray(workout.exercises) ? workout.exercises : []
    const logs = ehObjeto(s.logs) ? s.logs : {}

    const progresso = progressoDoTreino(exercises, logs)

    return {
        feitas: progresso.feitas,
        total: progresso.total,
        exerciciosSemSerie: progresso.exerciciosSemSerie,
        exercicioAtualIdx: exercicioDaVez(exercises, logs, s.ui),
        minutosDesdeInicio: minutosDesde(s.startedAt, agoraMs),
    }
}

function exercicioDaVez(
    exercises: readonly unknown[],
    logs: Record<string, unknown>,
    ui: unknown,
): number | null {
    const emExecucao = ehObjeto(ui) && ehObjeto(ui.activeExecution) ? ui.activeExecution : null
    const chave = emExecucao ? String(emExecucao.key ?? '').trim() : ''
    if (chave) {
        const idx = Number(chave.split('-')[0])
        // Só aceita se o exercício ainda existe: o professor pode ter removido
        // séries/exercícios depois do carimbo, e apontar para um índice que saiu
        // da lista destacaria o card errado.
        if (Number.isInteger(idx) && idx >= 0 && idx < exercises.length) return idx
    }

    for (let exIdx = 0; exIdx < exercises.length; exIdx++) {
        const n = setsCountOfExercise(exercises[exIdx])
        for (let s = 0; s < n; s++) {
            const log = logs[`${exIdx}-${s}`]
            if (!(ehObjeto(log) && log.done === true)) return exIdx
        }
    }
    return null
}

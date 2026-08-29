/**
 * "Quando foi a última vez que fiz este treino?"
 *
 * O card da lista mostrava exercícios, duração estimada e séries — nada sobre
 * QUANDO. Com cinco treinos na lista, nada indicava qual estava atrasado, e a
 * informação existia a uma tela de distância (o histórico).
 *
 * Puro: a normalização de nome e a redação do "há quanto tempo" são
 * exercitáveis sem banco. A consulta vive no hook.
 */

import { resolveWorkoutKey } from './workoutKey'

export interface LinhaDeExecucao {
    name?: string | null
    completed_at?: string | null
    date?: string | null
}

/**
 * Última execução por treino, em ms.
 *
 * A chave é a MESMA de `resolveWorkoutKey` — a que o motor de carga usa para
 * separar "Remada na máquina" do treino de terça da do treino de quinta. Um
 * segundo jeito de normalizar nome faria o card dizer "há 3 dias" sobre um
 * treino diferente do que o histórico conta.
 */
export function buildLastPerformedMap(linhas: readonly LinhaDeExecucao[]): Map<string, number> {
    const mapa = new Map<string, number>()
    for (const linha of linhas) {
        const chave = resolveWorkoutKey({ name: linha?.name })
        if (!chave) continue
        const bruto = linha?.completed_at ?? linha?.date ?? null
        const ms = bruto ? new Date(String(bruto)).getTime() : Number.NaN
        if (!Number.isFinite(ms)) continue
        const atual = mapa.get(chave)
        if (atual == null || ms > atual) mapa.set(chave, ms)
    }
    return mapa
}

const DIA_MS = 24 * 60 * 60 * 1000

/** O dia-calendário em BRT — comparar "hoje" pelo dia UTC erra à noite. */
const diaBrt = (d: Date): string =>
    new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d)

/**
 * Há quanto tempo, em português de gente.
 *
 * Devolve string VAZIA quando não há execução — a ausência não vira "nunca" no
 * card. Treino recém-criado não deve nascer com um carimbo de cobrança; quem
 * decide como mostrar isso é a tela.
 */
export function formatarUltimaVez(ms: number | null | undefined, agora: Date = new Date()): string {
    if (ms == null || !Number.isFinite(ms)) return ''
    const d = new Date(ms)
    if (d.getTime() > agora.getTime() + DIA_MS) return ''

    if (diaBrt(d) === diaBrt(agora)) return 'hoje'
    if (diaBrt(d) === diaBrt(new Date(agora.getTime() - DIA_MS))) return 'ontem'

    // Diferença por DIA-calendário, não por horas: às 8h da manhã, um treino
    // das 22h de anteontem tem 34 h de idade e mesmo assim é "há 2 dias".
    const inicioHoje = new Date(`${diaBrt(agora)}T12:00:00Z`).getTime()
    const inicioDele = new Date(`${diaBrt(d)}T12:00:00Z`).getTime()
    const dias = Math.round((inicioHoje - inicioDele) / DIA_MS)
    if (dias < 1) return ''
    if (dias < 7) return `há ${dias} dias`
    if (dias < 14) return 'há 1 semana'
    if (dias < 60) return `há ${Math.floor(dias / 7)} semanas`
    const meses = Math.floor(dias / 30)
    return meses <= 1 ? 'há 1 mês' : `há ${meses} meses`
}

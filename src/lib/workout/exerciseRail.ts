/**
 * A tira de navegação do treino ativo — o ESTADO de cada exercício.
 *
 * Num treino de 10 exercícios só havia rolagem: nenhum índice, nenhum salto.
 * Isso ficou mais visível depois do "pular — fazer depois" (28/08/2026): o
 * usuário guarda o exercício 3 e precisa rolar a lista inteira para voltar.
 *
 * Puro de propósito. O que a tira mostra é derivado de coisas que já existem
 * (logs, adiados, exercício atual) — nada aqui é estado novo, e é por isso que
 * a tira não pode discordar dos cards: as duas leem a mesma regra.
 */

import { isExerciseComplete, setsCountOfExercise, type DeferralContext } from './deferredExercises'

/**
 * A partir de quantos exercícios a tira aparece.
 *
 * Abaixo disso ela custa mais do que resolve: ocupa uma faixa permanente do
 * topo — o espaço mais caro da tela — para encurtar uma rolagem que já era
 * curta. Com três cards, o polegar chega mais rápido que o olho.
 */
export const MINIMO_PARA_MOSTRAR_TIRA = 4

export type EstadoNaTira = 'feito' | 'guardado' | 'pendente'

export interface ItemDaTira {
    idx: number
    /** "01", "02"… — o mesmo número que o card mostra no cabeçalho. */
    numero: string
    nome: string
    estado: EstadoNaTira
    /** É o exercício em foco (o mesmo que a Ilha Dinâmica anuncia). */
    atual: boolean
    /** Quantas séries já foram concluídas / quantas existem. */
    feitas: number
    total: number
}

const isObj = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v)

function contarFeitas(logs: Readonly<Record<string, unknown>>, exIdx: number, total: number): number {
    let feitas = 0
    for (let i = 0; i < total; i++) {
        const log = logs[`${exIdx}-${i}`]
        if (isObj(log) && log.done === true) feitas++
    }
    return feitas
}

/**
 * Monta a tira.
 *
 * `atual` é INDEPENDENTE do estado: um exercício em foco pode estar concluído
 * (o usuário acabou de terminá-lo) ou guardado (ele acabou de voltar para
 * ele). Colapsar as duas coisas num campo só faria a tira mentir sobre uma
 * delas — na tela, a cor diz o estado e um anel diz onde você está.
 */
export function buildRailItems(
    ctx: DeferralContext,
    currentIdx: number,
): ItemDaTira[] {
    return ctx.exercises.map((ex, idx) => {
        const total = setsCountOfExercise(ex)
        const feitas = contarFeitas(ctx.logs, idx, total)
        const completo = isExerciseComplete(ctx, idx)
        // Concluído vence "guardado": quem adiou e mesmo assim fez as séries
        // não tem mais nada guardado ali — é o mesmo critério do aviso de
        // finalizar (`pendingDeferred`), e as duas superfícies têm que
        // concordar sobre o que ainda falta.
        const estado: EstadoNaTira = completo
            ? 'feito'
            : ctx.deferred.has(idx)
                ? 'guardado'
                : 'pendente'
        const nome = isObj(ex) ? String(ex.name ?? '').trim() : ''
        return {
            idx,
            numero: String(idx + 1).padStart(2, '0'),
            nome: nome || `Exercício ${idx + 1}`,
            estado,
            atual: idx === currentIdx,
            feitas,
            total,
        }
    })
}

/** O que o leitor de tela anuncia — o número sozinho não diz nada. */
export function rotuloDoItem(item: ItemDaTira): string {
    const progresso = item.total > 0 ? `, ${item.feitas} de ${item.total} séries` : ''
    const estado =
        item.estado === 'feito' ? ', concluído'
            : item.estado === 'guardado' ? ', guardado para depois'
                : ''
    return `Ir para ${item.nome}${progresso}${estado}`
}

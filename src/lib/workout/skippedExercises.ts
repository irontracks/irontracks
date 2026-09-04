/**
 * "Não vou fazer esse hoje" — exercícios DISPENSADOS na sessão.
 *
 * Pedido do dono (04/09/2026): "hoje não fiz a panturrilha sentado, ter um
 * botão para 'não vou fazer esse hoje'".
 *
 * ⚠️ NÃO confundir com o "fazer depois" (`deferredExercises.ts`), que é o
 * parente mais próximo e resolve outro problema:
 *
 *   fazer depois  → sai do CAMINHO, continua PENDENTE. O app leva o usuário
 *                   para o próximo e cobra o adiado ao finalizar.
 *   não vou fazer → sai da CONTA. Não é pendente, não entra no aviso de
 *                   finalizar, e some do denominador do progresso.
 *
 * A diferença que importa está no denominador: com 30 séries planejadas, quem
 * dispensa um exercício de 4 séries passa a mirar 26 — senão a barra jamais
 * chega a 100% e o app fica cobrando um trabalho que o usuário já decidiu não
 * fazer. Cobrar o que foi dispensado é transformar uma decisão dele num débito.
 *
 * ⚠️ Essa CONTA não mora aqui, e não por descuido: no `useActiveWorkoutController`
 * o `logs` vem de um ref, e passar dado derivado dele para qualquer função de
 * fora faz o `react-hooks/refs` acusar acesso a ref durante o render no arquivo
 * inteiro (15 erros, medido por eliminação). A conta ficou inline lá, com guard
 * de forma; este módulo guarda o que dá para isolar de verdade.
 *
 * O que NÃO muda:
 * - O template fica intacto. É decisão de HOJE, não do plano; amanhã o
 *   exercício está lá de novo. (Mesmo princípio do "fazer depois".)
 * - As séries já feitas continuam valendo. Dispensar não apaga trabalho: quem
 *   fez 2 de 4 e dispensou o resto mantém as 2 no volume e no mapa muscular.
 * - Nada é enviado para o relatório como "falhou". Não fazer por escolha não é
 *   o mesmo que deixar pendente.
 */

const isObj = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v)

/** Quantas séries o exercício tem (mesma conta do `deferredExercises`). */
function setsCountOf(ex: unknown): number {
    if (!isObj(ex)) return 0
    const header = Math.max(0, Number.parseInt(String(ex.sets ?? '0'), 10) || 0)
    const sd = Array.isArray(ex.setDetails)
        ? ex.setDetails
        : Array.isArray(ex.set_details)
            ? (ex.set_details as unknown[])
            : []
    return Math.max(header, sd.length)
}

export interface ProgressoContext {
    exercises: readonly unknown[]
    logs: Readonly<Record<string, unknown>>
    /** Índices dispensados nesta sessão. */
    skipped: ReadonlySet<number>
}

/**
 * O progresso da sessão descontando o que foi dispensado.
 *
 * ⚠️ Série JÁ CONCLUÍDA em exercício dispensado continua contando nos dois
 * lados (feito e total). Tirá-la do total faria o percentual passar de 100% —
 * e tirá-la do concluído apagaria trabalho real da barra. Quem dispensa no meio
 * quase sempre já fez alguma série; é o caso comum, não a exceção.
 */
/**
 * Dispensar segue o GRUPO, como o adiar.
 *
 * Bi-Set / Super-Set / Tri-Set só existem em par — o enunciado do método é "sem
 * descanso entre eles". Dispensar metade deixaria o outro membro alternando com
 * um card que o usuário mandou embora.
 */
export function exercisesToSkip(
    exIdx: number,
    groups: ReadonlyMap<number, { members: number[] }> | null | undefined,
): number[] {
    const g = groups?.get(exIdx)
    if (g && Array.isArray(g.members) && g.members.length > 1) return [...g.members]
    return [exIdx]
}

/**
 * Nomes dos dispensados que valem menção — os que não tiveram série nenhuma.
 *
 * Quem dispensou DEPOIS de fazer parte do exercício não precisa ser lembrado:
 * ele fez o que quis e parou, e listar isso no fim viraria cobrança de uma
 * decisão consciente.
 */
export function dispensadosSemTrabalho(ctx: ProgressoContext, exercises: readonly unknown[]): string[] {
    const out: string[] = []
    for (const idx of ctx.skipped) {
        if (idx < 0 || idx >= exercises.length) continue
        const count = setsCountOf(exercises[idx])
        let algumaFeita = false
        for (let i = 0; i < count; i++) {
            const log = ctx.logs[`${idx}-${i}`]
            if (isObj(log) && log.done === true) { algumaFeita = true; break }
        }
        if (algumaFeita) continue
        const ex = exercises[idx]
        const nome = isObj(ex) ? String(ex.name ?? '').trim() : ''
        out.push(nome || `Exercício ${idx + 1}`)
    }
    return out
}

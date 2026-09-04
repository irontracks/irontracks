/**
 * Minutos de cardio EFETIVAMENTE FEITOS — fonte única.
 *
 * ⚠️ Este módulo existe porque o mesmo defeito apareceu DUAS vezes, em telas
 * diferentes, com anos de distância:
 *
 *  1. ago/2026 — a caloria lia `ex.reps`, que é o tempo PLANEJADO no editor.
 *     Um treino com "Esteira 20 min" que a pessoa NÃO fez somava 20 minutos e
 *     as kcal correspondentes. Corrigido em `utils/calories/cardioKcal.ts`.
 *  2. 04/09/2026 — o STORY do treino tinha a MESMA leitura, e a correção de
 *     ago/2026 nunca chegou nele. Relatado pelo dono: fez 30 min de esteira e o
 *     story publicou "20min" — que era o planejado. Medido na sessão real:
 *     `reps` = 20, log `durationSeconds` = 1803 (30,05 min).
 *
 * A segunda vez é o motivo de a regra sair de dentro de um arquivo e virar
 * módulo: duas cópias da mesma leitura divergem em silêncio, e quem paga é
 * quem publica um treino com o número errado.
 */

const isRecord = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v)

/** Tempo PLANEJADO no editor (`reps` guarda minutos). Só serve de fallback. */
export const minutosPlanejados = (ex: Record<string, unknown> | null | undefined): number => {
    const m = Number(ex?.reps)
    return Number.isFinite(m) && m >= 1 && m <= 240 ? m : 0
}

/**
 * Minutos feitos, lidos dos LOGS da sessão.
 *
 * Soma TODAS as séries concluídas do exercício — o que também cobre o cardio em
 * BLOCOS (5 min a 4 km/h + 10 a 5 + 15 a 6 devolve 30).
 *
 * Sem série concluída → ZERO. Não fez, não conta.
 *
 * Concluiu mas sem duração gravada (sessão anterior ao `durationSeconds`, ou log
 * truncado) → cai no planejado: a pessoa marcou como feito, só não temos o
 * cronômetro.
 */
export function minutosDeCardioFeitos(
    logs: Readonly<Record<string, unknown>>,
    exIdx: number,
    ex: Record<string, unknown> | null | undefined,
): number {
    let segundos = 0
    let concluiuAlguma = false

    for (const [key, raw] of Object.entries(logs)) {
        if (Number(String(key).split('-')[0]) !== exIdx) continue
        if (!isRecord(raw)) continue
        // `done` é o que o usuário afirmou ter feito. Sem isso, é plano.
        if (raw.done !== true) continue
        concluiuAlguma = true
        const sec = Number(raw.durationSeconds)
        if (Number.isFinite(sec) && sec > 0) segundos += sec
    }

    if (!concluiuAlguma) return 0
    if (segundos <= 0) return minutosPlanejados(ex)

    const minutos = segundos / 60
    return minutos >= 0.5 && minutos <= 240 ? minutos : 0
}

/**
 * Minutos de cardio PARA EXIBIR — o feito quando existe, o planejado quando não.
 *
 * ⚠️ Diferente de `minutosDeCardioFeitos`, e a diferença é uma exigência real de
 * produto, não descuido:
 *
 *   CALORIA  → sem execução, ZERO. Inflar gasto de quem não fez é o defeito de
 *              ago/2026, e ali o silêncio é o certo.
 *   STORY    → sem execução, mostra o PLANEJADO. Existe cardio que acontece
 *              FORA do app (o caso real é a aula de FitDance, jul/2026,
 *              relatado por uma aluna): não há log nenhum, e a linha sumia da
 *              tabela em silêncio. O tempo planejado é tudo que se sabe, e é
 *              melhor que nada.
 *
 * Ou seja: quem PUBLICA mostra o que dá para mostrar; quem CONTA caloria só
 * conta o que foi feito. Misturar as duas quebra uma das pontas — e as duas já
 * foram bug.
 */
export function minutosDeCardioParaExibir(
    logs: Readonly<Record<string, unknown>>,
    exIdx: number,
    ex: Record<string, unknown> | null | undefined,
): number {
    const feitos = minutosDeCardioFeitos(logs, exIdx, ex)
    return feitos > 0 ? feitos : minutosPlanejados(ex)
}

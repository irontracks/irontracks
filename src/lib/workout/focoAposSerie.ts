/**
 * Quem é o exercício da VEZ depois de uma série ser concluída.
 *
 * ⚠️ Até 01/09/2026 NINGUÉM respondia essa pergunta: `currentExerciseIdx`
 * nascia 0 e só mudava quando o usuário TOCAVA no cabeçalho de um card, abria
 * um modal ou usava o "fazer depois". Quem simplesmente treina — conclui série,
 * rola a tela, conclui a próxima — ficava com o foco preso no exercício 1 do
 * treino inteiro. E o foco não é enfeite: a tira de navegação veste o dourado
 * com ele (`exerciseRail`) e a Live Activity ANUNCIA o nome dele na tela
 * bloqueada, então o iPhone dizia "Leg press" enquanto o usuário estava na
 * cadeira flexora. Um sintoma na tela, outro fora dela, a mesma causa.
 *
 * A regra é a que o usuário já executa com o corpo: a série que ele acabou de
 * fazer diz onde ele está; quando o exercício fecha, ele anda para o próximo
 * que ainda falta — o MESMO `nextPendingExercise` do "fazer depois", para as
 * duas superfícies não discordarem sobre o que é "o próximo".
 *
 * Puro: recebe o contexto JÁ com o log gravado e devolve só o índice.
 */

import { isExerciseComplete, nextPendingExercise, type DeferralContext } from './deferredExercises'

/**
 * @param ctx contexto de execução COM a série recém-concluída já nos logs
 * @param exIdx exercício da série que acabou de ser concluída
 * @returns o índice que deve virar o atual, ou `null` quando não há decisão a
 *          tomar (índice inválido) — nunca "chute" um foco a partir de lixo.
 */
export function focoAposSerieConcluida(ctx: DeferralContext, exIdx: number): number | null {
    if (!Number.isFinite(exIdx)) return null
    const idx = Math.trunc(exIdx)
    if (idx < 0 || idx >= ctx.exercises.length) return null
    // Exercício ainda em andamento: é ali que o usuário está, e ponto.
    if (!isExerciseComplete(ctx, idx)) return idx
    // Fechou. Anda para o próximo pendente — e se não houver nenhum (treino
    // terminado), FICA onde está: mandar o foco para um card já concluído seria
    // inventar destino, o mesmo critério do `deferExercise`.
    return nextPendingExercise(ctx, idx) ?? idx
}

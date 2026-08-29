/**
 * Como o resumo técnico do relatório FALA dos números que já calcula.
 *
 * Duas coisas que a tela dizia errado, vistas no aparelho em 28/08/2026:
 *
 *  1. **Duração 53 min · Execução 10 min · Descanso 19 min.** Três números lado
 *     a lado convidam a uma soma — e ela não fecha: faltavam 24 minutos sem
 *     nome. O usuário fica escolhendo entre "o app errou" e "eu não entendi".
 *
 *  2. **"−100,0%" com "semana normal" logo abaixo.** O app afirmava as duas
 *     coisas sobre a mesma semana, na mesma caixa.
 *
 * Puro para as duas regras serem exercitáveis sem montar o relatório.
 */

/** Minutos que a sessão durou, mas não estão nem em série nem em descanso. */
export function minutosForaDeSerie(
    duracaoMin: unknown,
    execucaoMin: unknown,
    descansoMin: unknown,
): number {
    const total = Number(duracaoMin)
    const exec = Number(execucaoMin)
    const rest = Number(descansoMin)
    if (!Number.isFinite(total) || total <= 0) return 0
    const contabilizado = (Number.isFinite(exec) ? exec : 0) + (Number.isFinite(rest) ? rest : 0)
    const sobra = total - contabilizado
    // Menos de um minuto não vira frase: "inclui 0 min" é ruído.
    return sobra >= 1 ? Math.round(sobra) : 0
}

/**
 * A linha que fecha a conta embaixo da Duração.
 *
 * Diz o que o tempo restante É — trocar de aparelho, ajustar carga, conversar —
 * em vez de deixar o usuário procurar erro numa subtração. Vazia quando não há
 * sobra: sem lacuna, sem explicação.
 */
export function legendaDaDuracao(
    duracaoMin: unknown,
    execucaoMin: unknown,
    descansoMin: unknown,
): string {
    const sobra = minutosForaDeSerie(duracaoMin, execucaoMin, descansoMin)
    if (sobra <= 0) return ''
    return `inclui ${sobra} min entre séries (troca de aparelho, ajuste de carga)`
}

/** Quanto a semana precisa cair para ser chamada de mais leve. */
export const QUEDA_PARA_SEMANA_LEVE = -25

/**
 * O rótulo da variação semanal.
 *
 * `isHeavyWeek` só distinguia PESADA de tudo o mais, e "tudo o mais" incluía
 * uma queda de 100% — que a tela então chamava de "semana normal", ao lado do
 * próprio "−100,0%". Um app que se contradiz na mesma caixa ensina o usuário a
 * não ler nenhum dos dois.
 *
 * Sem semana anterior não há variação: o rótulo diz isso em vez de fingir
 * estabilidade (o `deltaPct` vem 0 nesse caso, e "0,0% — semana normal" é uma
 * afirmação que ninguém mediu).
 */
export function rotuloDaVariacaoSemanal(input: {
    deltaPct: unknown
    isHeavyWeek: unknown
    previousWeekKg: unknown
}): string {
    const anterior = Number(input?.previousWeekKg)
    if (!Number.isFinite(anterior) || anterior <= 0) return 'sem semana anterior'
    if (input?.isHeavyWeek === true) return 'semana pesada'
    const delta = Number(input?.deltaPct)
    if (Number.isFinite(delta) && delta <= QUEDA_PARA_SEMANA_LEVE) return 'semana mais leve'
    return 'semana normal'
}

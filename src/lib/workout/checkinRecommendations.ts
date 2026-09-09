/**
 * As recomendações do check-in — e por que elas precisam saber da DESCARGA.
 *
 * Relato do dono em 09/09/2026, com print: sessão inteira em deload, RPE 10 no
 * pós-treino, e o relatório respondendo "RPE alto: reduza um pouco a
 * intensidade e aumente descanso entre séries". Ele já tinha reduzido — o app
 * é que não sabia, porque estas regras liam só os dois check-ins e nunca
 * olhavam o que a sessão fez com a carga.
 *
 * O conselho errado tem duas formas, e a segunda é pior:
 *
 *  1. "reduza a intensidade" para quem já reduziu — inútil, e faz o app parecer
 *     que não acompanha o próprio usuário;
 *  2. "considere 5–7 dias de deload" para quem está NO deload. Essa chega a
 *     contradizer o estado da sessão que o próprio relatório está exibindo.
 *
 * O que muda com a descarga ligada não é o alarme: RPE 10 continua sendo sinal.
 * Muda o que ele SIGNIFICA — a redução de hoje não bastou —, e portanto o que
 * se faz a respeito. Por isso a regra troca de texto em vez de emudecer: calar
 * esconderia justamente a sessão que mais pede atenção.
 *
 * Função pura, extraída de `WorkoutReport.tsx` para poder ser testada de
 * verdade. O PDF (`buildHtml`) recebe o resultado pronto da tela e não
 * recalcula — os dois não podem discordar.
 */

/** Limiares, num lugar só — eles aparecem no texto das mensagens. */
export const DOR_ALTA = 7
export const ENERGIA_BAIXA = 2
export const RPE_ALTO = 9
export const SATISFACAO_BAIXA = 2
export const SATISFACAO_MORNA = 3
export const TEMPO_CURTO_MIN = 45

export interface CheckinParaRecomendar {
    energy?: unknown
    soreness?: unknown
    timeMinutes?: unknown
    rpe?: unknown
    satisfaction?: unknown
}

/**
 * ⚠️ Campo AUSENTE é "não sei", nunca zero.
 *
 * A versão que morava no `WorkoutReport` fazia `Number(String(v ?? ''))`, e
 * `Number('')` é **0** — finito, logo aceito. Quem PULAVA o check-in recebia
 * "Energia baixa" e "Satisfação baixa" sem ter respondido nada, porque 0 passa
 * nos dois limiares. Medido ao extrair esta função em 09/09/2026; o defeito
 * estava no ar desde que as recomendações existem.
 */
const numeroOuNulo = (v: unknown): number | null => {
    try {
        if (v == null) return null
        if (typeof v === 'number') return Number.isFinite(v) ? v : null
        const texto = String(v).trim().replace(',', '.')
        if (texto === '') return null
        const n = Number(texto)
        return Number.isFinite(n) ? n : null
    } catch {
        return null
    }
}

/**
 * A sessão aplicou descarga?
 *
 * A verdade está nos LOGS: `buildDeloadPatches` carimba `log.deload` em cada
 * série que de fato recebeu peso menor — e só nelas (série que não mudou não
 * ganha marca, decisão de 07/09/2026). Ou seja, uma marca aqui é prova de que a
 * carga caiu nesta sessão, não de que alguém tocou no botão.
 *
 * Não usamos a preferência `autoLoadDeloadCycle` nem o estado do botão: os dois
 * dizem INTENÇÃO, e a intenção não é o que o usuário executou.
 */
export function sessaoEmDeload(logs: unknown): boolean {
    if (!logs || typeof logs !== 'object') return false
    for (const valor of Object.values(logs as Record<string, unknown>)) {
        if (!valor || typeof valor !== 'object') continue
        const deload = (valor as Record<string, unknown>).deload
        if (deload && typeof deload === 'object') return true
    }
    return false
}

export function buildCheckinRecommendations(input: {
    preCheckin?: CheckinParaRecomendar | null
    postCheckin?: CheckinParaRecomendar | null
    emDeload?: boolean
}): string[] {
    const { preCheckin, postCheckin, emDeload = false } = input
    const recs: string[] = []

    const preEnergia = numeroOuNulo(preCheckin?.energy)
    const preDor = numeroOuNulo(preCheckin?.soreness)
    const preTempo = numeroOuNulo(preCheckin?.timeMinutes)
    const posRpe = numeroOuNulo(postCheckin?.rpe)
    const posSatisfacao = numeroOuNulo(postCheckin?.satisfaction)
    const posDor = numeroOuNulo(postCheckin?.soreness)

    const dorAlta = (preDor != null && preDor >= DOR_ALTA) || (posDor != null && posDor >= DOR_ALTA)

    if (dorAlta) {
        recs.push(
            emDeload
                // Já está reduzindo e a dor segue alta: o problema deixou de ser
                // a carga. Repetir "reduza 20–30%" mandaria descer sobre uma
                // carga já descida, e é o conselho que o dono recebeu.
                ? 'Dor alta mesmo na descarga: a carga já está reduzida, então olhe recuperação — sono, alimentação e mobilidade. Dor que não cede em uma semana pede avaliação.'
                : 'Dor alta: reduzir volume/carga 20–30% e priorizar técnica + mobilidade.',
        )
    }
    if (preEnergia != null && preEnergia <= ENERGIA_BAIXA) {
        recs.push('Energia baixa: mantenha o treino mais curto, evite falha e foque em recuperação (sono/estresse).')
    }
    if (posRpe != null && posRpe >= RPE_ALTO) {
        recs.push(
            emDeload
                ? 'RPE alto MESMO na descarga: a redução de hoje não foi suficiente. Desça mais na próxima sessão em vez de manter o mesmo corte.'
                : 'RPE alto: reduza um pouco a intensidade e aumente descanso entre séries.',
        )
    }
    // Sugerir deload a quem ESTÁ em deload contradiz a própria sessão que o
    // relatório mostra logo acima. Em descarga, o sinal de fadiga já está sendo
    // tratado — e o que ele acrescenta é dito pela mensagem de RPE.
    if (
        !emDeload
        && posRpe != null
        && posRpe >= RPE_ALTO
        && (dorAlta || (posSatisfacao != null && posSatisfacao <= SATISFACAO_MORNA))
    ) {
        recs.push('Sinais de fadiga: considere 5–7 dias de deload (−10–20% carga ou −1 série por exercício).')
    }
    if (posSatisfacao != null && posSatisfacao <= SATISFACAO_BAIXA) {
        recs.push('Satisfação baixa: revise seleção de exercícios e meta da sessão para manter consistência.')
    }
    if (preTempo != null && preTempo > 0 && preTempo < TEMPO_CURTO_MIN) {
        recs.push('Pouco tempo: use um treino "mínimo efetivo" (menos exercícios e mais foco).')
    }
    return recs
}

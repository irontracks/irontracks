/**
 * Cruzamento entre a % de gordura ESTIMADA pela foto (IA) e a MEDIDA na
 * avaliação física (dobras cutâneas ou bioimpedância).
 *
 * Por que existe: o laudo por foto sempre devolveu uma faixa (ex.: 14–17%) e a
 * avaliação por dobras sempre teve o número medido — e nada no app confrontava
 * os dois. No caso que originou isto, a foto dizia 14–17% e as dobras diziam
 * 7,07%: 7 pontos de diferença, invisíveis porque cada número vivia numa tela.
 *
 * A divergência é INFORMAÇÃO, não erro a esconder: ela mede a qualidade dos
 * dados de entrada. Uma dobra mal medida (ou uma foto com luz ruim) aparece
 * aqui antes de contaminar dieta, TDEE e progressão de carga.
 *
 * ⚠️ Ordem importa: a IA estima a faixa SEM ver este número. Se o valor medido
 * entrasse no prompt do laudo, o modelo repetiria o número em vez de olhar a
 * foto — e o cruzamento viraria eco. Por isso a comparação acontece DEPOIS, na
 * leitura, e nunca antes da estimativa.
 */

/** Fonte do número medido, para a UI não chamar bioimpedância de dobra. */
export type MeasuredBodyFatSource = 'skinfold' | 'bia' | 'assessment'

export interface AssessmentBodyFatRow {
    assessment_date: string
    body_fat_percentage?: number | string | null
    body_fat_percentage_skinfold?: number | string | null
    bia_body_fat_percentage?: number | string | null
}

export interface BodyFatReference {
    assessmentDate: string
    percent: number
    source: MeasuredBodyFatSource
    /** Distância em dias entre a avaliação medida e a foto (absoluta). */
    daysApart: number
}

const toNum = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null
    const n = Number(String(v).replace(',', '.'))
    return Number.isFinite(n) && n > 0 && n < 80 ? n : null
}

/** Dias entre duas datas 'YYYY-MM-DD' (absoluto). */
const daysBetween = (a: string, b: string): number => {
    const [ay, am, ad] = String(a).split('-').map(Number)
    const [by, bm, bd] = String(b).split('-').map(Number)
    if (!ay || !by) return Number.MAX_SAFE_INTEGER
    const da = Date.UTC(ay, am - 1, ad)
    const db = Date.UTC(by, bm - 1, bd)
    return Math.round(Math.abs(da - db) / 86_400_000)
}

/**
 * Escolhe a avaliação de referência para a foto: a mais recente ATÉ a data da
 * foto (o passado explica a foto; o futuro ainda não aconteceu). Sem nenhuma
 * anterior, aceita a posterior mais próxima — melhor comparar com algo do que
 * esconder o cruzamento.
 *
 * Preferência de fonte por linha: dobras → bioimpedância → campo consolidado.
 */
export function pickBodyFatReference(
    rows: readonly AssessmentBodyFatRow[],
    photoDate: string,
): BodyFatReference | null {
    if (!Array.isArray(rows) || !rows.length || !photoDate) return null

    const candidates: BodyFatReference[] = []
    for (const row of rows) {
        const date = String(row?.assessment_date || '').slice(0, 10)
        if (!date) continue
        const skin = toNum(row.body_fat_percentage_skinfold)
        const bia = toNum(row.bia_body_fat_percentage)
        const generic = toNum(row.body_fat_percentage)
        const picked: [number, MeasuredBodyFatSource] | null =
            skin !== null ? [skin, 'skinfold']
                : bia !== null ? [bia, 'bia']
                    : generic !== null ? [generic, 'assessment']
                        : null
        if (!picked) continue
        candidates.push({ assessmentDate: date, percent: picked[0], source: picked[1], daysApart: daysBetween(date, photoDate) })
    }
    if (!candidates.length) return null

    const past = candidates.filter((c) => c.assessmentDate <= photoDate)
    const pool = past.length ? past : candidates
    // Mais próxima da foto; empate fica com a mais recente.
    return [...pool].sort((a, b) => a.daysApart - b.daysApart || b.assessmentDate.localeCompare(a.assessmentDate))[0]
}

export type CrossCheckVerdict = 'match' | 'photo_higher' | 'photo_lower'
export type CrossCheckSeverity = 'ok' | 'attention' | 'high'

export interface BodyFatCrossCheck {
    verdict: CrossCheckVerdict
    /** Distância em PONTOS PERCENTUAIS até a borda mais próxima da faixa. 0 quando bate. */
    deltaPoints: number
    severity: CrossCheckSeverity
    /** Referência com mais de 90 dias explica sozinha boa parte da diferença. */
    stale: boolean
}

/** Acima disto a diferença deixa de ser ruído de método e vira sinal de dado ruim. */
const ATTENTION_POINTS = 3
const HIGH_POINTS = 5
const STALE_DAYS = 90

/**
 * Compara a faixa estimada na foto com o valor medido.
 * `deltaPoints` mede a distância até a BORDA da faixa, não até o meio: se o
 * medido cai dentro da faixa, os dois métodos concordam e a distância é zero.
 */
export function compareBodyFat(
    photoLow: number,
    photoHigh: number,
    reference: BodyFatReference,
): BodyFatCrossCheck {
    const low = Math.min(photoLow, photoHigh)
    const high = Math.max(photoLow, photoHigh)
    const measured = reference.percent
    const stale = reference.daysApart > STALE_DAYS

    if (measured >= low && measured <= high) {
        return { verdict: 'match', deltaPoints: 0, severity: 'ok', stale }
    }
    const verdict: CrossCheckVerdict = measured < low ? 'photo_higher' : 'photo_lower'
    const deltaPoints = Math.round((measured < low ? low - measured : measured - high) * 10) / 10
    const severity: CrossCheckSeverity =
        deltaPoints >= HIGH_POINTS ? 'high' : deltaPoints >= ATTENTION_POINTS ? 'attention' : 'ok'
    return { verdict, deltaPoints, severity, stale }
}

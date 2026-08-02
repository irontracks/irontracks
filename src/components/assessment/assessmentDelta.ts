/**
 * Variação entre uma avaliação e a anterior.
 *
 * Por que existe (ago/2026): o histórico mostrava cinco números soltos por
 * avaliação e nenhuma evolução. Os dados estavam na tela — 88,2 kg em março,
 * 92,5 kg em setembro; 12,2% de gordura virando 11,3% — e o usuário tinha de
 * fazer a conta de cabeça, rolando entre cards. Um histórico que não mostra a
 * mudança é uma planilha, não um histórico.
 *
 * ⚠️ SOBRE A COR: só recebe julgamento a métrica cuja direção é inequívoca.
 * Gordura caindo é bom; massa magra subindo é bom. PESO NÃO — subir é ganho
 * para quem está em bulking e problema para quem corta, e o app não sabe o
 * objetivo de quem olha. Pintar o peso de vermelho seria opinião disfarçada de
 * dado. Por isso ele é sempre neutro.
 */

/** Sentido do que a variação significa — `neutral` quando depende do objetivo. */
export type DeltaTone = 'good' | 'bad' | 'neutral'

export interface MetricDelta {
    /** Diferença absoluta (atual − anterior), já arredondada para exibição. */
    diff: number
    /** Texto pronto, com sinal: "+4.3", "−0.9". */
    label: string
    tone: DeltaTone
}

/** Direção que representa MELHORA. `null` = não julgamos. */
export type BetterDirection = 'up' | 'down' | null

const MINUS = '−' // sinal de menos tipográfico, não hífen

/**
 * @param decimals casas na exibição — também define o limiar de "sem mudança":
 *                 uma diferença que arredonda para zero não vira seta.
 */
export function computeDelta(
    current: number | null | undefined,
    previous: number | null | undefined,
    better: BetterDirection,
    decimals = 1,
): MetricDelta | null {
    // ⚠️ `Number(null)` é 0 e `Number.isFinite(0)` é true — sem este guarda,
    // uma avaliação SEM anterior renderizaria "+88.2 kg" (o peso inteiro como se
    // fosse ganho). Pego por teste antes de chegar na tela.
    if (current == null || previous == null) return null
    const a = Number(current)
    const b = Number(previous)
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null

    const raw = a - b
    const factor = 10 ** decimals
    const diff = Math.round(raw * factor) / factor
    // Variação que some no arredondamento não é variação: mostrar "+0.0" com
    // seta verde seria ruído com cara de sinal.
    if (diff === 0) return null

    const magnitude = Math.abs(diff).toFixed(decimals)
    const label = `${diff > 0 ? '+' : MINUS}${magnitude}`

    let tone: DeltaTone = 'neutral'
    if (better === 'up') tone = diff > 0 ? 'good' : 'bad'
    else if (better === 'down') tone = diff < 0 ? 'good' : 'bad'

    return { diff, label, tone }
}

/** Dias entre duas avaliações — dá escala à variação ("+4.3 kg em 188 dias"). */
export function daysBetween(current: unknown, previous: unknown): number | null {
    const toMs = (v: unknown): number => {
        const d = new Date(typeof v === 'string' || typeof v === 'number' || v instanceof Date ? v : String(v ?? ''))
        const t = d.getTime()
        return Number.isFinite(t) ? t : NaN
    }
    const a = toMs(current)
    const b = toMs(previous)
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null
    const days = Math.round((a - b) / 86_400_000)
    return days > 0 ? days : null
}

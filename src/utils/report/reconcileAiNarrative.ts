/**
 * src/utils/report/reconcileAiNarrative.ts
 *
 * Rede de segurança contra número agregado ALUCINADO pelo modelo no relatório
 * pós-treino.
 *
 * Sintoma real (29/07/2026): o card mostrava "26.300 kg / 29 séries" e, três
 * centímetros abaixo, o texto gerado pela IA afirmava "Volume total de 18.232 kg
 * movimentado em 26 séries de trabalho". O mesmo 18.232 apareceu numa sessão
 * completamente diferente (27/07, volume real 17.566 kg) — e a string "18232"
 * não existia em lugar nenhum do payload enviado ao modelo. Ou seja: o número
 * foi inventado, não recortado de outra regra de negócio.
 *
 * A defesa principal é o prompt (as métricas oficiais vão prontas e o modelo é
 * proibido de somar). Isto aqui é o cinto de segurança: o relatório é
 * compartilhável (Story/Card/PDF) e sai do app, então um número errado não pode
 * vazar por uma geração azarada. Bullet com agregado divergente é DESCARTADO —
 * perder uma frase custa menos que publicar carga errada.
 *
 * Conservador de propósito: só reconcilia quando o texto declara um TOTAL
 * ("volume total de X kg", "em N séries de trabalho", "19 das 26 séries").
 * Peso de exercício ("Puxada com 73 kg") e série de um exercício específico
 * ("supino em 4 séries") não são tocados.
 */

export type AiMetricsLike = {
  totalVolumeKg?: number | null
  totalSetsDone?: number | null
} | null | undefined

export type NarrativeDivergence = {
  field: string
  kind: 'volume' | 'sets'
  declared: number
  official: number
  text: string
}

/** Campos de texto livre do bloco de IA que podem conter agregados. */
const NARRATIVE_FIELDS = ['summary', 'highlights', 'warnings'] as const

/**
 * "18.232" → 18232 · "26.300" → 26300 · "7,5" → 7.5
 * Ponto só é separador de milhar quando seguido de exatamente 3 dígitos.
 */
export function parsePtBrNumber(raw: string): number {
  const cleaned = String(raw || '')
    .trim()
    .replace(/\.(?=\d{3}\b)/g, '')
    .replace(',', '.')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : NaN
}

/** Volume TOTAL declarado no texto, em kg. null quando o texto não afirma um total. */
export function findDeclaredVolumeKg(text: string): number | null {
  const m = /volume\s+total[^.!?]*?(\d[\d.,]*)\s*kg/i.exec(String(text || ''))
  if (!m?.[1]) return null
  const n = parsePtBrNumber(m[1])
  return Number.isFinite(n) ? n : null
}

/** Total de séries declarado no texto. null quando o texto não afirma um total. */
export function findDeclaredSets(text: string): number | null {
  const s = String(text || '')
  // "em 26 séries de trabalho" / "26 séries de trabalho"
  const trabalho = /(\d+)\s+s[ée]ries?\s+de\s+trabalho/i.exec(s)
  if (trabalho?.[1]) {
    const n = Number(trabalho[1])
    if (Number.isFinite(n)) return n
  }
  // "19 das 26 séries" → o denominador é o total da sessão
  const proporcao = /\bd[ae]s\s+(\d+)\s+s[ée]ries?/i.exec(s)
  if (proporcao?.[1]) {
    const n = Number(proporcao[1])
    if (Number.isFinite(n)) return n
  }
  return null
}

/**
 * Tolerância de volume: o texto costuma arredondar ("26.3 mil", 26.300 vs
 * 26.298). Aceita 1% ou 50 kg, o que for maior. Séries são exatas.
 */
function volumeBate(declared: number, official: number): boolean {
  const tolerancia = Math.max(50, official * 0.01)
  return Math.abs(declared - official) <= tolerancia
}

/**
 * Remove dos campos narrativos os bullets que afirmam um agregado divergente
 * das métricas oficiais. Função pura: quem chama decide o que fazer com as
 * divergências (logar, medir).
 */
export function reconcileAiNarrative<T extends Record<string, unknown>>(
  ai: T,
  metrics: AiMetricsLike,
): { ai: T; divergences: NarrativeDivergence[] } {
  const officialVolume = Number(metrics?.totalVolumeKg)
  const officialSets = Number(metrics?.totalSetsDone)
  const temVolume = Number.isFinite(officialVolume) && officialVolume > 0
  const temSets = Number.isFinite(officialSets) && officialSets > 0
  if (!ai || typeof ai !== 'object' || (!temVolume && !temSets)) {
    return { ai, divergences: [] }
  }

  const divergences: NarrativeDivergence[] = []
  const out: Record<string, unknown> = { ...ai }

  for (const field of NARRATIVE_FIELDS) {
    const value = (ai as Record<string, unknown>)[field]
    if (!Array.isArray(value)) continue

    out[field] = value.filter((item) => {
      const text = String(item ?? '')
      if (!text.trim()) return true

      if (temVolume) {
        const declared = findDeclaredVolumeKg(text)
        if (declared !== null && !volumeBate(declared, officialVolume)) {
          divergences.push({ field, kind: 'volume', declared, official: officialVolume, text })
          return false
        }
      }

      if (temSets) {
        const declared = findDeclaredSets(text)
        if (declared !== null && declared !== officialSets) {
          divergences.push({ field, kind: 'sets', declared, official: officialSets, text })
          return false
        }
      }

      return true
    })
  }

  return { ai: out as T, divergences }
}

/**
 * Tendência de peso ao longo do tempo, combinando DUAS fontes:
 *   - avaliações físicas (`assessments.weight`) — esparsas, medidas formais;
 *   - check-ins de treino (`workout_checkins.answers.body_weight_kg`) — frequentes,
 *     um ponto por treino em que o usuário informou o peso.
 *
 * Assim o gráfico de peso deixa de ter só os poucos pontos das avaliações e passa
 * a mostrar a curva densa do dia a dia — SEM escrever nada em `assessments` (o
 * card PESO e o gráfico das avaliações continuam intactos; isto só LÊ os check-ins).
 *
 * Pura e testável: recebe as linhas cruas dos dois selects e devolve os pontos
 * válidos, ordenados por data e deduplicados por dia (avaliação vence check-in no
 * mesmo dia — é a medida formal).
 */
export interface WeightTrendPoint {
  ms: number
  weightKg: number
  source: 'assessment' | 'checkin'
}

const MIN_KG = 20
const MAX_KG = 300

const toMs = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const ms = new Date(String(v)).getTime()
  return Number.isFinite(ms) ? ms : null
}

const toKg = (v: unknown): number | null => {
  const n = Number(String(v ?? '').replace(',', '.').trim())
  return Number.isFinite(n) && n >= MIN_KG && n <= MAX_KG ? Math.round(n * 10) / 10 : null
}

const dayKey = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

const isRec = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

export function buildWeightTrend(
  checkinRows: unknown[],
  assessmentRows: unknown[],
): WeightTrendPoint[] {
  const raw: WeightTrendPoint[] = []

  for (const r of Array.isArray(assessmentRows) ? assessmentRows : []) {
    if (!isRec(r)) continue
    const ms = toMs(r.date) ?? toMs(r.assessment_date) ?? toMs(r.created_at)
    const kg = toKg(r.weight)
    if (ms != null && kg != null) raw.push({ ms, weightKg: kg, source: 'assessment' })
  }

  for (const r of Array.isArray(checkinRows) ? checkinRows : []) {
    if (!isRec(r)) continue
    const ms = toMs(r.created_at)
    const answers = isRec(r.answers) ? r.answers : {}
    const kg = toKg(r.weight_kg) ?? toKg(answers.body_weight_kg)
    if (ms != null && kg != null) raw.push({ ms, weightKg: kg, source: 'checkin' })
  }

  // Dedup por dia: avaliação vence check-in; entre iguais, o mais recente do dia.
  const byDay = new Map<string, WeightTrendPoint>()
  for (const p of raw) {
    const key = dayKey(p.ms)
    const cur = byDay.get(key)
    if (!cur) { byDay.set(key, p); continue }
    if (cur.source === 'assessment' && p.source === 'checkin') continue
    if (cur.source === 'checkin' && p.source === 'assessment') { byDay.set(key, p); continue }
    if (p.ms >= cur.ms) byDay.set(key, p)
  }

  return Array.from(byDay.values()).sort((a, b) => a.ms - b.ms)
}

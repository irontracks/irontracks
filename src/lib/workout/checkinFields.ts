/**
 * checkinFields — leitura e formatação dos campos do check-in (pré-treino) e
 * check-out (pós-treino).
 *
 * Fonte única para a TELA (`ReportCheckinPanel`) e o PDF (`utils/report/buildHtml`):
 * as duas leem exatamente estas funções para o mesmo dado. É a classe de bug mais
 * repetida deste repo (duas superfícies decidindo a mesma coisa por conta própria e
 * divergindo no dia em que uma muda e a outra não) — aqui não há onde divergir,
 * porque não há duas implementações.
 *
 * Puro, sem I/O: recebe o valor bruto do check-in (string, number ou ausente) e
 * devolve o texto pronto pra exibir.
 */

const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'boolean') return null
  const n = Number(String(v).trim().replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Arredonda pra 1 casa e usa vírgula — o app inteiro é pt-BR. "82.53" → "82,5". */
const oneDecimalPtBr = (n: number): string => String(Math.round(n * 10) / 10).replace('.', ',')

/**
 * Energia do pré-treino (escala 1–5, ver `CHECKIN_SCALES.energy`) traduzida pro
 * mesmo rótulo que o seletor de humor usa ao coletar ('great'|'normal'|'tired'
 * já convertidos em 5|3|1 antes de chegar aqui).
 */
export function checkinEnergyLabel(energy: unknown): string {
  const e = toNum(energy)
  if (e == null) return '—'
  if (e >= 5) return '💪 Ótimo'
  if (e >= 3) return '😐 Normal'
  if (e >= 1) return '😴 Cansado'
  return String(e)
}

/** "82,5 kg" — o peso do check-in (`answers.body_weight_kg`) é sempre em kg. */
export function checkinWeightLabel(weightKg: unknown): string {
  const n = toNum(weightKg)
  return n == null ? '—' : `${oneDecimalPtBr(n)} kg`
}

/** "7,5 h" — sono da última noite, coletado só no pré-treino. */
export function checkinSleepLabel(sleepHours: unknown): string {
  const n = toNum(sleepHours)
  return n == null ? '—' : `${oneDecimalPtBr(n)} h`
}

/**
 * Valor simples sem rótulo de escala (RPE, dor, satisfação, tempo disponível) —
 * "—" quando ausente. Sem sufixo por padrão: a tela nunca rotulou a escala (dor
 * aparece como "7", não "7/10"), e aqui segue o mesmo — mudar isso é decisão de
 * design, não detalhe de formatação.
 */
export function checkinPlainValue(v: unknown, suffix = ''): string {
  if (v === null || v === undefined) return '—'
  const s = String(v).trim()
  return s === '' ? '—' : `${s}${suffix}`
}

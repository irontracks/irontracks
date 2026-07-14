// Detecta o "dia da semana" de um treino a partir do prefixo do título — a
// convenção do app grava o dia no próprio título ("SEG · LOWER B", "TER · UPPER
// A", ...); não existe campo estruturado de agendamento em DashboardWorkout.

const DAY_TOKENS: Record<string, number> = {
  DOM: 0, // domingo
  SEG: 1, // segunda
  TER: 2, // terça
  QUA: 3, // quarta
  QUI: 4, // quinta
  SEX: 5, // sexta
  SAB: 6, // sábado
}

const stripAccents = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

/**
 * Extrai o índice do dia da semana (0=domingo … 6=sábado) do prefixo do título.
 * Aceita abreviações e nomes completos, com ou sem acento:
 * "SEG", "Segunda", "TER · Upper", "SÁB - Full body", "domingo". Retorna null
 * quando o título não começa por um dia reconhecível.
 */
export function parseWorkoutDay(title: unknown): number | null {
  const raw = typeof title === 'string' ? title : ''
  if (!raw) return null
  const head = stripAccents(raw).toUpperCase().trim().split(/[·\-–—:.,/|\s]/)[0]
  if (!head) return null
  const key = head.slice(0, 3)
  return key in DAY_TOKENS ? DAY_TOKENS[key] : null
}

/**
 * True quando o dia do título bate com o dia da semana atual (hora local do
 * device). Títulos sem prefixo de dia nunca são "hoje".
 */
export function isWorkoutToday(title: unknown, now: Date = new Date()): boolean {
  const day = parseWorkoutDay(title)
  if (day === null) return false
  return day === now.getDay()
}

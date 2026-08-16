// Detecta o "dia da semana" de um treino a partir do TÍTULO — não existe campo
// estruturado de agendamento em DashboardWorkout, então o dia mora no nome.
//
// Duas convenções convivem em produção e as duas precisam funcionar:
//   • prefixo   — "SEG · LOWER B", "TER · UPPER A"
//   • sufixo    — "A - empurrar a (segunda)", "D - EMPURRAR B (QUINTA)"
//
// A versão original só olhava o PRIMEIRO token. Resultado: quem nomeia os
// treinos como "A - empurrar a (segunda)" — o padrão do dono do app — nunca via
// o selo HOJE. A feature existia, estava bem construída, e não disparava nunca
// (achado da auditoria de design de ago/2026, usando o app).

const DAY_TOKENS: Record<string, number> = {
  DOM: 0, // domingo
  SEG: 1, // segunda
  TER: 2, // terça
  QUA: 3, // quarta
  QUI: 4, // quinta
  SEX: 5, // sexta
  SAB: 6, // sábado
}

/** Nomes por extenso. Precisam ser EXATOS — ver a armadilha abaixo. */
const DAY_WORDS: Record<string, number> = {
  DOMINGO: 0,
  SEGUNDA: 1,
  TERCA: 2,
  QUARTA: 3,
  QUINTA: 4,
  SEXTA: 5,
  SABADO: 6,
}

const stripAccents = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

/**
 * Extrai o índice do dia da semana (0=domingo … 6=sábado) de qualquer posição do
 * título. Aceita abreviação ou nome completo, com ou sem acento, e ignora
 * pontuação e parênteses.
 *
 * ⚠️ A comparação é EXATA por token, nunca por prefixo de 3 letras solto. Casar
 * prefixo faria "QUAdríceps" virar quarta-feira e "TERra" virar terça — e o
 * treino errado ganharia o selo HOJE. É a razão de existirem duas tabelas.
 */
export function parseWorkoutDay(title: unknown): number | null {
  const raw = typeof title === 'string' ? title : ''
  if (!raw) return null

  const tokens = stripAccents(raw)
    .toUpperCase()
    .split(/[^A-Z]+/)          // separa por tudo que não é letra: ·, -, (), espaço…
    .filter(Boolean)

  for (const token of tokens) {
    if (token in DAY_WORDS) return DAY_WORDS[token]
    if (token.length === 3 && token in DAY_TOKENS) return DAY_TOKENS[token]
    // "SEGUNDA-FEIRA" chega aqui como dois tokens (SEGUNDA, FEIRA) — o primeiro
    // já resolveu. Nada a fazer com o resto.
  }
  return null
}

/**
 * True quando o dia do título bate com o dia da semana atual (hora local do
 * device). Títulos sem dia reconhecível nunca são "hoje".
 */
export function isWorkoutToday(title: unknown, now: Date = new Date()): boolean {
  const day = parseWorkoutDay(title)
  if (day === null) return false
  return day === now.getDay()
}

/**
 * Índice do treino que deve receber o CTA em destaque (sólido) numa lista: o de
 * hoje; se nenhum bate com hoje, o primeiro (âncora visual). -1 se a lista é
 * vazia. Recebe os títulos na ordem exibida.
 */
export function pickEmphasizedWorkoutIndex(titles: unknown[], now: Date = new Date()): number {
  if (!Array.isArray(titles) || titles.length === 0) return -1
  const todayIdx = titles.findIndex((t) => isWorkoutToday(t, now))
  return todayIdx >= 0 ? todayIdx : 0
}

/**
 * True quando ALGUM título da lista declara dia da semana. É o que separa quem
 * usa a agenda ("SEG · Upper B") de quem só nomeia os treinos ("Treino A").
 */
export function hasScheduledDay(titles: unknown[]): boolean {
  return Array.isArray(titles) && titles.some((t) => parseWorkoutDay(t) !== null)
}

/**
 * Índice do treino que o ATALHO DO TOPO deve oferecer hoje, ou -1 quando o dia
 * não tem treino programado.
 *
 * Diferente de `pickEmphasizedWorkoutIndex`, que nunca devolve -1: lá o
 * fallback existe para dar âncora visual a uma lista que já está na tela; aqui
 * a pergunta é outra — "há treino para HOJE?" —, e o fallback respondia sempre
 * que sim. No sábado, com a semana nomeada SEG…SEX, o topo anunciava
 * "PRÓXIMO TREINO · SEG" com um botão TREINAR AGORA: convite para adiantar o
 * treino de segunda no fim de semana, que ninguém pediu (relato do dono,
 * 16/08/2026). Quem agenda por dia quer ver o card só no dia.
 *
 * A regra, em ordem:
 *   1. treino cujo dia bate com hoje;
 *   2. se a lista TEM agenda mas hoje não é dia de nada, o primeiro treino SEM
 *      dia declarado (o avulso — pode ser feito qualquer dia), ou -1;
 *   3. lista sem agenda nenhuma: o primeiro, como antes — senão o atalho
 *      sumiria para sempre de quem nomeia os treinos por letra.
 */
export function pickQuickStartWorkoutIndex(titles: unknown[], now: Date = new Date()): number {
  if (!Array.isArray(titles) || titles.length === 0) return -1
  const todayIdx = titles.findIndex((t) => isWorkoutToday(t, now))
  if (todayIdx >= 0) return todayIdx
  if (!hasScheduledDay(titles)) return 0
  return titles.findIndex((t) => parseWorkoutDay(t) === null)
}

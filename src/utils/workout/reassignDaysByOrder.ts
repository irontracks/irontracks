/**
 * Reatribui os prefixos de dia dos treinos seguindo a ORDEM da lista.
 *
 * O dia não é um campo do banco — é o prefixo do próprio título ("SEG · LOWER B").
 * A ordem da lista é outro campo (`sort_order`). Sem isto, arrastar a quinta pra
 * cima da quarta deixava os dois fora de sincronia, e o badge HOJE (que lê o
 * NOME, não a posição) passava a apontar pro treino errado.
 *
 * Regras:
 * - **Só reescreve quem já tem prefixo de dia.** Treino sem dia ("Cardio livre")
 *   nunca ganha um — ele apenas ocupa a posição dele e é ignorado no rodízio.
 * - **Não inventa dias.** Os tokens de dia que já existiam na lista são
 *   reaproveitados, em ordem cronológica (semana começando na segunda), e
 *   redistribuídos entre os treinos-com-dia na ordem em que aparecem agora. Quem
 *   treina SEG/TER/QUI/SEX continua com SEG/TER/QUI/SEX.
 * - **Preserva o texto original do token.** Se o título dizia "Segunda", o rótulo
 *   reaproveitado é "Segunda" — não normalizamos pra "SEG".
 * - **Preserva o resto do título** (separador incluso): só o token do dia muda.
 */
import { parseWorkoutDay } from './workoutDay'

/** Ordem cronológica com a semana começando na segunda (domingo por último). */
const weekRank = (day: number): number => (day === 0 ? 7 : day)

/** Casa o primeiro token do título (o candidato a dia) preservando o resto. */
const HEAD_RE = /^(\s*)([^\s·\-–—:.,/|]+)([\s\S]*)$/

export function reassignWorkoutDaysByOrder<T extends { title: string }>(items: readonly T[]): T[] {
  const list = Array.isArray(items) ? items : []
  if (list.length < 2) return [...list]

  // Posições (na ordem atual) que têm dia, e os tokens originais desses dias.
  const slots: number[] = []
  const tokens: { day: number; text: string }[] = []

  list.forEach((it, idx) => {
    const title = typeof it?.title === 'string' ? it.title : ''
    const day = parseWorkoutDay(title)
    if (day === null) return
    const m = title.match(HEAD_RE)
    if (!m) return
    slots.push(idx)
    tokens.push({ day, text: m[2] })
  })

  if (slots.length < 2) return [...list]

  // Dias em ordem cronológica → redistribuídos na ordem em que os treinos aparecem.
  tokens.sort((a, b) => weekRank(a.day) - weekRank(b.day))

  const out = [...list]
  slots.forEach((listIdx, i) => {
    const item = out[listIdx]
    const title = typeof item?.title === 'string' ? item.title : ''
    const m = title.match(HEAD_RE)
    if (!m) return
    const next = `${m[1]}${tokens[i].text}${m[3]}`
    if (next !== title) out[listIdx] = { ...item, title: next }
  })

  return out
}

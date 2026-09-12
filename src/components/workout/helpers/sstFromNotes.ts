/**
 * @module sstFromNotes
 *
 * O SST que a NOTA do exercício injeta numa série específica ("SST na última:
 * Falha > 10s > Falha > 10s > Falha", "SST na 3ª série: ..."). Era uma IIFE
 * dentro do `ExerciseCard`, o que prendia a decisão ao componente.
 *
 * Existe porque o painel do professor precisa RÓTULAR a série com o MESMO
 * critério do card do aluno, e o rótulo por palpite é pior que rótulo nenhum —
 * é exatamente o que o docstring de `helpers/resolveSetMethod.ts` registra
 * ("o app diria 'Normal' numa série desenhada como DROP"). O `resolveSetMethodLabel`
 * já recebe `sstFromNotes` pronto; quem está FORA do card não tinha como
 * calculá-lo sem reimplementar o parser — e um segundo parser divergiria, que é
 * a armadilha que este repo já pagou caro em outras superfícies.
 *
 * Função PURA, sem React: só a nota e a quantidade de séries decidem.
 */

export type SstFromNotes = {
  /** Segundos de descanso entre as mini-séries (o "10s" do padrão). */
  restSec: number
  /** Quantas mini-séries — contadas pelas ocorrências de "Falha", piso de 2. */
  miniCount: number
  /** Índice (0-based) da série que recebe o SST. */
  targetSetIdx: number
}

/**
 * Lê a nota do exercício e devolve a configuração de SST, ou `null` quando a
 * nota não pede SST nenhum.
 *
 * `setsCount` só é usado no caso "na última" — "SST na 3ª série" fixa o índice
 * pela própria nota.
 */
export function parseSstFromNotes(notes: unknown, setsCount: number): SstFromNotes | null {
  const texto = String(notes || '')
  // Detecta "SST na última" ou "SST na Nª série"
  const lastMatch = /SST\s+na\s+(última|ult\.)/i.exec(texto)
  const nthMatch = /SST\s+na\s+(\d+)[ªa°.]?\s*série/i.exec(texto)
  if (!lastMatch && !nthMatch) return null

  // O resto do padrão depois do ":" traz o nº de minis e o descanso
  const colonIdx = texto.indexOf(':')
  const pattern = colonIdx >= 0 ? texto.slice(colonIdx + 1) : texto
  const restMatch = /(\d+)\s*s/i.exec(pattern)
  const restSec = restMatch ? parseInt(restMatch[1]) : 10
  const miniCount = Math.max(2, (pattern.match(/Falha/gi) ?? []).length)

  const targetSetIdx = nthMatch
    ? parseInt(nthMatch[1]) - 1 // "SST na 3ª série" → índice 2
    : setsCount - 1 // "SST na última" → última série

  return { restSec, miniCount, targetSetIdx }
}

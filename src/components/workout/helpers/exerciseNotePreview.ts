/**
 * @module exerciseNotePreview
 *
 * Prepara a observação do exercício para o PREVIEW de duas linhas do card de
 * treino ativo.
 *
 * Por que existe: as notas do coach quase sempre abrem reafirmando o nome do
 * exercício ("Leg press horizontal, uma perna de cada vez…" logo abaixo do
 * título "Leg press horizontal unilateral"). Num preview de duas linhas isso
 * gasta a metade útil do espaço repetindo o que o usuário acabou de ler — e a
 * informação que só a nota tem (onde põe o pé, até onde desce) fica cortada.
 *
 * Só o PREVIEW é afetado. Ao expandir, o texto do professor aparece inteiro,
 * sem corte: esconder conteúdo alheio para sempre não é decisão de layout.
 */

/** Acima disto o preview de 2 linhas corta, e o botão de expandir faz sentido. */
export const NOTE_PREVIEW_CHARS = 110

/** Tokens curtos ("de", "com", "uma") aparecem em qualquer frase e não provam repetição. */
const MIN_TOKEN_LEN = 4

/** Fração dos tokens do título que precisa reaparecer para a abertura ser considerada redundante. */
const REDUNDANT_RATIO = 0.6

const normalize = (raw: string): string =>
  String(raw ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const tokensOf = (raw: string): string[] =>
  normalize(raw)
    .split(' ')
    .filter((t) => t.length >= MIN_TOKEN_LEN)

/**
 * Corta a primeira frase quando ela só repete o nome do exercício.
 *
 * Conservador de propósito: na dúvida, mantém. Uma abertura preservada custa
 * meia linha de preview; uma abertura removida por engano some com instrução
 * que só existia ali.
 */
export const stripRedundantOpening = (note: string, exerciseName: string): string => {
  const text = String(note ?? '').trim()
  if (!text) return ''

  const nameTokens = tokensOf(exerciseName)
  if (!nameTokens.length) return text

  // Primeira frase = até o primeiro ponto final. `match` devolve null quando
  // não há ponto nenhum (nota de uma linha só) — aí não há o que cortar.
  // `[\s\S]` no lugar de `.` + flag `s`: a flag dotAll exige target es2018 e o
  // build deste repo mira mais baixo — o tsc reprova.
  const match = /^([^.]*\.)\s*([\s\S]*)$/.exec(text)
  if (!match) return text

  const first = match[1]
  const rest = String(match[2] || '').trim()
  // Sem resto, cortar deixaria o preview VAZIO — pior que a repetição.
  if (!rest) return text

  const firstNorm = normalize(first)
  const hits = nameTokens.filter((t) => firstNorm.includes(t)).length
  const isRedundant = hits / nameTokens.length >= REDUNDANT_RATIO

  return isRedundant ? rest : text
}

/**
 * O preview cabe inteiro? Então não há botão de expandir — um "ver mais" que
 * não revela nada é ruído, e o usuário aprende a ignorar o controle.
 */
export const noteNeedsExpand = (preview: string): boolean =>
  String(preview ?? '').trim().length > NOTE_PREVIEW_CHARS

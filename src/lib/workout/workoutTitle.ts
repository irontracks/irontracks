/**
 * @module workoutTitle
 *
 * O prefixo de dia no título do treino — quando ele informa e quando ele estorva.
 *
 * Os treinos deste app costumam se chamar `QUA · Upper A - Costas + Ombro`. Na
 * LISTA do dashboard esse prefixo é o que faz o usuário escolher: ele procura o
 * dia. Mas em duas telas ele é redundante com o que está na própria tela — e,
 * como vem primeiro, é o conteúdo que sobra para ser cortado:
 *
 * - **Header do treino ativo**: você já está treinando. Sobrava
 *   "QUA · Upper A - Costas + O…" — os seis caracteres do prefixo custaram
 *   exatamente a parte que diz o que você vai treinar.
 * - **Card do histórico**: a data completa (`31/07/26 • 07:36`) aparece na linha
 *   de baixo. O dia da semana é dito duas vezes, e a segunda come o título.
 *
 * A correção é remover o redundante, não espremer a fonte nem quebrar em duas
 * linhas: o texto que sobra é mais curto E diz mais.
 *
 * ⚠️ **Não use na lista de treinos.** Lá o prefixo é a informação principal.
 */

/** Dias como o app os escreve. `SÁB` com e sem acento — os dois existem na base. */
const DIA = /^(SEG|TER|QUA|QUI|SEX|S[ÁA]B|DOM)\s*[·•\-–—:]\s*/i

/**
 * Remove o prefixo de dia quando existe. Devolve o título original se não houver
 * prefixo, ou se o prefixo for tudo o que há — um card chamado só "QUA" precisa
 * continuar dizendo "QUA", senão vira um cartão sem nome.
 */
export function stripDayPrefix(title: unknown): string {
  const t = String(title ?? '').trim()
  if (!t) return ''
  const semDia = t.replace(DIA, '').trim()
  return semDia ? semDia : t
}

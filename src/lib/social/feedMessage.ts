/**
 * A mensagem do feed sem o nome que já está no título do card.
 *
 * O servidor monta `${nome} bateu PR: …` e `${nome} terminou: …` porque a MESMA
 * string vai para o push notification, onde o nome é a informação inteira —
 * "Diogo bateu PR" fora do app não faz sentido sem o "Diogo".
 *
 * Dentro do feed, o card já mostra o nome no título. O resultado era cada linha
 * dizendo o nome duas vezes ("Diogo Andreiko" / "Diogo Andreiko bateu PR: …"),
 * comendo metade da largura útil num lugar onde o que interessa é O QUE
 * aconteceu — visto no aparelho do dono em 13/08/2026.
 *
 * Tirar o nome na origem quebraria o push. A remoção é de EXIBIÇÃO, e só
 * acontece quando o texto realmente começa com aquele nome: mensagem que não
 * casa passa intacta, porque um recorte cego cortaria a primeira palavra de
 * qualquer frase futura.
 */

/** Remove o prefixo `<nome>` da mensagem quando ele duplica o título do card. */
export function feedMessageSemNome(message: unknown, nome: unknown): string {
  const texto = String(message ?? '').trim()
  const quem = String(nome ?? '').trim()
  if (!texto || !quem || !texto.startsWith(quem)) return texto

  let resto = texto.slice(quem.length).trimStart()
  if (!resto) return texto // a mensagem era só o nome — devolve como veio

  // Maiúscula na primeira letra: "bateu PR: …" → "Bateu PR: …"
  return resto.charAt(0).toUpperCase() + resto.slice(1)
}

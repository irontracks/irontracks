/**
 * Nome de usuário como ele pode aparecer PARA OUTRAS PESSOAS.
 *
 * 9 dos 58 perfis (16%) têm o e-mail salvo em `display_name` — provavelmente do
 * cadastro sem nome informado. A lista de Conversas exibia isso cru, então o
 * endereço completo de gente real aparecia na tela de terceiros:
 * "byte-code.assistencia@hotmail.com" como título da linha (visto no aparelho
 * em 13/08/2026).
 *
 * Três problemas de uma vez: expõe endereço alheio, é feio como título, e
 * trunca no meio do domínio sem dizer nada de útil.
 *
 * A correção é de EXIBIÇÃO, não de dado: o handle (parte antes do @) continua
 * identificando a pessoa para quem a conhece, sem publicar onde escrever para
 * ela. Nada de migration — o `display_name` no banco fica como está, porque o
 * dono da conta ainda pode querer editá-lo.
 */

/** Devolve o nome exibível; se for um e-mail, só o handle. */
export function publicDisplayName(nome: unknown, fallback = 'Usuário'): string {
  const bruto = String(nome ?? '').trim()
  if (!bruto) return fallback
  const arroba = bruto.indexOf('@')
  // `@` no começo é handle de rede social ("@fulano"), não e-mail — preserva.
  if (arroba > 0 && bruto.includes('.', arroba)) {
    const handle = bruto.slice(0, arroba).trim()
    return handle || fallback
  }
  return bruto
}

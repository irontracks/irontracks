/**
 * Extrai o claim "email" do identityToken (JWT) da Apple SEM verificar assinatura.
 *
 * Motivo: a Apple só popula `response.email` no objeto da PRIMEIRA autorização do
 * Sign in with Apple; em logins repetidos esse campo vem vazio. O identityToken
 * (JWT), porém, SEMPRE carrega o claim "email". Usamos isto apenas para
 * pré-cadastrar/whitelistar o aluno antes do `signInWithIdToken` — o Supabase
 * ainda valida a assinatura do JWT no login real, então extrair o email aqui não
 * concede acesso; só garante a linha de whitelist. Sem isto, o re-login com Apple
 * barra no trigger `enforce_invite_whitelist` (causa da rejeição Apple 2.1a).
 *
 * É tolerante a falhas: qualquer token malformado retorna string vazia.
 */
const decodeBase64 = (b64: string): string => {
  if (typeof atob === 'function') return atob(b64)
  const g = globalThis as { Buffer?: { from(s: string, enc: string): { toString(enc: string): string } } }
  if (g.Buffer) return g.Buffer.from(b64, 'base64').toString('binary')
  return ''
}

export function decodeAppleEmailFromToken(token: string): string {
  try {
    const part = String(token || '').split('.')[1]
    if (!part) return ''
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')
    const json = decodeBase64(b64)
    if (!json) return ''
    const payload = JSON.parse(json) as { email?: unknown }
    return String(payload?.email || '').trim().toLowerCase()
  } catch {
    return ''
  }
}

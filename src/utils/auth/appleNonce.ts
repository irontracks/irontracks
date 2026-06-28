/**
 * SHA-256 (hex) via Web Crypto — usado no Sign in with Apple NATIVO para o nonce
 * anti-replay.
 *
 * Padrão correto (Supabase + Apple):
 *   1. Gera um nonce CRU aleatório.
 *   2. Envia SHA256(cru) para ASAuthorizationAppleIDRequest.nonce (a Apple grava
 *      esse hash no claim `nonce` do id_token).
 *   3. Passa o nonce CRU para supabase.auth.signInWithIdToken({ nonce }) — o
 *      Supabase hasheia e compara com o claim do JWT.
 *
 * Passar o MESMO valor para os dois (sem hashear para a Apple) causa o
 * "Nonces mismatch" persistente — foi por isso que o nonce tinha sido desabilitado.
 * Auditoria de segurança 2026-06-27 (L6).
 */
export async function sha256Hex(input: string): Promise<string> {
  const subtle = (typeof crypto !== 'undefined' && crypto.subtle) ? crypto.subtle : null
  if (!subtle) throw new Error('crypto.subtle indisponível (contexto inseguro)')
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

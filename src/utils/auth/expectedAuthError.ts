/**
 * isExpectedAuthError — distingue erros de autenticação ESPERADOS (causados pelo
 * usuário/fluxo normal) de falhas reais de aplicação.
 *
 * Motivação: condições como "código OTP expirado" (`otp_expired`), senha errada ou
 * rate limit são eventos do dia a dia — não são bugs. Logá-los como `logError` polui
 * o Sentry com ruído (issues que não exigem ação). O chamador usa isto para decidir
 * entre `logWarn` (só console, esperado) e `logError` (Sentry, inesperado). A mensagem
 * amigável ao usuário é independente disto e continua sendo exibida normalmente.
 *
 * Reconhece tanto o `code` do AuthError do Supabase quanto a mensagem em texto.
 */

/** Códigos de AuthError do Supabase que representam condição esperada, não falha de app. */
const EXPECTED_CODES = new Set<string>([
  'otp_expired',
  'otp_disabled',
  'invalid_credentials',
  'email_not_confirmed',
  'over_email_send_rate_limit',
  'over_request_rate_limit',
  'over_sms_send_rate_limit',
  'user_already_exists',
  'email_exists',
  'weak_password',
  'same_password',
])

export function isExpectedAuthError(err: unknown): boolean {
  const rec = err && typeof err === 'object' ? (err as Record<string, unknown>) : {}
  const code = String(rec.code ?? '').trim().toLowerCase()
  if (code && EXPECTED_CODES.has(code)) return true

  const msg = String((err instanceof Error ? err.message : rec.message ?? err) ?? '').toLowerCase()
  if (!msg) return false

  // OTP/token expirado ou inválido (o caso do primeiro acesso).
  if (msg.includes('otp') && (msg.includes('expired') || msg.includes('invalid'))) return true
  if (msg.includes('token has expired') || msg.includes('token has expired or is invalid')) return true
  if (msg.includes('expired') && (msg.includes('code') || msg.includes('link') || msg.includes('token'))) return true
  // Credenciais/senha (erro do usuário).
  if (msg.includes('invalid login') || msg.includes('invalid credentials')) return true
  if (msg.includes('weak password') || msg.includes('same_password')) return true
  // Conta já existente e confirmação de e-mail.
  if (msg.includes('already registered') || msg.includes('user already exists')) return true
  if (msg.includes('email not confirmed')) return true
  // Rate limit (usuário insistindo) — esperado, não é falha de app.
  if (msg.includes('rate limit') || msg.includes('rate_limit') || msg.includes('too many request')) return true

  return false
}

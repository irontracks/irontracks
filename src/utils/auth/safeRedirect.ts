/**
 * Validation helper for `next` / redirect-after-login parameters.
 *
 * The previous pattern (`raw.startsWith('/')`) was insufficient because
 * protocol-relative URLs ("//evil.com") also start with "/" and the browser
 * resolves them to an external host. That allowed an open-redirect:
 *
 *     /auth/callback?code=...&next=//attacker.com
 *
 * After successful login the user would land on the attacker's site with a
 * fresh session cookie set on our domain — perfect for phishing.
 *
 * `sanitizeNextParam` rejects:
 *   - empty / non-string input
 *   - values that don't start with "/"
 *   - protocol-relative URLs:  "//evil.com", "/\\evil.com"
 *   - any colon (catches "javascript:", "data:", schemes generally)
 *
 * Returns the original value when safe; otherwise the fallback.
 */
export function sanitizeNextParam(raw: unknown, fallback = '/dashboard'): string {
  const s = typeof raw === 'string' ? raw : ''
  if (!s) return fallback
  if (!s.startsWith('/')) return fallback
  // Protocol-relative bypass: //evil.com or /\evil.com
  if (s.length > 1 && (s[1] === '/' || s[1] === '\\')) return fallback
  // Anything with a colon could be a scheme (javascript:, data:, http:)
  if (s.includes(':')) return fallback
  return s
}

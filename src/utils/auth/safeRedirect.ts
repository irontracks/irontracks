/**
 * Validation helper for `next` / redirect-after-login parameters.
 *
 * Audit Finding #2 (XSS via `next` em /auth/callback): a versão anterior só
 * barrava open-redirect (protocol-relative + scheme com `:`) mas NÃO escapava
 * `"`, `<`, `>`, `'`. Payloads como `/"><img src=x onerror=...>` passavam o
 * sanitizer e eram interpolados em `href="..."` no template HTML do callback,
 * abrindo XSS no contexto do domínio autenticado.
 *
 * AGORA usa allowlist ASCII estrita pra path/query string:
 *   - alfanuméricos (`a-z`, `A-Z`, `0-9`)
 *   - `/`, `-`, `_`, `.`, `~` (path segments)
 *   - `?`, `=`, `&`, `%` (query string)
 *   - `+` (espaço encodado em alguns clients)
 *
 * Slugs com caracteres não-ASCII devem ser passados encoded (`%C3%A7` etc) —
 * forma canônica de URL e única que sobrevive ao sanitizer.
 *
 * Continua rejeitando:
 *   - vazio / não-string
 *   - não começa com `/`
 *   - >512 chars
 *   - protocol-relative (`//evil`, `/\evil`)
 *   - `:` (esquema)
 *   - QUALQUER outro char (`"`, `'`, `<`, `>`, espaço cru, etc)
 */
const NEXT_PARAM_ALLOWED = /^[a-zA-Z0-9/_\-.~?=&%+]+$/

export function sanitizeNextParam(raw: unknown, fallback = '/dashboard'): string {
  const s = typeof raw === 'string' ? raw : ''
  if (!s) return fallback
  if (s.length > 512) return fallback
  if (!s.startsWith('/')) return fallback
  // Protocol-relative bypass: //evil.com or /\evil.com
  if (s.length > 1 && (s[1] === '/' || s[1] === '\\')) return fallback
  // Anything with a colon could be a scheme (javascript:, data:, http:)
  if (s.includes(':')) return fallback
  // Allowlist final — rejeita qualquer char que poderia quebrar atributos HTML
  // ou tags (`"`, `'`, `<`, `>`, etc). Defesa em profundidade vs. XSS.
  if (!NEXT_PARAM_ALLOWED.test(s)) return fallback
  return s
}

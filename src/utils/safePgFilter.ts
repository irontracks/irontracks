/**
 * @module safePgFilter
 *
 * Sanitizes user-supplied values for safe interpolation inside
 * Supabase PostgREST `.or()` filter strings.
 *
 * PostgREST uses `,`, `(`, `)`, `.` and `\\` as operators.
 * If any of these leak into a filter expression, an attacker
 * can inject additional filter clauses.
 *
 * Usage:
 * ```ts
 * import { safePg } from '@/utils/safePgFilter'
 * query.or(`name.ilike.%${safePg(userInput)}%,email.ilike.%${safePg(userInput)}%`)
 * ```
 */

/**
 * Strip all PostgREST operator characters from a value.
 * Returns an empty string when input is falsy.
 */
export function safePg(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/[,()\\\\.%*'"]/g, '')
    .slice(0, 200) // hard cap to prevent DoS via extremely long strings
}

/**
 * Build a safe `ilike` pattern (`%value%`) for use inside `.or()`.
 * Strips dangerous characters and wraps with wildcards.
 */
export function safePgLike(value: unknown): string {
  const clean = safePg(value)
  return clean ? `%${clean}%` : ''
}

/**
 * Escape a value for an EXACT, case-insensitive `.ilike(column, value)` match —
 * e.g. looking a user up by their email.
 *
 * Unlike {@link safePgLike}, this does NOT strip dots/operators (that mangled
 * "user@gmail.com" into "user@gmailcom", so the lookup never matched) and does
 * NOT add `%` wildcards. It only escapes the three LIKE metacharacters (`\`, `%`,
 * `_`), all of which are legal in email local-parts, so the match stays exact.
 * Safe because `.ilike(col, value)` is parameterized by PostgREST — there is no
 * operator-injection surface the way there is inside an interpolated `.or()`.
 */
export function safeEmailLike(value: unknown): string {
  return String(value ?? '').trim().replace(/([\\%_])/g, '\\$1')
}

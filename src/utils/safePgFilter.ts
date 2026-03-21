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

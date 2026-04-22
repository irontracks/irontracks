/**
 * Shared source-of-truth for AI error codes.
 *
 * Extracted into its own file because:
 *   - handleGeminiError.ts imports from next/server (server-only)
 *   - clientErrors.ts must be importable by client components
 *
 * Mixing server-only and client-safe code in the same module causes
 * "Module not found: next/server" on client bundles. Keeping the codes here
 * lets both sides import without a boundary violation.
 */

export type AiErrorCode =
  | 'ai_rate_limited'
  | 'ai_forbidden'
  | 'ai_model_missing'
  | 'ai_invalid_input'
  | 'ai_upstream_error'
  | 'ai_timeout'
  | 'ai_error'

export const AI_ERROR_KNOWN_CODES: ReadonlySet<AiErrorCode> = new Set<AiErrorCode>([
  'ai_rate_limited',
  'ai_forbidden',
  'ai_model_missing',
  'ai_invalid_input',
  'ai_upstream_error',
  'ai_timeout',
  'ai_error',
])

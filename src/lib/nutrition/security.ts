/**
 * Nutrition security helpers.
 * Centralizes input sanitization and validation for the nutrition module.
 */

/**
 * Strip HTML tags, control chars, and excessive whitespace from food names.
 * Prevents XSS if content is ever rendered outside React's auto-escaping.
 */
export function sanitizeFoodName(raw: unknown): string {
  const str = String(raw ?? '').trim()
  if (!str) return ''
  return str
    .replace(/<[^>]*>/g, '')          // strip HTML tags
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // control chars
    .replace(/&(lt|gt|amp|quot|#\d+|#x[\da-f]+);?/gi, '') // HTML entities
    .replace(/\s+/g, ' ')            // collapse whitespace
    .trim()
    .slice(0, 200)                    // hard length cap
}

/**
 * Sanitize free-text user input before sending to AI model.
 * Strips prompt-injection patterns and limits length.
 */
export function sanitizeAiInput(raw: unknown): string {
  let str = String(raw ?? '').trim()
  if (!str) return ''

  // Remove obvious prompt injection patterns
  const injectionPatterns = [
    /ignore\s+(all\s+)?previous\s+(instructions?|prompts?)/gi,
    /forget\s+(all\s+)?previous/gi,
    /you\s+are\s+now\s+a/gi,
    /act\s+as\s+(a|an)?\s/gi,
    /system\s*:\s*/gi,
    /\buser\s*:\s*/gi,
    /\bassistant\s*:\s*/gi,
    /\bhuman\s*:\s*/gi,
    /<\/?(?:script|style|iframe|object|embed|form|input|button|textarea|select)[^>]*>/gi,
  ]

  for (const pattern of injectionPatterns) {
    str = str.replace(pattern, '')
  }

  return str
    .replace(/<[^>]*>/g, '')          // strip any remaining HTML
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500)                    // strict length cap for AI input
}

/**
 * Validate a dateKey string (YYYY-MM-DD format).
 */
export function isValidDateKey(dateKey: unknown): boolean {
  if (typeof dateKey !== 'string') return false
  return /^\d{4}-\d{2}-\d{2}$/.test(dateKey)
}

/**
 * Clamp a numeric value to safe nutrition bounds.
 */
export function clampNutritionValue(value: number, max: number = 10000): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(max, Math.round(n)))
}

/**
 * Escapes HTML special characters to prevent XSS in dynamically built HTML strings.
 * Centralised utility — import from here, do not redeclare locally.
 */
export function escapeHtml(value: unknown): string {
  try {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;')
  } catch {
    return ''
  }
}

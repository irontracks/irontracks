/**
 * Extrai a mensagem de texto de um erro desconhecido de forma type-safe.
 * Substitui o padrão `catch (e: unknown) { getErrorMessage(e) }`.
 *
 * @example
 * catch (e: unknown) {
 *   setError(getErrorMessage(e))
 * }
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (
    error !== null &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message
  }
  return String(error)
}

/**
 * Converte códigos de erro técnicos da API para mensagens amigáveis em português.
 * Use nos componentes antes de exibir erros ao usuário.
 *
 * @example
 * const msg = getFriendlyApiError(json.error) ?? fallback
 * const msg = getFriendlyApiError(json.error, 'Falha ao salvar.')
 */
export function getFriendlyApiError(error: unknown, fallback?: string): string {
  const raw = typeof error === 'string' ? error : getErrorMessage(error)
  const lower = raw.toLowerCase().trim()

  // Rate limiting
  if (
    lower === 'rate_limited' ||
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    lower.includes('429')
  ) {
    return 'Muitas requisições. Aguarde um momento e tente novamente.'
  }

  // Auth / session
  if (
    lower === 'unauthorized' ||
    lower.includes('session expired') ||
    lower.includes('jwt expired') ||
    lower.includes('not authenticated')
  ) {
    return 'Sessão expirada. Faça login novamente.'
  }

  // Forbidden / VIP
  if (
    lower === 'forbidden' ||
    lower.includes('vip_required') ||
    lower.includes('feature_locked') ||
    lower.includes('permission denied')
  ) {
    return 'Acesso restrito. Este recurso requer o plano VIP.'
  }

  // Network / offline
  if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('offline')) {
    return 'Sem conexão. Verifique sua internet e tente novamente.'
  }

  // Timeout
  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('aborted')) {
    return 'A operação demorou muito. Tente novamente.'
  }

  // Server error
  if (lower.includes('internal server error') || lower === '500') {
    return 'Erro no servidor. Tente novamente em alguns instantes.'
  }

  return fallback ?? raw
}

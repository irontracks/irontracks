/**
 * Extrai a mensagem de texto de um erro desconhecido de forma type-safe.
 * Substitui o padrão `catch (e: any) { getErrorMessage(e) }`.
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

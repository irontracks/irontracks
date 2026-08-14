/**
 * src/utils/api/internalError.ts
 *
 * Resposta padrão para EXCEÇÃO inesperada em rota de API — o irmão do
 * respondDbError (dbError.ts) para o catch-all. SEC-05 (auditoria 2026-08-13):
 * 112 rotas devolviam `getErrorMessage(e)` cru no 500 — nome de tabela, erro
 * de SQL e detalhe de provedor chegavam ao cliente e serviam de
 * reconhecimento para atacante.
 *
 * O detalhe vai para o Sentry/log com um requestId; o cliente recebe só
 * `internal_error` + o mesmo requestId — quem reportar um erro dá o id, e o
 * Sentry acha o evento pela tag.
 *
 * Uso (no catch-all da rota):
 *   } catch (e: unknown) {
 *     return respondInternalError('api:workouts:finish', e)
 *   }
 *
 * Erro de VALIDAÇÃO continua específico (parseJsonBody/zod respondem 400 com
 * mensagem enumerada) — isto aqui é só para o inesperado.
 */
import { NextResponse } from 'next/server'
import { logError } from '@/lib/logger'

export function respondInternalError(logKey: string, error: unknown): NextResponse {
  const requestId = crypto.randomUUID()
  logError(logKey, error, { requestId })
  return NextResponse.json(
    { ok: false as const, error: 'internal_error' as const, requestId },
    { status: 500 },
  )
}

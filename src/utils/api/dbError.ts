/**
 * src/utils/api/dbError.ts
 *
 * Resposta padrão para erro de DB/PostgREST nas rotas de API: loga o detalhe
 * server-side (logger/Sentry) e devolve ao cliente uma mensagem genérica e
 * estável — sem vazar nomes de tabela/coluna/constraint nem estado de RLS, que
 * servem de reconhecimento para um atacante (auditoria 2026-06-27, L12).
 *
 * Uso:
 *   if (error) return respondDbError('vip:profile', error)
 */
import { NextResponse } from 'next/server'
import { logError } from '@/lib/logger'

export function respondDbError(logKey: string, error: unknown, status = 400): NextResponse {
  logError(`db:${logKey}`, error)
  return NextResponse.json({ ok: false as const, error: 'database_error' }, { status })
}

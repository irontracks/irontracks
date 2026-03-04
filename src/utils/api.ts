import { NextResponse } from 'next/server'
import { getErrorMessage } from '@/utils/errorMessage'

/**
 * Resposta padrão de erro interno
 */
export const errorResponse = (e: unknown, status = 500) =>
  NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status })

/**
 * Resposta padrão de não autorizado
 */
export const unauthorizedResponse = () =>
  NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

/**
 * Resposta padrão de sucesso
 */
export const successResponse = <T>(data: T, extra?: Record<string, unknown>) =>
  NextResponse.json({ ok: true, data, ...extra })

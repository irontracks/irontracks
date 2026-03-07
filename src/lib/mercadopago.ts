import { getErrorMessage } from '@/utils/errorMessage'
import { parseJsonWithSchema } from '@/utils/zod'
import { z } from 'zod'
type MercadoPagoError = {
  message?: string
  error?: string
  status?: number
  cause?: { description?: string }[]
}

export type MercadoPagoRequestOptions = {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  body?: unknown
  idempotencyKey?: string
}

export async function mercadopagoRequest<T>(options: MercadoPagoRequestOptions): Promise<T> {
  const baseUrl = (process.env.MERCADOPAGO_BASE_URL || 'https://api.mercadopago.com').replace(/\/$/, '')
  const accessToken = (process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim()
  const userAgent = (process.env.MERCADOPAGO_USER_AGENT || 'IronTracks').trim()
  if (!accessToken) {
    throw new Error('mercadopago_access_token_missing')
  }

  const url = `${baseUrl}${options.path.startsWith('/') ? '' : '/'}${options.path}`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': userAgent,
    Authorization: `Bearer ${accessToken}`,
  }
  if (options.method === 'POST') {
    let idempotencyKey = String(options.idempotencyKey || '').trim()
    if (!idempotencyKey) {
      try {
        const cryptoGlobal = globalThis as typeof globalThis & { crypto?: { randomUUID?: () => string } }
        const maybe = cryptoGlobal?.crypto?.randomUUID
        if (typeof maybe === 'function') idempotencyKey = String(maybe()).trim()
      } catch {}
    }
    if (!idempotencyKey) {
      try {
        const mod = await import('crypto') as { randomUUID?: () => string }
        const maybe = mod?.randomUUID
        if (typeof maybe === 'function') idempotencyKey = String(maybe()).trim()
      } catch {}
    }
    if (!idempotencyKey) idempotencyKey = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    headers['X-Idempotency-Key'] = idempotencyKey
  }
  const res = await fetch(url, {
    method: options.method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: 'no-store',
  })

  const text = await res.text()
  let json: unknown = null
  json = text ? parseJsonWithSchema(text, z.unknown()) : null

  if (!res.ok) {
    const err = (json || {}) as MercadoPagoError
    const msg = err?.cause?.[0]?.description || getErrorMessage(err) || err?.error || `mercadopago_http_${res.status}`
    throw new Error(msg)
  }

  return (json as T)
}

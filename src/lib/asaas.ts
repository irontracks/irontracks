import { getErrorMessage } from '@/utils/errorMessage'
import { parseJsonWithSchema } from '@/utils/zod'
import { z } from 'zod'
import { env } from '@/utils/env'
type AsaasError = {
  errors?: { code?: string; description?: string }[]
  message?: string
}

export type AsaasRequestOptions = {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  body?: unknown
}

export async function asaasRequest<T>(options: AsaasRequestOptions): Promise<T> {
  const baseUrl = env.asaas.baseUrl.replace(/\/$/, '')
  const apiKey = env.asaas.apiKey
  const userAgent = (env.asaas.userAgent || 'IronTracks').trim()
  if (!apiKey) {
    throw new Error('asaas_api_key_missing')
  }

  const url = `${baseUrl}${options.path.startsWith('/') ? '' : '/'}${options.path}`
  const res = await fetch(url, {
    method: options.method,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': userAgent,
      'access_token': apiKey,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: 'no-store',
  })

  const text = await res.text()
  let json: unknown = null
  json = text ? parseJsonWithSchema(text, z.unknown()) : null

  if (!res.ok) {
    const err = (json || {}) as AsaasError
    const msg = err?.errors?.[0]?.description || getErrorMessage(err) || `asaas_http_${res.status}`
    throw new Error(msg)
  }

  return (json as T)
}

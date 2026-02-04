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
}

export async function mercadopagoRequest<T>(options: MercadoPagoRequestOptions): Promise<T> {
  const baseUrl = (process.env.MERCADOPAGO_BASE_URL || 'https://api.mercadopago.com').replace(/\/$/, '')
  const accessToken = (process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim()
  const userAgent = (process.env.MERCADOPAGO_USER_AGENT || 'IronTracks').trim()
  if (!accessToken) {
    throw new Error('mercadopago_access_token_missing')
  }

  const url = `${baseUrl}${options.path.startsWith('/') ? '' : '/'}${options.path}`
  const res = await fetch(url, {
    method: options.method,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': userAgent,
      Authorization: `Bearer ${accessToken}`,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: 'no-store',
  })

  const text = await res.text()
  let json: any = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }

  if (!res.ok) {
    const err = (json || {}) as MercadoPagoError
    const msg = err?.cause?.[0]?.description || err?.message || err?.error || `mercadopago_http_${res.status}`
    throw new Error(msg)
  }

  return (json as T)
}


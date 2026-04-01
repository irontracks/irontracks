/**
 * src/lib/api/_fetch.ts
 * Base fetch utility shared by all API client modules.
 * Provides consistent error handling and JSON parsing.
 *
 * # Native platform header
 * When running inside Capacitor (iOS or Android), all API requests include
 * the header `X-Native-Platform: ios|android` so the server can apply the
 * correct cookie settings for native WebView requests.
 */

import { isIosNative, isAndroidNative } from '@/utils/platform'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly endpoint: string,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface ApiResponse<T = unknown> {
  ok: boolean
  data?: T
  error?: string
}

const RETRYABLE_STATUSES = new Set([408, 429, 502, 503, 504])

/**
 * Core fetch wrapper — throws ApiError on non-ok responses.
 * Retries up to 2 times on transient network errors and retryable HTTP statuses.
 */
export async function apiFetch<T>(url: string, init?: RequestInit, _retries = 2): Promise<T> {
  // isIosNative() / isAndroidNative() are guarded with `typeof window === 'undefined'`
  // so they are safe to call on the server — they always return false there.
  const nativeHeaders: Record<string, string> =
    typeof window !== 'undefined' && isIosNative()
      ? { 'X-Native-Platform': 'ios' }
      : typeof window !== 'undefined' && isAndroidNative()
        ? { 'X-Native-Platform': 'android' }
        : {}

  let res: Response
  try {
    res = await fetch(url, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...nativeHeaders, ...(init?.headers ?? {}) },
      ...init,
    })
  } catch (networkErr) {
    if (_retries > 0) {
      await new Promise((r) => setTimeout(r, 800))
      return apiFetch<T>(url, init, _retries - 1)
    }
    throw networkErr
  }

  if (!res.ok) {
    // Retry on transient server errors (rate-limit, gateway, timeout)
    if (RETRYABLE_STATUSES.has(res.status) && _retries > 0) {
      const retryAfter = Number(res.headers.get('Retry-After') || 0)
      const delay = retryAfter > 0 ? retryAfter * 1000 : 800
      await new Promise((r) => setTimeout(r, delay))
      return apiFetch<T>(url, init, _retries - 1)
    }
    let message = `HTTP ${res.status}`
    try {
      const body = await res.json()
      message = body?.error ?? body?.message ?? message
    } catch { /* ignore */ }
    throw new ApiError(res.status, url, message)
  }
  return res.json() as Promise<T>
}

/**
 * GET convenience — adds cache: 'no-store' for data freshness.
 */
export function apiGet<T>(url: string, init?: RequestInit): Promise<T> {
  return apiFetch<T>(url, { ...init, method: 'GET', cache: 'no-store' })
}

/**
 * POST convenience.
 */
export function apiPost<T>(url: string, body?: unknown, init?: RequestInit): Promise<T> {
  return apiFetch<T>(url, {
    ...init,
    method: 'POST',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

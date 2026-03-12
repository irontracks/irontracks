/**
 * src/lib/api/_fetch.ts
 * Base fetch utility shared by all API client modules.
 * Provides consistent error handling and JSON parsing.
 */

// isIosNative is imported lazily (no SSR side-effects)
let _isIosNative: (() => boolean) | null = null
const checkIosNative = (): boolean => {
  if (typeof window === 'undefined') return false
  try {
    if (!_isIosNative) {
      // Dynamic require to avoid SSR import of Capacitor
      _isIosNative = require('@/utils/platform').isIosNative
    }
    return _isIosNative ? _isIosNative() : false
  } catch {
    return false
  }
}

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

/**
 * Core fetch wrapper — throws ApiError on non-ok responses.
 */
export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const nativeHeaders: Record<string, string> = checkIosNative()
    ? { 'X-Native-Platform': 'ios' }
    : {}
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...nativeHeaders, ...(init?.headers ?? {}) },
    ...init,
  })
  if (!res.ok) {
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

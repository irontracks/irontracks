/**
 * src/lib/api/_fetch.ts
 * Base fetch utility shared by all API client modules.
 * Provides consistent error handling and JSON parsing.
 */

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
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
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

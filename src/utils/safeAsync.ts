import { logWarn } from '@/lib/logger'

export type Result<T> = { ok: true; data: T } | { ok: false; error: string }

/**
 * Wraps an async function to safely catch errors and return a Result<T>.
 * Eliminates the need for try/catch in every caller.
 */
export async function safeAsync<T>(
    fn: () => Promise<T>,
    context?: string
): Promise<Result<T>> {
    try {
        const data = await fn()
        return { ok: true, data }
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (context) logWarn(context, msg, e)
        return { ok: false, error: msg }
    }
}

/**
 * Fetch with timeout. Rejects if the request takes longer than `ms`.
 */
export function fetchWithTimeout(
    url: string,
    opts?: RequestInit & { timeoutMs?: number }
): Promise<Response> {
    const { timeoutMs = 15_000, ...fetchOpts } = opts || {}
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    return fetch(url, { ...fetchOpts, signal: controller.signal }).finally(() =>
        clearTimeout(timer)
    )
}

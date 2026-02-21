import type { SupabaseClient } from '@supabase/supabase-js'

const safeJsonParse = (raw: string) => {
  try {
    const s = String(raw || '').trim()
    if (!s) return null
    return JSON.parse(s)
  } catch {
    return null
  }
}

export const getAdminAuthHeaders = async (supabase: SupabaseClient) => {
  try {
    const { data } = await supabase.auth.getSession()
    const token = String(data?.session?.access_token || '').trim()
    if (!token) return {}
    return { Authorization: `Bearer ${token}` }
  } catch {
    return {}
  }
}

export const adminFetchJson = async <T extends { ok?: boolean } = { ok?: boolean }>(
  supabase: SupabaseClient,
  url: string,
  init?: RequestInit,
): Promise<{ ok: false; error: string } | T> => {
  const authHeaders = await getAdminAuthHeaders(supabase)
  const headers = { ...(init?.headers || {}), ...authHeaders } as Record<string, string>
  const res = await fetch(url, { ...(init || {}), headers })
  const text = await res.text().catch(() => '')
  const json = safeJsonParse(text)
  if (json) return json as T
  if (!res.ok) return { ok: false, error: `http_${res.status}` }
  return { ok: false, error: 'invalid_json' }
}

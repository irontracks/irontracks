import { createAdminClient } from '@/utils/supabase/admin'

const HANDLE_RE = /(?<![a-z0-9_])@([a-z][a-z0-9_]{2,19})/gi

/**
 * Parse @handle tokens from a free-form text and resolve them to user_ids
 * via profiles.handle. Returns deduped, lowercase handles + the resolved
 * user_id map. Unresolved handles are silently dropped (no error).
 *
 * The regex uses a negative lookbehind so emails like "user@example.com"
 * don't get parsed as mentions.
 */
export async function extractMentions(text: unknown): Promise<{
  handles: string[]
  userIdsByHandle: Record<string, string>
}> {
  const raw = String(text ?? '')
  if (!raw) return { handles: [], userIdsByHandle: {} }

  const matches = Array.from(raw.matchAll(HANDLE_RE)).map((m) => String(m[1] || '').toLowerCase())
  const handles = Array.from(new Set(matches)).slice(0, 10)
  if (!handles.length) return { handles: [], userIdsByHandle: {} }

  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('profiles')
      .select('id, handle')
      .in('handle', handles)

    const map: Record<string, string> = {}
    for (const row of Array.isArray(data) ? data : []) {
      const h = String((row as { handle?: string | null })?.handle || '').toLowerCase()
      const id = String((row as { id?: string })?.id || '')
      if (h && id) map[h] = id
    }
    return { handles, userIdsByHandle: map }
  } catch {
    return { handles, userIdsByHandle: {} }
  }
}

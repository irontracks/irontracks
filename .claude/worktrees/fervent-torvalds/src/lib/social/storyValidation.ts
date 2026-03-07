
export const isAllowedStoryPath = (userId: string, path: string) => {
  const uid = String(userId || '').trim()
  const p = String(path || '').trim()
  if (!uid || !p) return false
  if (p.includes('..') || p.includes('\\') || p.includes('\0') || p.startsWith('/')) return false
  const parts = p.split('/').filter(Boolean)
  if (parts.length < 3) return false
  if (parts[0] !== uid) return false
  if (parts[1] !== 'stories') return false
  const name = parts.slice(2).join('/')
  if (
    !name.endsWith('.jpg') &&
    !name.endsWith('.jpeg') &&
    !name.endsWith('.png') &&
    !name.endsWith('.mp4') &&
    !name.endsWith('.mov') &&
    !name.endsWith('.webm')
  )
    return false
  return true
}

export const validateStoryPayload = (body: unknown) => {
  const b = body && typeof body === 'object' ? body as Record<string, any> : {}
  const mediaPath = String(b?.mediaPath || b?.media_path || '').trim()
  const caption = b?.caption != null ? String(b.caption).trim() : null
  const meta = b?.meta && typeof b.meta === 'object' ? b.meta : {}

  if (!mediaPath) return { ok: false, error: 'media_path required' }
  
  return { ok: true, data: { mediaPath, caption, meta } }
}

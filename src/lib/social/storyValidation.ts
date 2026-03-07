
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

const CAPTION_MAX_LENGTH = 500
const META_MAX_KEYS = 20
const META_MAX_VALUE_LENGTH = 512

export const validateStoryPayload = (body: unknown) => {
  const b = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const mediaPath = String(b?.mediaPath || b?.media_path || '').trim()

  let caption: string | null = null
  if (b?.caption != null) {
    const raw = String(b.caption).trim()
    if (raw.length > CAPTION_MAX_LENGTH) {
      return { ok: false, error: `caption too long (max ${CAPTION_MAX_LENGTH} chars)` }
    }
    caption = raw || null
  }

  let meta: Record<string, unknown> = {}
  if (b?.meta && typeof b.meta === 'object' && !Array.isArray(b.meta)) {
    const rawMeta = b.meta as Record<string, unknown>
    const keys = Object.keys(rawMeta).slice(0, META_MAX_KEYS)
    for (const key of keys) {
      const val = rawMeta[key]
      if (typeof val === 'string' && val.length > META_MAX_VALUE_LENGTH) {
        meta[key] = val.slice(0, META_MAX_VALUE_LENGTH)
      } else {
        meta[key] = val
      }
    }
  }

  if (!mediaPath) return { ok: false, error: 'media_path required' }

  return { ok: true, data: { mediaPath, caption, meta } }
}

import { logWarn } from '@/lib/logger'

/**
 * Extrai o path de storage a partir de uma URL pública/proxy do Supabase.
 * Fonte única — existia copiado (idêntico) em chat/delete e cron/cleanup-expired,
 * e a exclusão de conta (SEC-03) virou o terceiro consumidor.
 */
export const extractStoragePathFromPublicUrl = (
  bucket: string,
  publicUrl: string,
  logContext = 'storage:public-url-path',
): string | null => {
  const url = String(publicUrl || '').trim()
  if (!url) return null
  try {
    const u = new URL(url)
    const marker = `/storage/v1/object/public/${bucket}/`
    const idx = u.pathname.indexOf(marker)
    if (idx >= 0) {
      const p = u.pathname.slice(idx + marker.length)
      return decodeURIComponent(p).replace(/^\/+/, '')
    }
    const alt = `/${bucket}/`
    const idx2 = u.pathname.indexOf(alt)
    if (idx2 >= 0) {
      const p = u.pathname.slice(idx2 + alt.length)
      return decodeURIComponent(p).replace(/^\/+/, '')
    }
  } catch (e) { logWarn(logContext, 'silenced', e) }
  return null
}

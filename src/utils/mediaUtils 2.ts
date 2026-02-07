export const parseExt = (rawName: string) => {
  const n = String(rawName || '').trim().toLowerCase()
  const i = n.lastIndexOf('.')
  if (i < 0) return ''
  const ext = n.slice(i)
  return ['.jpeg', '.jpg', '.png', '.mp4', '.mov', '.webm'].includes(ext) ? ext : ''
}

export const guessMediaKind = (mime: string, ext: string) => {
  const t = String(mime || '').trim().toLowerCase()
  if (t.startsWith('video/')) return 'video'
  if (t.startsWith('image/')) return 'image'
  if (['.mp4', '.mov', '.webm'].includes(ext)) return 'video'
  if (['.jpg', '.jpeg', '.png'].includes(ext)) return 'image'
  return 'unknown'
}

export const extFromMime = (mime: string) => {
  const t = String(mime || '').trim().toLowerCase()
  if (t === 'image/png') return '.png'
  if (t === 'image/jpeg') return '.jpg'
  if (t === 'video/mp4') return '.mp4'
  if (t === 'video/quicktime') return '.mov'
  if (t === 'video/webm') return '.webm'
  return ''
}

export const mediaKindFromUrl = (mediaUrl: string | null) => {
  const u = String(mediaUrl || '').trim()
  if (!u) return 'unknown'
  let pathname = u
  try {
    pathname = new URL(u).pathname
  } catch {}
  const ext = parseExt(pathname)
  return guessMediaKind('', ext)
}

// Script de validação de lógica de mídia (Standalone)
// Executar com: node scripts/validate-media-logic.js

const parseExt = (rawName) => {
  const n = String(rawName || '').trim().toLowerCase()
  const i = n.lastIndexOf('.')
  if (i < 0) return ''
  const ext = n.slice(i)
  return ['.jpeg', '.jpg', '.png', '.mp4', '.mov', '.webm'].includes(ext) ? ext : ''
}

const guessMediaKind = (mime, ext) => {
  const t = String(mime || '').trim().toLowerCase()
  if (t.startsWith('video/')) return 'video'
  if (t.startsWith('image/')) return 'image'
  if (['.mp4', '.mov', '.webm'].includes(ext)) return 'video'
  if (['.jpg', '.jpeg', '.png'].includes(ext)) return 'image'
  return 'unknown'
}

const extFromMime = (mime) => {
  const t = String(mime || '').trim().toLowerCase()
  if (t === 'image/png') return '.png'
  if (t === 'image/jpeg') return '.jpg'
  if (t === 'video/mp4') return '.mp4'
  if (t === 'video/quicktime') return '.mov'
  if (t === 'video/webm') return '.webm'
  return ''
}

const mediaKindFromUrl = (mediaUrl) => {
  const u = String(mediaUrl || '').trim()
  if (!u) return 'unknown'
  let pathname = u
  try {
    pathname = new URL(u).pathname
  } catch {}
  const ext = parseExt(pathname)
  return guessMediaKind('', ext)
}

// --- Test Runner Simples ---
let passed = 0
let failed = 0

function assert(desc, actual, expected) {
  if (actual === expected) {
    console.log(`✅ ${desc}`)
    passed++
  } else {
    console.error(`❌ ${desc} | Esperado: '${expected}', Recebido: '${actual}'`)
    failed++
  }
}

console.log('--- Iniciando Testes de Lógica de Mídia ---\n')

// parseExt
assert('parseExt mp4', parseExt('video.mp4'), '.mp4')
assert('parseExt case insensitive', parseExt('FOTO.JPG'), '.jpg')
assert('parseExt invalid', parseExt('virus.exe'), '')

// guessMediaKind
assert('guess kind video mime', guessMediaKind('video/mp4', ''), 'video')
assert('guess kind image ext', guessMediaKind('', '.png'), 'image')
assert('guess kind webm', guessMediaKind('', '.webm'), 'video')

// extFromMime
assert('mime to ext mp4', extFromMime('video/mp4'), '.mp4')
assert('mime to ext unknown', extFromMime('foo/bar'), '')

// mediaKindFromUrl
assert('url simple video', mediaKindFromUrl('http://a.com/b.mp4'), 'video')
assert('url signed query params', mediaKindFromUrl('http://a.com/b.mp4?token=123'), 'video')

console.log(`\n--- Resultados: ${passed} Passou, ${failed} Falhou ---`)

if (failed > 0) process.exit(1)

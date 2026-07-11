import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * Guards do fix do chat-media (bucket público → privado + rota de leitura gateada):
 *  - rota /api/chat/media valida path (isSafeStoragePath), confere participação
 *    (canUploadToChatMediaPath) e redireciona pra signed URL de service-role;
 *  - ChatDirectScreen roteia mídia do chat-media por chatMediaSrc (GIF/externo passa direto);
 *  - migration torna o bucket privado.
 */
describe('rota /api/chat/media — signed URL gateada por participação', () => {
  const src = readFileSync('src/app/api/chat/media/route.ts', 'utf8')
  it('valida path, confere participação e assina via service-role', () => {
    expect(src).toMatch(/isSafeStoragePath\(path\)/)
    expect(src).toMatch(/canUploadToChatMediaPath\(auth\.user\.id, safe\.channelId\)/)
    expect(src).toMatch(/createSignedUrl\(safe\.path/)
    expect(src).toMatch(/status: 403/)
  })
})

describe('ChatDirectScreen — roteia mídia do chat-media por chatMediaSrc', () => {
  const src = readFileSync('src/components/ChatDirectScreen.tsx', 'utf8')
  it('helper roteia só /chat-media/ (GIF/externo direto)', () => {
    expect(src).toMatch(/if \(s\.includes\('\/chat-media\/'\)\) return `\/api\/chat\/media\?u=\$\{encodeURIComponent\(s\)\}`/)
  })
  it('imagem e vídeo usam chatMediaSrc', () => {
    expect(src).toMatch(/src=\{chatMediaSrc\(payload\.thumb_url \?\? payload\.media_url\)\}/)
    expect(src).toMatch(/<video src=\{chatMediaSrc\(payload\.media_url\)\}/)
  })
})

describe('migration chat_media_bucket_private', () => {
  const dir = 'supabase/migrations'
  const file = readdirSync(dir).find((f) => f.includes('chat_media_bucket_private'))
  it('torna o bucket chat-media privado', () => {
    const sql = file ? readFileSync(path.join(dir, file), 'utf8') : ''
    expect(sql).toMatch(/update storage\.buckets set public = false where id = 'chat-media'/i)
  })
})

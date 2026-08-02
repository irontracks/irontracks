import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Regression guard — upload de imagem no WebView do Capacitor (Android).
 *
 * Bug: `compressImage` carregava o arquivo via `URL.createObjectURL(file)` e apontava
 * `img.src` pra essa blob: URL. No app nativo (servido do server.url remoto) as blob:
 * URLs NÃO carregam no WebView → `img.onerror` → a compressão rejeitava e o upload de
 * foto de perfil morria com "Erro inesperado. Tente novamente." (mesma causa do preview
 * quebrado). A correção lê o arquivo como data URL (FileReader.readAsDataURL), que carrega
 * em qualquer contexto — mesmo caminho já usado no ProgressPhotos.
 *
 * canvas.toBlob/decode de imagem não roda em jsdom, então travamos a invariante por
 * source-guard em vez de exercitar a função.
 */
describe('compressImage — usa data URL, não blob: URL (WebView do Capacitor)', () => {
  const src = readFileSync('src/utils/chat/media.ts', 'utf8')

  it('lê o arquivo com FileReader.readAsDataURL', () => {
    expect(src).toMatch(/readAsDataURL\s*\(/)
    expect(src).toMatch(/new FileReader\s*\(/)
  })

  it('aponta img.src pra data URL (não pra objeto de URL.createObjectURL)', () => {
    expect(src).toMatch(/img\.src\s*=\s*dataUrl/)
  })

  it('NÃO chama URL.createObjectURL (a regressão que quebrava o WebView)', () => {
    // Forbid the CALL (com paren) — a menção em comentário explicativo é permitida.
    expect(src).not.toMatch(/URL\.createObjectURL\(/)
  })
})

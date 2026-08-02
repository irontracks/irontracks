import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Regression guards — AvatarUploadModal (foto de perfil).
 *
 * Achados corrigidos (bug "Erro inesperado. Tente novamente." no app Android):
 *  1. Erro engolido: o catch do upload era vazio → zero visibilidade no Sentry (viola a
 *     regra do repo). Agora reporta via logError.
 *  2. Compressão fatal: se o canvas/WebView não decodificava a imagem, o upload inteiro
 *     morria. Agora a compressão é best-effort e cai pro arquivo original.
 *  3. Preview via blob: URL (URL.createObjectURL) não carrega no WebView → preview
 *     quebrado. Agora usa data URL (FileReader).
 *  4. Fallback sem normalização: original .heic não renderia. Agora normaliza a entrega
 *     via cloudinaryDeliveryUrl (f_auto/resize).
 *
 * Envolve canvas + Supabase + Cloudinary + input de arquivo — difícil de exercitar de
 * ponta a ponta em jsdom, então travamos por source-guard.
 */
describe('AvatarUploadModal — resiliência do upload de foto de perfil', () => {
  const src = readFileSync('src/components/settings/AvatarUploadModal.tsx', 'utf8')

  it('reporta falhas ao Sentry via logError (catch não é mais vazio)', () => {
    expect(src).toMatch(/import\s*\{[^}]*logError[^}]*\}\s*from\s*'@\/lib\/logger'/)
    expect(src).toMatch(/logError\(\s*'avatarUpload'/)
    // Não pode voltar a existir um catch que só troca a mensagem sem reportar.
    expect(src).not.toMatch(/catch\s*\{\s*setError\('Erro inesperado/)
  })

  it('compressão é best-effort com fallback pro arquivo original', () => {
    // compressImage dentro de try/catch e um flag compressed pra decidir o fallback.
    expect(src).toMatch(/let\s+compressed\s*=\s*false/)
    expect(src).toMatch(/uploadBlob\s*=\s*await\s+compressImage/)
    expect(src).toMatch(/logWarn\(\s*'avatarUpload'/)
    // O upload usa uploadBlob (comprimido OU original), nunca só o comprimido.
    expect(src).toMatch(/form\.append\('file',\s*uploadBlob/)
  })

  it('preview usa data URL (FileReader), nunca blob: URL', () => {
    expect(src).toMatch(/readAsDataURL/)
    // Forbid as CHAMADAS (com paren) — menção em comentário explicativo é permitida.
    expect(src).not.toMatch(/URL\.createObjectURL\(/)
    expect(src).not.toMatch(/URL\.revokeObjectURL\(/)
  })

  it('normaliza a URL de entrega no fallback (HEIC/imagem grande precisa exibir)', () => {
    expect(src).toMatch(/import\s*\{[^}]*cloudinaryDeliveryUrl[^}]*\}\s*from\s*'@\/utils\/storage\/cloudinaryUpload'/)
    expect(src).toMatch(/cloudinaryDeliveryUrl\(\s*rawUrl/)
  })
})

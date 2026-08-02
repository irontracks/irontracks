import { describe, it, expect } from 'vitest'
import { cloudinaryDeliveryUrl, isCloudinaryUrl } from '@/utils/storage/cloudinaryUpload'

/**
 * cloudinaryDeliveryUrl injeta uma transformação de entrega logo após /image/upload/.
 * Usado no fallback do upload de foto de perfil: quando a compressão no cliente falha
 * (HEIC mislabelado, imagem gigante — bug do "Erro inesperado"), enviamos o original e
 * forçamos f_auto/resize aqui pra garantir que a foto exiba (um .heic cru não renderiza
 * no <img> do WebView).
 */
describe('cloudinaryDeliveryUrl', () => {
  const T = 'f_auto,q_auto,w_512,c_limit'

  it('injeta a transformação logo após /image/upload/', () => {
    const src = 'https://res.cloudinary.com/demo/image/upload/v170/irontracks/user-uploads/profile/uid/uuid.heic'
    expect(cloudinaryDeliveryUrl(src, T)).toBe(
      'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_512,c_limit/v170/irontracks/user-uploads/profile/uid/uuid.heic',
    )
  })

  it('funciona sem o segmento de versão (v123)', () => {
    const src = 'https://res.cloudinary.com/demo/image/upload/irontracks/x.jpg'
    expect(cloudinaryDeliveryUrl(src, T)).toBe(
      'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_512,c_limit/irontracks/x.jpg',
    )
  })

  it('não duplica a transformação se já estiver aplicada', () => {
    const already = 'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_512,c_limit/v1/x.jpg'
    expect(cloudinaryDeliveryUrl(already, T)).toBe(already)
  })

  it('resultado continua sendo uma URL do Cloudinary', () => {
    const src = 'https://res.cloudinary.com/demo/image/upload/v1/x.png'
    expect(isCloudinaryUrl(cloudinaryDeliveryUrl(src, T))).toBe(true)
  })

  it('não mexe em URL que não é do Cloudinary', () => {
    const supabase = 'user-uploads/profile/abc.jpg'
    expect(cloudinaryDeliveryUrl(supabase, T)).toBe(supabase)
    const other = 'https://example.com/image/upload/x.jpg'
    expect(cloudinaryDeliveryUrl(other, T)).toBe(other)
  })

  it('não mexe quando falta o marcador /image/upload/ (ex.: video/raw)', () => {
    const video = 'https://res.cloudinary.com/demo/video/upload/v1/x.mp4'
    expect(cloudinaryDeliveryUrl(video, T)).toBe(video)
  })

  it('entradas vazias voltam inalteradas (nunca corrompe)', () => {
    expect(cloudinaryDeliveryUrl('', T)).toBe('')
    const src = 'https://res.cloudinary.com/demo/image/upload/v1/x.jpg'
    expect(cloudinaryDeliveryUrl(src, '')).toBe(src)
  })
})

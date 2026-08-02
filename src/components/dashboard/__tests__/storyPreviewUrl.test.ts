import { describe, it, expect } from 'vitest'
import { storyPreviewUrl } from '../StoriesBar'

/**
 * O próprio story voltou pra fileira STORIES mostrando a PRÉVIA da mídia (não a
 * foto de avatar, que duplicava o avatar do header). Para vídeo, o círculo não
 * pode receber uma URL .mp4 — o next/image não renderiza vídeo. O Cloudinary
 * devolve o primeiro frame trocando a extensão por .jpg; esta função garante isso.
 */
describe('storyPreviewUrl', () => {
  const base = 'https://res.cloudinary.com/dydthx6oq/video/upload/v1/irontracks/story/x/abc'

  it('imagem: usa a própria URL', () => {
    const url = 'https://res.cloudinary.com/dydthx6oq/image/upload/v1/x/abc.jpg'
    expect(storyPreviewUrl({ mediaUrl: url, mediaKind: 'image' })).toBe(url)
  })

  it('vídeo .mp4: troca a extensão por .jpg (primeiro frame do Cloudinary)', () => {
    expect(storyPreviewUrl({ mediaUrl: `${base}.mp4`, mediaKind: 'video' })).toBe(`${base}.jpg`)
  })

  it('vídeo .mov/.webm/.m4v: também vira .jpg', () => {
    expect(storyPreviewUrl({ mediaUrl: `${base}.mov`, mediaKind: 'video' })).toBe(`${base}.jpg`)
    expect(storyPreviewUrl({ mediaUrl: `${base}.webm`, mediaKind: 'video' })).toBe(`${base}.jpg`)
    expect(storyPreviewUrl({ mediaUrl: `${base}.m4v`, mediaKind: 'video' })).toBe(`${base}.jpg`)
  })

  it('vídeo com querystring: preserva nada além do frame .jpg', () => {
    expect(storyPreviewUrl({ mediaUrl: `${base}.mp4?v=2`, mediaKind: 'video' })).toBe(`${base}.jpg`)
  })

  it('sem mídia: null (cai no fallback do avatar/iniciais)', () => {
    expect(storyPreviewUrl(null)).toBeNull()
    expect(storyPreviewUrl({ mediaUrl: null })).toBeNull()
    expect(storyPreviewUrl(undefined)).toBeNull()
  })

  it('mediaKind ausente é tratado como imagem (não mexe na URL)', () => {
    const url = `${base}.jpg`
    expect(storyPreviewUrl({ mediaUrl: url })).toBe(url)
  })
})

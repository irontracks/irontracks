import { describe, it, expect } from 'vitest'
import { isAllowedStoryPath, validateStoryPayload } from '@/lib/social/storyValidation'

// ────────────────────────────────────────────────────────────────────────────
// storyValidation — testes unitários
// ────────────────────────────────────────────────────────────────────────────

const USER_ID = 'user-uuid-abc123'

describe('isAllowedStoryPath', () => {
  describe('paths válidos', () => {
    it('aceita path no formato correto {userId}/stories/arquivo.jpg', () => {
      expect(isAllowedStoryPath(USER_ID, `${USER_ID}/stories/photo.jpg`)).toBe(true)
    })

    it('aceita extensão .jpeg', () => {
      expect(isAllowedStoryPath(USER_ID, `${USER_ID}/stories/img.jpeg`)).toBe(true)
    })

    it('aceita extensão .png', () => {
      expect(isAllowedStoryPath(USER_ID, `${USER_ID}/stories/img.png`)).toBe(true)
    })

    it('aceita extensão .mp4 (vídeo)', () => {
      expect(isAllowedStoryPath(USER_ID, `${USER_ID}/stories/video.mp4`)).toBe(true)
    })

    it('aceita extensão .mov', () => {
      expect(isAllowedStoryPath(USER_ID, `${USER_ID}/stories/video.mov`)).toBe(true)
    })

    it('aceita extensão .webm', () => {
      expect(isAllowedStoryPath(USER_ID, `${USER_ID}/stories/video.webm`)).toBe(true)
    })

    it('aceita path com subdiretório dentro de stories', () => {
      expect(isAllowedStoryPath(USER_ID, `${USER_ID}/stories/2024-01/photo.jpg`)).toBe(true)
    })
  })

  describe('path traversal — deve ser bloqueado', () => {
    it('bloqueia ".." no path', () => {
      expect(isAllowedStoryPath(USER_ID, `${USER_ID}/stories/../secret.jpg`)).toBe(false)
    })

    it('bloqueia backslash no path', () => {
      expect(isAllowedStoryPath(USER_ID, `${USER_ID}/stories\\photo.jpg`)).toBe(false)
    })

    it('bloqueia null byte no path', () => {
      expect(isAllowedStoryPath(USER_ID, `${USER_ID}/stories/photo\0.jpg`)).toBe(false)
    })

    it('bloqueia path que começa com /', () => {
      expect(isAllowedStoryPath(USER_ID, `/etc/passwd`)).toBe(false)
    })
  })

  describe('controle de acesso por userId', () => {
    it('bloqueia path de outro usuário', () => {
      const otherUserId = 'other-user-xyz'
      expect(isAllowedStoryPath(USER_ID, `${otherUserId}/stories/photo.jpg`)).toBe(false)
    })

    it('bloqueia userId vazio', () => {
      expect(isAllowedStoryPath('', `${USER_ID}/stories/photo.jpg`)).toBe(false)
    })
  })

  describe('estrutura do path', () => {
    it('bloqueia path sem segmento "stories"', () => {
      expect(isAllowedStoryPath(USER_ID, `${USER_ID}/uploads/photo.jpg`)).toBe(false)
    })

    it('bloqueia path muito curto (só userId e stories, sem arquivo)', () => {
      expect(isAllowedStoryPath(USER_ID, `${USER_ID}/stories`)).toBe(false)
    })

    it('bloqueia extensão não permitida (.gif)', () => {
      expect(isAllowedStoryPath(USER_ID, `${USER_ID}/stories/anim.gif`)).toBe(false)
    })

    it('bloqueia extensão não permitida (.exe)', () => {
      expect(isAllowedStoryPath(USER_ID, `${USER_ID}/stories/malware.exe`)).toBe(false)
    })

    it('bloqueia path sem extensão', () => {
      expect(isAllowedStoryPath(USER_ID, `${USER_ID}/stories/noext`)).toBe(false)
    })
  })
})

describe('validateStoryPayload', () => {
  describe('payload válido', () => {
    it('retorna ok=true com mediaPath e dados corretos', () => {
      const result = validateStoryPayload({
        mediaPath: `${USER_ID}/stories/photo.jpg`,
        caption: 'Treino incrível!',
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.mediaPath).toBe(`${USER_ID}/stories/photo.jpg`)
        expect(result.data.caption).toBe('Treino incrível!')
      }
    })

    it('aceita payload sem caption (opcional)', () => {
      const result = validateStoryPayload({ mediaPath: `${USER_ID}/stories/video.mp4` })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.caption).toBeNull()
      }
    })

    it('aceita media_path (snake_case alternativo)', () => {
      const result = validateStoryPayload({ media_path: `${USER_ID}/stories/img.png` })
      expect(result.ok).toBe(true)
    })
  })

  describe('validação de caption', () => {
    it('bloqueia caption maior que 500 caracteres', () => {
      const longCaption = 'a'.repeat(501)
      const result = validateStoryPayload({
        mediaPath: `${USER_ID}/stories/photo.jpg`,
        caption: longCaption,
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain('caption too long')
      }
    })

    it('aceita caption exatamente de 500 caracteres', () => {
      const maxCaption = 'a'.repeat(500)
      const result = validateStoryPayload({
        mediaPath: `${USER_ID}/stories/photo.jpg`,
        caption: maxCaption,
      })
      expect(result.ok).toBe(true)
    })
  })

  describe('validação de media_path obrigatório', () => {
    it('retorna erro quando sem mediaPath', () => {
      const result = validateStoryPayload({ caption: 'Sem mídia' })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain('media_path required')
      }
    })

    it('retorna erro para payload vazio', () => {
      const result = validateStoryPayload({})
      expect(result.ok).toBe(false)
    })

    it('retorna erro para payload null', () => {
      const result = validateStoryPayload(null)
      expect(result.ok).toBe(false)
    })
  })

  describe('sanitização do meta', () => {
    it('limita values do meta a 512 caracteres', () => {
      const longValue = 'x'.repeat(600)
      const result = validateStoryPayload({
        mediaPath: `${USER_ID}/stories/photo.jpg`,
        meta: { tag: longValue },
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(String(result.data.meta.tag).length).toBe(512)
      }
    })

    it('limita meta a 20 chaves (trunca extras)', () => {
      const bigMeta: Record<string, string> = {}
      for (let i = 0; i < 25; i++) bigMeta[`key${i}`] = `val${i}`
      const result = validateStoryPayload({
        mediaPath: `${USER_ID}/stories/photo.jpg`,
        meta: bigMeta,
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(Object.keys(result.data.meta).length).toBeLessThanOrEqual(20)
      }
    })
  })
})

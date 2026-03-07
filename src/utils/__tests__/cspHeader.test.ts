import { describe, it, expect } from 'vitest'

// ────────────────────────────────────────────────────────────────────────────
// Lógica pura extraída de src/utils/security/headers.ts
// Copiada aqui para teste isolado (sem importar next/server)
// ────────────────────────────────────────────────────────────────────────────
const buildCspHeader = (nonce: string, isDev: boolean): string => {
  const scriptSrc = isDev
    ? `'self' 'nonce-${nonce}' 'unsafe-inline' 'unsafe-eval'`
    : `'self' 'nonce-${nonce}'`
  const styleSrc = `'self' 'unsafe-inline' https://fonts.googleapis.com`

  return [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src ${styleSrc}`,
    `style-src-attr 'unsafe-inline'`,
    `font-src 'self' https://fonts.gstatic.com data:`,
    `img-src 'self' data: blob: https://*.googleusercontent.com https://*.supabase.co https://*.supabase.in https://i.ytimg.com https://img.youtube.com`,
    `media-src 'self' blob: https://*.supabase.co https://*.supabase.in`,
    `connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co https://generativelanguage.googleapis.com https://api.mercadopago.com https://www.googleapis.com`,
    `frame-src 'none'`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `worker-src 'self' blob:`,
  ].join('; ')
}

// ────────────────────────────────────────────────────────────────────────────

describe('buildCspHeader', () => {
  const NONCE = 'abc123secure'

  describe('modo produção (isDev=false)', () => {
    it('não contém unsafe-eval em produção', () => {
      const csp = buildCspHeader(NONCE, false)
      expect(csp).not.toContain("'unsafe-eval'")
    })

    it('não contém unsafe-inline no script-src em produção', () => {
      const csp = buildCspHeader(NONCE, false)
      // unsafe-inline pode aparecer em style-src, mas NÃO no script-src
      const scriptSrcPart = csp.split(';').find(p => p.trim().startsWith('script-src')) ?? ''
      expect(scriptSrcPart).not.toContain("'unsafe-inline'")
    })

    it('contém o nonce no script-src', () => {
      const csp = buildCspHeader(NONCE, false)
      expect(csp).toContain(`'nonce-${NONCE}'`)
    })
  })

  describe('modo desenvolvimento (isDev=true)', () => {
    it('contém unsafe-eval em dev', () => {
      const csp = buildCspHeader(NONCE, true)
      expect(csp).toContain("'unsafe-eval'")
    })

    it('contém o nonce no script-src em dev', () => {
      const csp = buildCspHeader(NONCE, true)
      expect(csp).toContain(`'nonce-${NONCE}'`)
    })
  })

  describe('diretivas de segurança obrigatórias', () => {
    it("frame-src é 'none' (sem iframes)", () => {
      const csp = buildCspHeader(NONCE, false)
      const frameSrc = csp.split(';').find(p => p.trim().startsWith('frame-src')) ?? ''
      expect(frameSrc.trim()).toBe("frame-src 'none'")
    })

    it("frame-ancestors é 'none' (anti-clickjacking)", () => {
      const csp = buildCspHeader(NONCE, false)
      const frameAncestors = csp.split(';').find(p => p.trim().startsWith('frame-ancestors')) ?? ''
      expect(frameAncestors.trim()).toBe("frame-ancestors 'none'")
    })

    it("object-src é 'none' (sem plugins)", () => {
      const csp = buildCspHeader(NONCE, false)
      const objSrc = csp.split(';').find(p => p.trim().startsWith('object-src')) ?? ''
      expect(objSrc.trim()).toBe("object-src 'none'")
    })

    it("base-uri é 'self' (anti-base injection)", () => {
      const csp = buildCspHeader(NONCE, false)
      const baseUri = csp.split(';').find(p => p.trim().startsWith('base-uri')) ?? ''
      expect(baseUri.trim()).toBe("base-uri 'self'")
    })

    it('permite Google Fonts no style-src', () => {
      const csp = buildCspHeader(NONCE, false)
      expect(csp).toContain('https://fonts.googleapis.com')
    })

    it('permite Supabase no connect-src', () => {
      const csp = buildCspHeader(NONCE, false)
      expect(csp).toContain('https://*.supabase.co')
    })

    it('retorna string não-vazia', () => {
      const csp = buildCspHeader(NONCE, false)
      expect(csp.length).toBeGreaterThan(100)
    })

    it('nonces diferentes geram CSPs diferentes', () => {
      const csp1 = buildCspHeader('nonce-aaa', false)
      const csp2 = buildCspHeader('nonce-bbb', false)
      expect(csp1).not.toBe(csp2)
    })
  })
})

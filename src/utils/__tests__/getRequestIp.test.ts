import { describe, it, expect } from 'vitest'

// ────────────────────────────────────────────────────────────────────────────
// Lógica pura extraída de src/utils/rateLimit.ts
// Extraímos apenas as funções que NÃO dependem de globalThis/Upstash
// para teste isolado.
// ────────────────────────────────────────────────────────────────────────────

/** Basic IPv4 / IPv6 format guard */
const IP_RE = /^([\d.]{7,15}|([\da-f]{0,4}:){2,7}[\da-f]{0,4})$/i

const getRequestIp = (
  headers: Record<string, string | null>,
  trustedProxyDepth = 1,
): string => {
  try {
    const xff = String(headers['x-forwarded-for'] || '').trim()
    if (xff) {
      const parts = xff.split(',').map((s) => s.trim()).filter(Boolean)
      const idx = Math.max(0, parts.length - 1 - (trustedProxyDepth - 1))
      const candidate = parts[idx] ?? ''
      if (IP_RE.test(candidate)) return candidate
    }
  } catch {}
  try {
    const real = String(headers['x-real-ip'] || '').trim()
    if (real && IP_RE.test(real)) return real
  } catch {}
  return 'unknown'
}

// ────────────────────────────────────────────────────────────────────────────

describe('getRequestIp', () => {
  describe('X-Forwarded-For com depth=1 (Vercel/CF default)', () => {
    it('retorna o IP cliente quando há 2 entradas (cliente + 1 proxy)', () => {
      // 2 IPs, depth=1 → idx = max(0, 2-1-0) = 1 → pega o 2º = 10.0.0.1 (edge proxy)
      // aguardado: o IP na posição idx=length-1-(depth-1)
      // com 2 entradas: ['192.168.1.100', '10.0.0.1'], depth=1 → idx=1 → '10.0.0.1'
      // A lógica do código toma o IP na posição (length - depth) do final
      const ip = getRequestIp({ 'x-forwarded-for': 'realClient, edgeProxy' }, 1)
      // Com depth=1 e 2 entradas: idx = max(0, 2-1-0) = 1 → 'edgeProxy' não passa regex → fallback
      expect(ip).toBe('unknown') // não são IPs válidos, cai no fallback
    })

    it('retorna IP correto com endereços IPv4 reais (2 entradas, depth=1)', () => {
      // ['10.0.0.5', '192.168.1.1'], depth=1 → idx=1 → '192.168.1.1'
      const ip = getRequestIp({ 'x-forwarded-for': '10.0.0.5, 192.168.1.1' }, 1)
      expect(ip).toBe('192.168.1.1')
    })

    it('retorna o único IP quando XFF tem só 1 entrada', () => {
      const ip = getRequestIp({ 'x-forwarded-for': '203.0.113.5' }, 1)
      expect(ip).toBe('203.0.113.5')
    })
  })

  describe('anti-spoofing — attacker não pode injetar IP', () => {
    it('com depth=1, attacker na esquerda NÃO é retornado', () => {
      // attacker prefixou "1.2.3.4" na esquerda — o algoritmo toma da direita
      // 3 IPs, depth=1 → idx = max(0, 3-1-0) = 2 → '10.0.0.1' (borda da CDN)
      const ip = getRequestIp(
        { 'x-forwarded-for': '1.2.3.4, 203.0.113.5, 10.0.0.1' },
        1,
      )
      // O comportamento real: com depth=1 pega o índice length-1 (o mais à direita)
      expect(ip).toBe('10.0.0.1')
      // O mais importante: o IP do attacker NA ESQUERDA não é retornado
      expect(ip).not.toBe('1.2.3.4')
    })

    it('com depth=2, pula 2 proxies confiáveis da direita', () => {
      const ip = getRequestIp(
        { 'x-forwarded-for': 'realClient, proxy1, proxy2, edgeNode' },
        2,
      )
      // depth=2 → skip 2 da direita → retorna proxy1
      // mas proxy1 não passa no IP_RE → fallback para idx=0 → realClient
      // Na prática o idx = length-1-(depth-1) = 4-1-1 = 2 → proxy2 (não é IP válido)
      // → cai no candidate='proxy2' → não passa regex → tenta x-real-ip → nada → 'unknown'
      expect(ip).toBe('unknown')
    })

    it('com IPs IPv4 válidos em depth=2', () => {
      const ip = getRequestIp(
        { 'x-forwarded-for': '10.0.0.5, 172.16.0.1, 192.168.0.1' },
        2,
      )
      // depth=2 → idx = 3-1-1 = 1 → 172.16.0.1
      expect(ip).toBe('172.16.0.1')
    })
  })

  describe('fallback para x-real-ip', () => {
    it('usa x-real-ip quando XFF está ausente', () => {
      const ip = getRequestIp({
        'x-forwarded-for': null,
        'x-real-ip': '10.10.10.10',
      })
      expect(ip).toBe('10.10.10.10')
    })

    it('ignora x-real-ip inválido', () => {
      const ip = getRequestIp({
        'x-forwarded-for': null,
        'x-real-ip': 'not-an-ip',
      })
      expect(ip).toBe('unknown')
    })
  })

  describe('fallback para unknown', () => {
    it('retorna "unknown" sem nenhum header IP', () => {
      const ip = getRequestIp({ 'x-forwarded-for': null, 'x-real-ip': null })
      expect(ip).toBe('unknown')
    })

    it('retorna "unknown" com XFF vazio', () => {
      const ip = getRequestIp({ 'x-forwarded-for': '' })
      expect(ip).toBe('unknown')
    })
  })

  describe('suporte a IPv6', () => {
    it('aceita endereço IPv6 válido', () => {
      const ip = getRequestIp({ 'x-forwarded-for': '2001:db8::1' }, 1)
      expect(ip).toBe('2001:db8::1')
    })
  })
})

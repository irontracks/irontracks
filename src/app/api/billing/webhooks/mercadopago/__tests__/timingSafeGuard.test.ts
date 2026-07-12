import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/** Guard: verificação da assinatura do webhook MercadoPago em tempo constante (não ===). */
describe('mercadopago webhook — HMAC compare tempo-constante', () => {
  const src = readFileSync('src/app/api/billing/webhooks/mercadopago/route.ts', 'utf8')
  it('usa crypto.timingSafeEqual e não === no compare do HMAC', () => {
    expect(src).toMatch(/crypto\.timingSafeEqual\(a, b\)/)
    expect(src).not.toMatch(/hashed\.toLowerCase\(\) === v1\.toLowerCase\(\)/)
  })
})

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Fase 8 — cartão recorrente do aluno. Guards (source-guards):
 *  - CHECKOUT: exige login; assinatura tem que ser DO aluno (anti-IDOR); só plano recorrente;
 *    external_reference no formato student_plan_recurring; grava preapproval_id + billing_method.
 *  - WEBHOOK: ramos student_plan_recurring em preapproval E payment; idempotente por
 *    provider_payment_id; grava `period` (índice único anti-cobrança-dupla no ciclo).
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

describe('rota student/checkout-recurring (cartão)', () => {
  const src = stripComments(readFileSync('src/app/api/student/checkout-recurring/route.ts', 'utf8'))

  it('exige usuário logado', () => {
    expect(src).toMatch(/auth\.getUser\(\)|getUser\(\)/)
    expect(src).toMatch(/unauthorized/)
  })

  it('assinatura tem que ser DO aluno (anti-IDOR: student_user_id = user.id)', () => {
    expect(src).toMatch(/\.eq\(\s*['"]student_user_id['"]\s*,\s*user\.id\s*\)/)
  })

  it('recusa plano avulso (só recorrente vira preapproval)', () => {
    expect(src).toMatch(/plano_nao_recorrente/)
  })

  it('cria preapproval com external_reference student_plan_recurring', () => {
    expect(src).toMatch(/\/preapproval/)
    expect(src).toMatch(/student_plan_recurring:/)
  })

  it('grava preapproval_id + billing_method=card na assinatura', () => {
    expect(src).toMatch(/preapproval_id:\s*preapprovalId/)
    expect(src).toMatch(/billing_method:\s*['"]card['"]/)
  })
})

describe('webhook — ramos student_plan_recurring', () => {
  const src = stripComments(readFileSync('src/app/api/billing/webhooks/mercadopago/route.ts', 'utf8'))

  it('trata o preapproval do aluno (reflete estado da assinatura)', () => {
    expect(src).toMatch(/student_plan_recurring:/)
    expect(src).toMatch(/from\(\s*['"]student_subscriptions['"]\s*\)/)
  })

  it('trata o payment recorrente e é idempotente por provider_payment_id', () => {
    expect(src).toMatch(/scope === ['"]student_plan_recurring['"]/)
    expect(src).toMatch(/\.eq\(\s*['"]provider_payment_id['"]\s*,\s*dataId\s*\)/)
  })

  it('grava period no charge (rede anti-cobrança-dupla do índice único)', () => {
    expect(src).toMatch(/period,/)
  })

  it('valida o valor pago (assessPaymentAmount) antes de conceder', () => {
    expect(src).toMatch(/assessPaymentAmount\(amountCents/)
  })
})

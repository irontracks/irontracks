import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Regressão (Fase 8): o webhook do MercadoPago lia o subscriptionId do índice ERRADO do
 * external_reference `student_plan:teacher:plan:student:sub` (5 campos → sub = índice 4).
 * O código antigo `const [, , , subscriptionId]` pegava o índice 3 (studentUserId), então a
 * assinatura nunca era ativada (`update ... eq('id', subscriptionId)` não casava linha). Ficou
 * latente porque produção tinha 0 assinaturas de aluno.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

describe('webhook MercadoPago — parse do student_plan', () => {
  const src = stripComments(readFileSync('src/app/api/billing/webhooks/mercadopago/route.ts', 'utf8'))

  it('lê subscriptionId do índice 4 (5º campo) do external_reference', () => {
    expect(src).toMatch(/subscriptionId\s*=\s*externalRef\.split\(':'\)\[4\]/)
  })

  it('NÃO usa mais o destructuring de 3 skips (que pegava o studentUserId)', () => {
    expect(src).not.toMatch(/\[\s*,\s*,\s*,\s*subscriptionId\s*\]\s*=\s*externalRef/)
  })

  it('confirma o formato documentado do external_reference (5 campos)', () => {
    // A verdade da origem é api/student/charge/route.ts:100.
    const charge = readFileSync('src/app/api/student/charge/route.ts', 'utf8')
    expect(charge).toMatch(/student_plan:\$\{sub\.teacher_user_id\}:\$\{plan\.id[^}]*\}:\$\{user\.id\}:\$\{subscription_id\}/)
  })
})

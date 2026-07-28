/**
 * Source-guard de CLASSE: ninguém monta nem lê `external_reference` à mão.
 *
 * A divergência entre o checkout do aluno e o webhook (assinatura lida da
 * posição do aluno) só foi possível porque cada ponta manipulava a string por
 * conta própria. O teste de ida e volta em `externalReference.test.ts` prova que
 * builder e parser concordam; este aqui garante que o código de produção use
 * esse par, em vez de template string e desestruturação posicional.
 *
 * Falhou numa rota nova? Use os helpers de `utils/billing/mercadopagoWebhookRules`.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()

/** Rotas que criam cobrança no MP e precisam montar a referência. */
const CHECKOUT_ROUTES = [
  'src/app/api/app/checkout/route.ts',
  'src/app/api/teachers/checkout/route.ts',
  'src/app/api/student/charge/route.ts',
]

const WEBHOOK_ROUTE = 'src/app/api/billing/webhooks/mercadopago/route.ts'

const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8')

describe('external_reference — quem monta', () => {
  it.each(CHECKOUT_ROUTES)('%s usa o builder compartilhado', (rel) => {
    const src = read(rel)
    expect(src).toContain('@/utils/billing/mercadopagoWebhookRules')
    expect(src).toMatch(/external_reference:\s*build(Vip|TeacherPlan|StudentPlan)Reference/)
  })

  it.each(CHECKOUT_ROUTES)('%s não monta a string por template', (rel) => {
    const src = read(rel)
    // `external_reference: \`algo:${...}\`` é exatamente o padrão que divergiu.
    expect(src).not.toMatch(/external_reference:\s*`[^`]*\$\{/)
  })
})

describe('external_reference — quem lê', () => {
  const src = read(WEBHOOK_ROUTE)

  it('o webhook usa o parser compartilhado', () => {
    expect(src).toContain('parseExternalReference')
  })

  it('o webhook não desestrutura por posição', () => {
    // `const [, , , x] = ref.split(':')` foi a linha do bug: silenciosa,
    // e o número de vírgulas não tem como ser conferido de bate-pronto.
    expect(src).not.toMatch(/const\s*\[[^\]]*\]\s*=\s*\w*[Rr]ef\w*\.split\(/)
  })
})

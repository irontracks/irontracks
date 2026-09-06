import { describe, expect, it, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Segredo de cron gerado DENTRO do banco (06/09/2026).
 *
 * O único valor aceito vivia numa env var da Vercel, então ligar um cron novo
 * dependia de alguém copiar credencial de painel à mão — e o lembrete de
 * refeição ficou dias mudo por isso: o pg_cron rodava, devolvia "0 rows" e
 * nunca chamava a rota, porque o segredo que ele procurava no Vault nunca foi
 * criado.
 *
 * O que este arquivo trava: a env var continua sendo tentada PRIMEIRO; o
 * caminho do banco só aceita o bearer que bate com a linha `cron_secrets`; e
 * qualquer falha NEGA (fail-closed) — a pior regressão possível aqui é uma rota
 * de cron virar pública.
 */
const CRON_SECRET = 'segredo-da-vercel'
const SEGREDO_DO_BANCO = 'a'.repeat(64)

let linhaDoBanco: { secret: string } | null = { secret: SEGREDO_DO_BANCO }
let erroDoBanco: unknown = null
let lancaAoCriarCliente = false
let consultas = 0

vi.mock('@/utils/env', () => ({ env: { security: { get cronSecret() { return CRON_SECRET } } } }))
vi.mock('@/utils/auth/route', () => ({ hasValidInternalSecret: () => false }))
vi.mock('@/utils/supabase/admin', () => ({
  createAdminClient: () => {
    if (lancaAoCriarCliente) throw new Error('sem service role')
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              consultas += 1
              return { data: linhaDoBanco, error: erroDoBanco }
            },
          }),
        }),
      }),
    }
  },
}))

const req = (bearer?: string) =>
  new Request('https://irontracks.com.br/api/cron/meal-reminders', {
    headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
  })

beforeEach(() => {
  linhaDoBanco = { secret: SEGREDO_DO_BANCO }
  erroDoBanco = null
  lancaAoCriarCliente = false
  consultas = 0
})

describe('isCronAuthorizedAsync', () => {
  it('aceita o segredo do BANCO', async () => {
    const { isCronAuthorizedAsync } = await import('../auth')
    expect(await isCronAuthorizedAsync(req(SEGREDO_DO_BANCO))).toBe(true)
  })

  it('aceita o segredo da ENV sem ir ao banco', async () => {
    const { isCronAuthorizedAsync } = await import('../auth')
    expect(await isCronAuthorizedAsync(req(CRON_SECRET))).toBe(true)
    expect(consultas, 'a env var resolve primeiro — nada de round-trip à toa').toBe(0)
  })

  it('recusa bearer errado', async () => {
    const { isCronAuthorizedAsync } = await import('../auth')
    expect(await isCronAuthorizedAsync(req('chute'))).toBe(false)
  })

  it('recusa sem header nenhum — e nem consulta o banco', async () => {
    const { isCronAuthorizedAsync } = await import('../auth')
    expect(await isCronAuthorizedAsync(req())).toBe(false)
    expect(consultas).toBe(0)
  })

  it('recusa bearer vazio', async () => {
    const { isCronAuthorizedAsync } = await import('../auth')
    expect(await isCronAuthorizedAsync(req('   '))).toBe(false)
  })

  it('linha ausente NEGA — sem segredo no banco, ninguém entra por ali', async () => {
    linhaDoBanco = null
    const { isCronAuthorizedAsync } = await import('../auth')
    expect(await isCronAuthorizedAsync(req(SEGREDO_DO_BANCO))).toBe(false)
  })

  it('linha em branco não autoriza ninguém', async () => {
    linhaDoBanco = { secret: '   ' }
    const { isCronAuthorizedAsync } = await import('../auth')
    expect(await isCronAuthorizedAsync(req('qualquer-coisa'))).toBe(false)
    expect(await isCronAuthorizedAsync(req('   '))).toBe(false)
  })

  it('erro de leitura NEGA (fail-closed)', async () => {
    erroDoBanco = { message: 'timeout' }
    const { isCronAuthorizedAsync } = await import('../auth')
    expect(await isCronAuthorizedAsync(req(SEGREDO_DO_BANCO))).toBe(false)
  })

  it('exceção NEGA e não derruba a rota', async () => {
    lancaAoCriarCliente = true
    const { isCronAuthorizedAsync } = await import('../auth')
    let lancou = false
    let ok: boolean | null = null
    try { ok = await isCronAuthorizedAsync(req(SEGREDO_DO_BANCO)) } catch { lancou = true }
    expect(lancou).toBe(false)
    expect(ok).toBe(false)
  })
})

describe('fiação e forma', () => {
  const auth = readFileSync(join(process.cwd(), 'src/utils/cron/auth.ts'), 'utf8')
  const rota = readFileSync(join(process.cwd(), 'src/app/api/cron/meal-reminders/route.ts'), 'utf8')

  it('a comparação é em tempo constante, como no caminho da env', () => {
    const corpo = auth.slice(auth.indexOf('export async function isCronAuthorizedAsync'))
    expect(corpo).toMatch(/safeEqual\(/)
    expect(corpo, 'comparar com === abre timing attack sobre o segredo').not.toMatch(/bearer\s*===\s*expected/)
  })

  it('a rota do lembrete de refeição usa a versão que enxerga o banco', () => {
    expect(rota).toMatch(/await isCronAuthorizedAsync\(req\)/)
    expect(rota, 'a rota precisa AGUARDAR — promise é truthy e passaria sempre').not.toMatch(/if \(!isCronAuthorizedAsync\(/)
  })
})

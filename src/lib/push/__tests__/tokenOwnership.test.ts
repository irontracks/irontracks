import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { decidirDonoDoToken } from '../tokenOwnership'

/**
 * Regra de dono do push token + a fiação nas duas pontas.
 *
 * O caso que motivou (medido em produção, 06/09/2026): o iPhone do dono levou
 * 409 ao registrar sob a conta oficial porque o token já estava gravado sob
 * outra conta DO MESMO APARELHO. Resultado: zero token iOS na conta, nenhum
 * push de tipo nenhum, e ninguém sabia — o app engolia o erro.
 */
const SRC = join(process.cwd(), 'src')
const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const EU = 'aaaaaaaa-0000-0000-0000-000000000001'
const OUTRO = 'bbbbbbbb-0000-0000-0000-000000000002'
const APARELHO = '084FA337-B783-434D-87AE-96600A88B27E'
const OUTRO_APARELHO = '2716DC35-62E6-4629-AC59-07100C94CC4F'

describe('decidirDonoDoToken', () => {
  it('token novo: grava', () => {
    expect(decidirDonoDoToken({ donoAtual: null, novoDono: EU, deviceIdGravado: null, deviceIdRecebido: APARELHO })).toBe('grava')
    expect(decidirDonoDoToken({ donoAtual: '', novoDono: EU, deviceIdGravado: '', deviceIdRecebido: '' })).toBe('grava')
  })

  it('mesmo dono renovando: grava', () => {
    expect(decidirDonoDoToken({ donoAtual: EU, novoDono: EU, deviceIdGravado: APARELHO, deviceIdRecebido: APARELHO })).toBe('grava')
  })

  it('MESMO aparelho, outra conta: reatribui — é troca de conta, não sequestro', () => {
    expect(decidirDonoDoToken({ donoAtual: OUTRO, novoDono: EU, deviceIdGravado: APARELHO, deviceIdRecebido: APARELHO })).toBe('reatribui')
  })

  it('aparelho DIFERENTE: recusa — é o IDOR que o guard existe para barrar', () => {
    expect(decidirDonoDoToken({ donoAtual: OUTRO, novoDono: EU, deviceIdGravado: APARELHO, deviceIdRecebido: OUTRO_APARELHO })).toBe('recusa')
  })

  it('sem prova de aparelho (um dos lados vazio): recusa', () => {
    expect(decidirDonoDoToken({ donoAtual: OUTRO, novoDono: EU, deviceIdGravado: null, deviceIdRecebido: APARELHO })).toBe('recusa')
    expect(decidirDonoDoToken({ donoAtual: OUTRO, novoDono: EU, deviceIdGravado: APARELHO, deviceIdRecebido: '' })).toBe('recusa')
    expect(decidirDonoDoToken({ donoAtual: OUTRO, novoDono: EU, deviceIdGravado: null, deviceIdRecebido: null })).toBe('recusa')
  })

  it('espaço em volta não muda a identidade do aparelho', () => {
    expect(decidirDonoDoToken({ donoAtual: OUTRO, novoDono: EU, deviceIdGravado: ` ${APARELHO} `, deviceIdRecebido: APARELHO })).toBe('reatribui')
  })

  it('sem usuário autenticado: recusa', () => {
    expect(decidirDonoDoToken({ donoAtual: OUTRO, novoDono: '', deviceIdGravado: APARELHO, deviceIdRecebido: APARELHO })).toBe('recusa')
  })
})

describe('fiação — a rota decide por aqui e lê o device_id', () => {
  const rota = semComentarios(readFileSync(join(SRC, 'app/api/push/register/route.ts'), 'utf8'))

  it('a rota chama decidirDonoDoToken e só recusa pelo veredito', () => {
    expect(rota).toMatch(/decidirDonoDoToken\(\{/)
    expect(rota).toMatch(/decisao === 'recusa'[\s\S]{0,160}token_owned_by_another_user/)
  })

  it('o SELECT traz o device_id — sem ele a decisão é sempre recusa', () => {
    expect(rota).toMatch(/\.select\('user_id, device_id'\)/)
  })

  it('reatribuição vira trilha em audit_events', () => {
    expect(rota).toMatch(/push_token_reassigned/)
  })
})

describe('fiação — o app não engole mais a recusa', () => {
  const hook = semComentarios(readFileSync(join(SRC, 'hooks/usePushNotifications.ts'), 'utf8'))

  it('a resposta do register é conferida e o erro vai para o Sentry', () => {
    // `logWarn` some em produção (`if (IS_PROD) return`), e foi por isso que
    // meses de 409 passaram sem sinal nenhum.
    expect(hook).toMatch(/const res = await fetch\('\/api\/push\/register'/)
    expect(hook).toMatch(/if \(res && !res\.ok\)[\s\S]{0,200}logWarnRemote\(/)
  })
})

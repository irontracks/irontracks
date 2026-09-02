/**
 * Guarda de origem (SEC-08, auditoria 2026-08-13) — a matriz inteira.
 *
 * O perigo desta guarda não é deixar passar: é BLOQUEAR o legítimo. Cada
 * caso de 'pass' abaixo é um fluxo real do app que um enforce apressado
 * derrubaria (webhook de pagamento, cron, bearer nativo, o próprio app).
 * Por isso metade do teste é sobre o que ela NÃO pode travar.
 */
import { describe, expect, it, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { evaluateOriginGuard, originGuardEnforced } from '@/utils/security/originGuard'

const base = {
  method: 'POST',
  origin: 'https://irontracks.com.br',
  requestHost: 'irontracks.com.br',
  hasSessionCookie: true,
  hasAuthorizationHeader: false,
}

describe('o que NUNCA pode ser travado', () => {
  it('leitura passa sempre — GET/HEAD/OPTIONS não são alvo de CSRF', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS', 'get']) {
      expect(evaluateOriginGuard({ ...base, method, origin: 'https://atacante.com' }).action).toBe('pass')
    }
  })

  it('sem cookie de sessão passa — webhooks, crons e rotas públicas vivem aqui', () => {
    expect(
      evaluateOriginGuard({ ...base, hasSessionCookie: false, origin: null }).action
    ).toBe('pass')
    expect(
      evaluateOriginGuard({ ...base, hasSessionCookie: false, origin: 'https://qstash.upstash.io' }).action
    ).toBe('pass')
  })

  it('bearer nativo passa — cross-site não anexa header custom sem preflight', () => {
    expect(
      evaluateOriginGuard({ ...base, hasAuthorizationHeader: true, origin: 'https://outro.com' }).action
    ).toBe('pass')
  })

  it('mesma origem passa — o app falando com ele mesmo (web e Capacitor)', () => {
    expect(evaluateOriginGuard(base).action).toBe('pass')
    // Preview da Vercel: host e origin do próprio deploy.
    expect(
      evaluateOriginGuard({
        ...base,
        origin: 'https://app-iron-tracks-git-x.vercel.app',
        requestHost: 'app-iron-tracks-git-x.vercel.app',
      }).action
    ).toBe('pass')
  })
})

describe('o que é reportado', () => {
  it('cookie + POST de outra origem = cross-origin', () => {
    const v = evaluateOriginGuard({ ...base, origin: 'https://atacante.com' })
    expect(v).toEqual({ action: 'mismatch', kind: 'cross-origin', originHost: 'atacante.com' })
  })

  it('www × apex NÃO é a mesma origem — o redirect cuida da navegação, não do fetch', () => {
    const v = evaluateOriginGuard({ ...base, origin: 'https://www.irontracks.com.br' })
    expect(v.action).toBe('mismatch')
  })

  it('Origin ausente ou "null" vira missing-origin — categoria própria, para a janela medir', () => {
    expect(evaluateOriginGuard({ ...base, origin: null })).toEqual({
      action: 'mismatch',
      kind: 'missing-origin',
      originHost: null,
    })
    expect(evaluateOriginGuard({ ...base, origin: 'null' }).action).toBe('mismatch')
  })

  it('Origin ilegível não derruba a avaliação — vira cross-origin com o cru truncado', () => {
    const v = evaluateOriginGuard({ ...base, origin: '::não-é-url::' })
    expect(v.action).toBe('mismatch')
    if (v.action === 'mismatch') expect(v.kind).toBe('cross-origin')
  })
})

describe('enforce é decisão explícita', () => {
  const original = process.env.ORIGIN_GUARD_ENFORCE
  afterEach(() => {
    if (original === undefined) delete process.env.ORIGIN_GUARD_ENFORCE
    else process.env.ORIGIN_GUARD_ENFORCE = original
  })

  it('default é relatar (env ausente/qualquer coisa ≠ true)', () => {
    delete process.env.ORIGIN_GUARD_ENFORCE
    // Polaridade invertida em 01/09/2026: sem a var, BLOQUEIA — o default fica
    // do lado seguro, como no CSP. Antes esta linha esperava `false`.
    expect(originGuardEnforced()).toBe(true)
    process.env.ORIGIN_GUARD_ENFORCE = '1'
    expect(originGuardEnforced()).toBe(true)
    process.env.ORIGIN_GUARD_ENFORCE = 'true'
    expect(originGuardEnforced()).toBe(true)
    process.env.ORIGIN_GUARD_ENFORCE = 'TRUE'
    expect(originGuardEnforced()).toBe(true)
    // Só a string exata `false` (qualquer caixa) é o freio.
    process.env.ORIGIN_GUARD_ENFORCE = 'false'
    expect(originGuardEnforced()).toBe(false)
    process.env.ORIGIN_GUARD_ENFORCE = ' False '
    expect(originGuardEnforced()).toBe(false)
  })
})

describe('fiação no middleware (a guarda existe onde as requisições passam)', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../../middleware.ts'), 'utf8')

  it('o branch de /api/ avalia a guarda e retorna ANTES do updateSession', () => {
    expect(src).toContain('evaluateOriginGuard')
    const apiBranch = src.indexOf("pathname.startsWith('/api/')")
    const updateSession = src.indexOf('await updateSession')
    expect(apiBranch, 'branch de /api/ sumiu do middleware').toBeGreaterThan(-1)
    expect(apiBranch, 'a guarda precisa vir antes do caminho de navegação').toBeLessThan(updateSession)
  })

  it('o matcher cobre /api/ — guarda fora do matcher é guarda que não roda', () => {
    expect(src).toMatch(/'\/api\/:path\*'/)
  })

  it('o bloqueio está atrás do enforce — nunca incondicional', () => {
    const branch = src.slice(src.indexOf("pathname.startsWith('/api/')"), src.indexOf('const nonce'))
    expect(branch).toMatch(/if \(originGuardEnforced\(\)\)/)
    expect(branch, 'o 403 precisa estar DENTRO do if de enforce').toMatch(
      /if \(originGuardEnforced\(\)\) \{\s*\n\s*return NextResponse\.json/
    )
  })
})

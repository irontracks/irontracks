/**
 * Guards da ativação do middleware (11/08/2026).
 *
 * O middleware ficou 6 meses DESLIGADO sem ninguém notar: em 27/02/2026 um
 * commit de deploy renomeou `src/middleware.ts` → `src/proxy.ts`, e em 07/03 ele
 * voltou como `middleware.ts` na RAIZ — lugar onde o Next simplesmente não o
 * carrega quando as rotas vivem em `src/app/`. Sem erro, sem aviso no build.
 * O app rodou todo esse tempo sem renovação de sessão no servidor e sem CSP.
 *
 * O que estes testes travam é justamente o que ninguém viu:
 *   • o ARQUIVO no lugar certo (a falha era invisível em runtime)
 *   • o CSP entrando em modo relatório, não bloqueante
 *   • o destino do relatório existindo de verdade
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextResponse } from 'next/server'
import { applySecurityHeaders, buildCspHeader, cspEnforcedFrom, CSP_REPORT_PATH } from '../headers'

const ROOT = join(__dirname, '..', '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

describe('o middleware está onde o Next o carrega', () => {
  it('vive em src/middleware.ts', () => {
    expect(existsSync(join(ROOT, 'src', 'middleware.ts'))).toBe(true)
  })

  it('NÃO existe cópia na raiz — duas seriam pior que nenhuma', () => {
    expect(existsSync(join(ROOT, 'middleware.ts'))).toBe(false)
  })

  it('exporta middleware e config', () => {
    const src = read('src/middleware.ts')
    expect(src).toMatch(/export async function middleware/)
    expect(src).toMatch(/export const config/)
  })

  it('renova a sessão — é o motivo principal de ele existir', () => {
    expect(read('src/middleware.ts')).toMatch(/updateSession\(request/)
  })

  it('o matcher deixa /api de fora (evita um getUser por chamada de API)', () => {
    expect(read('src/middleware.ts')).toMatch(/\(\?!api\|/)
  })

  // O que roda em toda navegação não pode ter caminho que lance: um throw vira
  // 500 no site inteiro de uma vez — e o app nativo, que carrega o front deste
  // servidor, cairia junto em todos os aparelhos instalados.
  it('a renovação de sessão é melhor-esforço nos DOIS níveis', () => {
    expect(read('src/middleware.ts')).toMatch(/try\s*\{[^}]*updateSession/s)
    expect(read('src/utils/supabase/middleware.ts')).toMatch(/try\s*\{\s*await supabase\.auth\.getUser\(\)\s*\}\s*catch/s)
  })
})

describe('CSP entra relatando, não bloqueando', () => {
  const nonce = 'nonce-de-teste'

  it('sem opção alguma, o header é Report-Only', () => {
    const res = applySecurityHeaders(NextResponse.next(), nonce, false)
    expect(res.headers.get('Content-Security-Policy-Report-Only')).toBeTruthy()
    expect(res.headers.get('Content-Security-Policy')).toBeNull()
  })

  it('enforceCsp:false mantém Report-Only', () => {
    const res = applySecurityHeaders(NextResponse.next(), nonce, false, { enforceCsp: false })
    expect(res.headers.get('Content-Security-Policy-Report-Only')).toBeTruthy()
    expect(res.headers.get('Content-Security-Policy')).toBeNull()
  })

  it('enforceCsp:true bloqueia — e aí é só um header, não dois', () => {
    const res = applySecurityHeaders(NextResponse.next(), nonce, false, { enforceCsp: true })
    expect(res.headers.get('Content-Security-Policy')).toBeTruthy()
    expect(res.headers.get('Content-Security-Policy-Report-Only')).toBeNull()
  })

  /**
   * A polaridade virou em 27/08/2026: BLOQUEIA por padrão, e `CSP_ENFORCE=false`
   * é o freio de emergência (env var, sem deploy).
   *
   * Antes este caso exigia `=== 'true'` no fonte — um source-guard que
   * envelheceu junto com a decisão que descrevia. Agora a regra mora em
   * `cspEnforcedFrom` e é testada por COMPORTAMENTO, com os valores que
   * realmente chegam de uma env var.
   */
  it('bloqueia por padrão — proteger não pode depender de alguém lembrar', () => {
    for (const valor of [undefined, '', '   ', 'true', 'TRUE', 'sim', '1', '0', 'no', 'falso']) {
      expect(cspEnforcedFrom(valor), `CSP_ENFORCE=${JSON.stringify(valor)} deveria BLOQUEAR`).toBe(true)
    }
  })

  it('só a string exata `false` desliga', () => {
    for (const valor of ['false', 'FALSE', ' false ', 'False']) {
      expect(cspEnforcedFrom(valor), `CSP_ENFORCE=${JSON.stringify(valor)} deveria RELATAR`).toBe(false)
    }
  })

  it('o middleware consome a regra, não reimplementa', () => {
    const src = read('src/middleware.ts')
    expect(src).toMatch(/cspEnforcedFrom\(process\.env\.CSP_ENFORCE\)/)
    // Reimplementar aqui faria a polaridade divergir em silêncio no dia da
    // próxima mudança — foi assim que o guard anterior ficou obsoleto.
    expect(src).not.toMatch(/CSP_ENFORCE\s*(\?\?|\|\|)/)
  })

  it('as demais proteções continuam saindo nos dois modos', () => {
    for (const enforce of [false, true]) {
      const res = applySecurityHeaders(NextResponse.next(), nonce, false, { enforceCsp: enforce })
      expect(res.headers.get('X-Frame-Options')).toBe('DENY')
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    }
  })
})

describe('o relatório tem para onde ir', () => {
  it('a política carrega report-uri', () => {
    expect(buildCspHeader('n', false)).toContain(`report-uri ${CSP_REPORT_PATH}`)
  })

  it('o caminho apontado existe como rota de verdade', () => {
    const rel = join('src', 'app', CSP_REPORT_PATH.replace(/^\//, ''), 'route.ts')
    expect(existsSync(join(ROOT, rel))).toBe(true)
    expect(read(rel)).toMatch(/export async function POST/)
  })

  it('a rota tem teto de volume — relatório de CSP vira enxurrada', () => {
    expect(read(join('src', 'app', CSP_REPORT_PATH.replace(/^\//, ''), 'route.ts')))
      .toMatch(/MAX_REPORTS_PER_INSTANCE/)
  })

  // O Sentry sozinho não responde a pergunta de quem decide: o token não existe
  // neste repo, então a pista fica ilegível justamente de onde se investiga.
  // Mesma lição que gerou `api/diag/live-activity` em ago/2026.
  it('grava também em audit_events, que é consultável por SQL', () => {
    const src = read(join('src', 'app', CSP_REPORT_PATH.replace(/^\//, ''), 'route.ts'))
    expect(src).toMatch(/from\('audit_events'\)\.insert/)
    expect(src).toMatch(/action: 'csp_violation'/)
    expect(src).toMatch(/createAdminClient/)
  })

  // Rota pública que ESCREVE no banco: o navegador posta sem sessão, então não
  // dá para exigir auth — os freios têm que ser outros.
  it('a rota pública tem rate limit, dedupe e teto de linhas', () => {
    const src = read(join('src', 'app', CSP_REPORT_PATH.replace(/^\//, ''), 'route.ts'))
    expect(src).toMatch(/checkRateLimitAsync/)
    expect(src).toMatch(/seen\.has\(key\)/)
    expect(src).toMatch(/MAX_AUDIT_ROWS_PER_INSTANCE/)
  })
})

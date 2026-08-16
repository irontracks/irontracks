/**
 * Guard da fiação do E2E público no CI (sugestão que saiu do teste manual de
 * 15/08/2026: "os 3 bugs passaram por 5.476 testes verdes — falta teste que
 * ANDE pelo app").
 *
 * O ganho só existe enquanto o job estiver de fato ligado e apontando para os
 * specs que foram MEDIDOS como estáveis (29 testes, 2 rodadas, 100% verdes).
 * Um `ci.yml` editado sem querer devolve o repo ao estado anterior em silêncio
 * — e ninguém percebe, porque o CI continua verde sem rodar nada disso.
 *
 * Também trava as duas exclusões conscientes:
 *  - `authenticated-*`: exige segredos do repositório (decisão do dono).
 *  - `visual-regression`: comparação de screenshot entre máquinas é flake por
 *    construção, e CI flaky é pior que CI sem cobertura.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const ci = readFileSync('.github/workflows/ci.yml', 'utf8')
const pw = readFileSync('playwright.config.ts', 'utf8')

describe('CI — E2E de navegador nas páginas públicas', () => {
  it('o job instala o chromium do Playwright', () => {
    expect(ci).toMatch(/playwright install --with-deps chromium/)
  })

  it('roda os três specs medidos como estáveis', () => {
    const step = ci.slice(ci.indexOf('E2E — public pages'))
    expect(step).toMatch(/e2e\/pages-smoke\.spec\.ts/)
    expect(step).toMatch(/e2e\/pages-smoke-protected\.spec\.ts/)
    expect(step).toMatch(/e2e\/accessibility\.spec\.ts/)
  })

  it('NÃO arrasta os specs autenticados nem o visual-regression', () => {
    const step = ci.slice(ci.indexOf('E2E — public pages'))
    const cmd = step.split('\n').find((l) => l.includes('npx playwright test')) ?? ''
    expect(cmd).not.toMatch(/authenticated-/)
    expect(cmd).not.toMatch(/visual-regression/)
  })

  it('o servidor sobe no CI a partir do build (senão o job fala com localhost vazio)', () => {
    expect(ci).toMatch(/PLAYWRIGHT_CI_SERVER:\s*"1"/)
    expect(pw).toMatch(/PLAYWRIGHT_CI_SERVER === '1'/)
    expect(pw).toMatch(/command:\s*`npm run start[^`]*`/)
  })

  it('o E2E vem DEPOIS do build (reaproveita o .next em vez de buildar de novo)', () => {
    expect(ci.indexOf('Verify Build')).toBeLessThan(ci.indexOf('E2E — public pages'))
  })
})

/**
 * O E2E LOGADO é a camada que os 3 bugs de 15/08/2026 atravessaram: 5.4k
 * testes verdes e nenhum ANDANDO pelo app. Estes casos travam que o job existe,
 * roda o spec de jornada e é PULADO (não quebrado) quando faltar configuração —
 * um job vermelho por falta de secret ensina a equipe a ignorar o vermelho.
 */
describe('CI — E2E da jornada logada', () => {
  const step = ci.slice(ci.indexOf('E2E — jornada logada'))

  it('nenhum `if:` de step usa o contexto secrets (derruba o workflow inteiro)', () => {
    const ifsDeStep = ci.split('\n').filter((l) => l.trim().startsWith('if:'))
    for (const linha of ifsDeStep) expect(linha).not.toMatch(/secrets\./)
  })

  it('roda o spec de jornada', () => {
    expect(ci).toContain('E2E — jornada logada')
    expect(step).toMatch(/e2e\/authenticated-workout-journey\.spec\.ts/)
    expect(step).toMatch(/--project=authenticated/)
  })

  it('é PULADO sem as credenciais e sem as chaves públicas do Supabase', () => {
    // Sem as chaves, o build sai com placeholder e o app não conecta: o job
    // ficaria vermelho por configuração, não por regressão.
    // O gate lê env do JOB (o contexto `secrets` não existe em `if:` de step —
    // usá-lo ali derruba o workflow inteiro antes de rodar; aconteceu no run
    // 31918472665).
    expect(step).toMatch(/if:\s*env\.TEM_E2E_LOGIN\s*==\s*'true'/)
    expect(step).toMatch(/env\.TEM_SUPABASE_PUBLICO\s*==\s*'true'/)
    expect(ci).toMatch(/TEM_SUPABASE_PUBLICO:\s*\$\{\{\s*secrets\.NEXT_PUBLIC_SUPABASE_URL/)
  })

  it('o build usa as chaves reais quando existirem (senão o E2E logado é inútil)', () => {
    expect(ci).toMatch(/NEXT_PUBLIC_SUPABASE_URL:\s*\$\{\{\s*secrets\.NEXT_PUBLIC_SUPABASE_URL\s*\|\|/)
  })
})

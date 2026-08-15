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
    expect(pw).toMatch(/command:\s*'npm run start'/)
  })

  it('o E2E vem DEPOIS do build (reaproveita o .next em vez de buildar de novo)', () => {
    expect(ci.indexOf('Verify Build')).toBeLessThan(ci.indexOf('E2E — public pages'))
  })
})

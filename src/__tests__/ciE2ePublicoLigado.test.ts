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
describe('CI — E2E da jornada logada (contra o preview da Vercel)', () => {
  /**
   * Recorta APENAS o step do E2E logado (até o próximo `- name:`) e remove os
   * comentários. Sem as duas coisas o guard erra dos dois jeitos clássicos:
   * pega o step seguinte (que legitimamente usa PLAYWRIGHT_CI_SERVER) e casa
   * com o próprio comentário que explica por que aquilo não deve existir aqui.
   */
  const step = (() => {
    const inicio = ci.indexOf('    - name: E2E — jornada logada')
    const resto = ci.slice(inicio + 10)
    const fim = resto.indexOf('\n    - name:')
    const bruto = fim === -1 ? resto : resto.slice(0, fim)
    return bruto.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n')
  })()

  it('nenhum `if:` de step usa o contexto secrets (derruba o workflow inteiro)', () => {
    // Aconteceu no run 31918472665: `secrets` não existe em `if:` de step e o
    // GitHub reprova o workflow ANTES de rodar qualquer passo.
    const ifsDeStep = ci.split('\n').filter((l) => l.trim().startsWith('if:'))
    for (const linha of ifsDeStep) expect(linha).not.toMatch(/secrets\./)
  })

  it('roda o spec de jornada contra a URL do preview, sem subir servidor', () => {
    expect(step).toMatch(/e2e\/authenticated-workout-journey\.spec\.ts/)
    expect(step).toMatch(/PLAYWRIGHT_BASE_URL:\s*\$\{\{\s*steps\.preview\.outputs\.url/)
    // Subir servidor aqui testaria outro binário, sem as variáveis do ambiente.
    expect(step).not.toMatch(/PLAYWRIGHT_CI_SERVER/)
  })

  it('a service role NÃO aparece no job do E2E logado (repo é público)', () => {
    // A chave ignora RLS e alcança os dados de todos os usuários. O preview da
    // Vercel já a tem no ambiente correto — ela não precisa existir aqui.
    expect(step).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/)
  })

  it('o passo é PULADO sem o token de bypass ou sem o preview pronto', () => {
    expect(ci).toMatch(/TEM_BYPASS_VERCEL:\s*\$\{\{\s*secrets\.VERCEL_AUTOMATION_BYPASS_SECRET/)
    expect(step).toMatch(/if:\s*steps\.preview\.outputs\.url\s*!=\s*''/)
  })

  it('o bypass da Vercel chega ao Playwright e ao login (senão bate na tela da Vercel)', () => {
    expect(pw).toMatch(/x-vercel-protection-bypass/)
    const gs = readFileSync('e2e/global-setup.ts', 'utf8')
    expect(gs).toMatch(/x-vercel-protection-bypass/)
  })

  it('o login não espera networkidle e falha claramente sem storage state', () => {
    const gs = readFileSync('e2e/global-setup.ts', 'utf8')
    expect(gs).toMatch(/waitUntil:\s*'domcontentloaded'/)
    expect(gs).not.toMatch(/waitUntil:\s*'networkidle'/)
    expect(gs).toMatch(/catch \(err\)[\s\S]*throw err/)
  })
})

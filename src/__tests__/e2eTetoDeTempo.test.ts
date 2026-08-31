/**
 * Nada no CI pode herdar o teto padrão do GitHub — **6 horas**.
 *
 * Em 31/08/2026 (run 33365701785, PR #1009) o step "E2E — jornada logada"
 * pendurou sem imprimir UMA linha e só morreu nesse limite. Não é a primeira
 * vez: em 18/08/2026 o mesmo step ficou 46 min mudo e foi cancelado à mão. O
 * rerun do mesmo commit passou em 9,3 min — a falha é intermitente, então o
 * que precisa de defesa não é a causa daquele dia, é a CLASSE "pendurou".
 *
 * O custo do que falta aqui não é o runner: enquanto o step pendura, nenhum PR
 * do repositório consegue ficar verde.
 *
 * Por que o silêncio é total, e por isso enganoso: com `--reporter=github` o
 * reporter do GitHub NÃO escreve em stdio (`printsToStdio() → false`), e o
 * "Running N tests" que costuma aparecer vem do reporter `dot` que o Playwright
 * acrescenta quando nenhum outro imprime. Ele fala no `onBegin`, e a ordem das
 * tasks do runner é globalSetup → load → onBegin. Ou seja: zero output prova
 * que o processo não passou do globalSetup, e é lá que ficavam as chamadas sem
 * teto (`page.fill`/`page.click`, cujo `actionTimeout` default é 0).
 *
 * As três defesas se cobrem em cascata, e a ORDEM é o que dá diagnóstico:
 *   1. `globalTimeout` (playwright.config) — aborta e DIZ o motivo;
 *   2. `timeout-minutes` do step — mata quando o processo não se aborta;
 *   3. `timeout-minutes` do job — a rede que pega qualquer step futuro.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/** O `#` de comentário casaria com o próprio texto que explica a regra. */
const semComentarios = (yaml: string) =>
    yaml.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n')

const ci = semComentarios(readFileSync('.github/workflows/ci.yml', 'utf8'))
const pw = readFileSync('playwright.config.ts', 'utf8')
const setup = readFileSync('e2e/global-setup.ts', 'utf8')

/** Blocos de cada job (`  nome:` na raiz de `jobs:`). */
function jobs(): Array<{ nome: string; bloco: string }> {
    const corpo = ci.slice(ci.indexOf('\njobs:'))
    const linhas = corpo.split('\n')
    const achados: Array<{ nome: string; bloco: string }> = []
    let atual: { nome: string; linhas: string[] } | null = null
    for (const linha of linhas) {
        const m = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(linha)
        if (m) {
            if (atual) achados.push({ nome: atual.nome, bloco: atual.linhas.join('\n') })
            atual = { nome: m[1], linhas: [] }
        } else if (atual) {
            atual.linhas.push(linha)
        }
    }
    if (atual) achados.push({ nome: atual.nome, bloco: atual.linhas.join('\n') })
    return achados
}

/** Blocos de cada step (`    - ` dentro de `steps:`). */
function steps(): string[] {
    const corpo = ci.slice(ci.indexOf('\n    steps:'))
    return corpo.split(/\n {4}- /).slice(1)
}

describe('CI — nada herda as 6 horas do GitHub', () => {
    it('todo job declara timeout-minutes', () => {
        const encontrados = jobs()
        expect(encontrados.length).toBeGreaterThan(0)
        for (const { nome, bloco } of encontrados) {
            expect(bloco, `o job "${nome}" herda o teto padrão de 6 h do GitHub`)
                .toMatch(/^ {4}timeout-minutes:\s*\d+\s*$/m)
        }
    })

    it('todo step que roda o Playwright tem teto PRÓPRIO', () => {
        // O teto do job pega o conjunto; o do step diz QUAL passo pendurou — e
        // é o que impede um step lento de consumir a folga dos outros.
        const doPlaywright = steps().filter((s) => s.includes('npx playwright test'))
        expect(doPlaywright.length, 'nenhum step de playwright encontrado — o slice mudou?')
            .toBeGreaterThanOrEqual(2)
        for (const step of doPlaywright) {
            expect(step, `step sem teto:\n${step.split('\n')[0]}`)
                .toMatch(/^ {6}timeout-minutes:\s*\d+\s*$/m)
        }
    })
})

describe('Playwright — o teto que ALCANÇA o globalSetup', () => {
    const globalTimeoutMin = (() => {
        const m = /const GLOBAL_TIMEOUT_MS = (\d+) \* 60_000/.exec(pw)
        expect(m, 'GLOBAL_TIMEOUT_MS sumiu ou mudou de forma no playwright.config').not.toBeNull()
        return Number(m![1])
    })()

    it('o globalTimeout está ligado no CI', () => {
        // O `timeout` por teste não vale no setup: o deadline do run é calculado
        // antes da primeira task, e o globalSetup é a primeira delas.
        expect(pw).toMatch(/process\.env\.CI\s*\?\s*\{\s*globalTimeout:\s*GLOBAL_TIMEOUT_MS\s*\}/)
    })

    it('ele dispara ANTES do teto do step (senão volta a ser silêncio)', () => {
        // Quem mata primeiro é quem explica. O GitHub só mata.
        const tetos = steps()
            .filter((s) => s.includes('npx playwright test'))
            .map((s) => Number(/^ {6}timeout-minutes:\s*(\d+)\s*$/m.exec(s)?.[1]))
        expect(tetos.length).toBeGreaterThan(0)
        for (const teto of tetos) {
            expect(Number.isFinite(teto)).toBe(true)
            expect(globalTimeoutMin, 'o step mataria antes de o Playwright dizer o motivo')
                .toBeLessThan(teto)
        }
    })
})

describe('globalSetup — as ações não podem esperar para sempre', () => {
    it('o contexto define um teto de ação (o default do Playwright é 0)', () => {
        // Cobre a CLASSE: `fill`, `click`, `waitForSelector` e a próxima ação
        // que alguém acrescentar aqui. Anotar chamada por chamada esquece a
        // próxima — foi assim que `fill`/`click` ficaram ilimitados.
        expect(setup, 'sem default de contexto, um click em botão não-acionável espera para sempre')
            .toMatch(/context\.setDefaultTimeout\(\s*\d[\d_]*\s*\)/)
    })

    it('o browser.close() do finally é limitado', () => {
        // `close()` não aceita `timeout` (só `reason`): cru, ele pendura o
        // processo DEPOIS de o trabalho estar feito.
        const fechamento = setup.slice(setup.indexOf('} finally {'))
        expect(fechamento).not.toMatch(/await browser\.close\(\)/)
        expect(fechamento).toMatch(/comTeto\(\s*browser\.close\(\)/)
    })
})

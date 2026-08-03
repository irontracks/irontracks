import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'

import { DOM_TEST_FILES } from '../../vitest.domTests'

/**
 * Guard da separação de ambientes da suíte (vitest.config.ts).
 *
 * A suíte roda em dois projetos: `.test.tsx` em jsdom, `.test.ts` em `node` — o que
 * a deixou 2,5× mais rápida (322s → 130s), porque só 39 dos 371 arquivos usam DOM.
 * O preço é uma lista de exceções: os `.test.ts` que mexem em DOM precisam estar em
 * `vitest.domTests.ts`, senão rodam em `node` e quebram com um "document is not
 * defined" que não explica nada.
 *
 * Este guard fecha esse buraco: varre os `.test.ts` de verdade e cobra a lista.
 */

/** Sinais de que o arquivo precisa de um DOM para rodar. */
const DOM_MARKERS = [
  /@testing-library\/react/,
  /\bdocument\./,
  /\bwindow\./,
  /\blocalStorage\b/,
  /\bnavigator\./,
]

const listTestTsFiles = (): string[] =>
  execSync('git ls-files "src/**/*.test.ts" "src/**/*.spec.ts"', { encoding: 'utf8' })
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)

/**
 * Reduz o arquivo ao CÓDIGO executável antes de procurar os marcadores: fora
 * comentários, strings, templates e regex literais.
 *
 * Sem isso o guard acusa quem apenas MENCIONA os nomes. Foram dois grupos reais:
 * arquivos que citam `localStorage` no cabeçalho explicando o bug que travam, e
 * os source-guards — que leem o código de OUTROS arquivos como texto e por
 * definição carregam `navigator.share` dentro de string e de regex. Nenhum dos
 * dois precisa de DOM; todos rodam em `node`. Guard que cobra mudança onde não há
 * problema vira ruído, e ruído mata a confiança no sinal.
 */
const toExecutableCode = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')          // blocos /* */
    .replace(/(^|[^:])\/\/.*$/gm, '$1')          // linhas //
    .replace(/`(?:\\[\s\S]|[^\\`])*`/g, '``')    // templates
    .replace(/'(?:\\.|[^\\'])*'/g, "''")         // aspas simples
    .replace(/"(?:\\.|[^\\"])*"/g, '""')         // aspas duplas
    .replace(/\/(?:\\.|\[(?:\\.|[^\]])*\]|[^/\n\\])+\/[gimsuy]*/g, '/RE/') // regex literais

describe('separação de ambientes da suíte', () => {
  const files = listTestTsFiles()

  it('enxerga os arquivos .test.ts do repo', () => {
    // Sanidade: um glob quebrado tornaria todo o resto deste guard vacuamente verde.
    expect(files.length).toBeGreaterThan(100)
  })

  it('todo .test.ts que usa DOM está declarado em vitest.domTests.ts', () => {
    const declared = new Set<string>(DOM_TEST_FILES)
    const faltando: string[] = []

    for (const file of files) {
      if (declared.has(file)) continue
      const code = toExecutableCode(readFileSync(file, 'utf8'))
      if (DOM_MARKERS.some(re => re.test(code))) faltando.push(file)
    }

    expect(
      faltando,
      `Estes .test.ts usam DOM mas rodariam em "node" e quebrariam com "document is not defined".\n` +
      `Adicione a DOM_TEST_FILES em vitest.domTests.ts:\n${faltando.map(f => `  '${f}',`).join('\n')}`,
    ).toEqual([])
  })

  it('a lista não tem entrada morta (arquivo renomeado ou apagado)', () => {
    const sumidos = DOM_TEST_FILES.filter(f => !existsSync(f))
    expect(
      sumidos,
      `Entradas de DOM_TEST_FILES que não existem mais — remova de vitest.domTests.ts:\n${sumidos.join('\n')}`,
    ).toEqual([])
  })

  it('a lista não tem .tsx (esses já vão para jsdom pela convenção)', () => {
    expect(DOM_TEST_FILES.filter(f => f.endsWith('.tsx'))).toEqual([])
  })

  it('a config declara os dois projetos e usa a lista como exceção', () => {
    const cfg = readFileSync('vitest.config.ts', 'utf8')
    expect(cfg).toMatch(/projects:\s*\[/)
    expect(cfg).toMatch(/project\('dom',\s*'jsdom'/)
    expect(cfg).toMatch(/project\('node',\s*'node'/)
    expect(cfg).toMatch(/DOM_TEST_FILES/)
    // O timeout curto default é o que causava a flakiness — não pode voltar.
    expect(cfg).toMatch(/testTimeout:\s*15_000/)
  })
})

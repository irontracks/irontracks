/**
 * Portal monta DENTRO do contêiner raiz do app, nunca no `<body>`.
 *
 * Desde #1172 (26/09/2026) a fonte Inter e o `text-white` moram no contêiner de
 * `app/app/layout.tsx`, não no `<body>` (compartilhado com a landing). Os sete
 * portais do app apontavam para `document.body` e passaram a desenhar em Times:
 * menu do avatar, check-out, troca de exercício, chat da nutrição, editores de
 * story, mapa 3D… — visto no simulador em 27/10/2026. Nenhum teste via, porque
 * o jsdom não pinta fonte.
 *
 * O guard é de CLASSE: varre `src/` atrás de qualquer `createPortal(` e exige o
 * alvo `portalRoot()`. Portal novo apontando para o `body` reprova.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(process.cwd(), 'src')

const arquivos = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return n === '__tests__' || n === 'node_modules' ? [] : arquivos(p)
    return /\.(tsx?|jsx?)$/.test(n) ? [p] : []
  })

/** Só código executável: comentário que CITA `document.body` não é o padrão. */
const semComentario = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/** Argumentos da chamada `createPortal(` por parêntese balanceado. */
function chamadas(src: string): string[] {
  const out: string[] = []
  let i = src.indexOf('createPortal(')
  while (i !== -1) {
    let j = i + 'createPortal('.length
    let nivel = 1
    while (j < src.length && nivel > 0) {
      const c = src[j]
      if (c === '(') nivel++
      else if (c === ')') nivel--
      j++
    }
    out.push(src.slice(i, j))
    i = src.indexOf('createPortal(', j)
  }
  return out
}

describe('portal monta no contêiner do app', () => {
  it('todo createPortal de src/ usa portalRoot() como alvo', () => {
    const errados: string[] = []
    let total = 0
    for (const f of arquivos(SRC)) {
      const src = semComentario(readFileSync(f, 'utf8'))
      if (/import\s*\{[^}]*createPortal/.test(src) === false) continue
      for (const c of chamadas(src)) {
        total++
        if (!/,\s*portalRoot\(\)\s*,?\s*\)$/.test(c)) errados.push(f.replace(SRC, 'src'))
      }
    }
    // Sem este piso, o guard passaria verde varrendo o lugar errado.
    expect(total).toBeGreaterThanOrEqual(7)
    expect(errados, 'portal fora do contêiner do app perde a fonte e a cor').toEqual([])
  })

  it('o contêiner raiz do app carrega o id E a fonte', () => {
    const layout = readFileSync(join(SRC, 'app/app/layout.tsx'), 'utf8')
    expect(layout).toMatch(/<div id=\{APP_ROOT_ID\} className=\{`\$\{inter\.variable\} font-sans/)
  })

  it('o contêiner raiz NÃO cria contexto de empilhamento — senão portal não escaparia de nada', () => {
    const layout = readFileSync(join(SRC, 'app/app/layout.tsx'), 'utf8')
    const classe = /<div id=\{APP_ROOT_ID\} className=\{`([^`]*)`\}/.exec(layout)?.[1] ?? ''
    expect(classe).not.toBe('')
    expect(classe).not.toMatch(/(^|\s)(z-|relative|absolute|fixed|sticky|transform|translate-|scale-|overflow-|isolate|opacity-|filter|backdrop-|will-change)/)
  })
})

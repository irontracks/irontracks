import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { STORY_TEMPLATES } from '@/components/stories/storyTemplates'
import { NUTRITION_STORY_TEMPLATES } from '@/components/stories/nutritionStoryTemplates'

/**
 * A marca é UMA PALAVRA: IRONTRACKS.
 *
 * Relato do dono (25/08/2026): "IronTracks é junto e tem template colocando -".
 * Ao medir, o defeito era maior do que o hífen — a grafia mudava conforme o
 * LAYOUT escolhido:
 *
 *  - `live`, `group`, `workout` desenhavam "IRONTRACKS" (sem separador)
 *  - os outros quatro liam `template.brandDivider` e desenhavam
 *    "IRON · TRACKS", "IRON / TRACKS", "IRON 🇧🇷 TRACKS"
 *
 * Ou seja: a mesma marca, escrita de duas formas no mesmo produto, na peça que
 * vai para a rede social. Cor e fonte podem variar por template; a grafia do
 * nome, não.
 *
 * Este guard é de CLASSE: não basta os onze templates de hoje estarem limpos —
 * um template novo com separador, ou um renderer que volte a inserir texto
 * entre IRON e TRACKS, reprova aqui.
 */

const SRC = path.resolve(process.cwd(), 'src')

/** Percorre os `.ts`/`.tsx` de uma pasta, sem testes. */
function varrer(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'node_modules') continue
      varrer(full, acc)
    } else if (/\.(ts|tsx)$/.test(e.name)) acc.push(full)
  }
  return acc
}

/**
 * Reduz ao código executável. Sem isto o guard casa com a própria nota que
 * explica por que o separador foi banido — o jeito clássico de escrever guard
 * que acusa a própria documentação.
 */
function semComentarios(src: string): string {
  let out = ''
  let i = 0
  while (i < src.length) {
    const c = src[i], n = src[i + 1]
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue }
    if (c === '/' && n === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; out += c; i++
      while (i < src.length) {
        if (src[i] === '\\') { out += src[i] + (src[i + 1] ?? ''); i += 2; continue }
        out += src[i]
        if (src[i] === q) { i++; break }
        i++
      }
      continue
    }
    out += c; i++
  }
  return out
}

describe('IRONTRACKS é uma palavra só', () => {
  it('nenhum template de story declara separador de marca', () => {
    for (const t of STORY_TEMPLATES) {
      expect(t, `template "${t.id}"`).not.toHaveProperty('brandDivider')
    }
    for (const t of NUTRITION_STORY_TEMPLATES) {
      expect(t, `template de nutrição "${t.id}"`).not.toHaveProperty('brandDivider')
    }
  })

  it('o campo não existe em lugar nenhum do código executável', () => {
    // Remover é diferente de zerar: enquanto o campo existir, alguém preenche.
    const culpados = varrer(SRC)
      .filter((f) => /brandDivider/.test(semComentarios(readFileSync(f, 'utf8'))))
      .map((f) => path.relative(SRC, f))
    expect(culpados, `A marca é uma palavra. Remova \`brandDivider\` de:\n${culpados.join('\n')}`).toEqual([])
  })

  it('nenhum renderer desenha texto ENTRE o IRON e o TRACKS', () => {
    // A forma do defeito: `fillText('TRACKS', x + ironW + algumaCoisa, …)`.
    // Com a marca junta, o deslocamento é exatamente a largura de "IRON".
    const culpados: string[] = []
    for (const f of varrer(SRC)) {
      const code = semComentarios(readFileSync(f, 'utf8'))
      if (!code.includes("'TRACKS'")) continue
      for (const m of code.matchAll(/fillText\(\s*'TRACKS'\s*,\s*([^,]+),/g)) {
        const desloc = m[1].replace(/\s/g, '')
        // Aceita `x+ironW` / `left+ironWidth`; recusa qualquer soma a mais.
        if (!/^[A-Za-z_$][\w$]*\+[A-Za-z_$][\w$]*$/.test(desloc)) {
          culpados.push(`${path.relative(SRC, f)} → fillText('TRACKS', ${m[1].trim()}, …)`)
        }
      }
    }
    expect(culpados, `Nada entra entre IRON e TRACKS:\n${culpados.join('\n')}`).toEqual([])
  })

  it('os renderers de marca continuam existindo — o guard não passa por vazio', () => {
    // Sem esta âncora, renomear `fillText` deixaria os casos acima varrendo
    // lista vazia e verdes por acidente (o 5º jeito de errar do CLAUDE.md).
    const comMarca = varrer(SRC).filter((f) => semComentarios(readFileSync(f, 'utf8')).includes("'TRACKS'"))
    expect(comMarca.length).toBeGreaterThanOrEqual(4)
  })
})

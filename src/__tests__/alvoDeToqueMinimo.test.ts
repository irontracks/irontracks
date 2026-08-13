/**
 * Alvo de toque mínimo — 44pt (Apple HIG).
 *
 * Medição de 12/08/2026: 90 botões em 53 arquivos tinham caixa FIXA menor que
 * 44px — 43 em 40px, 19 em 36, 15 em 32, 11 em 28 e 2 em 24. Nenhum falhava o
 * WCAG 2.5.8 (que exige só 24×24), então isto não é conformidade: é ergonomia.
 * O app é usado entre séries, com a mão suada e o olhar dividido; 4px de folga
 * no dedo custam zero e mudam a taxa de erro.
 *
 * A correção NÃO cresce a caixa (isso empurraria ícone, gap e alinhamento em 53
 * arquivos): a classe `.tap-44` estende a área tocável por um ::after centrado.
 * Nenhum pixel se move.
 *
 * ⚠️ O parser anda caractere a caractere de propósito. `<button([^>]*)>` PARA no
 * `>` do `=>` de qualquer handler inline e deixa passar a maioria dos botões —
 * foi assim que a primeira versão do guard de nome acessível deste repo disse
 * verde com 10 botões mudos.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ⚠️ AS DUAS raízes. O guard nasceu varrendo só `src/components` e ficou cego
 * para `src/app`, onde vivem páginas inteiras — Agenda, Comunidade, Marketplace.
 * Foram 15 botões, achados só quando a auditoria chegou na Agenda a olho.
 *
 * É o TERCEIRO buraco deste mesmo guard: primeiro ele só via `w-N h-N` casados
 * (155 escaparam por altura sozinha), depois só varria uma pasta. O padrão do
 * erro é sempre o mesmo — o guard nasce cobrindo o caso que motivou a escrevê-lo
 * e é tratado como se cobrisse a classe inteira. Ao escrever um guard, a
 * pergunta não é "ele pega o meu caso?", é "onde ele NÃO olha?".
 */
const RAIZES = [join('src', 'components'), join('src', 'app')]

/** Botões cujo alvo pequeno é intencional e não pode crescer. Só encolhe. */
const NAO_E_ALVO_DE_DEDO: Record<string, string> = {}

const arquivos = RAIZES.flatMap((raiz) =>
  readdirSync(raiz, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.tsx') && !f.includes('__tests__'))
    .map((f) => join(raiz, f)),
)

/** Extrai a tag de abertura completa, respeitando chaves/parênteses aninhados. */
const tagsDeBotao = (src: string): string[] => {
  const tags: string[] = []
  for (const m of src.matchAll(/<button\b/g)) {
    let i = (m.index ?? 0) + m[0].length
    let profundidade = 0
    while (i < src.length) {
      const c = src[i]
      if (c === '{' || c === '[' || c === '(') profundidade++
      else if (c === '}' || c === ']' || c === ')') profundidade--
      else if (c === '>' && profundidade <= 0) { tags.push(src.slice(m.index ?? 0, i)); break }
      i++
    }
  }
  return tags
}

/**
 * Caixa fixa abaixo de 44px.
 *
 * ⚠️ A primeira versão só olhava `w-N h-N` CASADOS e ficou cega para 155
 * botões — mais que os 90 que ela pegou. As pílulas de período do Histórico
 * (`min-h-[36px]`) e os botões de relatório (`h-8`) definem só a ALTURA, que é
 * a dimensão que o polegar erra, e passavam batido. Dois chegavam a 20px, abaixo
 * do mínimo de 24 do WCAG 2.5.8. Guard que cobre metade dos casos dá a sensação
 * de proteção sem entregá-la.
 */
const caixaPequena = (tag: string): boolean => {
  const wh = /\bw-(\d+)\s+h-(\d+)\b/.exec(tag)
  if (wh) return Number(wh[1]) < 11 || Number(wh[2]) < 11
  const h = /\bh-(\d+)\b/.exec(tag)
  if (h) return Number(h[1]) < 11
  const hpx = /\bh-\[(\d+)px\]/.exec(tag)
  if (hpx) return Number(hpx[1]) < 44
  const minh = /\bmin-h-\[(\d+)px\]/.exec(tag)
  if (minh) return Number(minh[1]) < 44
  return false
}

const temAlvoAmpliado = (tag: string): boolean =>
  tag.includes('tap-44') || tag.includes('min-h-[44px]') || tag.includes('min-w-[44px]')

describe('alvo de toque mínimo de 44pt', () => {
  it('todo botão de caixa pequena amplia a área tocável', () => {
    const infratores: string[] = []
    for (const rel of arquivos) {
      if (NAO_E_ALVO_DE_DEDO[rel]) continue
      const src = readFileSync(rel, 'utf8')
      for (const tag of tagsDeBotao(src)) {
        if (caixaPequena(tag) && !temAlvoAmpliado(tag)) infratores.push(rel)
      }
    }
    expect(
      [...new Set(infratores)],
      'botão com caixa fixa < 44px precisa da classe `tap-44` (globals.css), que ' +
        'estende o alvo pelo ::after sem mover pixel nenhum. Crescer w-*/h-* muda ' +
        'o layout — não é a saída.',
    ).toEqual([])
  })

  it('o parser enxerga botão com handler inline (a armadilha do `=>`)', () => {
    const src = '<button onClick={() => f()} className="w-8 h-8">x</button>'
    expect(tagsDeBotao(src)).toHaveLength(1)
    expect(caixaPequena(tagsDeBotao(src)[0])).toBe(true)
  })

  it('enxerga altura sozinha, não só a caixa quadrada', () => {
    // O buraco que deixou 155 botões passarem — inclusive dois de 20px.
    expect(caixaPequena('<button className="min-h-[36px] px-3 rounded-full">7d</button>')).toBe(true)
    expect(caixaPequena('<button className="h-8 px-3 rounded-lg">Semanal</button>')).toBe(true)
    expect(caixaPequena('<button className="h-[20px] w-[20px]">x</button>')).toBe(true)
    expect(caixaPequena('<button className="h-11 px-4">ok</button>')).toBe(false)
    expect(caixaPequena('<button className="px-4 py-3">sem altura fixa</button>')).toBe(false)
  })

  it('o guard reprova de verdade quando falta a classe', () => {
    const semAlvo = '<button className="w-8 h-8 rounded-xl">x</button>'
    const comAlvo = '<button className="tap-44 w-8 h-8 rounded-xl">x</button>'
    expect(caixaPequena(tagsDeBotao(semAlvo)[0]) && !temAlvoAmpliado(tagsDeBotao(semAlvo)[0])).toBe(true)
    expect(caixaPequena(tagsDeBotao(comAlvo)[0]) && !temAlvoAmpliado(tagsDeBotao(comAlvo)[0])).toBe(false)
  })

  it('a utility existe no CSS e não neutraliza o próprio alvo', () => {
    const css = readFileSync(join('src', 'app', 'globals.css'), 'utf8')
    const bloco = css.slice(css.indexOf('.tap-44'))
    expect(bloco).toContain("content: ''")
    expect(bloco.slice(0, 400)).not.toContain('pointer-events: none')
  })

  it('o feedback de pressão global continua de pé', () => {
    // 1037 botões dependem destas 4 linhas: no celular NÃO existe hover, então
    // o press é o único canal que confirma o toque. Quem tem `active:scale-*`
    // na classe apenas sobrescreve (classe vence seletor de elemento) — a
    // maioria não tem, e é esta regra que os atende.
    const css = readFileSync(join('src', 'app', 'globals.css'), 'utf8')
    const regra = /button:active[\s\S]{0,80}?transform:\s*scale\(0?\.\d+\)/
    expect(regra.test(css), 'a regra global de :active sumiu — sem ela, a maioria dos botões não dá retorno nenhum ao toque').toBe(true)
  })

  it('a allowlist não guarda entrada morta — ela só encolhe', () => {
    const mortas = Object.keys(NAO_E_ALVO_DE_DEDO).filter((rel) => {
      try {
        return !tagsDeBotao(readFileSync(rel, 'utf8')).some(caixaPequena)
      } catch {
        return true
      }
    })
    expect(mortas, 'já não tem botão pequeno — remova da lista').toEqual([])
  })
})

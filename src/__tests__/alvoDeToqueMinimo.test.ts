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
const NAO_E_ALVO_DE_DEDO: Record<string, string> = {
  // Peças ARRASTÁVEIS do editor de story, posicionadas em `absolute` com
  // left/top percentuais. Ampliar a área faria peças vizinhas se sobreporem e o
  // toque pegar a errada — o mesmo raciocínio dos dots do tour, que ganharam
  // `aria-hidden` em vez de 44pt porque tinham 12px entre centros.
  'src/components/StoryComposer.tsx': 'peça arrastável — ampliar sobrepõe a vizinha',
}

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

/**
 * QUARTO buraco do mesmo guard (26/08/2026): botão sem NENHUMA altura
 * declarada, cuja caixa nasce do `padding` mais a altura da linha.
 *
 *     <button className="px-2 py-1 text-[10px]">Remover</button>
 *
 * 4px de padding em cima, 4 embaixo e ~15px de linha dão 23px — metade do
 * mínimo, e o guard não via nada porque não havia `h-*` para ler. Eram **333
 * botões em 129 arquivos**, mais que os três buracos anteriores somados.
 *
 * A altura é ESTIMADA: `2 × padding + line-height`. Não é o valor que o
 * navegador calcula (não há `border`, `leading-*` nem herança aqui), e não
 * precisa ser — a pergunta é "cabe um polegar?", e a margem entre 23px e 44px
 * não depende de um pixel a mais ou a menos. Onde a estimativa erra, ela erra
 * para MENOS casos, nunca para falso positivo: só entra quem não declarou
 * altura nenhuma.
 */
const alturaPorPadding = (tag: string): number | null => {
  if (/\b(w-\d+\s+h-\d+|h-\d+|h-\[\d+px\]|min-h-\[\d+px\])\b/.test(tag)) return null
  const pad = /\bp[yb]?-(\d+(?:\.\d+)?)\b/.exec(tag)
  if (!pad) return null
  const px = /text-\[(\d+)px\]/.exec(tag)
  const nome = /\btext-(xs|sm|base|lg)\b/.exec(tag)
  const linha = px
    ? Number(px[1]) * 1.5
    : ({ xs: 16, sm: 20, base: 24, lg: 28 } as Record<string, number>)[nome?.[1] ?? 'sm'] ?? 20
  return 2 * Number(pad[1]) * 4 + linha
}

/** O piso ABSOLUTO do WCAG 2.5.8 (AA). Abaixo disto não há discussão. */
const PISO_WCAG = 24

const temAlvoAmpliado = (tag: string): boolean =>
  tag.includes('tap-44') || tag.includes('min-h-[44px]') || tag.includes('min-w-[44px]')

describe('alvo de toque mínimo de 44pt', () => {
  /**
   * Os 44pt são a HIG da Apple e o alvo deste repo; os 24×24 são o mínimo do
   * WCAG 2.5.8 nível AA, onde não há discussão possível. Os 333 botões medidos
   * por padding ficam no ratchet abaixo — mas os 9 que furavam o piso foram
   * corrigidos na mesma varredura, e este caso impede que voltem.
   */
  it('nenhum botão fica abaixo do piso de 24px do WCAG', () => {
    const abaixoDoPiso: string[] = []
    for (const rel of arquivos) {
      if (NAO_E_ALVO_DE_DEDO[rel]) continue
      const src = readFileSync(rel, 'utf8')
      for (const tag of tagsDeBotao(src)) {
        if (temAlvoAmpliado(tag)) continue
        const h = alturaPorPadding(tag)
        if (h !== null && h < PISO_WCAG) abaixoDoPiso.push(`${rel} (~${Math.round(h)}px)`)
      }
    }
    expect(
      abaixoDoPiso,
      'botão sem altura declarada, com caixa de padding + linha abaixo de 24px. ' +
        'Use `.tap-44`, que estende a área pelo ::after sem mover pixel nenhum.',
    ).toEqual([])
  })

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
        // As DUAS formas de ser pequeno: caixa declarada e caixa de padding.
        // Sem a segunda, uma exceção legítima pelo novo critério é acusada de
        // morta — e removê-la reabriria o buraco que ela cobre.
        return !tagsDeBotao(readFileSync(rel, 'utf8')).some(
          (tag) => caixaPequena(tag) || (alturaPorPadding(tag) ?? 44) < 44,
        )
      } catch {
        return true
      }
    })
    expect(mortas, 'já não tem botão pequeno — remova da lista').toEqual([])
  })
})

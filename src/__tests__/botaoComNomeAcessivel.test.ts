/**
 * Guard: botão cujo conteúdo é SÓ ícone precisa de nome acessível.
 *
 * Quem usa VoiceOver ouve "botão" e mais nada — o ícone não fala. Boa parte dos
 * casos reais eram fechar/voltar de modal: o usuário cego procurava a SAÍDA por
 * tentativa e erro.
 *
 * `title` não resolve: em botão sem texto o VoiceOver do iOS não o anuncia de
 * forma confiável — e este repo tinha esse caso no header das Avaliações, com
 * `title="Fechar"` numa ação que era voltar.
 *
 * ## Duas lições que este arquivo carrega
 *
 * **1. O regex `<button([^>]*)>` está ERRADO e não deve voltar.** Ele corta nos
 * `=>` das arrow functions (`onClick={() => ...}`), então os atributos vinham
 * truncados e botões com handler inline escapavam da verificação. A primeira
 * versão deste guard tinha esse furo: acusava 26 casos quando existiam 36.
 * O parser abaixo anda caractere a caractere respeitando chaves e strings.
 *
 * **2. A regra é PRECISA, não heurística.** Três tentativas de adivinhar "tem
 * texto?" produziram falsos positivos diferentes: botões com texto em expressão
 * condicional (`{saved ? <>…Salvo</> : 'Salvar'}`), wrappers genéricos
 * (`<button>{children}</button>`) e rótulos vindos de dado (`{cfg.label}`).
 * Colar `aria-label` em qualquer um deles seria pior que o problema — rótulo
 * errado o usuário acredita.
 * Por isso o guard só acusa o caso em que NÃO HÁ COMO existir nome: o conteúdo
 * é exclusivamente uma ou mais tags JSX auto-fecháveis de componente.
 * Conteúdo dinâmico fica de fora de propósito — não é falso negativo, é
 * abstenção consciente.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')

/** Conteúdo que é só `<Icone ... />`, uma ou mais vezes. Nada de texto, nada de `{}`. */
const SO_ICONES = /^(?:\s*<[A-Z][A-Za-z0-9]*\b[^>]*\/>\s*)+$/

/**
 * Percorre a tag `<button …>` respeitando chaves e strings, para não parar no
 * `>` de uma arrow function. Devolve [atributos, conteúdo].
 */
function* botoes(src: string): Generator<{ pos: number; attrs: string; inner: string }> {
  const abre = /<button\b/g
  let m: RegExpExecArray | null
  while ((m = abre.exec(src))) {
    let i = abre.lastIndex
    let profundidade = 0
    let aspas: string | null = null
    while (i < src.length) {
      const c = src[i]
      if (aspas) {
        if (c === aspas && src[i - 1] !== '\\') aspas = null
      } else if (c === '"' || c === "'" || c === '`') {
        aspas = c
      } else if (c === '{') profundidade++
      else if (c === '}') profundidade--
      else if (c === '>' && profundidade === 0) {
        const fim = src.indexOf('</button>', i)
        yield {
          pos: m.index,
          attrs: src.slice(abre.lastIndex, i),
          inner: fim > 0 ? src.slice(i + 1, fim) : '',
        }
        break
      }
      i++
    }
  }
}

const arquivos = readdirSync(ROOT, { recursive: true, encoding: 'utf8' })
  .filter((f) => f.endsWith('.tsx') && !f.includes('__tests__'))
  .map((f) => f.split('\\').join('/'))

describe('nome acessível em botão só de ícone', () => {
  it('o guard tem alvos — varredura vazia não protege nada', () => {
    expect(arquivos.length).toBeGreaterThan(50)
  })

  it('o parser não para no "=>" de arrow function', () => {
    // Sem isto o guard volta a ter o furo que deixou 10 botões passarem.
    const amostra = `<button onClick={() => setOpen(true)} aria-label="Abrir"><X /></button>`
    const [b] = [...botoes(amostra)]
    expect(b.attrs).toContain('aria-label="Abrir"')
    expect(b.inner.trim()).toBe('<X />')
  })

  it('nenhum botão só de ícone fica sem aria-label', () => {
    const infratores: string[] = []
    for (const rel of arquivos) {
      const src = readFileSync(join(ROOT, rel), 'utf8')
      if (!src.includes('<button')) continue
      for (const { pos, attrs, inner } of botoes(src)) {
        if (/aria-(label|labelledby)/.test(attrs)) continue
        if (!SO_ICONES.test(inner.replace(/\{\/\*[\s\S]*?\*\/\}/g, ''))) continue
        infratores.push(`${rel}:${src.slice(0, pos).split('\n').length}`)
      }
    }
    expect(
      infratores,
      'Botão cujo conteúdo é só ícone precisa de aria-label — quem usa leitor ' +
        'de tela ouve apenas "botão". `title` não substitui: não é anunciado de ' +
        'forma confiável em botão sem texto no VoiceOver do iOS.',
    ).toEqual([])
  })
})

/**
 * Disclosure inline precisa anunciar se está aberto ou fechado.
 *
 * Sem `aria-expanded`, o leitor de tela anuncia "botão Equilíbrio Muscular" e
 * o usuário não tem como saber se o conteúdo está aberto — nem descobre que
 * ele existe. Com o atributo, o VoiceOver diz "recolhido"/"expandido".
 *
 * ## Por que só 5, se havia 159 candidatos
 * Dos 159 controles que mexem em estado de abertura, **53 abrem MODAL** — e ali
 * `aria-expanded` é INCORRETO: modal quer `role="dialog"` e gestão de foco, não
 * disclosure. Outros são toggles de senha (pedem `aria-pressed` ou rótulo que
 * muda) e menus (pedem `aria-haspopup` junto).
 *
 * Chutar o atributo errado é pior que não ter: o leitor de tela anuncia com
 * confiança uma informação falsa. Então este guard cobre só o caso inequívoco —
 * estado literalmente chamado `expanded`, controlando conteúdo na própria tela.
 * O resto continua reportado, não silenciado.
 */
describe('disclosure inline anuncia o estado', () => {
  const ALVOS = [
    'components/MuscleBalanceCard.tsx',
    'components/dashboard/MuscleMapCard.tsx',
    'components/dashboard/PRPrediction.tsx',
    'components/dashboard/nutrition/NutritionDayScore.tsx',
    'components/update/UpdateAvailableBanner.tsx',
  ]

  it.each(ALVOS)('%s tem aria-expanded ligado ao estado', (rel) => {
    const src = readFileSync(join(ROOT, rel), 'utf8')
    expect(src, 'o botão precisa refletir o estado, não um valor fixo')
      .toMatch(/aria-expanded=\{expanded\}/)
  })

  it('nenhum deles usa valor literal em vez do estado', () => {
    for (const rel of ALVOS) {
      const src = readFileSync(join(ROOT, rel), 'utf8')
      expect(src).not.toMatch(/aria-expanded=\{(true|false)\}/)
      expect(src).not.toMatch(/aria-expanded="(true|false)"/)
    }
  })
})

/**
 * Guard de CLASSE: todo campo que recebe IDENTIFICADOR desliga a autocorreção.
 *
 * O bug: o teclado do iOS autocorrige por padrão e nome de exercício não é
 * palavra de dicionário. Medido no simulador em 15/08/2026 — "Drop teste"
 * virou "Frio teste", "Bi A" virou "Vi A". O usuário digita certo, o sistema
 * entrega outra coisa, e o nome errado já está salvo quando ele percebe.
 *
 * Por que varrer em vez de listar os campos que eu conhecia: um guard que
 * confere só os arquivos que o autor já tinha na mão é guard da INSTÂNCIA com
 * cara de classe — foi exatamente assim que o guard dos modais passou verde
 * enquanto o rodapé do treino continuava coberto pela barra do descanso
 * (15/08/2026). Aqui a varredura é sobre `src/` inteiro e a pergunta é "o que
 * ESTE campo recebe?", não "em que arquivo ele está".
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = join(__dirname, '..', '..', '..')

const listarTsx = (dir: string, out: string[] = []): string[] => {
  for (const nome of readdirSync(dir)) {
    if (nome === 'node_modules' || nome === '__tests__' || nome.startsWith('.')) continue
    const full = join(dir, nome)
    if (statSync(full).isDirectory()) listarTsx(full, out)
    else if (nome.endsWith('.tsx')) out.push(full)
  }
  return out
}

/**
 * Extrai tags <input>/<textarea> INTEIRAS.
 *
 * Caractere a caractere de propósito: `<input([^>]*)>` PARA no `>` da arrow
 * function de um handler inline (`onChange={e => …}`) e devolve meia tag — o
 * mesmo furo que deixou o guard de nome acessível passar verde com 10 botões
 * mudos. Aqui contamos chaves e pulamos strings.
 */
const extrairTags = (src: string): string[] => {
  const tags: string[] = []
  const re = /<(input|textarea)[\s>]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    let i = m.index
    let chaves = 0
    let aspas: string | null = null
    for (; i < src.length; i++) {
      const c = src[i]
      const anterior = src[i - 1]
      if (aspas) {
        if (c === aspas && anterior !== '\\') aspas = null
        continue
      }
      if (c === '"' || c === "'" || c === '`') { aspas = c; continue }
      if (c === '{') chaves++
      else if (c === '}') chaves--
      else if (c === '>' && chaves === 0) break
    }
    tags.push(src.slice(m.index, i + 1))
  }
  return tags
}

/** Rótulo do campo: o que o usuário lê (placeholder) ou o leitor de tela anuncia. */
const rotuloDe = (tag: string): string => {
  const ph = tag.match(/placeholder=["']([^"']*)["']/)?.[1] ?? ''
  const aria = tag.match(/aria-label=["']([^"']*)["']/)?.[1] ?? ''
  return `${ph} ${aria}`.trim()
}

/** Campos que recebem identificador — nome, busca, documento, código. */
const PADRAO_IDENTIFICADOR =
  /\bnome\b|buscar|\bcpf\b|cnpj|celular|telefone|c[óo]digo|handle|cref|\bDDD\b/i

/**
 * Texto livre: aqui a autocorreção AJUDA e o guard não deve cobrar nada. São
 * frases em português — notas de treino, chat, observação, descrição.
 */
const PADRAO_TEXTO_LIVRE = /observa|nota|mensagem|descri|coment|bio\b|pergunt/i

const TEM_PROTECAO = /\.\.\.(properNameFieldProps|codeFieldProps|plainFieldProps)|autoCorrect/

/**
 * Exceções declaradas, cada uma com o MOTIVO. Lista que só encolhe: entrada
 * sem justificativa é dívida com cara de decisão.
 */
const EXCECOES: Record<string, string> = {}

describe('campos de identificador desligam a autocorreção do teclado', () => {
  const arquivos = listarTsx(RAIZ)

  it('varre um número plausível de arquivos (o guard não pode ficar cego por caminho errado)', () => {
    // Sem isto, um erro de caminho faria a varredura passar verde examinando ZERO
    // arquivos — o jeito nº 5 de guard falso: o teste que não existe.
    expect(arquivos.length).toBeGreaterThan(200)
  })

  it('nenhum campo de identificador ficou sem proteção', () => {
    const faltando: string[] = []
    for (const arq of arquivos) {
      const src = readFileSync(arq, 'utf8')
      if (!src.includes('<input') && !src.includes('<textarea')) continue
      for (const tag of extrairTags(src)) {
        const rotulo = rotuloDe(tag)
        if (!rotulo) continue
        if (PADRAO_TEXTO_LIVRE.test(rotulo)) continue
        if (!PADRAO_IDENTIFICADOR.test(rotulo)) continue
        if (TEM_PROTECAO.test(tag)) continue
        const rel = arq.slice(arq.indexOf('/src/') + 1)
        if (EXCECOES[`${rel}::${rotulo}`]) continue
        faltando.push(`${rel} :: "${rotulo}"`)
      }
    }
    expect(faltando, `Campos de identificador sem desligar a autocorreção:\n${faltando.join('\n')}\n\nUse properNameFieldProps / codeFieldProps / plainFieldProps de @/utils/ui/textFieldProps.`).toEqual([])
  })

  it('campos de TEXTO LIVRE continuam com a autocorreção ligada', () => {
    // O oposto também é defeito: desligar o corretor onde o usuário escreve
    // frases em português piora a digitação. A fronteira é identificador ×
    // texto livre, e ela vale nos dois sentidos.
    const indevidos: string[] = []
    for (const arq of arquivos) {
      const src = readFileSync(arq, 'utf8')
      if (!src.includes('textFieldProps')) continue
      for (const tag of extrairTags(src)) {
        const rotulo = rotuloDe(tag)
        if (!rotulo || !PADRAO_TEXTO_LIVRE.test(rotulo)) continue
        if (PADRAO_IDENTIFICADOR.test(rotulo)) continue
        if (TEM_PROTECAO.test(tag)) indevidos.push(`${arq.slice(arq.indexOf('/src/') + 1)} :: "${rotulo}"`)
      }
    }
    expect(indevidos, `Campo de texto livre não deve desligar a autocorreção:\n${indevidos.join('\n')}`).toEqual([])
  })

  it('o parser enxerga a tag inteira mesmo com handler inline (arrow function)', () => {
    // A regressão que este caso trava: `<input([^>]*)>` para no `>` do `=>` e
    // devolve meia tag, então a proteção que vem DEPOIS do handler fica
    // invisível e o guard aprova um campo desprotegido — ou reprova um
    // protegido.
    const comArrow = `<input onChange={(e) => setX(e.target.value)} placeholder="Nome" {...properNameFieldProps} />`
    const tags = extrairTags(comArrow)
    expect(tags).toHaveLength(1)
    expect(TEM_PROTECAO.test(tags[0])).toBe(true)
    expect(rotuloDe(tags[0])).toBe('Nome')
  })
})

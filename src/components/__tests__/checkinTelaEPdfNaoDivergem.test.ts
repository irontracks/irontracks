import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * O PDF precisa receber o MESMO check-in/check-out que a tela mostra.
 *
 * Auditoria de 02/09/2026: o check-in (pré-treino) e o check-out (pós-treino)
 * eram gravados, apareciam no `ReportCheckinPanel` da tela, e o gerador do
 * PDF — o artefato que sai do app para uma avaliação externa (professor,
 * nutricionista) — não os desenhava; os dois só entravam por baixo dos panos
 * na estimativa de calorias. Ver `buildCheckinSectionHtml` em `buildHtml.ts`.
 *
 * Guard de CLASSE, não de instância (mesmo padrão de
 * `stories/exportLeTudoPorRef.test.ts`): em vez de fixar os três nomes de
 * hoje, ele COMPARA as duas chamadas em `WorkoutReport.tsx` — o que vai pro
 * `<ReportCheckinPanel>` da tela e o que vai pro `buildReportHTML(...)` do
 * PDF. Campo novo em um sem o par no outro reprova sozinho.
 */

const SRC = 'src/components/WorkoutReport.tsx'
const src = readFileSync(SRC, 'utf8')

/** Do `(` ou `{` de abertura até o fechamento balanceado — ignora parênteses/chaves dentro de strings. */
function blocoBalanceado(source: string, aberturaIdx: number, abre: string, fecha: string): string {
  let depth = 0
  let quote: string | null = null
  for (let i = aberturaIdx; i < source.length; i++) {
    const ch = source[i]
    if (quote) {
      if (ch === '\\') { i++; continue }
      if (ch === quote) quote = null
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue }
    if (ch === abre) depth++
    else if (ch === fecha) {
      depth--
      if (depth === 0) return source.slice(aberturaIdx, i + 1)
    }
  }
  throw new Error('bloco não fechou — guard mediria trecho incompleto')
}

/** Tira comentário de linha e de bloco — sem isto, um `//` entre a vírgula e o
 *  próximo campo (comum nesta chamada, que é fortemente comentada) quebra o
 *  casamento do shorthand e o guard mede "campo ausente" que na verdade está
 *  presente, só com uma explicação na frente. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, '')
}

/** Identificadores VALOR de uma chamada — `prop={valor}`, `chave: valor,` e o shorthand `valor,`/`valor}`. */
function valoresDaChamada(trechoBruto: string): Set<string> {
  const trecho = stripComments(trechoBruto)
  const valores = new Set<string>()
  // Lookahead no delimitador de FECHAMENTO (`(?=[,}])`) em vez de consumi-lo:
  // consumir os dois delimitadores faz o `,` entre dois campos shorthand
  // seguidos ("preCheckin,\npostCheckin,") ser tragado pelo primeiro casamento
  // e faltar pro segundo começar — `matchAll` então pula um campo em cada dois.
  // Medido: numa lista de 3 shorthand seguidos, só o do MEIO era encontrado.
  for (const m of trecho.matchAll(/=\{\s*([A-Za-z_$][\w$]*)\s*\}/g)) valores.add(m[1])
  for (const m of trecho.matchAll(/:\s*([A-Za-z_$][\w$]*)\s*(?=[,}])/g)) valores.add(m[1])
  for (const m of trecho.matchAll(/[{,]\s*([A-Za-z_$][\w$]*)\s*(?=[,}])/g)) valores.add(m[1])
  return valores
}

describe('check-in/check-out: tela e PDF não divergem', () => {
  const panelCall = (() => {
    const i = src.indexOf('<ReportCheckinPanel')
    expect(i, '<ReportCheckinPanel> não encontrado em WorkoutReport.tsx').toBeGreaterThan(-1)
    const open = src.indexOf('<', i + 1) === -1 ? i : i // âncora já é a abertura
    const close = src.indexOf('/>', i)
    expect(close, 'fechamento /> do ReportCheckinPanel não encontrado').toBeGreaterThan(-1)
    return src.slice(i, close + 2)
  })()

  const pdfCall = (() => {
    const i = src.indexOf('buildReportHTML(')
    expect(i, 'chamada a buildReportHTML não encontrada em WorkoutReport.tsx').toBeGreaterThan(-1)
    const openParen = src.indexOf('(', i)
    return blocoBalanceado(src, openParen, '(', ')')
  })()

  it('os dois blocos existem e não estão vazios', () => {
    expect(panelCall.length).toBeGreaterThan(20)
    expect(pdfCall.length).toBeGreaterThan(50)
  })

  it('preCheckin e postCheckin chegam aos DOIS — tela e PDF', () => {
    const doPainel = valoresDaChamada(panelCall)
    const doPdf = valoresDaChamada(pdfCall)
    for (const campo of ['preCheckin', 'postCheckin']) {
      expect(doPainel.has(campo), `a TELA não recebe ${campo}`).toBe(true)
      expect(doPdf.has(campo), `o PDF não recebe ${campo} — o profissional externo fica sem essa informação`).toBe(true)
    }
  })

  it('as recomendações do check-in também chegam ao PDF', () => {
    // Nomes diferem de propósito: a prop do painel é `recommendations` (o
    // componente é genérico), a variável é `checkinRecommendations` — o que
    // importa é que a MESMA lista alimente os dois.
    expect(panelCall, 'a tela não passa recommendations ao painel').toMatch(/recommendations=\{checkinRecommendations\}/)
    const doPdf = valoresDaChamada(pdfCall)
    expect(doPdf.has('checkinRecommendations'), 'o PDF não recebe checkinRecommendations').toBe(true)
  })
})

/**
 * Guards da auditoria do relatório e do histórico (11/08/2026).
 *
 * Duas correções, e o fio comum é o mesmo: **superfícies do mesmo app tratando
 * a mesma coisa de formas diferentes**.
 *
 * 1. O card de PR desenhava arte comemorativa atrás do texto sem scrim. O
 *    contraste do nome do exercício dependia de onde a explosão dourada
 *    calhava de estar clara — no aparelho, sumia. Texto sobre imagem sem piso
 *    escuro é contraste imprevisível por construção.
 *
 * 2. O card do histórico deixava EXCLUIR como primeiro alvo da linha, sempre
 *    visível — enquanto o card de treino do dashboard já escondia a exclusão
 *    atrás de um disclosure. Ação irreversível com duas políticas no mesmo app.
 *    De quebra, os três botões somavam ~152px e truncavam o título.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(__dirname, '..', '..')
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8')

describe('card de PR — texto sobre imagem', () => {
  const src = read('workout-report/ReportHighlightsPanel.tsx')

  it('há um scrim entre a arte e o texto', () => {
    expect(src, 'sem piso escuro o contraste depende do pixel da imagem')
      .toMatch(/absolute inset-0 bg-gradient-to-t from-neutral-950/)
  })

  it('o texto sobre a arte não usa opacidade', () => {
    // `opacity-80` em texto derruba o contraste efetivo; cor sólida é previsível.
    const bloco = /detectedPrs\[0\] && \(([\s\S]{0,400}?)\)\}/.exec(src)?.[1] ?? ''
    expect(bloco).not.toBe('')
    expect(bloco).not.toMatch(/opacity-\d+/)
  })
})

describe('card do histórico — exclusão e largura', () => {
  const src = read('HistoryList.tsx')

  it('a exclusão não fica no primeiro nível', () => {
    // O primeiro nível é só o disclosure; excluir exige abrir.
    expect(src).toMatch(/acoesAbertas !== String\(session\?\.id\)/)
    expect(src).toMatch(/aria-label="Ações da sessão"/)
  })

  it('dá para fechar as ações sem executar nenhuma', () => {
    expect(src).toMatch(/aria-label="Fechar ações"/)
    expect(src).toMatch(/setAcoesAbertas\(null\)/)
  })

  it('o estado é por sessão — abrir uma não abre as outras', () => {
    // Um booleano global abriria a linha de ações da lista inteira.
    expect(src).toMatch(/useState<string \| null>\(null\)/)
  })

  it('a unidade não cola no número', () => {
    // Mesma régua tipográfica aplicada ao Iron Rank.
    expect(src).toMatch(/\\u2009t`/)
    expect(src).toMatch(/\\u2009kg`/)
  })
})

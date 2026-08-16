import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { periodToContent } from '@/components/stories/nutritionStory'

/**
 * Story de PERÍODO (semana/mês).
 *
 * O que este arquivo NÃO prova: o desenho. jsdom não implementa
 * `canvas.getContext('2d')`, então `measureText` cai em fallback e um teste de
 * render passaria verde com o story em branco — foi assim que a legenda subiu
 * invisível com 23 guards verdes. O desenho se confere no aparelho; aqui ficam
 * o adapter e os invariantes que dá para ler no código.
 */

const resumo = {
  loggedDays: 5,
  windowDays: 7,
  avgCalories: 2180,
  avgProtein: 172,
  avgCarbs: 210,
  avgFat: 68,
}

describe('periodToContent', () => {
  it('repassa a média pronta — não recalcula nada', () => {
    const c = periodToContent(resumo, { calories: 2676 }, { periodLabel: 'Semana', rangeText: '10 – 16 de ago.' })
    expect(c).toMatchObject({
      kind: 'period',
      periodLabel: 'Semana',
      rangeText: '10 – 16 de ago.',
      calories: 2180,
      protein: 172,
      carbs: 210,
      fat: 68,
      goalCalories: 2676,
    })
  })

  it('a cobertura entra no conteúdo do story', () => {
    const c = periodToContent(resumo, null, { periodLabel: 'Mês', rangeText: 'x' })
    expect(c).toMatchObject({ loggedDays: 5, windowDays: 7 })
  })

  it('sem meta salva, a meta vai zerada — nunca inventada', () => {
    const c = periodToContent(resumo, null, { periodLabel: 'Semana', rangeText: 'x' })
    expect(c).toMatchObject({ goalCalories: 0 })
  })
})

describe('o renderer do período', () => {
  const src = readFileSync(join(process.cwd(), 'src/components/stories/nutritionStory.ts'), 'utf8')
  const codigo = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

  /**
   * A cobertura é o que impede "2.180 kcal/dia" de ser lido como "todo dia do
   * mês". No story isso é grave: a imagem sai da mão do dono e ninguém do
   * outro lado tem como perguntar quantos dias ele lançou.
   */
  it('desenha "N de M dias" junto do período', () => {
    expect(codigo).toMatch(/loggedDays\)\}\s*de\s*\$\{nf\(content\.windowDays\)\}\s*dias/)
  })

  it('o rótulo do hero diz que é MÉDIA, não total do período', () => {
    expect(codigo).toMatch(/'MÉDIA POR DIA'/)
  })

  it('sem meta, o hero não escreve "/ 0 kcal"', () => {
    expect(codigo).toMatch(/content\.goalCalories > 0/)
  })
})

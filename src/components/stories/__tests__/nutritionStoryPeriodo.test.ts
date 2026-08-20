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

/**
 * "MÊS" mostrando só um número de dia (relato do dono, 19/08/2026: "deveria
 * mostrar o total do mês, não? do jeito que está só mostra o do dia").
 *
 * A média por dia continua sendo o número grande — é ela que se compara com a
 * meta DIÁRIA. O que faltava era (a) o total do período e (b) deixar claro que
 * os macros também são média, não soma.
 */
describe('período mostra média E total, sem confundir os dois', () => {
  const comTotais = {
    ...resumo,
    totalCalories: 10900,
    totalProtein: 860,
    totalCarbs: 1050,
    totalFat: 340,
  }

  it('o adapter repassa os totais prontos do summarize', () => {
    const c = periodToContent(comTotais, { calories: 2676 }, { periodLabel: 'Mês', rangeText: '21 jul – 19 ago' })
    expect(c).toMatchObject({
      calories: 2180, // média/dia continua sendo o hero
      totalCalories: 10900,
      totalProtein: 860,
      totalCarbs: 1050,
      totalFat: 340,
    })
  })

  it('resumo antigo (sem totais) não quebra — vira 0 e a linha some', () => {
    const c = periodToContent(resumo, { calories: 2676 }, { periodLabel: 'Mês', rangeText: '—' })
    expect(c).toMatchObject({ totalCalories: 0, totalProtein: 0 })
  })

  it('o desenho rotula os macros do período como POR DIA', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/stories/nutritionStory.ts'), 'utf8')
    // Sem o sufixo, "144g" ao lado de um título "MÊS" lê como total do mês.
    expect(src).toContain("'PROTEÍNA/DIA'")
    expect(src).toContain("'CARBO/DIA'")
    expect(src).toContain("'GORDURA/DIA'")
  })

  it('o desenho só imprime o total quando ele existe', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/stories/nutritionStory.ts'), 'utf8')
    expect(src).toMatch(/content\.kind === 'period' && content\.totalCalories > 0/)
  })
})

describe('o editor de story escapa do stacking context', () => {
  // Bug: "sem botão para sair dessa tela". O composer nasce dentro do
  // NutritionOverlay (`fixed … z-[25]`), que cria stacking context — o
  // `z-[2500]` do composer virava 25 contra o resto da página, o cabeçalho do
  // app cobria o topo e o botão Voltar ficava inalcançável.
  const composers = [
    'src/components/NutritionStoryComposer.tsx',
    'src/components/CardioStoryComposer.tsx',
    'src/components/MetricsStoryComposer.tsx',
  ]

  it('os TRÊS composers renderizam em portal', () => {
    for (const arquivo of composers) {
      const src = readFileSync(join(process.cwd(), arquivo), 'utf8')
      expect(src, `${arquivo} sem portal`).toContain('<FullscreenPortal>')
    }
  })

  it('o portal vai para o document.body, não para um container qualquer', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/stories/FullscreenPortal.tsx'), 'utf8')
    expect(src).toMatch(/createPortal\(children, document\.body\)/)
  })

  it('cada composer mantém um botão de sair com nome acessível', () => {
    for (const arquivo of composers) {
      const src = readFileSync(join(process.cwd(), arquivo), 'utf8')
      expect(src, `${arquivo} sem botão de voltar`).toMatch(/aria-label="Voltar"/)
    }
  })
})

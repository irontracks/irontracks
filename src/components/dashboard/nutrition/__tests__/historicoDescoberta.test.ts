import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Descoberta do histórico de refeições.
 *
 * O dono não achou (16/08/2026): a única entrada era um ícone de calendário
 * mudo ao lado das setas de data — e num navegador de datas esse ícone lê como
 * "escolher data", não como "ver o passado". Ele foi procurar no menu do
 * avatar, que é onde mora o histórico de TREINOS.
 *
 * Duas entradas agora: rótulo visível na aba e item próprio no menu.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('entrada na aba de nutrição', () => {
  const nav = read('src/components/dashboard/nutrition/DateNavigator.tsx')

  it('o botão tem RÓTULO, não só ícone', () => {
    const bloco = nav.slice(nav.indexOf('onOpenHistory && ('))
    expect(bloco, 'ícone sozinho é atalho para quem já sabe que a função existe')
      .toMatch(/>\s*Histórico\s*</)
  })

  it('continua com nome acessível e alvo de 44pt', () => {
    const bloco = nav.slice(nav.indexOf('onOpenHistory && ('))
    expect(bloco).toMatch(/aria-label="Histórico de nutrição"/)
    expect(bloco).toMatch(/tap-44/)
  })
})

describe('entrada no menu do avatar', () => {
  const menu = read('src/components/HeaderActionsMenu.tsx')

  it('os dois históricos são nomeados — "Histórico" sozinho virou ambíguo', () => {
    expect(menu).toMatch(/label="Histórico de treinos"/)
    expect(menu).toMatch(/label="Histórico de refeições"/)
    expect(menu, 'o rótulo genérico não pode voltar').not.toMatch(/label="Histórico"/)
  })

  it('o item de refeições some quando o app não passa o callback', () => {
    // O menu serve telas que não têm nutrição; item que não leva a lugar
    // nenhum é pior que item ausente.
    expect(menu).toMatch(/\{onOpenNutritionHistory\s*&&\s*\(/)
  })
})

describe('fiação do menu até a lista', () => {
  const app = read('src/app/(app)/dashboard/IronTracksAppClientImpl.tsx')
  const header = read('src/app/(app)/dashboard/DashboardHeader.tsx')
  const overlay = read('src/components/dashboard/nutrition/NutritionOverlay.tsx')
  const mixer = read('src/components/dashboard/nutrition/NutritionMixer.tsx')

  it('o menu chega ao dashboard', () => {
    expect(header).toMatch(/onOpenNutritionHistory=\{onOpenNutritionHistory\}/)
    expect(app).toMatch(/onOpenNutritionHistory=\{openNutritionHistory\}/)
  })

  it('a intenção atravessa até o mixer', () => {
    expect(app).toMatch(/openHistoryOnMount=\{nutritionHistoryOnOpen\}/)
    expect(overlay).toMatch(/openHistoryOnMount=\{openHistoryOnMount\}/)
    expect(mixer).toMatch(/useState\(Boolean\(openHistoryOnMount\)\)/)
  })

  /**
   * Sem zerar, reabrir a aba pela barra cairia no histórico de novo — o app
   * repetindo uma ordem que o usuário deu uma vez só.
   */
  it('a intenção é zerada ao fechar a nutrição', () => {
    expect(app).toMatch(/setNutritionOpen\(false\);\s*setNutritionHistoryOnOpen\(false\)/)
  })
})

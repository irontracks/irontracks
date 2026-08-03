import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Botão "Metas" do card Macronutrientes.
 *
 * O dono reportou que ele estava "quase invisível" (ago/2026). Não era a cor: era
 * que aquilo NÃO ERA UM BOTÃO — texto de 10px, sem borda, sem fundo, sem padding,
 * com alvo de toque de ~12px de altura. A HIG da Apple e o WCAG 2.5.5 pedem 44pt,
 * e o app é usado com a mão suada no meio do treino.
 *
 * Source-guard porque o botão vive dentro do NutritionMixer (1400 linhas), cujo
 * render exige Supabase, dynamic imports e meia dúzia de providers. O que precisa
 * ser travado aqui é a FORMA do controle, e ela é legível no fonte.
 */
describe('botão Metas — affordance e alvo de toque', () => {
  const src = readFileSync('src/components/dashboard/nutrition/NutritionMixer.tsx', 'utf8')

  /** O bloco do botão, isolado pelo handler que só ele tem. */
  const button = (() => {
    const anchor = src.indexOf('setGoalsOpen(v => !v)')
    expect(anchor, 'botão de metas não encontrado no Mixer').toBeGreaterThan(-1)
    const start = src.lastIndexOf('<button', anchor)
    const end = src.indexOf('</button>', anchor)
    return src.slice(start, end)
  })()

  it('parece um botão: tem fundo, borda e raio', () => {
    // A regressão original era um <button> estilizado só com cor de texto.
    expect(button).toMatch(/bg-yellow-500/)
    expect(button).toMatch(/border/)
    expect(button).toMatch(/rounded-full/)
  })

  it('tem altura real e área de toque estendida', () => {
    expect(button, 'altura do controle').toMatch(/h-9/)
    // Estende o alvo para ~44px sem inflar o layout do cabeçalho.
    expect(button, 'área de toque estendida').toMatch(/before:-inset-2/)
  })

  it('usa ícone lucide, não emoji do sistema', () => {
    // ⚙ e ✕ renderizavam com a cor do glifo do sistema (cinza), brigando com o
    // amarelo do rótulo — e destoando dos componentes irmãos, que usam lucide.
    expect(button).not.toMatch(/⚙|✕/)
    expect(button).toMatch(/SlidersHorizontal|<X\s/)
  })

  it('mantém o rótulo "Metas" nos dois estados', () => {
    // Trocar o rótulo por "Fechar" ao abrir quebrava a permanência do objeto: o
    // usuário perdia a referência do que acabou de tocar. Só o ícone muda.
    expect(button).not.toMatch(/'✕ Fechar'|>\s*Fechar\s*</)
    expect(button).toMatch(/Metas/)
  })

  it('anuncia o estado a leitor de tela', () => {
    expect(button).toMatch(/aria-expanded=\{goalsOpen\}/)
    expect(button).toMatch(/aria-label=/)
  })

  it('o rótulo não volta para o tamanho ilegível de 10px', () => {
    expect(button).toMatch(/text-\[11px\]/)
    expect(button).not.toMatch(/text-\[10px\]/)
  })
})

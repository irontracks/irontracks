import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

import MacroBar, { MACRO_COLORS, MACRO_OVER_COLOR } from '../MacroBar'

/**
 * Barra de macronutriente do card Macronutrientes.
 *
 * O card foi refeito em ago/2026 depois de o dono chamá-lo de "confuso e amador".
 * Os guards abaixo travam as três correções — todas com potencial de voltar em
 * silêncio numa refatoração de estilo.
 */
/** jsdom serializa `background-color` como `rgb(...)`, nunca como hex. */
const rgb = (hex: string): string => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  return `rgb(${r}, ${g}, ${b})`
}

describe('MacroBar', () => {
  it('mostra consumido, meta e o quanto FALTA — sem exigir conta de cabeça', () => {
    render(<MacroBar label="Proteína" value={60} goal={208} color={MACRO_COLORS.protein} />)
    expect(screen.getByText(/60 \/ 208 g/)).toBeDefined()
    expect(screen.getByText(/faltam 148 g/)).toBeDefined()
  })

  it('em zero, informa a meta inteira como pendente em vez de um vazio mudo', () => {
    render(<MacroBar label="Proteína" value={0} goal={208} color={MACRO_COLORS.protein} />)
    expect(screen.getByText(/0 \/ 208 g/)).toBeDefined()
    expect(screen.getByText(/faltam 208 g/)).toBeDefined()
  })

  /**
   * O percentual dizia na tela o que a barra já desenha — quarta codificação do
   * mesmo fato na mesma linha. Saiu do visual e continua no `aria-valuetext`,
   * então quem usa leitor de tela não perde nada.
   */
  it('não repete na tela o percentual que a barra já mostra', () => {
    const { container } = render(
      <MacroBar label="Proteína" value={60} goal={208} color={MACRO_COLORS.protein} />,
    )
    expect(container.textContent).not.toMatch(/%/)
    expect(screen.getByRole('progressbar', { name: 'Proteína' }).getAttribute('aria-valuetext'))
      .toContain('29%')
  })

  /**
   * O trilho dividia a linha com a legenda (`flex-1` + `min-w`), então
   * "faltam 122 g" encolhia a própria barra e as três do card ficavam com
   * comprimentos diferentes — réguas de escalas distintas empilhadas num card
   * que existe para comparar. Nada mais pode ocupar a linha da barra.
   */
  it('a barra ocupa a linha inteira — nenhum texto divide espaço com ela', () => {
    const { container } = render(
      <MacroBar label="Carboidratos" value={173} goal={295} color={MACRO_COLORS.carbs} />,
    )
    const trilho = screen.getByRole('progressbar', { name: 'Carboidratos' })
    expect(trilho.className).toContain('w-full')
    expect(trilho.className).not.toContain('flex-1')

    // O trilho não pode estar dentro de uma linha horizontal: era o `flex` com
    // a legenda ao lado que roubava largura dele.
    expect((trilho.parentElement as HTMLElement).className).not.toContain('flex')
    // E nenhuma reserva de largura para texto sobrou no componente.
    expect(container.querySelector('[class*="min-w-["]')).toBeNull()
  })

  /**
   * Cor de categoria é da BARRA (mínimo 3:1). Como TEXTO de 10px o azul do
   * carboidrato dava ~3,7:1 sobre #0a0a0a — reprovado no WCAG AA, e lido de
   * relance numa academia.
   */
  it('a cor da categoria não é usada em texto pequeno', () => {
    const { container } = render(
      <MacroBar label="Carboidratos" value={173} goal={295} color={MACRO_COLORS.carbs} />,
    )
    const pintados = Array.from(container.querySelectorAll<HTMLElement>('[style*="color"]'))
      .filter((el) => el.style.color && !el.style.backgroundColor)
    expect(pintados).toHaveLength(0)
  })

  it('meta batida exata não vira "faltam 0 g"', () => {
    render(<MacroBar label="Gordura" value={74} goal={74} color={MACRO_COLORS.fat} />)
    expect(screen.getByText(/meta batida/)).toBeDefined()
    expect(screen.queryByText(/faltam/)).toBeNull()
  })

  it('VERMELHO só aparece quando estoura a meta — nunca como cor de macro', () => {
    // A regressão original: gordura era #ef4444, a cor de ERRO do app. Em 0/74g o
    // usuário lia "algo está errado" sobre um dia que só não tinha começado.
    const { container, rerender } = render(
      <MacroBar label="Gordura" value={0} goal={74} color={MACRO_COLORS.fat} />,
    )
    expect(container.innerHTML).not.toContain(rgb(MACRO_OVER_COLOR))
    expect(container.querySelector('.text-red-400')).toBeNull()

    rerender(<MacroBar label="Gordura" value={90} goal={74} color={MACRO_COLORS.fat} />)
    expect(container.innerHTML).toContain(rgb(MACRO_OVER_COLOR))
    expect(screen.getByText(/\+16 g acima/)).toBeDefined()
  })

  it('no estouro, mantém a barra da categoria e sobrepõe só o excesso', () => {
    // Pintar tudo de vermelho apagaria a informação de que a meta foi ATINGIDA.
    const { container } = render(
      <MacroBar label="Carboidratos" value={150} goal={100} color={MACRO_COLORS.carbs} />,
    )
    const html = container.innerHTML
    expect(html).toContain(rgb(MACRO_COLORS.carbs))
    expect(html).toContain(rgb(MACRO_OVER_COLOR))
    expect(screen.getByText(/\+50 g acima/)).toBeDefined()
    expect(screen.queryByText(/faltam/)).toBeNull()
  })

  it('as três cores de categoria são distinguíveis entre si', () => {
    // Antes, proteína #fbbf24 e carbo #f59e0b eram a mesma cor a olho nu.
    const values = Object.values(MACRO_COLORS)
    expect(new Set(values).size).toBe(values.length)
    expect(values).not.toContain(MACRO_OVER_COLOR)
  })

  it('qualquer registro > 0 desenha barra visível, por menor que seja', () => {
    // 1g de 208g arredonda para 0% e desenharia nada — mentindo que não há registro.
    const { container } = render(
      <MacroBar label="Proteína" value={1} goal={208} color={MACRO_COLORS.protein} />,
    )
    const fill = container.querySelector('[style*="width"]') as HTMLElement | null
    expect(fill).not.toBeNull()
    expect(parseFloat(fill!.style.width)).toBeGreaterThan(0)
  })

  it('expõe progresso a leitor de tela, com o estado por extenso', () => {
    render(<MacroBar label="Proteína" value={60} goal={208} color={MACRO_COLORS.protein} />)
    const bar = screen.getByRole('progressbar', { name: 'Proteína' })
    expect(bar.getAttribute('aria-valuenow')).toBe('60')
    expect(bar.getAttribute('aria-valuemax')).toBe('208')
    expect(bar.getAttribute('aria-valuetext')).toContain('60 de 208 gramas')
  })

  /**
   * Proximidade: o par rótulo+barra tem que ler como UM bloco, mais junto do que
   * dois macros vizinhos. Com a legenda ainda ao lado da barra isso se resolvia
   * sozinho; depois que ela saiu, `space-y-3` (12px) entre macros deixou cada
   * trilho parecendo pertencer ao macro de BAIXO.
   *
   * O limite é 16px, e ele NÃO sai de "maior que os 6px internos" — 12px também
   * é maior e mesmo assim errou, porque o leading do texto do rótulo soma ao
   * espaço interno e come a diferença. 16px foi o valor CONFERIDO na tela do
   * simulador; este guard só impede que ele volte a encolher. A prova de que o
   * agrupamento lê certo é visual, não deste arquivo.
   */
  it('macros vizinhos ficam a 16px — o par rótulo+barra tem que ler como um bloco', () => {
    const mixer = readFileSync(join(__dirname, '..', 'NutritionMixer.tsx'), 'utf8')
    const wrapper = mixer.match(/<div className="space-y-([\d.]+)">\s*<MacroBar/)
    expect(wrapper, 'os três MacroBar precisam de um wrapper com espaçamento próprio').not.toBeNull()
    expect(parseFloat(wrapper![1]) * 4, 'medido no simulador: abaixo de 16px o agrupamento inverte')
      .toBeGreaterThanOrEqual(16)
  })

  it('meta zerada não quebra nem gera NaN/Infinity na tela', () => {
    const { container } = render(<MacroBar label="Gordura" value={10} goal={0} color={MACRO_COLORS.fat} />)
    expect(container.innerHTML).not.toContain('NaN')
    expect(container.innerHTML).not.toContain('Infinity')
  })
})

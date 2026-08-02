import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

import PhaseSelector from '../PhaseSelector'
import { computeGoalsForPhase } from '@/lib/nutrition/phase'
import type { UserStats } from '@/lib/nutrition/goals'

/**
 * Seletor de fase da dieta (Cutting / Manutenção / Off) do painel ⚙ Metas.
 *
 * INVARIANTE CENTRAL: clicar numa fase NÃO grava nada — só devolve a escolha para o
 * painel preencher os campos. Quem persiste é o botão Salvar. Aplicar direto apagaria
 * sem aviso o ajuste manual de macros que o usuário tivesse feito antes, que foi
 * exatamente a alternativa descartada no desenho da feature.
 */
describe('PhaseSelector', () => {
  it('mostra as três fases na ordem déficit → superávit', () => {
    render(<PhaseSelector value="MAINTAIN" onSelect={vi.fn()} />)
    const labels = screen.getAllByRole('radio').map(b => b.textContent)
    expect(labels[0]).toContain('Cutting')
    expect(labels[1]).toContain('Manutenção')
    expect(labels[2]).toContain('Off')
  })

  it('marca como selecionada só a fase em vigor', () => {
    render(<PhaseSelector value="CUT" onSelect={vi.fn()} />)
    const [cut, maintain, off] = screen.getAllByRole('radio')
    expect(cut).toHaveAttribute('aria-checked', 'true')
    expect(maintain).toHaveAttribute('aria-checked', 'false')
    expect(off).toHaveAttribute('aria-checked', 'false')
  })

  it('clicar numa fase apenas NOTIFICA a escolha — não persiste', () => {
    const onSelect = vi.fn()
    render(<PhaseSelector value="MAINTAIN" onSelect={onSelect} />)

    fireEvent.click(screen.getAllByRole('radio')[0])
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('CUT')

    // O componente é controlado: sem o pai mudar `value`, a marcação não muda
    // sozinha. É o que garante que a UI reflete o draft do painel, não um estado
    // paralelo que poderia divergir do que será salvo.
    expect(screen.getAllByRole('radio')[0]).toHaveAttribute('aria-checked', 'false')
  })

  it('avisa que a fase foi DERIVADA quando o usuário nunca escolheu', () => {
    const { rerender } = render(<PhaseSelector value="BULK" onSelect={vi.fn()} isExplicit={false} />)
    expect(screen.getByText('sugerida pelo seu objetivo')).toBeDefined()

    // Escolha explícita → o aviso some (não é mais uma suposição do app).
    rerender(<PhaseSelector value="BULK" onSelect={vi.fn()} isExplicit />)
    expect(screen.queryByText('sugerida pelo seu objetivo')).toBeNull()
  })

  it('após clicar, instrui a conferir e salvar — a mudança ainda não está gravada', () => {
    const { rerender } = render(<PhaseSelector value="CUT" onSelect={vi.fn()} touched={false} />)
    expect(screen.queryByText(/toque em Salvar/i)).toBeNull()

    rerender(<PhaseSelector value="CUT" onSelect={vi.fn()} touched />)
    expect(screen.getByText(/Metas recalculadas do seu TDEE/i)).toBeDefined()
    expect(screen.getByText(/toque em Salvar/i)).toBeDefined()
  })

  it('descreve a fase marcada, e a descrição acompanha a troca', () => {
    const { rerender } = render(<PhaseSelector value="CUT" onSelect={vi.fn()} />)
    expect(screen.getByText(/Déficit para perder gordura/i)).toBeDefined()

    rerender(<PhaseSelector value="BULK" onSelect={vi.fn()} />)
    expect(screen.queryByText(/Déficit para perder gordura/i)).toBeNull()
    expect(screen.getByText(/Superávit para ganhar massa/i)).toBeDefined()
  })
})

describe('integração seletor → metas preenchidas', () => {
  const STATS: UserStats = { weight: 80, height: 180, age: 30, gender: 'MALE', activityLevel: 'MODERATE' }

  it('a fase clicada é a que alimenta o recálculo do painel', () => {
    // Reproduz a fiação do NutritionMixer: onSelect → computeGoalsForPhase → draft.
    let draft: { calories: number; protein: number; carbs: number; fat: number } | null = null
    const onSelect = (phase: 'CUT' | 'MAINTAIN' | 'BULK') => {
      draft = computeGoalsForPhase(STATS, phase)
    }

    render(<PhaseSelector value="MAINTAIN" onSelect={onSelect} />)
    fireEvent.click(screen.getAllByRole('radio')[0]) // Cutting
    expect(draft).toEqual(computeGoalsForPhase(STATS, 'CUT'))

    fireEvent.click(screen.getAllByRole('radio')[2]) // Off
    expect(draft).toEqual(computeGoalsForPhase(STATS, 'BULK'))
    expect(draft!.calories).toBeGreaterThan(computeGoalsForPhase(STATS, 'CUT')!.calories)
  })
})

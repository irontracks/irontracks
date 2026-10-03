import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import MedicationTodayList, { horaBrt } from '../MedicationTodayList'
import type { DoseDoDia } from '@/lib/medications/agenda'

const dose = (extra: Partial<DoseDoDia> = {}): DoseDoDia => ({
  userId: 'u1',
  medicationId: 'm1',
  nome: 'Losartana',
  dose: '50 mg',
  time: '08:00',
  dateKey: '2026-10-03',
  tomada: false,
  takenAt: null,
  ...extra,
})

describe('MedicationTodayList', () => {
  it('"Tomei" chama o handler com o remédio e o horário da dose', () => {
    const onTake = vi.fn()
    render(<MedicationTodayList doses={[dose()]} onTake={onTake} onUndo={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Tomei/ }))
    expect(onTake).toHaveBeenCalledWith('m1', '08:00')
  })

  it('mostra a linha no formato "08:00 · Losartana · 50 mg"', () => {
    render(<MedicationTodayList doses={[dose()]} onTake={vi.fn()} onUndo={vi.fn()} />)
    expect(screen.getByText(/08:00/).closest('p')?.textContent).toBe('08:00 · Losartana · 50 mg')
  })

  it('dose tomada mostra "Tomado às" em BRT e oferece Desfazer no lugar do Tomei', () => {
    const onUndo = vi.fn()
    // 11:03Z = 08:03 em São Paulo — a hora tem de ser BRT, não a do aparelho.
    render(
      <MedicationTodayList
        doses={[dose({ tomada: true, takenAt: '2026-10-03T11:03:00Z' })]}
        onTake={vi.fn()}
        onUndo={onUndo}
      />,
    )
    expect(screen.getByText('Tomado às 08:03')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Tomei/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Desfazer/ }))
    expect(onUndo).toHaveBeenCalledWith('m1', '08:00')
  })

  it('sem doses hoje: uma linha só', () => {
    render(<MedicationTodayList doses={[]} onTake={vi.fn()} onUndo={vi.fn()} />)
    expect(screen.getByText('Nenhuma dose hoje.')).toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('dose pendente NÃO usa vermelho nem âmbar — verde é só para o tomado', () => {
    const { container } = render(
      <MedicationTodayList
        doses={[dose(), dose({ medicationId: 'm2', nome: 'Metformina', tomada: true, takenAt: '2026-10-03T11:00:00Z' })]}
        onTake={vi.fn()}
        onUndo={vi.fn()}
      />,
    )
    const itens = container.querySelectorAll('li')
    expect(itens[0].innerHTML).not.toMatch(/red-|amber-|orange-|emerald-|green-/)
    expect(itens[1].innerHTML).toMatch(/emerald-/)
  })

  it('horaBrt devolve vazio para instante inválido em vez de "Invalid Date"', () => {
    expect(horaBrt('lixo')).toBe('')
    expect(horaBrt(null)).toBe('')
  })
})

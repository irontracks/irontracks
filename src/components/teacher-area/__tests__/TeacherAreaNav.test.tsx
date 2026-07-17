import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { TeacherAreaNav } from '../TeacherAreaNav'

describe('TeacherAreaNav', () => {
  it('mostra as 4 seções primárias + botão Mais', () => {
    render(<TeacherAreaNav activeTab="dashboard" onSelect={() => {}} />)
    for (const label of ['Início', 'Alunos', 'Treinos', 'Financeiro', 'Mais']) {
      expect(screen.getByText(label)).toBeTruthy()
    }
  })

  it('clicar numa seção primária chama onSelect com a key', () => {
    const onSelect = vi.fn()
    render(<TeacherAreaNav activeTab="dashboard" onSelect={onSelect} />)
    fireEvent.click(screen.getByText('Alunos'))
    expect(onSelect).toHaveBeenCalledWith('students')
  })

  it('"Mais" abre o sheet e permite escolher Prioridades', () => {
    const onSelect = vi.fn()
    render(<TeacherAreaNav activeTab="dashboard" onSelect={onSelect} />)
    // Prioridades não está visível antes de abrir o "Mais"
    expect(screen.queryByText('Prioridades')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Mais seções/i }))
    fireEvent.click(screen.getByText('Prioridades'))
    expect(onSelect).toHaveBeenCalledWith('priorities')
  })

  it('a seção ativa recebe aria-current', () => {
    render(<TeacherAreaNav activeTab="templates" onSelect={() => {}} />)
    const treinos = screen.getByText('Treinos').closest('button')
    expect(treinos?.getAttribute('aria-current')).toBe('page')
  })
})

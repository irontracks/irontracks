import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import type { AdminUser } from '@/types/admin'
import { ApplyWorkoutToStudentsModal } from '../ApplyWorkoutToStudentsModal'

const students = [
  { id: 's1', user_id: 'uid-a', name: 'Ana', email: 'ana@x.com' },
  { id: 's2', user_id: 'uid-b', name: 'Bruno', email: 'bruno@x.com' },
] as unknown as AdminUser[]

describe('ApplyWorkoutToStudentsModal', () => {
  it('começa sem seleção: botão aplicar desabilitado', () => {
    render(<ApplyWorkoutToStudentsModal workoutName="Treino A" students={students} onClose={() => {}} onApply={() => {}} />)
    const apply = screen.getByRole('button', { name: /Aplicar a 0 alunos/i })
    expect(apply).toBeDisabled()
  })

  it('selecionar um aluno habilita e o Aplicar leva só o id escolhido', () => {
    const onApply = vi.fn()
    render(<ApplyWorkoutToStudentsModal workoutName="Treino A" students={students} onClose={() => {}} onApply={onApply} />)
    fireEvent.click(screen.getByRole('button', { name: /Ana/ }))
    const apply = screen.getByRole('button', { name: /Aplicar a 1 aluno$/i })
    expect(apply).not.toBeDisabled()
    fireEvent.click(apply)
    expect(onApply).toHaveBeenCalledWith(['uid-a'])
  })

  it('"Selecionar todos" marca todos e o Aplicar leva todos os ids', () => {
    const onApply = vi.fn()
    render(<ApplyWorkoutToStudentsModal workoutName="Treino A" students={students} onClose={() => {}} onApply={onApply} />)
    fireEvent.click(screen.getByRole('button', { name: /Selecionar todos/i }))
    fireEvent.click(screen.getByRole('button', { name: /Aplicar a 2 alunos/i }))
    expect(onApply).toHaveBeenCalledWith(['uid-a', 'uid-b'])
  })

  it('desmarcar um aluno tira o id da seleção', () => {
    const onApply = vi.fn()
    render(<ApplyWorkoutToStudentsModal workoutName="Treino A" students={students} onClose={() => {}} onApply={onApply} />)
    fireEvent.click(screen.getByRole('button', { name: /Selecionar todos/i }))
    fireEvent.click(screen.getByRole('button', { name: /Bruno/ })) // desmarca Bruno
    fireEvent.click(screen.getByRole('button', { name: /Aplicar a 1 aluno$/i }))
    expect(onApply).toHaveBeenCalledWith(['uid-a'])
  })

  it('lista vazia mostra aviso e não renderiza o botão aplicar', () => {
    render(<ApplyWorkoutToStudentsModal workoutName="Treino A" students={[]} onClose={() => {}} onApply={() => {}} />)
    expect(screen.getByText(/Nenhum aluno com conta/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Aplicar a/i })).toBeNull()
  })

  it('clicar no overlay (fundo) fecha', () => {
    const onClose = vi.fn()
    render(<ApplyWorkoutToStudentsModal workoutName="Treino A" students={students} onClose={onClose} onApply={() => {}} />)
    // Há dois controles "Fechar" (fundo + X do cabeçalho); o primeiro é o overlay.
    act(() => { fireEvent.click(screen.getAllByRole('button', { name: 'Fechar' })[0]) })
    expect(onClose).toHaveBeenCalled()
  })
})

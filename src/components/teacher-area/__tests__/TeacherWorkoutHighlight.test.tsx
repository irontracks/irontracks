import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { TeacherWorkoutHighlight } from '../TeacherWorkoutHighlight'

describe('TeacherWorkoutHighlight', () => {
  it('destaca o sistema de treinos com os dois atalhos', () => {
    render(<TeacherWorkoutHighlight onOpenWorkouts={() => {}} onOpenStudents={() => {}} />)
    expect(screen.getByText(/Monte o treino dos seus alunos/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Montar treino/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Treino por aluno/i })).toBeTruthy()
  })

  it('"Montar treino" leva à biblioteca de treinos', () => {
    const onOpenWorkouts = vi.fn()
    render(<TeacherWorkoutHighlight onOpenWorkouts={onOpenWorkouts} onOpenStudents={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Montar treino/i }))
    expect(onOpenWorkouts).toHaveBeenCalled()
  })

  it('"Treino por aluno" leva à lista de alunos', () => {
    const onOpenStudents = vi.fn()
    render(<TeacherWorkoutHighlight onOpenWorkouts={() => {}} onOpenStudents={onOpenStudents} />)
    fireEvent.click(screen.getByRole('button', { name: /Treino por aluno/i }))
    expect(onOpenStudents).toHaveBeenCalled()
  })
})

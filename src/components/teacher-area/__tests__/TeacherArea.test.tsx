import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

// dynamic() → stub (as tabs pesadas viram no-op; testamos o shell, não elas)
vi.mock('next/dynamic', () => ({ default: () => { const Stub = () => null; return Stub } }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }))
// Controller + provider + tabs estáticas → stubs controláveis
const ctrl: Record<string, unknown> = {
  tab: 'dashboard', setTab: vi.fn(),
  isTeacher: true, isAdmin: false,
  selectedStudent: null, setSelectedStudent: vi.fn(),
}
vi.mock('@/components/admin-panel/useAdminPanelController', () => ({ useAdminPanelController: () => ctrl }))
vi.mock('@/components/admin-panel/AdminPanelContext', () => ({ AdminPanelProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('@/components/admin-panel/DashboardTab', () => ({ DashboardTab: () => <div>STUB_DASHBOARD</div> }))
vi.mock('@/components/admin-panel/StudentsTab', () => ({ StudentsTab: () => <div>STUB_STUDENTS</div> }))
vi.mock('@/components/admin-panel/PrioritiesTab', () => ({ PrioritiesTab: () => <div>STUB_PRIORITIES</div> }))
vi.mock('@/components/admin-panel/Modals', () => ({ Modals: () => null }))

import TeacherArea from '../TeacherArea'
import type { AdminUser } from '@/types/admin'

const teacher = { id: 't1', name: 'Prof. Maicon', role: 'teacher' } as unknown as AdminUser

describe('TeacherArea (shell)', () => {
  it('renderiza a identidade "Área do professor" e o nome do professor', () => {
    render(<TeacherArea user={teacher} onClose={() => {}} />)
    expect(screen.getByText('Área do professor')).toBeTruthy()
    expect(screen.getByText('Prof. Maicon')).toBeTruthy()
  })

  it('mostra a seção ativa (dashboard) e a bottom nav', () => {
    render(<TeacherArea user={teacher} onClose={() => {}} />)
    expect(screen.getByText('STUB_DASHBOARD')).toBeTruthy()
    expect(screen.getByText('Início')).toBeTruthy()
    expect(screen.getByText('Alunos')).toBeTruthy()
  })

  it('clicar numa seção da nav troca o tab pelo controller', () => {
    render(<TeacherArea user={teacher} onClose={() => {}} />)
    fireEvent.click(screen.getByText('Alunos'))
    expect(ctrl.setTab).toHaveBeenCalledWith('students')
  })

  it('o botão fechar chama onClose', () => {
    const onClose = vi.fn()
    render(<TeacherArea user={teacher} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('não-professor não fica em spinner eterno: vê "Acesso restrito" após o timer', () => {
    // Regressão achada na revisão: sem o timer, um não-coach que abrisse a URL
    // ficava em "Carregando..." pra sempre.
    vi.useFakeTimers()
    ctrl.isTeacher = false
    ctrl.isAdmin = false
    try {
      const student = { id: 'u1', name: 'Aluno', role: 'student' } as unknown as AdminUser
      render(<TeacherArea user={student} onClose={() => {}} />)
      expect(screen.getByText(/Carregando Área do professor/i)).toBeTruthy()
      act(() => { vi.advanceTimersByTime(3100) })
      expect(screen.getByText(/Acesso restrito/i)).toBeTruthy()
    } finally {
      ctrl.isTeacher = true
      ctrl.isAdmin = false
      vi.useRealTimers()
    }
  })
})

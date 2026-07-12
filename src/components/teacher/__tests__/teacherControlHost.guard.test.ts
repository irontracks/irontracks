import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Regression guard — "aceita e não abre o treino do aluno".
 *
 * Bug: a auto-abertura do controle + o TeacherControlModal viviam DENTRO do
 * StudentsTab (aba de alunos). Se o professor pedisse o controle pelo banner do
 * dashboard e não estivesse na aba de alunos, o aceite do aluno não abria nada.
 *
 * Fix: TeacherControlHost montado no SHELL do dashboard (qualquer view). Abre na
 * transição pra controle ativo, por evento explícito (botão do StudentsTab) e no
 * tap do push "Controle aceito!".
 */
describe('TeacherControlHost — abre o controle em qualquer tela', () => {
  const host = readFileSync('src/components/teacher/TeacherControlHost.tsx', 'utf8')
  const shell = readFileSync('src/app/(app)/dashboard/IronTracksAppClientImpl.tsx', 'utf8')
  const studentsTab = readFileSync('src/components/admin-panel/StudentsTab.tsx', 'utf8')
  const push = readFileSync('src/hooks/usePushNotifications.ts', 'utf8')

  it('o host é montado no shell do dashboard (global, para coach)', () => {
    expect(shell).toContain('TeacherControlHost')
    expect(shell).toMatch(/isCoach\s*&&\s*<TeacherControlHost/)
  })

  it('o host renderiza o TeacherControlModal e escuta o evento de abertura', () => {
    expect(host).toContain('TeacherControlModal')
    expect(host).toContain('OPEN_TEACHER_CONTROL_EVENT')
    expect(host).toContain('useTeacherStudentSessions')
    // Abre na TRANSIÇÃO pra ativo (não no estado parado → não reabre após fechar).
    expect(host).toMatch(/prevActiveRef/)
  })

  it('StudentsTab NÃO renderiza mais o modal — delega via evento', () => {
    expect(studentsTab).not.toContain('<TeacherControlModal')
    expect(studentsTab).toContain('openTeacherControl')
    expect(studentsTab).toContain('OPEN_TEACHER_CONTROL_EVENT')
  })

  it('o push "Controle aceito!" abre o controle (fallback de background)', () => {
    expect(push).toContain("type === 'teacher_control_accepted'")
    expect(push).toContain('irontracks:teacher-control:open')
  })

  it('host e StudentsTab usam canais Realtime distintos (sem colisão de tópico)', () => {
    // O host passa um sufixo de canal pra não colidir com o do StudentsTab.
    expect(host).toContain("'host'")
    const hook = readFileSync('src/hooks/useTeacherStudentSessions.ts', 'utf8')
    expect(hook).toContain('channelSuffix')
  })
})

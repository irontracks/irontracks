/**
 * Autorização de "notificar aluno sobre agendamento" (POST /api/notifications/appointment-created).
 *
 * Segurança (auditoria push 2026-07): a checagem antiga era
 *   `if (student.teacher_id && student.teacher_id !== user.id && role !== 'admin') 403`
 * que faz CURTO-CIRCUITO quando `teacher_id` é NULL — qualquer conta `teacher` conseguia
 * disparar push/notificação com título/corpo arbitrários pra qualquer aluno órfão
 * (teacher_id nulo). Havia ~20 alunos órfãos reais com user_id em produção. Fail-closed:
 * só passa admin OU o professor DAQUELE aluno (teacher_id não-nulo batendo com o caller).
 */
export function canNotifyStudentAppointment(input: {
  role: string | null | undefined
  studentTeacherId: string | null | undefined
  callerId: string | null | undefined
}): boolean {
  if (input.role === 'admin') return true
  const teacherId = input.studentTeacherId
  const caller = input.callerId
  return Boolean(teacherId) && Boolean(caller) && teacherId === caller
}

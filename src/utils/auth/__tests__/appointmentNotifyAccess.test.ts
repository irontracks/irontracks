import { describe, it, expect } from 'vitest'
import { canNotifyStudentAppointment } from '../appointmentNotifyAccess'

describe('canNotifyStudentAppointment — fail-closed p/ aluno órfão', () => {
  it('BUG DE SEGURANÇA: professor NÃO pode notificar aluno com teacher_id NULL', () => {
    // Era o furo: teacher_id nulo fazia curto-circuito e liberava qualquer professor.
    expect(canNotifyStudentAppointment({ role: 'teacher', studentTeacherId: null, callerId: 'teacher-1' })).toBe(false)
    expect(canNotifyStudentAppointment({ role: 'teacher', studentTeacherId: undefined, callerId: 'teacher-1' })).toBe(false)
  })

  it('professor pode notificar o PRÓPRIO aluno', () => {
    expect(canNotifyStudentAppointment({ role: 'teacher', studentTeacherId: 'teacher-1', callerId: 'teacher-1' })).toBe(true)
  })

  it('professor NÃO pode notificar aluno de OUTRO professor', () => {
    expect(canNotifyStudentAppointment({ role: 'teacher', studentTeacherId: 'teacher-2', callerId: 'teacher-1' })).toBe(false)
  })

  it('admin pode notificar qualquer aluno (inclusive órfão)', () => {
    expect(canNotifyStudentAppointment({ role: 'admin', studentTeacherId: null, callerId: 'admin-1' })).toBe(true)
    expect(canNotifyStudentAppointment({ role: 'admin', studentTeacherId: 'teacher-2', callerId: 'admin-1' })).toBe(true)
  })
})

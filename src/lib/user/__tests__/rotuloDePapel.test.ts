import { describe, it, expect } from 'vitest'
import { rotuloDePapel } from '../rotuloDePapel'

describe('rotuloDePapel', () => {
    it('quem é admin E coach vê os DOIS — era o caso real do dono', () => {
        // O ternário antigo testava `isCoach` primeiro e devolvia só "Coach":
        // o papel de maior alcance ficava invisível para quem o tem.
        expect(rotuloDePapel({ role: 'admin', isCoach: true })).toBe('Admin · Coach')
    })

    it('admin sem alunos é Admin', () => {
        expect(rotuloDePapel({ role: 'admin', isCoach: false })).toBe('Admin')
    })

    it('coach que não é admin é Coach', () => {
        expect(rotuloDePapel({ role: 'teacher', isCoach: true })).toBe('Coach')
    })

    it('aluno comum não tem rótulo — "Aluno" seria ruído', () => {
        expect(rotuloDePapel({ role: 'student', isCoach: false })).toBeNull()
        expect(rotuloDePapel({})).toBeNull()
        expect(rotuloDePapel({ role: null })).toBeNull()
    })

    it('Admin vem primeiro: é ele que explica os itens a mais no menu', () => {
        expect(rotuloDePapel({ role: 'admin', isCoach: true })!.startsWith('Admin')).toBe(true)
    })

    it('é indiferente a caixa e espaço no role', () => {
        expect(rotuloDePapel({ role: '  ADMIN ' })).toBe('Admin')
    })

    it('role parecido não vira admin', () => {
        // `teacher` e `student` não podem escorregar para Admin.
        expect(rotuloDePapel({ role: 'administrador' })).toBeNull()
        expect(rotuloDePapel({ role: 'teacher' })).toBeNull()
    })
})

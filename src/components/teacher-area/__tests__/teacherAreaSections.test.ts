import { describe, it, expect } from 'vitest'
import {
  TEACHER_PRIMARY_SECTIONS,
  TEACHER_MORE_SECTIONS,
  TEACHER_SECTION_KEYS,
  labelForSection,
  isMoreSection,
} from '../teacherAreaSections'

/**
 * A navegação da Área do professor usa `key` = `tab` que o useAdminPanelController já
 * entende. Se um key aqui não bater com um tab real, a seção não renderiza. Estes testes
 * travam o vocabulário e os helpers da nav.
 */
describe('teacherAreaSections', () => {
  it('as keys são tabs reusados do painel OU seções exclusivas da Área do professor', () => {
    // Tabs que o AdminPanelV2 já renderiza (reuso) + seções que só a Área do professor tem
    // (renderizadas pelo próprio TeacherArea, ex.: conversas).
    const valid = new Set(['dashboard', 'students', 'templates', 'billing', 'priorities', 'guide', 'conversas'])
    for (const s of [...TEACHER_PRIMARY_SECTIONS, ...TEACHER_MORE_SECTIONS]) {
      expect(valid.has(s.key), `key desconhecido: ${s.key}`).toBe(true)
    }
  })

  it('não há key duplicado entre primárias e "Mais"', () => {
    const keys = [...TEACHER_PRIMARY_SECTIONS, ...TEACHER_MORE_SECTIONS].map((s) => s.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('TEACHER_SECTION_KEYS cobre todas as seções', () => {
    expect(TEACHER_SECTION_KEYS.has('dashboard')).toBe(true)
    expect(TEACHER_SECTION_KEYS.has('billing')).toBe(true)
    expect(TEACHER_SECTION_KEYS.has('guide')).toBe(true)
    expect(TEACHER_SECTION_KEYS.has('inexistente')).toBe(false)
  })

  it('labelForSection devolve o rótulo, com fallback Início', () => {
    expect(labelForSection('students')).toBe('Alunos')
    expect(labelForSection('guide')).toBe('Guia')
    expect(labelForSection('qualquer')).toBe('Início')
  })

  it('isMoreSection distingue o grupo "Mais"', () => {
    expect(isMoreSection('priorities')).toBe(true)
    expect(isMoreSection('guide')).toBe(true)
    expect(isMoreSection('dashboard')).toBe(false)
    expect(isMoreSection('students')).toBe(false)
  })
})

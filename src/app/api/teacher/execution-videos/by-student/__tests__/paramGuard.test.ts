import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Guard: a rota by-student aceita o param que os callers realmente mandam (student_user_id).
 * Antes o schema exigia student_id -> 400 sempre -> listagem de vídeos do aluno morta.
 */
describe('execution-videos/by-student — param casa com os callers', () => {
  const src = readFileSync('src/app/api/teacher/execution-videos/by-student/route.ts', 'utf8')
  it('schema usa student_user_id', () => {
    expect(src).toMatch(/student_user_id: z\.string\(\)\.uuid/)
    expect(src).not.toMatch(/student_id: z\.string\(\)\.uuid/)
  })
})

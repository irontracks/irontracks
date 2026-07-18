import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * O inbox do professor lista conversas com os alunos DELE. Guards: só admin/teacher;
 * service-role só pra descobrir os alunos (students.teacher_id); as mensagens vêm da RPC
 * get_user_conversations (SECURITY DEFINER, valida caller=auth.uid()) e são FILTRADAS aos
 * alunos vinculados — nunca expõe conversa de terceiro; o arg da RPC é o próprio caller,
 * nunca um id do cliente.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

describe('rota /api/teacher/conversations', () => {
  const src = stripComments(readFileSync('src/app/api/teacher/conversations/route.ts', 'utf8'))

  it('exige role admin/teacher', () => {
    expect(src).toMatch(/requireRole\(\s*\[\s*['"]admin['"]\s*,\s*['"]teacher['"]\s*\]\s*\)/)
  })

  it('descobre os alunos por students.teacher_id (service-role só pra isso)', () => {
    expect(src).toMatch(/createAdminClient\(\)/)
    expect(src).toMatch(/from\(\s*['"]students['"]\s*\)/)
    expect(src).toMatch(/eq\(\s*['"]teacher_id['"]\s*,\s*requesterId\s*\)/)
  })

  it('chama get_user_conversations com o PRÓPRIO caller (não um id do cliente)', () => {
    expect(src).toMatch(/get_user_conversations['"]\s*,\s*\{\s*user_id:\s*requesterId\s*\}/)
    // a RPC roda sob o cliente RLS-scoped do professor, não o admin
    expect(src).toMatch(/auth\.supabase\.rpc\(\s*['"]get_user_conversations['"]/)
  })

  it('filtra as conversas aos alunos vinculados (não vaza terceiro)', () => {
    expect(src).toMatch(/studentMap\.has\(other\)/)
  })

  it('não devolve mensagem de erro crua (responde genérico)', () => {
    expect(src).toMatch(/error:\s*['"]internal_error['"]/)
  })
})

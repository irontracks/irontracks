import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Regressão do bug "Erro ao excluir professor: permission denied for table teachers".
 *
 * Tinha DUAS causas:
 *  1. O botão do painel fazia .delete() DIRETO do client contra `teachers`, cuja
 *     escrita foi revogada pro client no hardening de 2026-07-11. Agora o handler
 *     chama a rota /api/admin/teachers/delete (RPC via service-role).
 *  2. A RPC delete_teacher_cascade referenciava 3 tabelas inexistentes
 *     (assessment_photos, invites, messages) e quebrava pra QUALQUER professor.
 *     A migration 20260717170000 as removeu.
 */
const handler = readFileSync(
  join(process.cwd(), 'src/components/admin-panel/hooks/useAdminActions.ts'),
  'utf8',
)
const apiAdmin = readFileSync(join(process.cwd(), 'src/lib/api/admin.ts'), 'utf8')
const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260717170000_fix_delete_teacher_cascade_missing_tables.sql'),
  'utf8',
)

const handlerFn = handler.slice(
  handler.indexOf('const handleDeleteTeacher'),
  handler.indexOf('const handleDeleteTeacher') + 1400,
)

describe('exclusão de professor — caminho server-side', () => {
  it('o handler NÃO faz .delete() direto em teachers (era o permission denied)', () => {
    expect(handlerFn).not.toContain(".from('teachers').delete()")
    expect(handlerFn).not.toMatch(/\.from\('teachers'\)\s*\.delete/)
  })

  it('o handler delega pra rota via apiAdmin.deleteTeacher', () => {
    expect(handlerFn).toContain('apiAdmin.deleteTeacher(teacherId, token)')
  })

  it('passa o bearer token (app nativo, onde o cookie pode não valer)', () => {
    expect(apiAdmin).toContain("Authorization: `Bearer ${token}`")
    expect(apiAdmin).toContain("'/api/admin/teachers/delete'")
  })
})

describe('migration — a RPC não referencia mais tabela inexistente', () => {
  it('removeu assessment_photos, invites e messages', () => {
    // Nenhum DELETE ATIVO nessas tabelas (só menção em comentário "removido:").
    expect(migration).not.toMatch(/DELETE FROM public\.assessment_photos/)
    expect(migration).not.toMatch(/DELETE FROM public\.invites/)
    expect(migration).not.toMatch(/DELETE FROM public\.messages\b/)
  })

  it('mantém o que importa: gate de auth, DELETE de teachers e audit', () => {
    expect(migration).toContain("v_role <> 'service_role'")
    expect(migration).toContain('public.is_admin()')
    expect(migration).toContain('DELETE FROM public.teachers WHERE id = p_teacher_id')
    expect(migration).toContain("action")
    expect(migration).toContain('audit_events')
  })

  it('segue deletando as tabelas de dados que EXISTEM', () => {
    for (const t of ['students', 'workouts', 'assessments', 'direct_messages', 'notifications']) {
      expect(migration).toContain(`public.${t}`)
    }
  })
})

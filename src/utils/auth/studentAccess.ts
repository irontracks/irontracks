/**
 * src/utils/auth/studentAccess.ts
 *
 * Autorização para rotas "coach" que recebem um `studentId` no body e leem
 * dados sensíveis daquele aluno (perfil, avaliações, exames laboratoriais,
 * histórico de treino) via service-role (createAdminClient, que ignora RLS).
 *
 * Sem esta checagem, qualquer usuário autenticado podia passar o UUID de outra
 * pessoa e exfiltrar dados de saúde (IDOR). Ver auditoria de segurança 2026-06-27.
 */
import { createAdminClient } from '@/utils/supabase/admin'
import { resolveRoleByUser } from '@/utils/auth/route'
import { logError } from '@/lib/logger'

/**
 * Decide se `caller` pode acessar os dados sensíveis do aluno `studentId`.
 *
 * `studentId` é o auth uid do aluno (== profiles.id == assessments.user_id ==
 * students.user_id).
 *
 * Permitido quando QUALQUER uma:
 *  - self: o caller é o próprio aluno (caller.id === studentId)
 *  - professor vinculado: existe linha em `students` com
 *    user_id === studentId E teacher_id === caller.id
 *  - admin
 *
 * Fail-closed: qualquer erro retorna false.
 */
export async function canCoachStudent(
  caller: { id?: string | null; email?: string | null },
  studentId: string,
): Promise<boolean> {
  const callerId = String(caller?.id || '').trim()
  const target = String(studentId || '').trim()
  if (!callerId || !target) return false
  if (callerId === target) return true

  const admin = createAdminClient()
  try {
    // Professor vinculado ao aluno (vínculo gravado em students.teacher_id).
    const { data: link } = await admin
      .from('students')
      .select('id')
      .eq('user_id', target)
      .eq('teacher_id', callerId)
      .maybeSingle()
    if (link?.id) return true

    // Admin pode acessar qualquer aluno.
    const { role } = await resolveRoleByUser({ id: callerId, email: caller?.email ?? null })
    if (role === 'admin') return true
  } catch (e) {
    logError('canCoachStudent', e)
  }
  return false
}

/**
 * user_ids dos alunos com vínculo REAL com `callerId` (students.teacher_id).
 *
 * Para LISTAGENS, onde `canCoachStudent` (uma pergunta por aluno) não serve: em
 * vez de filtrar por `trainer_id` da própria linha — que o atacante escolhe ao
 * criar o registro — a query passa a filtrar por `user_id in (self, ...alunos)`.
 * Uma linha forjada com {user_id: vítima, trainer_id: self} deixa de aparecer,
 * porque a vítima não é aluna do caller.
 *
 * Fail-closed: qualquer erro devolve lista vazia (o caller ainda vê o que é dele).
 */
export async function listCoachedStudentIds(callerId: string): Promise<string[]> {
  const id = String(callerId || '').trim()
  if (!id) return []
  const admin = createAdminClient()
  try {
    const { data } = await admin
      .from('students')
      .select('user_id')
      .eq('teacher_id', id)
      .not('user_id', 'is', null)
    const rows = (data || []) as Array<{ user_id: string | null }>
    return [...new Set(rows.map((r) => String(r.user_id || '').trim()).filter(Boolean))]
  } catch (e) {
    logError('listCoachedStudentIds', e)
    return []
  }
}

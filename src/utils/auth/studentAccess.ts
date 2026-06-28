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

/**
 * src/utils/storage/biaAttachmentAccess.ts
 *
 * Autorização de acesso aos anexos de bioimpedância (bucket privado
 * `bioimpedance-files`). O path é `{ownerUserId}/bia/{arquivo}` — o dono é o
 * primeiro segmento. Leitura permitida para: o próprio dono, o professor
 * vinculado (students.teacher_id) ou admin. Auditoria 2026-06-27 (M2/M5).
 */
import { createAdminClient } from '@/utils/supabase/admin'
import { resolveRoleByUser } from '@/utils/auth/route'
import { logError } from '@/lib/logger'

export const BIA_BUCKET = 'bioimpedance-files'

/** Extrai o userId dono a partir do path `{ownerId}/bia/{arquivo}`. */
export function biaPathOwner(path: string): string {
  const parts = String(path || '').split('/').filter(Boolean)
  if (parts.length < 3 || parts[1] !== 'bia') return ''
  return parts[0]
}

/** Fail-closed: qualquer erro → false. */
export async function canAccessBiaPath(
  caller: { id?: string | null; email?: string | null },
  path: string,
): Promise<boolean> {
  const callerId = String(caller?.id || '').trim()
  const owner = biaPathOwner(path)
  if (!callerId || !owner) return false
  if (callerId === owner) return true

  const admin = createAdminClient()
  try {
    const { data: link } = await admin
      .from('students')
      .select('id')
      .eq('user_id', owner)
      .eq('teacher_id', callerId)
      .maybeSingle()
    if (link?.id) return true

    const { role } = await resolveRoleByUser({ id: callerId, email: caller?.email ?? null })
    if (role === 'admin') return true
  } catch (e) {
    logError('canAccessBiaPath', e)
  }
  return false
}

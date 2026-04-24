import { createAdminClient } from '@/utils/supabase/admin'
import { sendPushToAllPlatforms } from './sender'

export async function notifyAdminsNewSignup(userName: string, userEmail: string): Promise<void> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('profiles')
      .select('id')
      .eq('role', 'admin')

    const adminIds = (data ?? []).map((r) => String(r.id)).filter(Boolean)
    if (!adminIds.length) return

    const name = (userName || userEmail || 'Novo usuário').slice(0, 80)
    await sendPushToAllPlatforms(
      adminIds,
      'Novo cadastro',
      `${name} se cadastrou e aguarda aprovação`,
      { type: 'admin_new_signup', link: '/admin' },
    )
  } catch {
    // fire-and-forget — never throw
  }
}

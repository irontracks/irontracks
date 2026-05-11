/**
 * adminNotifications — notificações in-app pra admins.
 *
 * Diferente das notificações sociais (gated por preferências do destinatário),
 * notificações admin são operacionais: novo cadastro pendente, VIP expirando,
 * billing issue, etc. Sempre entregam (sem opt-out) pra quem tem role=admin.
 *
 * Reusa a tabela `notifications` com `type` no padrão `admin_*`. Como esses
 * tipos NÃO estão em NOTIFICATION_TYPE_TO_PREFERENCE, `insertNotifications`
 * trata como "always deliver" e não filtra. O push continua disparando pelo
 * mesmo caminho, então admin recebe na lock screen também.
 *
 * Fire-and-forget: nunca throw. Falha aqui não pode bloquear signup, etc.
 */

import { createAdminClient } from '@/utils/supabase/admin'
import { insertNotifications } from '@/lib/social/notifyFollowers'
import { logError } from '@/lib/logger'

/** Tipos canônicos de notificação admin. Mantenha em sync com a UI do sino. */
export type AdminNotificationType =
  | 'admin_new_signup'
  | 'admin_vip_expiring'
  | 'admin_access_request'

interface AdminNotifyArgs {
  type: AdminNotificationType
  title: string
  message: string
  /** Deep link opcional pra navegar ao clicar (ex: '/admin?tab=requests'). */
  link?: string
  /** Metadata extra (user_id afetado, plano, etc). */
  metadata?: Record<string, unknown>
}

/** Resolve a lista de user_ids com role=admin. Cache em memória de 60s. */
let _cachedAdminIds: { ids: string[]; at: number } | null = null
async function fetchAdminIds(): Promise<string[]> {
  if (_cachedAdminIds && Date.now() - _cachedAdminIds.at < 60_000) {
    return _cachedAdminIds.ids
  }
  try {
    const admin = createAdminClient()
    const { data } = await admin.from('profiles').select('id').eq('role', 'admin')
    const ids = (Array.isArray(data) ? data : [])
      .map((r) => String((r as { id?: string }).id ?? '').trim())
      .filter(Boolean)
    _cachedAdminIds = { ids, at: Date.now() }
    return ids
  } catch (e) {
    logError('adminNotifications.fetchAdminIds', e)
    return []
  }
}

/**
 * Insere uma notificação in-app pra TODOS os admins. Não throw — falha aqui
 * não pode quebrar o fluxo principal (signup, cron, etc).
 */
export async function notifyAdmins(args: AdminNotifyArgs): Promise<void> {
  try {
    const adminIds = await fetchAdminIds()
    if (!adminIds.length) return

    const rows = adminIds.map((uid) => ({
      user_id: uid,
      recipient_id: uid,
      sender_id: uid, // self-sender — sem ator humano
      type: args.type,
      title: args.title.slice(0, 120),
      message: args.message.slice(0, 280),
      is_read: false,
      // tabela notifications não tem coluna `link` — guardamos em metadata.
      // O insertNotifications usa metadata.link no payload do push.
      metadata: {
        ...(args.metadata ?? {}),
        ...(args.link ? { link: args.link } : {}),
        scope: 'admin',
      },
    }))

    await insertNotifications(rows)
  } catch (e) {
    logError('adminNotifications.notifyAdmins', e)
  }
}

/** Notifica admins quando um novo aluno se cadastra (access request criado). */
export async function notifyAdminNewSignup(args: {
  name: string
  email: string
  role: 'student' | 'teacher'
}): Promise<void> {
  const name = args.name.trim() || args.email.trim() || 'Novo usuário'
  const roleLabel = args.role === 'teacher' ? 'professor' : 'aluno'
  await notifyAdmins({
    type: 'admin_access_request',
    title: '🆕 Nova solicitação de acesso',
    message: `${name} (${roleLabel}) está aguardando aprovação.`,
    link: '/admin?tab=requests',
    metadata: { email: args.email, role: args.role },
  })
}

/** Notifica admins quando o plano de um aluno VIP está prestes a expirar. */
export async function notifyAdminVipExpiring(args: {
  userId: string
  userName: string
  daysRemaining: number
  planTier?: string
}): Promise<void> {
  const tierLabel = (args.planTier || 'VIP').toUpperCase()
  const dayWord = args.daysRemaining === 1 ? 'dia' : 'dias'
  await notifyAdmins({
    type: 'admin_vip_expiring',
    title: '💳 Plano expirando',
    message: `${args.userName} (${tierLabel}) expira em ${args.daysRemaining} ${dayWord}.`,
    link: '/admin?tab=vip',
    metadata: {
      userId: args.userId,
      planTier: args.planTier,
      daysRemaining: args.daysRemaining,
    },
  })
}

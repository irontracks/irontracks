/**
 * src/utils/team/sessionMembership.ts
 *
 * Verifica se um usuário é membro de uma team session — espelha exatamente a
 * policy RLS de SELECT de team_chat_messages (migration 20260513111015):
 *   (a) host_uid = usuário          → criador/host da sessão
 *   (b) entrada em participants[]   → snapshot persistente (jsonb)
 *   (c) row em team_session_presence → presença ao vivo
 *
 * Usado para barrar write-IDOR: sem isto, qualquer usuário autenticado inseria
 * mensagens em sessão alheia e disparava push spam (auditoria 2026-06-27).
 *
 * Fail-closed: qualquer erro retorna false.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { logError } from '@/lib/logger'

export async function isTeamSessionMember(
  admin: SupabaseClient,
  sessionId: string,
  userId: string,
): Promise<boolean> {
  const sid = String(sessionId || '').trim()
  const uid = String(userId || '').trim()
  if (!sid || !uid) return false

  try {
    const { data: session } = await admin
      .from('team_sessions')
      .select('host_uid, participants')
      .eq('id', sid)
      .maybeSingle()
    if (!session) return false

    // (a) host
    if (String(session.host_uid || '').trim() === uid) return true

    // (b) participants[] snapshot
    const participants = Array.isArray(session.participants) ? session.participants : []
    const inParticipants = participants.some((p) => {
      const o = p && typeof p === 'object' ? (p as Record<string, unknown>) : null
      return String(o?.uid || o?.user_id || o?.id || '').trim() === uid
    })
    if (inParticipants) return true

    // (c) presença ao vivo
    const { data: presence } = await admin
      .from('team_session_presence')
      .select('user_id')
      .eq('session_id', sid)
      .eq('user_id', uid)
      .maybeSingle()
    if (presence?.user_id) return true
  } catch (e) {
    logError('isTeamSessionMember', e)
  }
  return false
}

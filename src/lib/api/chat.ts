/**
 * src/lib/api/chat.ts
 * Typed API client for chat-related endpoints.
 *
 * Slimmed down in #55 cleanup: the chat_channels/chat_members/messages
 * system was dead and removed. Only /api/chat/delete survives (used by
 * ChatDirectScreen to delete direct_messages rows).
 */
import { apiPost } from './_fetch'

export const apiChat = {
  /** POST delete a message (scope='direct' targets direct_messages) */
  deleteMessage: (messageId: string, scope?: string) =>
    apiPost<{ ok: boolean }>('/api/chat/delete', { messageId, scope: scope ?? 'direct' }),
}

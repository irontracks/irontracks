/**
 * src/lib/api/chat.ts
 * Typed API client for chat-related endpoints.
 */
import { apiGet, apiPost } from './_fetch'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string
  channel_id: string
  sender_id: string
  content: string
  created_at: string
  sender?: {
    display_name: string
    photo_url?: string | null
  }
}

export interface SendMessagePayload {
  channel_id: string
  content: string
}

export interface DeleteMessagePayload {
  message_id: string
}

export interface MessagesResult {
  ok: boolean
  messages: ChatMessage[]
}

export interface GlobalChannelResult {
  ok: boolean
  channel_id: string
}

// ─── Client ───────────────────────────────────────────────────────────────────

export const apiChat = {
  /** GET the global-chat channel id for the current user */
  getGlobalChannelId: () =>
    apiGet<GlobalChannelResult>('/api/chat/global-id'),

  /** GET messages for a channel */
  getMessages: (channelId: string, signal?: AbortSignal) =>
    apiGet<MessagesResult>(`/api/chat/messages?channel_id=${encodeURIComponent(channelId)}`, { signal }),

  /** POST a new message */
  sendMessage: (payload: SendMessagePayload) =>
    apiPost<{ ok: boolean; message?: ChatMessage }>('/api/chat/send', payload),

  /** POST delete a message */
  deleteMessage: (messageId: string, scope?: string) =>
    apiPost<{ ok: boolean }>('/api/chat/delete', { messageId, scope: scope ?? 'channel' }),
}

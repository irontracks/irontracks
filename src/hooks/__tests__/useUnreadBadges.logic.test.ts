import { describe, it, expect } from 'vitest'

// Lógica pura extraída de useUnreadBadges
function shouldClearChatBadge(currentView: string): boolean {
  return currentView === 'chat' || currentView === 'chat-list' || currentView === 'chat-direct'
}

function shouldClearNotifBadge(currentView: string): boolean {
  return currentView === 'notifications'
}

function parseNotificationPayload(payload: unknown): {
  type: string
  userId: string | null
} {
  if (!payload || typeof payload !== 'object') return { type: 'unknown', userId: null }
  const p = payload as Record<string, unknown>
  return {
    type: String(p.type ?? p.event_type ?? 'unknown'),
    userId: p.user_id ? String(p.user_id) : null,
  }
}

describe('useUnreadBadges — lógica pura', () => {
  describe('shouldClearChatBadge', () => {
    it('limpa badge ao entrar em chat', () => {
      expect(shouldClearChatBadge('chat')).toBe(true)
      expect(shouldClearChatBadge('chat-list')).toBe(true)
      expect(shouldClearChatBadge('chat-direct')).toBe(true)
    })
    it('não limpa em outras views', () => {
      expect(shouldClearChatBadge('dashboard')).toBe(false)
      expect(shouldClearChatBadge('history')).toBe(false)
    })
  })

  describe('shouldClearNotifBadge', () => {
    it('limpa badge na view de notificações', () => {
      expect(shouldClearNotifBadge('notifications')).toBe(true)
    })
    it('não limpa em outras views', () => {
      expect(shouldClearNotifBadge('dashboard')).toBe(false)
      expect(shouldClearNotifBadge('chat')).toBe(false)
    })
  })

  describe('parseNotificationPayload', () => {
    it('parseia payload com type e user_id', () => {
      const result = parseNotificationPayload({ type: 'message', user_id: 'u1' })
      expect(result.type).toBe('message')
      expect(result.userId).toBe('u1')
    })
    it('usa event_type como fallback', () => {
      const result = parseNotificationPayload({ event_type: 'notification' })
      expect(result.type).toBe('notification')
    })
    it('retorna unknown para payload inválido', () => {
      expect(parseNotificationPayload(null).type).toBe('unknown')
      expect(parseNotificationPayload(undefined).type).toBe('unknown')
    })
    it('userId é null quando ausente', () => {
      const result = parseNotificationPayload({ type: 'ping' })
      expect(result.userId).toBeNull()
    })
  })
})

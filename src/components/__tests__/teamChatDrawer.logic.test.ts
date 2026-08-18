import { describe, it, expect, vi } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Pure logic extracted from TeamChatDrawer.tsx for isolated unit testing.
// ─────────────────────────────────────────────────────────────────────────────

// ── Constants ─────────────────────────────────────────────────────────────────

const QUICK_REACTIONS = ['🔥', '💪', '👏', '🏆', '😤', '💀']
const MAX_MESSAGES = 60

// ── Helpers ───────────────────────────────────────────────────────────────────

type ChatMessage = {
  id: string
  userId: string
  displayName: string
  photoURL: string | null
  text: string
  ts: number
}

/** Enforce MAX_MESSAGES cap (mirrors the component's state update logic) */
function trimMessages(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length <= MAX_MESSAGES) return messages
  return messages.slice(messages.length - MAX_MESSAGES)
}

/** Compute unread count when drawer is closed (mirrors component useEffect logic) */
function computeUnread(currentCount: number, lastSeenCount: number, isOpen: boolean): number {
  if (isOpen) return 0
  const newCount = currentCount - lastSeenCount
  return newCount > 0 ? newCount : 0
}

/** Guard: returns false if text is empty after trimming */
function canSendChat(text: string): boolean {
  return text.trim().length > 0
}

/** Format a text message with leading/trailing whitespace stripped */
function prepareMessageText(raw: string): string {
  return raw.trim()
}

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: `m-${Math.random()}`,
    userId: 'u1',
    displayName: 'Atleta',
    photoURL: null,
    text: 'Bora!',
    ts: Date.now(),
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('QUICK_REACTIONS constant', () => {
  it('contains the expected emoji set', () => {
    expect(QUICK_REACTIONS).toContain('🔥')
    expect(QUICK_REACTIONS).toContain('💪')
    expect(QUICK_REACTIONS).toContain('🏆')
  })

  it('has exactly 6 reactions', () => {
    expect(QUICK_REACTIONS).toHaveLength(6)
  })

  it('all entries are non-empty strings', () => {
    for (const r of QUICK_REACTIONS) {
      expect(typeof r).toBe('string')
      expect(r.length).toBeGreaterThan(0)
    }
  })
})

describe('MAX_MESSAGES constant', () => {
  it('is 60', () => {
    expect(MAX_MESSAGES).toBe(60)
  })
})

describe('trimMessages()', () => {
  it('passes through arrays at or below the cap', () => {
    const msgs = Array.from({ length: 60 }, (_, i) => makeMessage({ id: String(i) }))
    expect(trimMessages(msgs)).toHaveLength(60)
  })

  it('trims to the last MAX_MESSAGES when exceeded', () => {
    const msgs = Array.from({ length: 65 }, (_, i) => makeMessage({ id: String(i), text: `msg-${i}` }))
    const trimmed = trimMessages(msgs)
    expect(trimmed).toHaveLength(60)
    // Should keep the NEWEST messages (tail of array)
    expect(trimmed[0].text).toBe('msg-5')
    expect(trimmed[59].text).toBe('msg-64')
  })

  it('handles empty array', () => {
    expect(trimMessages([])).toHaveLength(0)
  })
})

describe('computeUnread()', () => {
  it('returns new messages when drawer is closed', () => {
    // 5 messages arrived; lastSeen = 3 → 2 unread
    expect(computeUnread(5, 3, false)).toBe(2)
  })

  it('returns 0 when drawer is open', () => {
    expect(computeUnread(10, 5, true)).toBe(0)
  })

  it('returns 0 when no new messages', () => {
    expect(computeUnread(5, 5, false)).toBe(0)
  })

  it('does not return negative counts', () => {
    // Edge case: lastSeen > current (shouldn't happen but guard it)
    expect(computeUnread(2, 5, false)).toBe(0)
  })
})

describe('canSendChat() guard', () => {
  it('allows non-empty text', () => {
    expect(canSendChat('🔥 Bora!')).toBe(true)
  })

  it('rejects empty string', () => {
    expect(canSendChat('')).toBe(false)
  })

  it('rejects whitespace-only string', () => {
    expect(canSendChat('   ')).toBe(false)
    expect(canSendChat('\n\t')).toBe(false)
  })
})

describe('prepareMessageText()', () => {
  it('trims leading whitespace', () => {
    expect(prepareMessageText('  Olá')).toBe('Olá')
  })

  it('trims trailing whitespace', () => {
    expect(prepareMessageText('Bora!  ')).toBe('Bora!')
  })

  it('trims both sides', () => {
    expect(prepareMessageText('  texto  ')).toBe('texto')
  })

  it('returns empty string for whitespace-only input', () => {
    expect(prepareMessageText('   ')).toBe('')
  })
})

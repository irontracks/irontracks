/**
 * src/lib/api/vip.ts
 * Typed API client for VIP-related endpoints.
 */
import { apiGet, apiPost } from './_fetch'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VipStatus {
  isVip: boolean
  tier?: string
  expiresAt?: string | null
  features?: string[]
}

export interface VipStatusResult {
  ok: boolean
  status: VipStatus
}

export interface VipChatThread {
  id: string
  user_id: string
  created_at: string
}

export interface VipChatMessage {
  id: string
  thread_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export interface VipChatThreadResult {
  ok: boolean
  thread: VipChatThread | null
}

export interface VipChatMessagesResult {
  ok: boolean
  messages: VipChatMessage[]
}

export interface VipWeeklySummary {
  totalSessions: number
  totalVolume: number
  muscleGroups: Record<string, number>
}

export interface VipWeeklySummaryResult {
  ok: boolean
  summary: VipWeeklySummary
}

export interface VipWelcomeStatusResult {
  ok: boolean
  shown: boolean
}

export interface PeriodizationPlan {
  id: string
  user_id: string
  goal: string
  weeks: number
  schedule: unknown
  created_at: string
}

export interface PeriodizationStats {
  adherence: number
  completedSessions: number
  plannedSessions: number
}

export interface PeriodizationActiveResult {
  ok: boolean
  plan: PeriodizationPlan | null
}

export interface PeriodizationStatsResult {
  ok: boolean
  stats: PeriodizationStats | null
}

export interface CreatePeriodizationPayload {
  goal: string
  weeks: number
  daysPerWeek: number
  focusAreas?: string[]
}

// ─── Client ───────────────────────────────────────────────────────────────────

export const apiVip = {
  /** GET current VIP status for the logged-in user */
  getStatus: () =>
    apiGet<VipStatusResult>('/api/vip/status'),

  /** GET welcome modal status */
  getWelcomeStatus: () =>
    apiGet<VipWelcomeStatusResult>('/api/vip/welcome-status'),

  /** GET weekly training summary */
  getWeeklySummary: () =>
    apiGet<VipWeeklySummaryResult>('/api/vip/weekly-summary'),

  // ─── VIP Chat ───────────────────────────────────────────────────────────────

  /** GET or create chat thread for current user */
  getChatThread: () =>
    apiGet<VipChatThreadResult>('/api/vip/chat/thread'),

  /** POST save a chat message (role: user | assistant) */
  saveChatMessage: (payload: { thread_id: string; role: 'user' | 'assistant'; content: string }) =>
    apiPost<{ ok: boolean }>('/api/vip/chat/messages', payload),

  /** GET messages for a thread */
  getChatMessages: (threadId: string, limit = 80) =>
    apiGet<VipChatMessagesResult>(
      `/api/vip/chat/messages?thread_id=${encodeURIComponent(threadId)}&limit=${limit}`
    ),

  // ─── Periodization ──────────────────────────────────────────────────────────

  /** GET active periodization plan */
  getPeriodizationActive: () =>
    apiGet<PeriodizationActiveResult>('/api/vip/periodization/active'),

  /** GET periodization adherence stats */
  getPeriodizationStats: () =>
    apiGet<PeriodizationStatsResult>('/api/vip/periodization/stats'),

  /** POST create a new periodization plan */
  createPeriodization: (payload: CreatePeriodizationPayload) =>
    apiPost<{ ok: boolean; plan?: PeriodizationPlan }>('/api/vip/periodization/create', payload),

  /** POST clean up old/expired periodization plans */
  cleanupPeriodization: () =>
    apiPost<{ ok: boolean }>('/api/vip/periodization/cleanup'),
}

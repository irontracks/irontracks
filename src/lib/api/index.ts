/**
 * src/lib/api/index.ts
 * Barrel re-export for all API client modules.
 *
 * Usage:
 *   import { apiChat, apiVip, apiAdmin, apiWorkouts, apiStorage, apiSocial } from '@/lib/api'
 *   import type { ChatMessage, VipStatus, ... } from '@/lib/api'
 */

export { ApiError, apiFetch, apiGet, apiPost } from './_fetch'
export type { ApiResponse } from './_fetch'

export { apiChat } from './chat'
export type { ChatMessage, SendMessagePayload, MessagesResult, GlobalChannelResult } from './chat'

export { apiStorage } from './storage'
export type { SignedUploadResult, PrepareVideoResult } from './storage'

export { apiVip } from './vip'
export type {
  VipStatus, VipStatusResult,
  VipChatThread, VipChatMessage, VipChatThreadResult, VipChatMessagesResult,
  VipWeeklySummary, VipWeeklySummaryResult,
  PeriodizationPlan, PeriodizationStats, PeriodizationActiveResult, PeriodizationStatsResult,
  CreatePeriodizationPayload,
} from './vip'

export { apiWorkouts } from './workouts'
export type {
  WorkoutSummary, WorkoutsListResult, WorkoutsHistoryResult,
  WorkoutUpdatePayload, WorkoutFinishPayload,
} from './workouts'

export { apiAdmin } from './admin'
export type {
  StudentRecord, TeacherRecord, AdminWorkout,
  StudentsListResult, TeachersListResult, AdminWorkoutsResult,
  ExecutionVideoRecord, ExecutionVideosResult,
} from './admin'

export { apiSocial } from './social'
export type {
  StoryComment, StoryView, StoryCommentsResult, StoryViewsResult,
} from './social'

export { apiAuth } from './auth'
export type {
  ApplePreflightResult, SessionResult, RecoveryCodeResult, AccessRequestResult,
} from './auth'

export { apiAi } from './ai'
export type {
  AiInsightResult, MuscleMapResult, ProgressionResult, PeriodInsightsResult,
} from './ai'

export { apiBilling } from './billing'
export type {
  AppPlansResult, CheckoutResult, MercadoPagoSubscribeResult,
} from './billing'

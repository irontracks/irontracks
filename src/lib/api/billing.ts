/**
 * src/lib/api/billing.ts
 * Typed API client for billing/subscription endpoints.
 */
import { apiGet, apiPost } from './_fetch'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AppPlansResult {
  ok: boolean
  plans?: unknown[]
  [key: string]: unknown
}

export interface RevenueCatSyncResult {
  ok: boolean
  [key: string]: unknown
}

export interface CheckoutResult {
  ok: boolean
  url?: string
  session_id?: string
  [key: string]: unknown
}

export interface MercadoPagoSubscribeResult {
  ok: boolean
  url?: string
  preference_id?: string
  [key: string]: unknown
}

export interface CancelPendingResult {
  ok: boolean
  [key: string]: unknown
}

// ─── Client ───────────────────────────────────────────────────────────────────

export const apiBilling = {
  /** GET list of available subscription plans */
  getPlans: () =>
    apiGet<AppPlansResult>('/api/app/plans'),

  /** POST sync RevenueCat subscription status */
  syncRevenueCat: () =>
    apiPost<RevenueCatSyncResult>('/api/billing/revenuecat/sync', {}),

  /** POST create checkout session */
  createCheckout: (payload: Record<string, unknown>) =>
    apiPost<CheckoutResult>('/api/app/checkout', payload),

  /** POST subscribe via MercadoPago */
  mercadoPagoSubscribe: (payload: Record<string, unknown>) =>
    apiPost<MercadoPagoSubscribeResult>('/api/billing/mercadopago/subscribe', payload),

  /** POST cancel pending subscription */
  cancelPendingSubscription: (payload?: Record<string, unknown>) =>
    apiPost<CancelPendingResult>('/api/app/subscriptions/cancel-pending', payload ?? {}),
}

/**
 * src/lib/api/teacher-billing.ts
 * Typed API client for teacher plan / billing endpoints.
 */
import { apiGet, apiPost } from './_fetch'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TeacherPlanRow {
  tier_key: string
  name: string
  description?: string
  max_students: number   // 0 = unlimited
  price_cents: number
  currency: string
  sort_order: number
}

export interface TeacherPlansResult {
  ok: boolean
  plans?: TeacherPlanRow[]
  [key: string]: unknown
}

export interface TeacherMyPlanResult {
  ok: boolean
  plan?: TeacherPlanRow
  status?: 'active' | 'trialing' | 'past_due' | 'cancelled'
  valid_until?: string | null
  student_count?: number
  max_students?: number
  can_add_student?: boolean
  [key: string]: unknown
}

export interface TeacherCheckoutPayload {
  planId: string
  cpfCnpj: string
  mobilePhone: string
  name?: string
}

export interface TeacherCheckoutResult {
  ok: boolean
  payment_id?: string
  pix_qr_code?: string | null
  pix_payload?: string | null
  invoice_url?: string | null
  due_date?: string | null
  amount?: number
  plan?: { id: string; name: string }
  error?: string
  [key: string]: unknown
}

// ─── Invoice (charge) row returned by /api/teachers/my-invoices ──────────────

export interface TeacherInvoiceRow {
  id: string
  amount_cents: number
  currency: string
  status: string                 // 'pending' | 'approved' | 'refunded' | 'cancelled' | …
  provider: string               // 'mercadopago' for now
  provider_payment_id: string | null
  pix_qr_code: string | null     // base64 PNG, only set while status=pending
  pix_payload: string | null     // copy-paste PIX code, idem
  invoice_url: string | null
  due_date: string | null
  paid_at: string | null
  created_at: string | null
  tier_key: string | null        // 'free' | 'starter' | 'pro' | 'elite' | 'unlimited'
  plan_name: string | null
}

export interface TeacherInvoicesResult {
  ok: boolean
  invoices?: TeacherInvoiceRow[]
  error?: string
  [key: string]: unknown
}

// ─── Recurring subscription (MercadoPago Preapproval) ─────────────────────────

export interface TeacherRecurringCheckoutPayload {
  planId: string
}

export interface TeacherRecurringCheckoutResult {
  ok: boolean
  subscription_id?: string
  init_point?: string             // URL the client opens to finish auth
  plan?: { id: string; name: string }
  amount?: number
  error?: string
  [key: string]: unknown
}

export interface TeacherActiveSubscription {
  id: string
  status: string                  // 'pending' | 'active' | 'cancelled' | 'past_due'
  provider: string
  provider_subscription_id: string | null
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  tier_key: string | null
  plan_name: string | null
  init_point: string | null       // resume MP checkout if status='pending'
  created_at: string | null
}

export interface TeacherActiveSubscriptionResult {
  ok: boolean
  subscription?: TeacherActiveSubscription | null
  error?: string
  [key: string]: unknown
}

export interface TeacherCancelRecurringResult {
  ok: boolean
  cancelled?: number
  error?: string
  [key: string]: unknown
}

// ─── Client ───────────────────────────────────────────────────────────────────

export const apiTeacherBilling = {
  /** GET list of available teacher plans */
  getPlans: () =>
    apiGet<TeacherPlansResult>('/api/teachers/plans'),

  /** GET current teacher plan status + student count */
  getMyPlan: () =>
    apiGet<TeacherMyPlanResult>('/api/teachers/my-plan'),

  /** POST initiate PIX checkout for a teacher plan upgrade (one-shot, monthly manual) */
  checkout: (payload: TeacherCheckoutPayload) =>
    apiPost<TeacherCheckoutResult>('/api/teachers/checkout', payload as unknown as Record<string, unknown>),

  /** GET historical invoices (pending + paid + cancelled) for the teacher */
  getInvoices: () =>
    apiGet<TeacherInvoicesResult>('/api/teachers/my-invoices'),

  /** POST start a recurring monthly subscription (MercadoPago Preapproval) */
  checkoutRecurring: (payload: TeacherRecurringCheckoutPayload) =>
    apiPost<TeacherRecurringCheckoutResult>('/api/teachers/checkout-recurring', payload as unknown as Record<string, unknown>),

  /** POST cancel the active recurring subscription (effective at period end) */
  cancelRecurring: () =>
    apiPost<TeacherCancelRecurringResult>('/api/teachers/cancel-recurring', {}),

  /** GET the most recent recurring subscription (or null) */
  getActiveSubscription: () =>
    apiGet<TeacherActiveSubscriptionResult>('/api/teachers/active-subscription'),
}

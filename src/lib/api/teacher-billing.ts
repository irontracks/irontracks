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

// ─── Client ───────────────────────────────────────────────────────────────────

export const apiTeacherBilling = {
  /** GET list of available teacher plans */
  getPlans: () =>
    apiGet<TeacherPlansResult>('/api/teachers/plans'),

  /** GET current teacher plan status + student count */
  getMyPlan: () =>
    apiGet<TeacherMyPlanResult>('/api/teachers/my-plan'),

  /** POST initiate PIX checkout for a teacher plan upgrade */
  checkout: (payload: TeacherCheckoutPayload) =>
    apiPost<TeacherCheckoutResult>('/api/teachers/checkout', payload as unknown as Record<string, unknown>),
}

/**
 * src/lib/api/student-billing.ts
 * API client for teacher service plans + student subscriptions.
 */
import { apiGet, apiPost } from './_fetch'

// ─── Types ────────────────────────────────────────────────────────────────────

export type BillingInterval = 'once' | 'monthly' | 'quarterly' | 'semiannual' | 'yearly'
export type TrainingDay = 'seg' | 'ter' | 'qua' | 'qui' | 'sex' | 'sab' | 'dom'

export interface ServicePlan {
  id: string
  teacher_user_id: string
  name: string
  description?: string
  price_cents: number
  currency: string
  billing_interval: BillingInterval
  duration_days: number
  sessions_per_week?: number | null
  session_duration_minutes?: number | null
  training_days: TrainingDay[]
  notes?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface StudentSubscription {
  id: string
  teacher_user_id: string
  student_user_id: string
  plan_id: string
  status: 'pending' | 'active' | 'past_due' | 'cancelled' | 'expired'
  started_at?: string | null
  expires_at?: string | null
  next_due_date?: string | null
  last_payment_at?: string | null
  student_name?: string
  student_service_plans?: Partial<ServicePlan> | null
}

export interface StudentCharge {
  id: string
  status: string
  amount_cents: number
  pix_qr_code?: string | null
  pix_payload?: string | null
  invoice_url?: string | null
  due_date?: string | null
}

// ─── Teacher client ────────────────────────────────────────────────────────────

export const apiTeacherServicePlans = {
  list: () => apiGet<{ ok: boolean; plans: ServicePlan[] }>('/api/teacher/service-plans'),

  create: (payload: Partial<ServicePlan>) =>
    apiPost<{ ok: boolean; plan: ServicePlan }>('/api/teacher/service-plans', payload as Record<string, unknown>),

  update: (id: string, payload: Partial<ServicePlan>) =>
    apiPost<{ ok: boolean; plan: ServicePlan }>(`/api/teacher/service-plans/${id}`, payload as Record<string, unknown>),

  deactivate: (id: string) =>
    apiPost<{ ok: boolean }>(`/api/teacher/service-plans/${id}`, { is_active: false } as Record<string, unknown>),

  listSubscriptions: () =>
    apiGet<{ ok: boolean; subscriptions: StudentSubscription[] }>('/api/teacher/billing-subscriptions'),

  assignPlan: (studentUserId: string, planId: string) =>
    apiPost<{ ok: boolean; subscription: StudentSubscription }>('/api/teacher/billing-subscriptions', {
      student_user_id: studentUserId,
      plan_id: planId,
    }),
}

// ─── Student client ────────────────────────────────────────────────────────────

export const apiStudentBilling = {
  getMySubscription: () =>
    apiGet<{ ok: boolean; subscription: StudentSubscription | null; teacher: Record<string, unknown> | null; charge: StudentCharge | null }>('/api/student/my-subscription'),

  pay: (payload: { subscription_id: string; cpfCnpj: string; mobilePhone: string; name?: string }) =>
    apiPost<{ ok: boolean; charge: StudentCharge; resumed?: boolean }>('/api/student/charge', payload as unknown as Record<string, unknown>),
}

/**
 * src/lib/api/admin.ts
 * Typed API client for admin panel endpoints.
 */
import { apiGet, apiPost } from './_fetch'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StudentRecord {
  user_id: string
  display_name: string
  email?: string
  teacher_id?: string | null
  vip_tier?: string | null
  created_at?: string
}

export interface TeacherRecord {
  user_id: string
  display_name: string
  email?: string
  student_count?: number
}

export interface AdminWorkout {
  id: string
  name: string
  user_id: string
  created_at: string
  [key: string]: unknown
}

export interface StudentsListResult {
  ok: boolean
  students: StudentRecord[]
}

export interface TeachersListResult {
  ok: boolean
  teachers: TeacherRecord[]
  [key: string]: unknown
}

export interface AdminWorkoutsResult {
  ok: boolean
  workouts: AdminWorkout[]
  rows?: AdminWorkout[]  // some API responses return rows[] instead of workouts[]
}

export interface ExecutionVideoRecord {
  id: string
  student_user_id: string
  exercise_name: string
  video_url: string
  status: 'pending' | 'reviewed' | 'rejected'
  feedback?: string | null
  created_at: string
}

export interface ExecutionVideosResult {
  ok: boolean
  videos: ExecutionVideoRecord[]
}

// ─── Client ───────────────────────────────────────────────────────────────────

export const apiAdmin = {
  // ─── Students ────────────────────────────────────────────────────────────────

  /** GET list of all students */
  listStudents: (authHeaders?: Record<string, string>) =>
    apiGet<StudentsListResult>('/api/admin/students/list', {
      headers: { 'Content-Type': 'application/json', ...authHeaders },
    }),

  /** POST assign a teacher to a student */
  assignTeacher: (studentId: string, teacherUserId: string | null, authHeaders?: Record<string, string>, email?: string) =>
    apiPost<{ ok: boolean; student_id?: string }>('/api/admin/students/assign-teacher', {
      student_id: studentId,       // s.id is the students table PK — must match route's eq('id', ...)
      teacher_user_id: teacherUserId,
      ...(email ? { email } : {}),
    }, { headers: { 'Content-Type': 'application/json', ...authHeaders } }),

  /** POST delete a user's auth record */
  deleteAuthUser: (userId: string, authHeaders?: Record<string, string>) =>
    apiPost<{ ok: boolean }>('/api/admin/delete-auth-user', { user_id: userId },
      { headers: { 'Content-Type': 'application/json', ...authHeaders } }),

  // ─── Extended Students ────────────────────────────────────────────────────────

  /**
   * POST update student status (pago/pendente/atrasado/cancelar).
   * `id` is tried first as students.id, then as students.user_id (profile UUID).
   * `email` is a last-resort fallback for rows that came from the profiles-only
   * fallback path (AdminUser built before the real `students` row exists).
   */
  updateStudentStatus: (
    id: string,
    status: string,
    authHeaders?: Record<string, string>,
    email?: string | null,
  ) =>
    apiPost<{ ok: boolean }>(
      '/api/admin/students/status',
      { id, status, ...(email ? { email } : {}) },
      { headers: { 'Content-Type': 'application/json', ...authHeaders } },
    ),

  /** POST delete a student and all associated data */
  deleteStudent: (id: string, token: string, authHeaders?: Record<string, string>) =>
    apiPost<{ ok: boolean }>('/api/admin/students/delete', { id, token },
      { headers: { 'Content-Type': 'application/json', ...authHeaders } }),

  /** POST delete auth user (with token) */
  deleteAuthUserWithToken: (userId: string, token: string) =>
    apiPost<{ ok: boolean }>('/api/admin/delete-auth-user', { user_id: userId, token }),

  /**
   * POST excluir um professor + toda a cascata (alunos, treinos, histórico,
   * assessments, auth.users). Vai pra rota server-side, que roda a RPC atômica
   * delete_teacher_cascade via service-role — a escrita direta em `teachers` está
   * revogada pro client (hardening 2026-07-11), por isso o .delete() do client dava
   * "permission denied for table teachers". `id` = teachers.id OU user_id (a rota
   * resolve os dois). Bearer no header pro app nativo, onde o cookie pode não valer.
   */
  deleteTeacher: (id: string, token: string) =>
    apiPost<{ ok: boolean; report?: unknown }>(
      '/api/admin/teachers/delete',
      { id },
      { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } },
    ),

  // ─── Teacher Details ──────────────────────────────────────────────────────────

  /** GET students for a teacher */
  getTeacherStudents: (teacherUserId: string, authHeaders?: Record<string, string>) =>
    apiGet<{ ok: boolean; students: unknown[] }>(
      `/api/admin/teachers/students?teacher_user_id=${encodeURIComponent(teacherUserId)}`,
      { headers: { 'Content-Type': 'application/json', ...authHeaders } }
    ),

  /** GET workout templates for a teacher */
  getTeacherTemplates: (teacherUserId: string, authHeaders?: Record<string, string>) =>
    apiGet<{ ok: boolean; templates: unknown[] }>(
      `/api/admin/teachers/workouts/templates?teacher_user_id=${encodeURIComponent(teacherUserId)}`,
      { headers: { 'Content-Type': 'application/json', ...authHeaders } }
    ),

  /** GET workout history for a teacher */
  getTeacherHistory: (teacherUserId: string, limit = 20, authHeaders?: Record<string, string>) =>
    apiGet<{ ok: boolean; sessions: unknown[] }>(
      `/api/admin/teachers/workouts/history?teacher_user_id=${encodeURIComponent(teacherUserId)}&limit=${limit}`,
      { headers: { 'Content-Type': 'application/json', ...authHeaders } }
    ),

  /** GET inbox messages for a teacher */
  getTeacherInbox: (teacherUserId: string, limit = 80, authHeaders?: Record<string, string>) =>
    apiGet<{ ok: boolean; messages: unknown[] }>(
      `/api/admin/teachers/inbox?teacher_user_id=${encodeURIComponent(teacherUserId)}&limit=${limit}`,
      { headers: { 'Content-Type': 'application/json', ...authHeaders } }
    ),

  /** POST get signed media URL for execution video review */
  getExecutionVideoMedia: (submissionId: string) =>
    apiPost<{ ok: boolean; url?: string }>('/api/execution-videos/media', { submission_id: submissionId }),

  // ─── VIP ─────────────────────────────────────────────────────────────────────

  /** POST grant VIP trial to a user */
  grantVipTrial: (userId: string, authHeaders?: Record<string, string>) =>
    apiPost<{ ok: boolean }>('/api/admin/vip/grant-trial', { user_id: userId },
      { headers: { 'Content-Type': 'application/json', ...authHeaders } }),

  // ─── Teachers ────────────────────────────────────────────────────────────────

  /** GET list of all teachers */
  listTeachers: (authHeaders?: Record<string, string>) =>
    apiGet<TeachersListResult>('/api/admin/teachers/list', {
      headers: { 'Content-Type': 'application/json', ...authHeaders },
    }),

  // ─── Workouts ────────────────────────────────────────────────────────────────

  /** GET admin's own workouts */
  getAdminWorkouts: (authHeaders?: Record<string, string>) =>
    apiGet<AdminWorkoutsResult>('/api/admin/workouts/mine', {
      headers: { 'Content-Type': 'application/json', ...authHeaders },
    }),

  /** POST delete a workout */
  deleteWorkout: (workoutId: string, authHeaders?: Record<string, string>) =>
    apiPost<{ ok: boolean }>('/api/admin/workouts/delete', { workout_id: workoutId },
      { headers: { 'Content-Type': 'application/json', ...authHeaders } }),

  // ─── Execution Videos ────────────────────────────────────────────────────────

  /** GET execution videos for a student */
  getExecutionVideosByStudent: (studentUserId: string, authHeaders?: Record<string, string>) =>
    apiGet<ExecutionVideosResult>(
      `/api/teacher/execution-videos/by-student?student_user_id=${encodeURIComponent(studentUserId)}`,
      { headers: { 'Content-Type': 'application/json', ...authHeaders } }
    ),

  /** POST review an execution video */
  reviewExecutionVideo: (
    payload: { video_id: string; status: 'reviewed' | 'rejected'; feedback?: string },
    authHeaders?: Record<string, string>
  ) =>
    apiPost<{ ok: boolean }>('/api/teacher/execution-videos/review', payload,
      { headers: { 'Content-Type': 'application/json', ...authHeaders } }),

  // ─── VIP List / Revoke ────────────────────────────────────────────────────────

  /** GET list of VIP users */
  listVip: (authHeaders?: Record<string, string>) =>
    apiGet<{ ok: boolean; items?: unknown[] }>('/api/admin/vip/list', {
      headers: { 'Content-Type': 'application/json', ...authHeaders },
    }),

  /** POST grant VIP trials (array of grants) */
  grantVipTrials: (grants: Array<{ email: string; plan_id: string; days: number }>, authHeaders?: Record<string, string>) =>
    apiPost<{ ok: boolean; results?: unknown[]; error?: string }>('/api/admin/vip/grant-trial', { grants },
      { headers: { 'Content-Type': 'application/json', ...authHeaders } }),

  /** POST revoke VIP entitlement */
  revokeVip: (entitlementId: string, authHeaders?: Record<string, string>) =>
    apiPost<{ ok: boolean }>('/api/admin/vip/revoke', { entitlement_id: entitlementId },
      { headers: { 'Content-Type': 'application/json', ...authHeaders } }),

  /** GET VIP grant history */
  getVipGrantHistory: (limit = 80, authHeaders?: Record<string, string>) =>
    apiGet<{ ok: boolean; items?: unknown[] }>(`/api/admin/vip/grant-history?limit=${limit}`, {
      headers: { 'Content-Type': 'application/json', ...authHeaders },
    }),

  /** GET VIP entitlement for a user */
  getVipEntitlement: (qs: string, authHeaders?: Record<string, string>) =>
    apiGet<{ ok: boolean; entitlement?: unknown }>(`/api/admin/vip/entitlement?${qs}`, {
      headers: { 'Content-Type': 'application/json', ...authHeaders },
    }),

  // ─── User Activity ────────────────────────────────────────────────────────────

  /** GET active users list */
  getUserActivityUsers: (qs: string, authHeaders?: Record<string, string>) =>
    apiGet<{ ok: boolean; users?: unknown[] }>(`/api/admin/user-activity/users?${qs}`, {
      headers: { 'Content-Type': 'application/json', ...authHeaders },
    }),

  /** GET activity summary */
  getActivitySummary: (qs: string, authHeaders?: Record<string, string>) =>
    apiGet<{ ok: boolean; summary?: unknown }>(`/api/admin/user-activity/summary?${qs}`, {
      headers: { 'Content-Type': 'application/json', ...authHeaders },
    }),

  /** GET activity events */
  getActivityEvents: (qs: string, authHeaders?: Record<string, string>) =>
    apiGet<{ ok: boolean; events?: unknown[] }>(`/api/admin/user-activity/events?${qs}`, {
      headers: { 'Content-Type': 'application/json', ...authHeaders },
    }),

  // ─── Workout Sync ─────────────────────────────────────────────────────────────

  /** POST sync workout templates to student */
  syncWorkoutTemplates: (payload: Record<string, unknown>, authHeaders?: Record<string, string>) =>
    apiPost<{ ok: boolean }>('/api/admin/workouts/sync-templates', payload,
      { headers: { 'Content-Type': 'application/json', ...authHeaders } }),

  // ─── Billing diagnostic & simulation ──────────────────────────────────────────

  /**
   * GET billing health checks (teacher_tiers consistency, MP token, env vars,
   * data counts). Used by SystemTab to show "system ready to charge?" status.
   */
  getBillingDiagnostic: (authHeaders?: Record<string, string>) =>
    apiGet<{
      ok: boolean
      ready_to_charge: boolean
      checks: Record<string, { ok: boolean; message: string; data?: Record<string, unknown> }>
      timestamp: string
    }>('/api/admin/billing-diagnostic', {
      headers: { 'Content-Type': 'application/json', ...authHeaders },
    }),

  /**
   * POST simulate a teacher plan activation WITHOUT touching MercadoPago.
   * Mirrors the real webhook handler but inserts raw.simulated=true on the
   * resulting invoice so it doesn't pollute revenue analytics.
   */
  simulateTeacherPayment: (
    payload: { teacherUserId: string; planId: 'starter' | 'pro' | 'elite' | 'unlimited' },
    authHeaders?: Record<string, string>,
  ) =>
    apiPost<{
      ok: boolean
      error?: string
      simulated_payment_id?: string
      teacher?: { id: string; name: string; email: string }
      plan?: { tier_key: string; name: string; price_cents: number }
      plan_valid_until?: string
    }>('/api/admin/simulate-teacher-payment', payload as unknown as Record<string, unknown>,
      { headers: { 'Content-Type': 'application/json', ...authHeaders } }),
}

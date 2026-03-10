/**
 * src/lib/api/auth.ts
 * Typed API client for authentication-related endpoints.
 */
import { apiPost } from './_fetch'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ApplePreflightResult {
  ok: boolean
  is_new_user?: boolean
  [key: string]: unknown
}

export interface SessionResult {
  ok: boolean
  [key: string]: unknown
}

export interface RecoveryCodeResult {
  ok: boolean
  access_token?: string
  refresh_token?: string
  [key: string]: unknown
}

export interface AccessRequestResult {
  ok: boolean
  id?: string
  [key: string]: unknown
}

// ─── Client ───────────────────────────────────────────────────────────────────

export const apiAuth = {
  /** POST Apple Sign-In preflight — register email/name before Supabase */
  appleSignInPreflight: (email: string, fullName: string, checkOnly = false) =>
    apiPost<ApplePreflightResult>('/api/auth/apple/preflight', {
      email,
      full_name: fullName,
      ...(checkOnly ? { check_only: true } : {}),
    }),

  /** POST persist server-side session cookie */
  persistSession: (accessToken: string, refreshToken: string) =>
    apiPost<SessionResult>('/api/auth/session', {
      access_token: accessToken,
      refresh_token: refreshToken,
    }),

  /** POST verify recovery code and set new password */
  verifyRecoveryCode: (email: string, code: string, password: string) =>
    apiPost<RecoveryCodeResult>('/api/auth/recovery-code', { email, code, password }),

  /** POST submit new access request (student or teacher) */
  createAccessRequest: (payload: {
    email: string
    full_name: string
    phone?: string
    birth_date?: string
    role_requested: 'teacher' | 'student'
    cref?: string | null
    [key: string]: unknown
  }) =>
    apiPost<AccessRequestResult>('/api/access-request/create', payload),
}

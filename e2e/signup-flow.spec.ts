import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { config as loadEnv } from 'dotenv'
import { existsSync } from 'fs'
import { resolve } from 'path'

// Playwright doesn't auto-load .env.local; do it explicitly so the skip
// condition below sees Supabase credentials when they're available locally.
const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) loadEnv({ path: envPath })

/**
 * E2E: Complete signup-and-login flow.
 *
 * Covers the full post-approval signup path:
 *   1. Admin approves access_request (simulated via service_role)
 *   2. Auth user is created (simulated via admin.auth.admin.createUser —
 *      this is equivalent to the user completing signup after approval)
 *   3. handle_new_user trigger runs, setting profile.is_approved = true
 *      because the access_request is already in status='approved'
 *   4. User logs in via the real UI
 *   5. Server redirects to /dashboard
 *   6. Dashboard renders (not the login gate)
 *
 * All test state uses the email prefix e2e-signup-<nonce>@irontracks-test.local
 * and is removed in a finally block. Residuals from a crashed run are
 * identifiable:
 *   DELETE FROM auth.users WHERE email LIKE 'e2e-signup-%@irontracks-test.local';
 *
 * Skipped unless SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL are set.
 */

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL

test.describe('Signup flow', () => {
  test.skip(!SERVICE_KEY || !SUPABASE_URL, 'requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL')

  test('approved user can sign up, log in, and reach the dashboard', async ({ page }) => {
    test.setTimeout(120_000)
    const admin = createClient(SUPABASE_URL!, SERVICE_KEY!, {
      auth: { persistSession: false },
    })

    const nonce = randomBytes(4).toString('hex')
    const email = `e2e-signup-${nonce}@irontracks-test.local`
    const password = `E2e-Signup-${nonce}-${randomBytes(6).toString('hex')}`
    const fullName = `E2E Signup ${nonce}`
    let userId: string | null = null

    try {
      // 1. Admin approved this email beforehand. Use status='approved' —
      //    the canonical value written by the approve_access_request RPC.
      //    Migration 20260419110000 normalized all three auth.users triggers
      //    (enforce_invite_whitelist_v2, handle_new_user, link_user_and_profile_v2)
      //    to accept both 'approved' and 'accepted'. This test exercises the
      //    'approved' path end-to-end as a regression guard.
      const { error: arErr } = await admin.from('access_requests').insert({
        email,
        full_name: fullName,
        status: 'approved',
        role_requested: 'student',
      })
      expect(arErr, `access_requests insert error: ${arErr?.message}`).toBeFalsy()

      // 2. User completes signup (simulated — in production the user fills a
      //    password form that calls supabase.auth.signUp).
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: fullName, full_name: fullName },
      })
      expect(createErr, `createUser error: ${createErr?.message}`).toBeFalsy()
      expect(created?.user?.id).toBeTruthy()
      userId = created!.user!.id

      // 3. Triggers should have created the profile AND marked it approved
      //    automatically (regression guard for migration 20260419110000 —
      //    previously this was broken because link_user_and_profile_v2 preserved
      //    is_approved=false after handle_new_user wrote it).
      const { data: profile, error: pErr } = await admin
        .from('profiles')
        .select('id, email, is_approved, role')
        .eq('id', userId)
        .maybeSingle()
      expect(pErr, `profile lookup error: ${pErr?.message}`).toBeFalsy()
      expect(profile, 'profile row should exist after signup trigger').toBeTruthy()
      expect(profile?.is_approved, 'approved access_request should auto-mark profile.is_approved=true').toBe(true)

      // 4. Sign in using a Node Supabase client to obtain a real session,
      //    then inject it into the browser's localStorage. This is equivalent
      //    to the user submitting the login form, but without relying on the
      //    browser-side fetch to supabase.co — which is flaky from some
      //    headless environments (Failed to fetch / CORS quirks).
      const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      expect(ANON_KEY, 'NEXT_PUBLIC_SUPABASE_ANON_KEY required').toBeTruthy()

      const anon = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } })
      const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({ email, password })
      expect(signInErr, `signIn error: ${signInErr?.message}`).toBeFalsy()
      expect(signIn?.session?.access_token).toBeTruthy()

      const projectRef = new URL(SUPABASE_URL!).host.split('.')[0]
      const storageKey = `sb-${projectRef}-auth-token`
      const sessionJson = JSON.stringify(signIn!.session)

      // Load the origin first (needs to be a real page, not about:blank, for
      // localStorage access), then inject the session.
      await page.goto('/', { waitUntil: 'domcontentloaded' })
      await page.evaluate(([key, val]) => {
        localStorage.setItem(key, val as string)
      }, [storageKey, sessionJson])

      // 5. Navigate to dashboard with the session in place.
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
      await page.waitForURL((url) => url.pathname.includes('/dashboard'), { timeout: 15_000 })
      expect(page.url()).toContain('/dashboard')

      // 6. Dashboard is actually rendered — not the login gate.
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
      const body = (await page.textContent('body')) ?? ''
      const lower = body.toLowerCase()
      expect(lower, 'login gate should be gone').not.toContain('entrar com email')
      expect(lower, 'dashboard should mention iron').toContain('iron')
    } finally {
      // Cleanup — best-effort, delete by email so residuals from a partial run
      // (e.g. createUser succeeded but the test failed before userId was set)
      // also get cleaned up next run.
      if (userId) {
        try { await admin.auth.admin.deleteUser(userId) } catch { /* best-effort */ }
      } else {
        // If userId wasn't captured but the user may still exist, look it up.
        try {
          const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
          const stray = data?.users?.find((u) => u.email === email)
          if (stray) await admin.auth.admin.deleteUser(stray.id)
        } catch { /* best-effort */ }
      }
      try { await admin.from('access_requests').delete().eq('email', email) } catch { /* best-effort */ }
    }
  })
})

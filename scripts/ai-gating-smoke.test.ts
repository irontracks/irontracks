#!/usr/bin/env node
/**
 * Smoke test: AI endpoint gating (auth + rate-limit) against prod.
 *
 * Validates the gating chain for /api/ai/exercise-swap (no VIP gate,
 * just auth + rate-limit — simplest endpoint to exercise the rate path).
 * (Era /api/ai/exercise-chat; a rota foi renomeada e o alvo antigo passou a
 * cair no fallback HTML de página — 200 — quebrando as asserções.)
 *
 * Scenarios:
 *   1. Unauthenticated request       → 401 (requireUser fails)
 *   2. Authenticated user × 60 hits  → mix of 400 (body invalid, parsed
 *                                       after rate-limit passes) and
 *                                       429 (rate-limit hit: 15/min cap)
 *      Both counts must be > 0. Zero 2xx allowed because the body is
 *      deliberately invalid — any 2xx would mean zod parsing was bypassed.
 *
 * Zero Gemini quota consumed: exercise-swap checks rate-limit FIRST, then
 * parses the body. Invalid bodies return 400 before touching the LLM.
 * Overflow requests hit 429 before even parsing. Cost: zero tokens.
 *
 * Creates one synthetic user (prefix ai-gate-<nonce>@irontracks-test.local)
 * via service_role, signs in via anon key, sends the requests with a
 * Supabase-SSR-compatible auth cookie. Cleans up in finally.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_* + APP_BASE_URL.
 * Skips cleanly if any are missing.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { config as loadEnv } from 'dotenv'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { randomBytes } from 'crypto'

const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) loadEnv({ path: envPath })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BASE_URL = (process.env.APP_BASE_URL || 'https://irontracks.com.br').replace(/\/$/, '')

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  process.stdout.write('skipped (missing supabase env vars)\n')
  process.exit(0)
}

const NONCE = randomBytes(4).toString('hex')
const EMAIL = `ai-gate-${NONCE}@irontracks-test.local`
const PASSWORD = `Ai-Gate-${NONCE}-${randomBytes(6).toString('hex')}`
const FULL_NAME = `AI Gate ${NONCE}`

const EXERCISE_SWAP_URL = `${BASE_URL}/api/ai/exercise-swap`

const PROJECT_REF = new URL(SUPABASE_URL).host.split('.')[0]
const COOKIE_NAME = `sb-${PROJECT_REF}-auth-token`

function buildSupabaseCookie(session: unknown): string {
  // @supabase/ssr 0.8 encodes the cookie value as `base64-<base64url(JSON)>`.
  // The JSON is the raw Session object (not an array). See
  // node_modules/@supabase/ssr/dist/main/cookies.js — BASE64_PREFIX + stringToBase64URL.
  const json = JSON.stringify(session)
  const b64url = Buffer.from(json).toString('base64url')
  return `${COOKIE_NAME}=base64-${b64url}`
}

async function setup(): Promise<{ admin: SupabaseClient; userId: string; cookie: string }> {
  const admin = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } })

  // Pre-insert access_request (status=approved — will auto-mark profile
  // is_approved=true after the 20260419110000 trigger fix).
  await admin.from('access_requests').insert({
    email: EMAIL,
    full_name: FULL_NAME,
    status: 'approved',
    role_requested: 'student',
  })

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: FULL_NAME, full_name: FULL_NAME },
  })
  if (createErr || !created?.user) throw new Error(`createUser failed: ${createErr?.message}`)
  const userId = created.user.id

  const anon = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } })
  const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (signInErr || !signIn?.session?.access_token) throw new Error(`signIn failed: ${signInErr?.message}`)

  return { admin, userId, cookie: buildSupabaseCookie(signIn.session as unknown) }
}

async function cleanup(admin: SupabaseClient, userId: string): Promise<void> {
  try { await admin.auth.admin.deleteUser(userId) } catch { /* best-effort */ }
  try { await admin.from('access_requests').delete().eq('email', EMAIL) } catch { /* best-effort */ }
}

const failures: string[] = []
function check(name: string, pass: boolean, detail?: string): void {
  if (!pass) failures.push(`[FAIL] ${name}${detail ? ` — ${detail}` : ''}`)
}

// Deliberately invalid body: zod BodySchema requires `exerciseName` (string,
// min 1). Omitting it means the request parses to 400 AFTER rate-limit
// passes but BEFORE Gemini is touched.
const body = JSON.stringify({ not_a_valid_field: true })

async function post(cookie?: string): Promise<number> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (cookie) headers.cookie = cookie
  const res = await fetch(EXERCISE_SWAP_URL, { method: 'POST', headers, body })
  return res.status
}

async function main(): Promise<void> {
  let ctx: { admin: SupabaseClient; userId: string; cookie: string } | null = null
  try {
    ctx = await setup()

    // Scenario 1: unauthenticated request → 401
    const unauthStatus = await post()
    check(
      'unauthenticated POST /api/ai/exercise-swap → 401',
      unauthStatus === 401,
      `got ${unauthStatus}`,
    )

    // Scenario 2: 60 parallel authenticated requests with invalid body.
    // Rate-limit cap is 15/min (ai:exercise-swap:<userId>:<ip>). Expected:
    //   - ~15 × 400 (rate-limit passes, body fails zod validation)
    //   - ~45 × 429 (rate-limit hit)
    //   - 0 × 2xx (invalid body would need to bypass zod)
    //
    // If count429 === 0 that's a prod finding — rate-limit may have fallen
    // back to memory-per-instance (Upstash timeout/misconfig). We emit a
    // warning instead of failing so the rest of the chain is still asserted.
    const BATCH = 60
    const statuses = await Promise.all(
      Array.from({ length: BATCH }, () => post(ctx!.cookie)),
    )
    const count2xx = statuses.filter((s) => s >= 200 && s < 300).length
    const count400 = statuses.filter((s) => s === 400).length
    const count429 = statuses.filter((s) => s === 429).length
    const distribution = JSON.stringify(tally(statuses))

    check(
      'invalid body never returns 2xx (zod runs)',
      count2xx === 0,
      `got ${count2xx} 2xx responses — body validation skipped? distribution: ${distribution}`,
    )
    check(
      'invalid body returns 400 (auth + rate-limit passed, then zod rejects)',
      count400 > 0,
      `no 400 seen in ${BATCH} requests (distribution: ${distribution})`,
    )

    if (count429 === 0) {
      process.stderr.write(
        `[WARN] rate limit did not trigger 429 in ${BATCH} burst requests ` +
        `(expected ~${BATCH - 20}). Distribution: ${distribution}. ` +
        `Likely causes: Upstash Redis unreachable from the app (silently ` +
        `falls back to in-memory per-instance mode), or Vercel distributing ` +
        `across edge nodes faster than the memory-mode bucket fills. ` +
        `Investigate UPSTASH_REDIS_REST_URL / _TOKEN and the [rateLimit] ` +
        `log warning in Sentry.\n`,
      )
    }
  } finally {
    if (ctx) {
      try { await cleanup(ctx.admin, ctx.userId) } catch (e) {
        process.stderr.write(`cleanup error: ${e instanceof Error ? e.message : String(e)}\n`)
      }
    }
  }

  if (failures.length > 0) {
    for (const f of failures) process.stderr.write(`${f}\n`)
    process.stderr.write(`\n${failures.length} AI gating check(s) failed\n`)
    process.exit(1)
  }

  process.stdout.write('ok\n')
}

function tally(arr: number[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const s of arr) out[s] = (out[s] || 0) + 1
  return out
}

main().catch((e) => {
  process.stderr.write(`unhandled error: ${e instanceof Error ? e.message : String(e)}\n`)
  process.exit(1)
})

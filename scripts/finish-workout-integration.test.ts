#!/usr/bin/env node
/**
 * Integration smoke: POST /api/workouts/finish end-to-end against prod.
 *
 * Validates the full write path of the core workout-finish flow:
 *   auth (cookie) → rate-limit → zod parse → workouts INSERT → cache invalidation
 *
 * Scenarios:
 *   1. Authenticated POST with valid session → 200 + saved.id returned
 *   2. workouts row exists in DB with the caller as user_id and a completed_at
 *   3. Same idempotencyKey replayed → 200 + `idempotent: true`, same saved.id
 *   4. Unauthenticated POST → 401
 *
 * Creates one synthetic user via service_role, signs in, sends the request
 * with the Supabase-SSR-compatible cookie. Cleans up workouts + user in finally.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_* + APP_BASE_URL.
 * Skips cleanly if any are missing.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { config as loadEnv } from 'dotenv'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { randomBytes, randomUUID } from 'crypto'

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
const EMAIL = `fin-wkt-${NONCE}@irontracks-test.local`
const PASSWORD = `Fin-Wkt-${NONCE}-${randomBytes(6).toString('hex')}`
const FULL_NAME = `Finish Workout ${NONCE}`

const FINISH_URL = `${BASE_URL}/api/workouts/finish`

const PROJECT_REF = new URL(SUPABASE_URL).host.split('.')[0]
const COOKIE_NAME = `sb-${PROJECT_REF}-auth-token`

function buildSupabaseCookie(session: unknown): string {
  const json = JSON.stringify(session)
  const b64url = Buffer.from(json).toString('base64url')
  return `${COOKIE_NAME}=base64-${b64url}`
}

async function setup(): Promise<{ admin: SupabaseClient; userId: string; cookie: string }> {
  const admin = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } })

  await admin.from('access_requests').insert({
    email: EMAIL, full_name: FULL_NAME, status: 'approved', role_requested: 'student',
  })

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: EMAIL, password: PASSWORD, email_confirm: true,
    user_metadata: { display_name: FULL_NAME, full_name: FULL_NAME },
  })
  if (createErr || !created?.user) throw new Error(`createUser failed: ${createErr?.message}`)

  const anon = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } })
  const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (signInErr || !signIn?.session?.access_token) throw new Error(`signIn failed: ${signInErr?.message}`)

  return {
    admin,
    userId: created.user.id,
    cookie: buildSupabaseCookie(signIn.session as unknown),
  }
}

async function cleanup(admin: SupabaseClient, userId: string): Promise<void> {
  try { await admin.from('workouts').delete().eq('user_id', userId) } catch { /* best-effort */ }
  try { await admin.from('active_workout_sessions').delete().eq('user_id', userId) } catch { /* best-effort */ }
  try { await admin.from('user_activity_events').delete().eq('user_id', userId) } catch { /* best-effort */ }
  try { await admin.auth.admin.deleteUser(userId) } catch { /* best-effort */ }
  try { await admin.from('access_requests').delete().eq('email', EMAIL) } catch { /* best-effort */ }
}

const failures: string[] = []
function check(name: string, pass: boolean, detail?: string): void {
  if (!pass) failures.push(`[FAIL] ${name}${detail ? ` — ${detail}` : ''}`)
}

interface FinishResponse {
  ok?: boolean
  saved?: { id?: string; created_at?: string }
  idempotent?: boolean
  error?: string
}

function buildFinishBody(idempotencyKey: string) {
  // Minimal but realistic session payload — matches what the client sends
  // from WorkoutScreen when a user taps "Finalizar Treino".
  return {
    session: {
      workoutTitle: `E2E Integration ${NONCE}`,
      date: new Date().toISOString(),
      idempotencyKey,
      finishIdempotencyKey: idempotencyKey,
      exercises: [
        {
          name: 'Supino reto',
          sets: 3,
          setDetails: [
            { weight: 60, reps: 10 },
            { weight: 60, reps: 10 },
            { weight: 60, reps: 8 },
          ],
        },
      ],
      logs: {
        '0-0': { done: true, weight: 60, reps: 10 },
        '0-1': { done: true, weight: 60, reps: 10 },
        '0-2': { done: true, weight: 60, reps: 8 },
      },
    },
    idempotencyKey,
  }
}

async function post(body: unknown, cookie?: string): Promise<{ status: number; data: FinishResponse }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (cookie) headers.cookie = cookie
  const res = await fetch(FINISH_URL, { method: 'POST', headers, body: JSON.stringify(body) })
  const data = (await res.json().catch(() => ({}))) as FinishResponse
  return { status: res.status, data }
}

async function main(): Promise<void> {
  let ctx: { admin: SupabaseClient; userId: string; cookie: string } | null = null
  try {
    ctx = await setup()

    const idempotencyKey = randomUUID()
    const body = buildFinishBody(idempotencyKey)

    // Scenario 1: authenticated POST → 200 + saved.id
    const first = await post(body, ctx.cookie)
    check(
      'POST /api/workouts/finish (authenticated) → 200 + saved.id',
      first.status === 200 && first.data.ok === true && typeof first.data.saved?.id === 'string',
      `status=${first.status} body=${JSON.stringify(first.data).slice(0, 200)}`,
    )
    const savedId = first.data.saved?.id

    // Scenario 2: workouts row exists with correct user_id + completed_at
    if (savedId) {
      const { data: row } = await ctx.admin
        .from('workouts')
        .select('id, user_id, name, completed_at, is_template, finish_idempotency_key')
        .eq('id', savedId)
        .maybeSingle()
      check(
        'workouts row persisted with caller user_id',
        !!row && row.user_id === ctx.userId,
        row ? `user_id=${row.user_id}` : 'row not found',
      )
      check(
        'workouts row has completed_at set',
        !!row?.completed_at,
        `completed_at=${row?.completed_at ?? 'null'}`,
      )
      check(
        'workouts row is not a template',
        row?.is_template === false,
        `is_template=${row?.is_template}`,
      )
      check(
        'workouts row stores the idempotency key',
        row?.finish_idempotency_key === idempotencyKey,
        `got=${row?.finish_idempotency_key}`,
      )
    }

    // Scenario 3: replay same idempotencyKey → idempotent response
    const replay = await post(body, ctx.cookie)
    check(
      'replaying same idempotencyKey → 200 + idempotent:true',
      replay.status === 200 && replay.data.ok === true && replay.data.idempotent === true,
      `status=${replay.status} body=${JSON.stringify(replay.data).slice(0, 200)}`,
    )
    check(
      'replay returns the same saved.id',
      replay.data.saved?.id === savedId,
      `first=${savedId} replay=${replay.data.saved?.id}`,
    )

    // Scenario 4: unauthenticated POST → 401
    const unauth = await post(body)
    check(
      'unauthenticated POST → 401',
      unauth.status === 401,
      `got ${unauth.status}`,
    )
  } finally {
    if (ctx) {
      try { await cleanup(ctx.admin, ctx.userId) } catch (e) {
        process.stderr.write(`cleanup error: ${e instanceof Error ? e.message : String(e)}\n`)
      }
    }
  }

  if (failures.length > 0) {
    for (const f of failures) process.stderr.write(`${f}\n`)
    process.stderr.write(`\n${failures.length} finish-workout check(s) failed\n`)
    process.exit(1)
  }

  process.stdout.write('ok\n')
}

main().catch((e) => {
  process.stderr.write(`unhandled error: ${e instanceof Error ? e.message : String(e)}\n`)
  process.exit(1)
})

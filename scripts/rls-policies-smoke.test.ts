#!/usr/bin/env node
/**
 * Smoke test: RLS policies — validates that the still-active policies block
 * the vectors they claim to block, and don't break legitimate flows.
 *
 * Scope reduced after PR #70 removed the chat_channels dead system
 * (closes #55). Remaining coverage:
 *   1. access_requests: anon cannot INSERT status='approved'; can INSERT 'pending'
 *   2. users_share_private_channel RPC (now checks direct_channels): false
 *      for disconnected users, true for users that share a direct_channel
 *
 * Creates 2 synthetic users (userA, userB) via service_role, signs them in
 * via the anon key to obtain real JWTs, then exercises each vector. All
 * created rows are cleaned up in a finally block.
 *
 * Email pattern: rls-smoke-<nonce>-<a|b>@irontracks-test.local
 * Residuals cleanup: DELETE FROM auth.users WHERE email LIKE 'rls-smoke-%@irontracks-test.local';
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 * SUPABASE_SERVICE_ROLE_KEY. Skips cleanly if missing.
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

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  process.stdout.write('skipped (missing supabase env vars)\n')
  process.exit(0)
}

const NONCE = randomBytes(4).toString('hex')
const EMAIL_PREFIX = `rls-smoke-${NONCE}`
const PASSWORD = `Rls-Smoke-${NONCE}-${randomBytes(6).toString('hex')}`

interface Ctx {
  admin: SupabaseClient
  userA: { id: string; email: string }
  userB: { id: string; email: string }
  createdDirectChannelIds: string[]
}

async function setup(): Promise<Ctx> {
  const admin = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } })

  const emailA = `${EMAIL_PREFIX}-a@irontracks-test.local`
  const emailB = `${EMAIL_PREFIX}-b@irontracks-test.local`

  await admin.from('access_requests').insert([
    { email: emailA, full_name: 'RLS A', status: 'approved', role_requested: 'student' },
    { email: emailB, full_name: 'RLS B', status: 'approved', role_requested: 'student' },
  ])

  const { data: a, error: aErr } = await admin.auth.admin.createUser({
    email: emailA, password: PASSWORD, email_confirm: true,
    user_metadata: { display_name: 'RLS Test A' },
  })
  if (aErr || !a?.user) throw new Error(`createUser A failed: ${aErr?.message}`)

  const { data: b, error: bErr } = await admin.auth.admin.createUser({
    email: emailB, password: PASSWORD, email_confirm: true,
    user_metadata: { display_name: 'RLS Test B' },
  })
  if (bErr || !b?.user) throw new Error(`createUser B failed: ${bErr?.message}`)

  return {
    admin,
    userA: { id: a.user.id, email: emailA },
    userB: { id: b.user.id, email: emailB },
    createdDirectChannelIds: [],
  }
}

async function cleanup(ctx: Ctx): Promise<void> {
  if (ctx.createdDirectChannelIds.length > 0) {
    await ctx.admin.from('direct_messages').delete().in('channel_id', ctx.createdDirectChannelIds)
    await ctx.admin.from('direct_channels').delete().in('id', ctx.createdDirectChannelIds)
  }
  await ctx.admin.from('access_requests').delete().like('email', `${EMAIL_PREFIX}%`)
  await ctx.admin.auth.admin.deleteUser(ctx.userA.id)
  await ctx.admin.auth.admin.deleteUser(ctx.userB.id)
}

const failures: string[] = []
function check(name: string, pass: boolean, detail?: string): void {
  if (!pass) failures.push(`[FAIL] ${name}${detail ? ` — ${detail}` : ''}`)
}

async function test_access_requests_status_pending(ctx: Ctx): Promise<void> {
  const anon = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } })
  const bogusEmail = `${EMAIL_PREFIX}-escalation@irontracks-test.local`
  const { error } = await anon.from('access_requests').insert({
    email: bogusEmail,
    full_name: 'Attacker',
    status: 'approved',
  })
  check(
    'access_requests blocks anon INSERT with status=approved',
    !!error,
    error ? undefined : 'insert succeeded (privilege escalation vector OPEN)',
  )
  await ctx.admin.from('access_requests').delete().eq('email', bogusEmail)

  const legitEmail = `${EMAIL_PREFIX}-legit@irontracks-test.local`
  const { error: legitErr } = await anon.from('access_requests').insert({
    email: legitEmail,
    full_name: 'Legit User',
    status: 'pending',
  })
  check(
    'access_requests allows anon INSERT with status=pending (legit signup)',
    !legitErr,
    legitErr?.message,
  )
  await ctx.admin.from('access_requests').delete().eq('email', legitEmail)
}

async function test_users_share_private_channel_rpc(ctx: Ctx): Promise<void> {
  // Before any direct_channel is created, users don't share → false
  const { data: disconnected } = await ctx.admin.rpc('users_share_private_channel', {
    p_a: ctx.userA.id,
    p_b: ctx.userB.id,
  })
  check(
    'users_share_private_channel returns false for users without shared direct_channel',
    disconnected === false,
    disconnected !== false ? `got ${JSON.stringify(disconnected)}` : undefined,
  )

  // Create a direct_channel between A and B (ordered pair; same convention
  // as get_or_create_direct_channel RPC uses: LEAST/GREATEST for insertion order).
  const [u1, u2] = ctx.userA.id < ctx.userB.id ? [ctx.userA.id, ctx.userB.id] : [ctx.userB.id, ctx.userA.id]
  const { data: ch } = await ctx.admin.from('direct_channels').insert({ user1_id: u1, user2_id: u2 }).select('id').single()
  if (ch) {
    ctx.createdDirectChannelIds.push(ch.id)
    const { data: connected } = await ctx.admin.rpc('users_share_private_channel', {
      p_a: ctx.userA.id,
      p_b: ctx.userB.id,
    })
    check(
      'users_share_private_channel returns true for users sharing a direct_channel',
      connected === true,
      connected !== true ? `got ${JSON.stringify(connected)}` : undefined,
    )
    // Also confirms order-agnostic: swap arguments
    const { data: connectedSwap } = await ctx.admin.rpc('users_share_private_channel', {
      p_a: ctx.userB.id,
      p_b: ctx.userA.id,
    })
    check(
      'users_share_private_channel is order-agnostic (p_a/p_b swapped still true)',
      connectedSwap === true,
      connectedSwap !== true ? `got ${JSON.stringify(connectedSwap)}` : undefined,
    )
  } else {
    check('users_share_private_channel test setup (direct_channel create)', false)
  }
}

async function main(): Promise<void> {
  let ctx: Ctx | null = null
  try {
    ctx = await setup()
    await test_access_requests_status_pending(ctx)
    await test_users_share_private_channel_rpc(ctx)
  } finally {
    if (ctx) {
      try {
        await cleanup(ctx)
      } catch (e) {
        process.stderr.write(`cleanup error: ${e instanceof Error ? e.message : String(e)}\n`)
      }
    }
  }

  if (failures.length > 0) {
    for (const f of failures) process.stderr.write(`${f}\n`)
    process.stderr.write(`\n${failures.length} RLS check(s) failed\n`)
    process.exit(1)
  }

  process.stdout.write('ok\n')
}

main().catch((e) => {
  process.stderr.write(`unhandled error: ${e instanceof Error ? e.message : String(e)}\n`)
  process.exit(1)
})

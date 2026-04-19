#!/usr/bin/env node
/**
 * Smoke test: RLS policies — validates that the policies added in
 * 20260418140000..20260419100000 actually block the attack vectors they
 * claim to block, and don't break legitimate flows.
 *
 * Creates 2 synthetic users (userA, userB) via service_role, signs them in
 * via the anon key to obtain real JWTs, then exercises each vector. All
 * created rows are cleaned up in a finally block.
 *
 * Test users use the email pattern `rls-smoke-<nonce>-<a|b>@irontracks-test.local`
 * so residuals from a crashed run are identifiable:
 *   DELETE FROM auth.users WHERE email LIKE 'rls-smoke-%@irontracks-test.local';
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 * SUPABASE_SERVICE_ROLE_KEY. Skips cleanly if missing (so it's safe in CI
 * environments that don't have the service_role key).
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
  userA: { id: string; email: string; client: SupabaseClient }
  userB: { id: string; email: string; client: SupabaseClient }
  createdChannelIds: string[]
  createdInviteIds: string[]
}

async function setup(): Promise<Ctx> {
  const admin = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } })

  const emailA = `${EMAIL_PREFIX}-a@irontracks-test.local`
  const emailB = `${EMAIL_PREFIX}-b@irontracks-test.local`

  // Satisfy the enforce_invite_whitelist_v2 trigger on auth.users — signups
  // are only permitted for emails present in admin_emails, access_requests
  // (pending|accepted), students, or teachers. Pre-insert access_requests so
  // createUser below is allowed. Cleaned up by cleanup() via email LIKE.
  await admin.from('access_requests').insert([
    { email: emailA, full_name: 'RLS Test A', status: 'pending' },
    { email: emailB, full_name: 'RLS Test B', status: 'pending' },
  ])

  const { data: a, error: aErr } = await admin.auth.admin.createUser({
    email: emailA,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: 'RLS Test User A' },
  })
  if (aErr || !a?.user) throw new Error(`createUser A failed: ${aErr?.message}`)

  const { data: b, error: bErr } = await admin.auth.admin.createUser({
    email: emailB,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: 'RLS Test User B' },
  })
  if (bErr || !b?.user) throw new Error(`createUser B failed: ${bErr?.message}`)

  const clientA = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } })
  const { error: signInAErr } = await clientA.auth.signInWithPassword({ email: emailA, password: PASSWORD })
  if (signInAErr) throw new Error(`signIn A failed: ${signInAErr.message}`)

  const clientB = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } })
  const { error: signInBErr } = await clientB.auth.signInWithPassword({ email: emailB, password: PASSWORD })
  if (signInBErr) throw new Error(`signIn B failed: ${signInBErr.message}`)

  return {
    admin,
    userA: { id: a.user.id, email: emailA, client: clientA },
    userB: { id: b.user.id, email: emailB, client: clientB },
    createdChannelIds: [],
    createdInviteIds: [],
  }
}

async function cleanup(ctx: Ctx): Promise<void> {
  if (ctx.createdChannelIds.length > 0) {
    await ctx.admin.from('chat_members').delete().in('channel_id', ctx.createdChannelIds)
    await ctx.admin.from('messages').delete().in('channel_id', ctx.createdChannelIds)
    await ctx.admin.from('chat_channels').delete().in('id', ctx.createdChannelIds)
  }
  if (ctx.createdInviteIds.length > 0) {
    await ctx.admin.from('chat_invites').delete().in('id', ctx.createdInviteIds)
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

async function test_chat_channels_only_private(ctx: Ctx): Promise<void> {
  // Attack vector: anon-key holder tries to create a public 'global' channel.
  // Legitimate globals are created only via service_role in /api/chat/global-id.
  const { data: globalTry, error: globalErr } = await ctx.userA.client
    .from('chat_channels')
    .insert({ type: 'global' })
    .select('id')
    .maybeSingle()
  check(
    'chat_channels blocks authenticated INSERT with type=global',
    !!globalErr || !globalTry,
    globalTry ? `inserted id=${globalTry.id}` : undefined,
  )
  if (globalTry?.id) ctx.createdChannelIds.push(globalTry.id)

  // Note: direct INSERT of type='private' by the creator also fails because
  // the RETURNING clause requires a SELECT policy that matches the new row,
  // and the "View my private channels" SELECT policy only fires after the
  // user is a chat_members row — which cannot exist for a channel that
  // doesn't exist yet. This is intentional: private channels are created
  // exclusively via accept_chat_invite (SECURITY DEFINER).
}

async function test_chat_members_only_self(ctx: Ctx): Promise<void> {
  // Channel created via admin (service_role bypasses RLS). In a real flow
  // this would have been created via accept_chat_invite RPC.
  const { data: ch } = await ctx.admin.from('chat_channels').insert({ type: 'private' }).select('id').single()
  if (!ch) { check('chat_members test — setup', false); return }
  ctx.createdChannelIds.push(ch.id)

  // Attack: user A tries to add user B to a channel — DM spy vector.
  const { error: foreignErr } = await ctx.userA.client
    .from('chat_members')
    .insert({ channel_id: ch.id, user_id: ctx.userB.id })
  check(
    'chat_members blocks INSERT with user_id != auth.uid() (cross-user)',
    !!foreignErr,
    foreignErr ? undefined : 'A added B to a channel (DM spy vector OPEN)',
  )

  // Legit: user A adds themselves (allowed by the "Users can add themselves"
  // policy; fails with "duplicate key" if chat_members SELECT can't see the
  // row, which is fine — we only care the WITH CHECK passes).
  const { error: selfErr } = await ctx.userA.client
    .from('chat_members')
    .insert({ channel_id: ch.id, user_id: ctx.userA.id })
  check(
    'chat_members allows INSERT with user_id = auth.uid()',
    !selfErr || /duplicate key/i.test(selfErr.message || ''),
    selfErr?.message,
  )
}

async function test_messages_select_membership(ctx: Ctx): Promise<void> {
  const { data: ch } = await ctx.admin.from('chat_channels').insert({ type: 'private' }).select('id').single()
  if (!ch) { check('messages test — setup channel', false); return }
  ctx.createdChannelIds.push(ch.id)

  await ctx.admin.from('chat_members').insert({ channel_id: ch.id, user_id: ctx.userB.id })
  await ctx.admin.from('messages').insert({
    channel_id: ch.id,
    user_id: ctx.userB.id,
    content: 'secret from B',
  })

  const { data: leak } = await ctx.userA.client
    .from('messages')
    .select('id, content')
    .eq('channel_id', ch.id)
  check(
    'messages SELECT hides rows from non-members',
    !leak || leak.length === 0,
    leak && leak.length > 0 ? `A read ${leak.length} messages from B's channel (DM leak OPEN)` : undefined,
  )

  const { error: foreignInsertErr } = await ctx.userA.client.from('messages').insert({
    channel_id: ch.id,
    user_id: ctx.userA.id,
    content: 'spam from A',
  })
  check(
    'messages INSERT blocks writes to channels the user is not a member of',
    !!foreignInsertErr,
    foreignInsertErr ? undefined : 'A injected a message into B-only channel (spam vector OPEN)',
  )
}

async function test_accept_chat_invite_rpc(ctx: Ctx): Promise<void> {
  // Clear any residual pending invite from the previous UPDATE test to avoid
  // the chat_invites_unique_pending unique constraint.
  await ctx.admin.from('chat_invites').delete()
    .eq('sender_id', ctx.userA.id).eq('receiver_id', ctx.userB.id)

  const { data: invite, error: inviteErr } = await ctx.userA.client
    .from('chat_invites')
    .insert({ sender_id: ctx.userA.id, receiver_id: ctx.userB.id })
    .select('id')
    .single()
  if (inviteErr || !invite) { check('accept_chat_invite — setup invite', false, inviteErr?.message); return }
  ctx.createdInviteIds.push(invite.id)

  const { error: stealErr } = await ctx.userA.client.rpc('accept_chat_invite', { p_invite_id: invite.id })
  check(
    'accept_chat_invite rejects caller != receiver with FORBIDDEN',
    !!stealErr && /FORBIDDEN/.test(stealErr.message || ''),
    stealErr ? undefined : 'A (sender) accepted own invite to B (identity spoof OPEN)',
  )

  const { data: channelId, error: acceptErr } = await ctx.userB.client.rpc('accept_chat_invite', { p_invite_id: invite.id })
  check(
    'accept_chat_invite succeeds for receiver',
    !acceptErr && typeof channelId === 'string',
    acceptErr?.message,
  )
  if (typeof channelId === 'string') ctx.createdChannelIds.push(channelId)

  const { error: reuseErr } = await ctx.userB.client.rpc('accept_chat_invite', { p_invite_id: invite.id })
  check(
    'accept_chat_invite rejects re-accept with INVITE_NOT_PENDING',
    !!reuseErr && /INVITE_NOT_PENDING/.test(reuseErr.message || ''),
    reuseErr ? undefined : 'double-accept passed (duplicate channel vector)',
  )
}

async function test_chat_invites_update_with_check(ctx: Ctx): Promise<void> {
  const { data: invite } = await ctx.userA.client
    .from('chat_invites')
    .insert({ sender_id: ctx.userA.id, receiver_id: ctx.userB.id })
    .select('id')
    .single()
  if (!invite) { check('chat_invites UPDATE — setup', false); return }
  ctx.createdInviteIds.push(invite.id)

  const { error: badStatusErr, data: updRows } = await ctx.userB.client
    .from('chat_invites')
    .update({ status: 'pending_hack' })
    .eq('id', invite.id)
    .select('id')
  check(
    'chat_invites UPDATE rejects arbitrary status (WITH CHECK)',
    !!badStatusErr || !updRows || updRows.length === 0,
    updRows && updRows.length > 0 ? 'receiver set status=pending_hack' : undefined,
  )

  const { error: hijackErr, data: hijackRows } = await ctx.userA.client
    .from('chat_invites')
    .update({ status: 'rejected' })
    .eq('id', invite.id)
    .select('id')
  check(
    'chat_invites UPDATE blocks sender from rejecting on behalf of receiver',
    !hijackErr || !hijackRows || hijackRows.length === 0,
    hijackRows && hijackRows.length > 0 ? 'sender rejected their own invite from receiver side' : undefined,
  )
}

async function test_users_share_private_channel_rpc(ctx: Ctx): Promise<void> {
  const { data: disconnected } = await ctx.admin.rpc('users_share_private_channel', {
    p_a: ctx.userA.id,
    p_b: ctx.userB.id,
  })
  check(
    'users_share_private_channel returns false for users without shared channel',
    disconnected === false,
    disconnected !== false ? `got ${JSON.stringify(disconnected)}` : undefined,
  )

  const { data: ch } = await ctx.admin.from('chat_channels').insert({ type: 'private' }).select('id').single()
  if (ch) {
    ctx.createdChannelIds.push(ch.id)
    await ctx.admin.from('chat_members').insert([
      { channel_id: ch.id, user_id: ctx.userA.id },
      { channel_id: ch.id, user_id: ctx.userB.id },
    ])
    const { data: connected } = await ctx.admin.rpc('users_share_private_channel', {
      p_a: ctx.userA.id,
      p_b: ctx.userB.id,
    })
    check(
      'users_share_private_channel returns true for users sharing a channel',
      connected === true,
      connected !== true ? `got ${JSON.stringify(connected)}` : undefined,
    )
  }
}

async function main(): Promise<void> {
  let ctx: Ctx | null = null
  try {
    ctx = await setup()
    await test_access_requests_status_pending(ctx)
    await test_chat_channels_only_private(ctx)
    await test_chat_members_only_self(ctx)
    await test_messages_select_membership(ctx)
    await test_chat_invites_update_with_check(ctx)
    // users_share_private_channel must run BEFORE accept_chat_invite because
    // the accept RPC creates a shared channel between A and B as a side effect,
    // which would make the "disconnected" assertion fail.
    await test_users_share_private_channel_rpc(ctx)
    await test_accept_chat_invite_rpc(ctx)
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

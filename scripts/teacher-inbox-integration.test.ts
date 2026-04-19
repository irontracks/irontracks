#!/usr/bin/env node
/**
 * Integration smoke: teacher ↔ student inbox flow end-to-end against prod.
 *
 * Exercises the real direct-messages chat system (direct_channels +
 * direct_messages, used by /api/teacher/inbox/send-message) — the system
 * that's *actually* alive in prod (23 messages, 10 channels), distinct
 * from the dormant chat_members system covered by RLS smoke.
 *
 * Scenarios:
 *   1. Teacher POSTs to the student they are linked to
 *      → 200 + channel_id
 *      → direct_messages row persisted with teacher as sender
 *      → direct_channels row with ordered (user1_id, user2_id) pair
 *   2. Student reads direct_messages via their own authenticated client
 *      → sees the teacher's message through RLS (channel membership)
 *   3. Random third user (non-admin, non-linked teacher) tries to DM
 *      the same student → 403 forbidden
 *   4. Unauthenticated POST → 401
 *
 * Setup (via service_role):
 *   - Teacher:  profile.role='teacher', approved, name, email
 *   - Student:  profile.role='student', approved
 *   - Third:    profile.role='user', approved (not linked to the student)
 *   - students.{teacher_id=teacher.userId, user_id=student.userId, status='ativo'}
 *     (this is the relationship that the route's 403 gate checks)
 *
 * All state uses email prefix ti-<nonce>-{t|s|x}@irontracks-test.local.
 * Cleanup in finally removes direct_messages, direct_channels, students rows,
 * auth users, access_requests.
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
const PREFIX = `ti-${NONCE}`
const PASSWORD = `Ti-${NONCE}-${randomBytes(6).toString('hex')}`

const SEND_URL = `${BASE_URL}/api/teacher/inbox/send-message`

const PROJECT_REF = new URL(SUPABASE_URL).host.split('.')[0]
const COOKIE_NAME = `sb-${PROJECT_REF}-auth-token`

function buildSupabaseCookie(session: unknown): string {
  const json = JSON.stringify(session)
  const b64url = Buffer.from(json).toString('base64url')
  return `${COOKIE_NAME}=base64-${b64url}`
}

interface TestUser {
  id: string
  email: string
  cookie: string
  client: SupabaseClient
}

async function createTestUser(
  admin: SupabaseClient,
  label: string,
  profileRole: 'teacher' | 'student' | 'user',
): Promise<TestUser> {
  const email = `${PREFIX}-${label}@irontracks-test.local`
  const fullName = `Teacher Inbox ${label.toUpperCase()}`
  const roleRequested = profileRole === 'teacher' ? 'teacher' : 'student'

  await admin.from('access_requests').insert({
    email, full_name: fullName, status: 'approved', role_requested: roleRequested,
  })

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
    user_metadata: { display_name: fullName, full_name: fullName },
  })
  if (createErr || !created?.user) throw new Error(`createUser ${label} failed: ${createErr?.message}`)
  const userId = created.user.id

  // Force profile.role to the exact value the test needs — the trigger's
  // mapping may not set 'student' explicitly.
  await admin.from('profiles').update({
    role: profileRole, is_approved: true, approval_status: 'approved',
  }).eq('id', userId)

  const anon = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } })
  const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({ email, password: PASSWORD })
  if (signInErr || !signIn?.session?.access_token) throw new Error(`signIn ${label} failed: ${signInErr?.message}`)

  return {
    id: userId,
    email,
    cookie: buildSupabaseCookie(signIn.session as unknown),
    client: createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${signIn.session.access_token}` } },
    }),
  }
}

interface Ctx {
  admin: SupabaseClient
  teacher: TestUser
  student: TestUser
  third: TestUser
  createdChannelIds: string[]
  createdStudentRowId: string | null
}

async function setup(): Promise<Ctx> {
  const admin = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } })
  const teacher = await createTestUser(admin, 't', 'teacher')
  const student = await createTestUser(admin, 's', 'student')
  const third = await createTestUser(admin, 'x', 'teacher') // also a teacher, but NOT linked to our student

  // Link student ↔ teacher via students table. The route checks:
  //   students WHERE user_id = studentUserId AND teacher_id = teacherUserId
  const { data: studentRow, error: stErr } = await admin.from('students').insert({
    teacher_id: teacher.id,
    user_id: student.id,
    name: `Student ${NONCE}`,
    email: student.email,
    status: 'ativo',
  }).select('id').single()
  if (stErr || !studentRow) throw new Error(`students insert failed: ${stErr?.message}`)

  return { admin, teacher, student, third, createdChannelIds: [], createdStudentRowId: studentRow.id }
}

async function cleanup(ctx: Ctx): Promise<void> {
  if (ctx.createdChannelIds.length > 0) {
    try { await ctx.admin.from('direct_messages').delete().in('channel_id', ctx.createdChannelIds) } catch { /* noop */ }
    try { await ctx.admin.from('direct_channels').delete().in('id', ctx.createdChannelIds) } catch { /* noop */ }
  }
  // Also catch any direct_channels not tracked (defensive)
  try {
    await ctx.admin.from('direct_channels').delete()
      .or(`user1_id.in.(${ctx.teacher.id},${ctx.student.id},${ctx.third.id}),user2_id.in.(${ctx.teacher.id},${ctx.student.id},${ctx.third.id})`)
  } catch { /* noop */ }
  if (ctx.createdStudentRowId) {
    try { await ctx.admin.from('students').delete().eq('id', ctx.createdStudentRowId) } catch { /* noop */ }
  }
  try { await ctx.admin.from('access_requests').delete().like('email', `${PREFIX}%`) } catch { /* noop */ }
  for (const u of [ctx.teacher, ctx.student, ctx.third]) {
    try { await ctx.admin.auth.admin.deleteUser(u.id) } catch { /* noop */ }
  }
}

const failures: string[] = []
function check(name: string, pass: boolean, detail?: string): void {
  if (!pass) failures.push(`[FAIL] ${name}${detail ? ` — ${detail}` : ''}`)
}

async function post(url: string, cookie: string | undefined, body: unknown): Promise<{ status: number; data: Record<string, unknown> }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (cookie) headers.cookie = cookie
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { status: res.status, data }
}

async function main(): Promise<void> {
  let ctx: Ctx | null = null
  try {
    ctx = await setup()

    const msg = `teacher inbox probe ${NONCE}`

    // Scenario 1: Teacher → linked student → 200 + channel_id
    const sendT = await post(SEND_URL, ctx.teacher.cookie, {
      student_user_id: ctx.student.id,
      content: msg,
    })
    check(
      'teacher POST /api/teacher/inbox/send-message → 200',
      sendT.status === 200 && sendT.data.ok === true && typeof sendT.data.channel_id === 'string',
      `status=${sendT.status} body=${JSON.stringify(sendT.data).slice(0, 200)}`,
    )
    const channelId = typeof sendT.data.channel_id === 'string' ? sendT.data.channel_id : null
    if (channelId) ctx.createdChannelIds.push(channelId)

    if (channelId) {
      // direct_messages row exists with expected shape
      const { data: msgRow } = await ctx.admin
        .from('direct_messages')
        .select('id, channel_id, sender_id, content')
        .eq('channel_id', channelId)
        .eq('content', msg)
        .maybeSingle()
      check(
        'direct_messages row persisted with teacher as sender',
        !!msgRow && msgRow.sender_id === ctx.teacher.id,
        `row=${JSON.stringify(msgRow)}`,
      )

      // direct_channels has an ordered (user1_id, user2_id) pair
      const { data: chRow } = await ctx.admin
        .from('direct_channels')
        .select('id, user1_id, user2_id')
        .eq('id', channelId)
        .maybeSingle()
      const pair = chRow ? new Set([chRow.user1_id, chRow.user2_id]) : new Set()
      check(
        'direct_channels has teacher + student as ordered pair',
        pair.has(ctx.teacher.id) && pair.has(ctx.student.id),
        `pair=${JSON.stringify(chRow)}`,
      )

      // Student can read the message via RLS on direct_messages
      const { data: readRows } = await ctx.student.client
        .from('direct_messages')
        .select('id, content, sender_id')
        .eq('channel_id', channelId)
      const readContents = (readRows ?? []).map((r) => (r as { content?: string }).content)
      check(
        'student client (RLS-authenticated) can read teacher\'s message',
        readContents.includes(msg),
        `got=${JSON.stringify(readContents).slice(0, 200)}`,
      )
    }

    // Scenario 3: Third (unlinked teacher) tries to DM the same student → 403
    const sendX = await post(SEND_URL, ctx.third.cookie, {
      student_user_id: ctx.student.id,
      content: 'spam from stranger',
    })
    check(
      'unlinked teacher POST for this student → 403',
      sendX.status === 403,
      `status=${sendX.status} body=${JSON.stringify(sendX.data).slice(0, 200)}`,
    )

    // Scenario 4: Unauthenticated POST → 401
    const sendU = await post(SEND_URL, undefined, {
      student_user_id: ctx.student.id,
      content: 'no auth',
    })
    check(
      'unauthenticated POST → 401',
      sendU.status === 401,
      `status=${sendU.status}`,
    )
  } finally {
    if (ctx) {
      try { await cleanup(ctx) } catch (e) {
        process.stderr.write(`cleanup error: ${e instanceof Error ? e.message : String(e)}\n`)
      }
    }
  }

  if (failures.length > 0) {
    for (const f of failures) process.stderr.write(`${f}\n`)
    process.stderr.write(`\n${failures.length} teacher-inbox check(s) failed\n`)
    process.exit(1)
  }

  process.stdout.write('ok\n')
}

main().catch((e) => {
  process.stderr.write(`unhandled error: ${e instanceof Error ? e.message : String(e)}\n`)
  process.exit(1)
})

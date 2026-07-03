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
 *   3. Students can read assigned workouts (migration 20260703220000):
 *      aluno (students.user_id = auth.uid()) LÊ workout/exercise/set onde
 *      workouts.student_id = students.id; NÃO consegue UPDATE/DELETE; e um
 *      terceiro sem vínculo não vê nada
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
  createdStudentIds: string[]
  createdWorkoutIds: string[]
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
    createdStudentIds: [],
    createdWorkoutIds: [],
  }
}

async function cleanup(ctx: Ctx): Promise<void> {
  if (ctx.createdDirectChannelIds.length > 0) {
    await ctx.admin.from('direct_messages').delete().in('channel_id', ctx.createdDirectChannelIds)
    await ctx.admin.from('direct_channels').delete().in('id', ctx.createdDirectChannelIds)
  }
  if (ctx.createdWorkoutIds.length > 0) {
    await ctx.admin.from('workouts').delete().in('id', ctx.createdWorkoutIds)
  }
  if (ctx.createdStudentIds.length > 0) {
    await ctx.admin.from('students').delete().in('id', ctx.createdStudentIds)
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

async function test_students_read_assigned_workouts(ctx: Ctx): Promise<void> {
  // Cenário: userB é o teacher; userA é o aluno com registro em students
  // (user_id preenchido). Workout atribuído via student_id, user_id NULL —
  // exatamente o padrão do assignWorkoutToStudent pra aluno sem conta que
  // depois foi vinculado.
  const { data: student, error: stErr } = await ctx.admin
    .from('students')
    .insert({ teacher_id: ctx.userB.id, user_id: ctx.userA.id, name: 'RLS Aluno A', email: ctx.userA.email })
    .select('id')
    .single()
  if (stErr || !student) {
    check('students_read_assigned setup (students insert)', false, stErr?.message)
    return
  }
  ctx.createdStudentIds.push(student.id)

  const { data: workout, error: wErr } = await ctx.admin
    .from('workouts')
    .insert({ user_id: null, student_id: student.id, name: 'RLS Treino Atribuído', is_template: true, created_by: ctx.userB.id })
    .select('id')
    .single()
  if (wErr || !workout) {
    check('students_read_assigned setup (workouts insert)', false, wErr?.message)
    return
  }
  ctx.createdWorkoutIds.push(workout.id)

  const { data: exercise } = await ctx.admin
    .from('exercises')
    .insert({ workout_id: workout.id, name: 'Supino', order: 0 })
    .select('id')
    .single()
  if (exercise) {
    await ctx.admin.from('sets').insert({ exercise_id: exercise.id, set_number: 1, reps: '10', weight: 40 })
  }

  // Aluno (userA) autenticado deve LER o workout, exercises e sets
  const alunoClient = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } })
  const { error: signInErr } = await alunoClient.auth.signInWithPassword({ email: ctx.userA.email, password: PASSWORD })
  if (signInErr) {
    check('students_read_assigned setup (signIn aluno)', false, signInErr.message)
    return
  }

  const { data: wRows } = await alunoClient.from('workouts').select('id, name').eq('id', workout.id)
  check(
    'aluno SELECT workout atribuído via student_id',
    Array.isArray(wRows) && wRows.length === 1,
    `got ${JSON.stringify(wRows)}`,
  )

  const { data: exRows } = await alunoClient.from('exercises').select('id').eq('workout_id', workout.id)
  check(
    'aluno SELECT exercises do workout atribuído',
    Array.isArray(exRows) && exRows.length === 1,
    `got ${JSON.stringify(exRows)}`,
  )

  if (exercise) {
    const { data: setRows } = await alunoClient.from('sets').select('id').eq('exercise_id', exercise.id)
    check(
      'aluno SELECT sets do workout atribuído',
      Array.isArray(setRows) && setRows.length === 1,
      `got ${JSON.stringify(setRows)}`,
    )
  }

  // Policy é SELECT-only: UPDATE/DELETE não afetam nenhuma linha
  const { data: updRows } = await alunoClient.from('workouts').update({ name: 'hacked' }).eq('id', workout.id).select('id')
  check(
    'aluno NÃO consegue UPDATE no workout atribuído (SELECT-only)',
    !updRows || updRows.length === 0,
    `update afetou ${JSON.stringify(updRows)}`,
  )
  const { data: delRows } = await alunoClient.from('workouts').delete().eq('id', workout.id).select('id')
  check(
    'aluno NÃO consegue DELETE no workout atribuído (SELECT-only)',
    !delRows || delRows.length === 0,
    `delete afetou ${JSON.stringify(delRows)}`,
  )
  await alunoClient.auth.signOut()

  // Terceiro sem vínculo (anon, sem sessão) não vê nada
  const anon = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } })
  const { data: anonRows } = await anon.from('workouts').select('id').eq('id', workout.id)
  check(
    'anon não vê workout atribuído',
    !anonRows || anonRows.length === 0,
    `got ${JSON.stringify(anonRows)}`,
  )
}

async function main(): Promise<void> {
  let ctx: Ctx | null = null
  try {
    ctx = await setup()
    await test_access_requests_status_pending(ctx)
    await test_users_share_private_channel_rpc(ctx)
    await test_students_read_assigned_workouts(ctx)
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

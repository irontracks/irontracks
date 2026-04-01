import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { normalizeWorkoutTitle } from '@/utils/workoutTitle'
import { createAdminClient } from '@/utils/supabase/admin'
import { parseJsonBody } from '@/utils/zod'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonWithSchema } from '@/utils/zod'
import { safeRecord } from '@/utils/guards'
import { cacheSetNx, cacheDeletePattern } from '@/utils/cache'
import { buildReportMetrics, buildWeeklyVolumeStats, buildTrainingLoadFlags } from '@/utils/report/reportMetrics'
import { logWarn, logError } from '@/lib/logger'
import { notifyWorkoutFinished } from '@/lib/social/workoutNotifications'

const LogEntrySchema = z
  .object({
    done: z.boolean().optional(),
    weight: z.union([z.string(), z.number()]).optional(),
    reps: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough()

const ExerciseSchema = z
  .object({
    name: z.string().optional(),
    sets: z.union([z.string(), z.number()]).optional(),
    setDetails: z.array(z.record(z.unknown())).optional(),
    set_details: z.array(z.record(z.unknown())).optional(),
  })
  .passthrough()

const SessionSchema = z
  .object({
    workoutTitle: z.string().optional(),
    workout_title: z.string().optional(),
    date: z.string().optional(),
    exercises: z.array(ExerciseSchema).optional(),
    logs: z.record(LogEntrySchema).optional(),
    idempotencyKey: z.string().optional(),
    finishIdempotencyKey: z.string().optional(),
  })
  .passthrough()

const BodySchema = z
  .object({
    session: SessionSchema,
    idempotencyKey: z.string().optional(),
  })
  .strip()

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    const userId = String(user.id || '').trim()
    const ip = getRequestIp(request)
    const rl = await checkRateLimitAsync(`workouts:finish:${userId}:${ip}`, 10, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsedBody = await parseJsonBody(request, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data as Record<string, unknown>
    const session = (body as Record<string, unknown>)?.session
    const sessionObj = safeRecord(session)
    let previousSessionObj: Record<string, unknown> | null = null
    try {
      const { data: prevRow } = await supabase
        .from('workouts')
        .select('notes')
        .eq('user_id', user.id)
        .eq('is_template', false)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (prevRow?.notes && typeof prevRow.notes === 'object') previousSessionObj = prevRow.notes as Record<string, unknown>
      else if (typeof prevRow?.notes === 'string') {
        const parsed = parseJsonWithSchema(prevRow.notes, z.record(z.unknown()))
        if (parsed && typeof parsed === 'object') previousSessionObj = parsed
      }
    } catch (e) { logError('api:workouts:finish:prev-session', e) }
    try {
      sessionObj.reportMeta = buildReportMetrics(sessionObj, previousSessionObj)
    } catch (e) { logError('api:workouts:finish:report-metrics', e) }
    try {
      const baseDate = new Date(String(sessionObj?.date ?? new Date().toISOString()))
      const start = new Date(baseDate)
      start.setDate(baseDate.getDate() - 13)
      const { data: rows } = await supabase
        .from('workouts')
        .select('notes, date, created_at')
        .eq('user_id', user.id)
        .eq('is_template', false)
        .gte('date', start.toISOString())
        .lte('date', baseDate.toISOString())
        .order('date', { ascending: false })
        .limit(180)
      const historySessions = (Array.isArray(rows) ? rows : [])
        .map((row) => {
          if (row?.notes && typeof row.notes === 'object') return row.notes as Record<string, unknown>
          if (typeof row?.notes === 'string') return parseJsonWithSchema(row.notes, z.record(z.unknown()))
          return null
        })
        .filter((s): s is Record<string, unknown> => Boolean(s && typeof s === 'object'))
      const reportMeta = safeRecord(sessionObj.reportMeta)
      const weekly = buildWeeklyVolumeStats(sessionObj, historySessions)
      const loadFlags = buildTrainingLoadFlags(sessionObj, historySessions, weekly)
      sessionObj.reportMeta = { ...reportMeta, weekly, loadFlags }
    } catch (e) { logError('api:workouts:finish:weekly-volume', e) }
    if (!Object.keys(sessionObj).length) return NextResponse.json({ ok: false, error: 'missing session' }, { status: 400 })
    const idempotencyKey = String((body as Record<string, unknown>)?.idempotencyKey || sessionObj?.idempotencyKey || sessionObj?.finishIdempotencyKey || '').trim()
    const reqId =
      (() => {
        try {
          if (typeof crypto !== 'undefined' && 'randomUUID' in crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
        } catch (e) { logWarn('workouts:finish', 'silenced', e) }
        return `${Date.now()}-${Math.random().toString(16).slice(2)}`
      })()

    try {
      const admin = createAdminClient()
      await admin.from('user_activity_events').insert({
        user_id: user.id,
        event_name: 'workout_finish_api',
        event_type: 'api',
        path: '/api/workouts/finish',
        metadata: {
          stage: 'start',
          reqId,
          idempotencyKey: idempotencyKey || null,
          exercisesCount: Array.isArray(sessionObj?.exercises) ? (sessionObj.exercises as unknown[]).length : null,
        },
        client_ts: sessionObj?.date ? new Date(String(sessionObj.date)).toISOString() : null,
        user_agent: request.headers.get('user-agent') || null,
      })
    } catch (e) { logError('api:workouts:finish:activity-event-start', e) }

    // R3#2: Clamp date to prevent backdated streak/badge manipulation
    // Allow up to 30 days in the past (for late-logged workouts) and no future dates
    const rawDate = new Date(String(sessionObj?.date ?? new Date().toISOString()))
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const clampedDate = isNaN(rawDate.getTime()) ? now
      : rawDate > now ? now
      : rawDate < thirtyDaysAgo ? thirtyDaysAgo
      : rawDate

    const baseInsert = {
      user_id: user.id,
      created_by: user.id,
      name: normalizeWorkoutTitle(String(sessionObj.workoutTitle || 'Treino Realizado')),
      date: clampedDate,
      completed_at: new Date().toISOString(),
      is_template: false,
      notes: JSON.stringify(session),
    } as Record<string, unknown>

    let saved: { id: string;[key: string]: unknown } | null = null
    let idempotent = false

    if (idempotencyKey) {
      const lockKey = `workouts:finish:v2:lock:${idempotencyKey}`
      const isFirst = await cacheSetNx(lockKey, '1', 30)
      if (!isFirst) {
        // cacheSetNx returned false — two possible causes:
        //  A) Upstash is unavailable (fail-closed) → no idempotency guarantee → 503
        //  B) Key already exists (duplicate request) → look up existing record
        //
        // Differentiate: if Upstash is not configured at all, this is case A.
        const upstashConfigured = Boolean(
          String(process.env.UPSTASH_REDIS_REST_URL || '').trim() &&
          String(process.env.UPSTASH_REDIS_REST_TOKEN || '').trim()
        )
        if (!upstashConfigured) {
          // Upstash offline — fail-closed protects integrity; tell client to retry
          return NextResponse.json(
            { ok: false, error: 'idempotency_service_unavailable' },
            { status: 503, headers: { 'Retry-After': '5' } }
          )
        }

        // Case B: Key existed — lookup existing workout (idempotent response)
        let lookupSucceeded = false
        try {
          const { data: existing } = await supabase
            .from('workouts')
            .select('id, created_at')
            .eq('user_id', user.id)
            .eq('is_template', false)
            .eq('finish_idempotency_key', idempotencyKey)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (existing?.id) {
            // Workout was already saved — return idempotent success
            return NextResponse.json({ ok: true, saved: existing, idempotent: true })
          }
          // No existing workout found: previous request died before saving.
          // Fall through to allow this request to save the workout.
          lookupSucceeded = true
        } catch (e) {
          logError('api:workouts:finish:idempotency-lookup', e)
          lookupSucceeded = false
        }
        // If lookup failed (DB error), reject to prevent duplicate saves
        if (!lookupSucceeded) {
          return NextResponse.json({ ok: false, error: 'concurrent_request_detected' }, { status: 429 })
        }
        // else: lookup succeeded but no existing workout → fall through to insert
      }
    }

    const tryInsert = async (withIdempotencyKey: boolean) => {
      const payload = withIdempotencyKey && idempotencyKey ? { ...baseInsert, finish_idempotency_key: idempotencyKey } : baseInsert
      return await supabase.from('workouts').insert(payload).select('id, created_at').single()
    }

    let insertRes = await tryInsert(true)
    if (insertRes?.error) {
      const code = String(((insertRes.error as unknown) as Record<string, unknown>)?.code ?? '')
      const msg = String(insertRes.error.message || '')
      if (code === '23505' && idempotencyKey) {
        try {
          const { data: existing } = await supabase
            .from('workouts')
            .select('id, created_at')
            .eq('user_id', user.id)
            .eq('is_template', false)
            .eq('finish_idempotency_key', idempotencyKey)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (existing?.id) {
            saved = existing as { id: string;[key: string]: unknown }
            idempotent = true
            insertRes = { data: existing, error: null } as unknown as typeof insertRes
          }
        } catch (e) { logError('api:workouts:finish:duplicate-key-lookup', e) }
      } else if (msg.toLowerCase().includes('finish_idempotency_key') && msg.toLowerCase().includes('does not exist')) {
        insertRes = await tryInsert(false)
      }
    }

    const { data, error } = insertRes
    saved = saved || (data as { id: string;[key: string]: unknown } | null)

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    try {
      await supabase.from('active_workout_sessions').delete().eq('user_id', user.id)
    } catch (e) { logWarn('workouts/finish', 'Failed to delete active_workout_sessions', e) }

    await notifyWorkoutFinished(user.id, saved?.id ? String(saved.id) : null, sessionObj)

    // Limpar os caches de listagem de histórico e dashboard ao finalizar o treino
    try {
      await Promise.all([
        cacheDeletePattern(`workouts:list:${user.id}*`),
        cacheDeletePattern(`workouts:history:${user.id}:*`),
        cacheDeletePattern(`dashboard:bootstrap:${user.id}`),
      ])
    } catch (e) { logWarn('workouts/finish', 'Failed to invalidate caches after workout finish', e) }

    try {
      const admin = createAdminClient()
      await admin.from('user_activity_events').insert({
        user_id: user.id,
        event_name: 'workout_finish_api',
        event_type: 'api',
        path: '/api/workouts/finish',
        metadata: {
          stage: 'success',
          reqId,
          idempotent,
          savedId: saved?.id ?? null,
        },
        user_agent: request.headers.get('user-agent') || null,
      })
    } catch (e) { logError('api:workouts:finish:activity-event-success', e) }

    return NextResponse.json({ ok: true, saved, idempotent })
  } catch (e: unknown) {
    const msg = (e as Record<string, unknown>)?.message
    return NextResponse.json({ ok: false, error: typeof msg === 'string' ? msg : 'unknown_error' }, { status: 500 })
  }
}

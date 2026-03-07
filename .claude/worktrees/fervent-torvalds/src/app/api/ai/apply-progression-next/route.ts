import { NextResponse } from 'next/server'
import { parseJsonBody } from '@/utils/zod'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

const ZodBodySchema = z
  .object({
    session: z.unknown(),
    progression: z.array(z.unknown()).min(1),
    historyId: z.string().optional(),
    history_id: z.string().optional(),
  })
  .passthrough()

const normalizeKey = (v: unknown) =>
  String(v || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')

const safeArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const parsedBody = await parseJsonBody(req, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data as Record<string, unknown>
    const session = body?.session && typeof body.session === 'object' ? (body.session as Record<string, unknown>) : null
    const progression = safeArray<unknown>(body?.progression).filter(isRecord)
    const historyId = String(body?.historyId || body?.history_id || '').trim() || null

    if (!session) return NextResponse.json({ ok: false, error: 'missing session' }, { status: 400 })
    if (!progression.length) return NextResponse.json({ ok: false, error: 'missing progression' }, { status: 400 })

    const userId = String(auth.user.id || '').trim()
    const originWorkoutId = String(session?.originWorkoutId || session?.origin_workout_id || '').trim()
    if (!originWorkoutId) return NextResponse.json({ ok: false, error: 'originWorkoutId missing' }, { status: 400 })

    const admin = createAdminClient()

    const { data: templatesRaw, error: tErr } = await admin
      .from('workouts')
      .select('id, name')
      .eq('user_id', userId)
      .eq('is_template', true)
      .order('name', { ascending: true })
      .limit(1000)
    if (tErr) return NextResponse.json({ ok: false, error: tErr.message }, { status: 400 })

    const templates = safeArray<unknown>(templatesRaw).filter(isRecord)
    const curIdx = templates.findIndex((w) => String(w?.id || '').trim() === originWorkoutId)
    if (curIdx === -1) return NextResponse.json({ ok: false, error: 'origin_template_not_found' }, { status: 404 })

    const next = templates[curIdx + 1] || templates[curIdx] || null
    const targetWorkoutId = String(next?.id || '').trim()
    if (!targetWorkoutId) return NextResponse.json({ ok: false, error: 'next_template_not_found' }, { status: 404 })

    const { data: workoutRow, error: wErr } = await admin
      .from('workouts')
      .select(
        `
        id,
        exercises (
          id,
          name,
          sets ( id, set_number, advanced_config )
        )
      `,
      )
      .eq('id', targetWorkoutId)
      .eq('user_id', userId)
      .maybeSingle()
    if (wErr) return NextResponse.json({ ok: false, error: wErr.message }, { status: 400 })
    if (!workoutRow?.id) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })

    const rowObj: Record<string, unknown> = isRecord(workoutRow) ? workoutRow : {}
    const exs = safeArray<unknown>(rowObj.exercises).filter(isRecord)
    const exerciseByKey = new Map<string, Record<string, unknown>>()
    for (const ex of exs) {
      const key = normalizeKey(ex?.name)
      if (!key) continue
      if (!exerciseByKey.has(key)) exerciseByKey.set(key, ex)
    }

    let applied = 0
    for (const rec of progression) {
      const exName = String(rec?.exercise || rec?.name || '').trim()
      const recKey = normalizeKey(exName)
      if (!recKey) continue
      const ex = exerciseByKey.get(recKey) || null
      if (!ex?.id) continue

      const suggestion = {
        recommendation: String(rec?.recommendation || rec?.action || rec?.text || '').trim(),
        reason: String(rec?.reason || '').trim(),
        historyId,
        createdAt: new Date().toISOString(),
      }
      if (!suggestion.recommendation) continue

      const sets = safeArray<unknown>(ex.sets)
        .filter(isRecord)
        .slice()
        .sort((a, b) => (Number(a?.set_number) || 0) - (Number(b?.set_number) || 0))
      const first = sets[0] || null

      if (first?.id) {
        const baseCfg = first?.advanced_config && typeof first.advanced_config === 'object' ? (first.advanced_config as Record<string, unknown>) : null
        const nextCfg: Record<string, unknown> = { ...(baseCfg || {}), ai_suggestion: suggestion }
        const { error } = await admin
          .from('sets')
          .update({ advanced_config: nextCfg })
          .eq('id', String(first.id))
          .eq('exercise_id', String(ex.id))
        if (!error) applied += 1
        continue
      }

      const { error: iErr } = await admin.from('sets').insert({
        exercise_id: String(ex.id),
        set_number: 1,
        weight: null,
        reps: null,
        rpe: null,
        is_warmup: false,
        completed: false,
        advanced_config: { ai_suggestion: suggestion },
      })
      if (!iErr) applied += 1
    }

    return NextResponse.json({ ok: true, templateId: targetWorkoutId, applied })
  } catch (e) {
    const msg = (e as Record<string, unknown>)?.message
    return NextResponse.json({ ok: false, error: typeof msg === 'string' ? msg : String(e) }, { status: 500 })
  }
}

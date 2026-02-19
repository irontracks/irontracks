import { NextResponse } from 'next/server'
import { z } from 'zod'
import crypto from 'crypto'

import { parseJsonBody } from '@/utils/zod'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { getVipPlanLimits } from '@/utils/vip/limits'
import { normalizeExerciseName } from '@/utils/normalizeExerciseName'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { errorResponse } from '@/utils/api'

import {
  VipPeriodizationQuestionnaire,
  buildWorkoutPlan,
} from '@/utils/vip/periodization'
import { vipPeriodizationExerciseSeed } from '@/data/vipPeriodizationExercises'

export const dynamic = 'force-dynamic'

const BodySchema = z
  .object({
    model: z.enum(['linear', 'undulating']),
    weeks: z.union([z.literal(4), z.literal(6), z.literal(8)]),
    goal: z.enum(['hypertrophy', 'strength', 'recomp']).default('hypertrophy'),
    level: z.enum(['beginner', 'intermediate', 'advanced']).default('intermediate'),
    daysPerWeek: z.number().int().min(2).max(6).default(4),
    timeMinutes: z.number().int().min(30).max(90).default(60),
    equipment: z.array(z.string()).default([]),
    limitations: z.string().default(''),
    preferredSplit: z.string().optional(),
    focusMuscles: z.array(z.string()).optional(),
    startDate: z.string().optional().nullable(),
  })
  .strict()

const MODEL_ID = process.env.GOOGLE_GENERATIVE_AI_MODEL_ID || 'gemini-2.5-flash'

const safeString = (v: unknown) => {
  try {
    return String(v ?? '').trim()
  } catch {
    return ''
  }
}

interface LogEntry {
  weight?: unknown
  reps?: unknown
  done?: boolean | string
  isDone?: boolean | string
  completed?: boolean | string
}

interface SessionData {
  workout?: { exercises?: unknown[] }
  logs?: Record<string, LogEntry>
}

const safeNumber = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? Number(n) : null
}

const parseSession = (notes: unknown): SessionData | null => {
  try {
    const raw = String(notes || '').trim()
    if (!raw) return null
    const obj = JSON.parse(raw)
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) return obj as SessionData
    return null
  } catch {
    return null
  }
}

const buildUser1rmMapFromHistory = (history: Array<{ created_at: string; notes: unknown }>) => {
  const byEx = new Map<string, number>()

  for (const row of history) {
    const session = parseSession(row.notes)
    if (!session) continue
    
    const w = session.workout
    const exercises = Array.isArray(w?.exercises) ? (w?.exercises as unknown[]) : []
    const namesByIdx = new Map<number, string>()
    
    exercises.forEach((ex, idx) => {
      const name = safeString((ex as Record<string, unknown>)?.name)
      if (name) namesByIdx.set(idx, normalizeExerciseName(name))
    })

    const logs = session.logs
    if (!logs) continue

    for (const [key, v] of Object.entries(logs)) {
      const parts = key.split('-')
      const exIdx = Number(parts[0])
      if (!Number.isFinite(exIdx)) continue
      
      const exNameNorm = namesByIdx.get(exIdx) || ''
      if (!exNameNorm) continue
      
      const log = v as LogEntry
      if (!log) continue
      
      const doneRaw = log.done ?? log.isDone ?? log.completed ?? null
      const done = doneRaw == null ? true : doneRaw === true || String(doneRaw).toLowerCase() === 'true'
      const weight = safeNumber(log.weight)
      const reps = safeNumber(log.reps)

      if (!done && (weight == null || reps == null)) continue
      if (weight != null && reps != null && weight > 0 && reps > 0) {
        const est = weight * (1 + reps / 30)
        const cur = byEx.get(exNameNorm) || 0
        if (est > cur) byEx.set(exNameNorm, est)
      }
    }
  }

  return byEx
}

const ensureExerciseLibrarySeeded = async (admin: ReturnType<typeof createAdminClient>) => {
  const { count } = await admin.from('exercise_library').select('id', { count: 'exact', head: true })
  const n = Number(count || 0)
  if (Number.isFinite(n) && n >= 150) return { ok: true as const, seeded: false as const, total: n }

  const rows = vipPeriodizationExerciseSeed.map((ex) => {
    const display = safeString(ex.display_name_pt)
    const normalized = normalizeExerciseName(display)
    return {
      display_name_pt: display,
      normalized_name: normalized,
      video_url: null as string | null,
      aliases: null as string[] | null,
      primary_muscle: safeString(ex.primary_muscle) || null,
      secondary_muscles: Array.isArray(ex.secondary_muscles) ? ex.secondary_muscles : [],
      equipment: Array.isArray(ex.equipment) ? ex.equipment : [],
      difficulty: safeString(ex.difficulty) || null,
      environments: Array.isArray(ex.environments) ? ex.environments : [],
      is_compound: !!ex.is_compound,
    }
  })

  await admin.from('exercise_library').upsert(rows, { onConflict: 'normalized_name' })
  const { count: nextCount } = await admin.from('exercise_library').select('id', { count: 'exact', head: true })
  return { ok: true as const, seeded: true as const, total: Number(nextCount || 0) }
}

const generateProgramOverviewWithGemini = async (q: VipPeriodizationQuestionnaire, split: string) => {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!apiKey) return null
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: MODEL_ID })
  const prompt = [
    'Você é um coach de musculação do IronTracks (VIP).',
    'Crie um resumo curto e prático (pt-BR) para um programa de periodização.',
    'Não invente dados pessoais. Não use emojis.',
    '',
    'Estrutura desejada:',
    '- Título',
    '- Como funciona (3 bullets)',
    '- Deload e testes (2 bullets)',
    '- Como progredir se bater repetições (2 bullets)',
    '',
    'Dados do usuário:',
    `- Modelo: ${q.model}`,
    `- Duração: ${q.weeks} semanas`,
    `- Objetivo: ${q.goal}`,
    `- Nível: ${q.level}`,
    `- Dias/semana: ${q.daysPerWeek}`,
    `- Tempo/sessão: ${q.timeMinutes} min`,
    `- Split: ${split}`,
    `- Equipamentos: ${(q.equipment || []).join(', ') || 'não informado'}`,
    `- Limitações: ${q.limitations || 'nenhuma'}`,
  ].join('\n')
  
  const result = await (model.generateContent as (parts: Array<{ text: string }>) => Promise<any>)([{ text: prompt }])
  const text = String((await result?.response?.text()) || '').trim()
  return text || null
}

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const userId = String(auth.user.id || '').trim()
    const limits = await getVipPlanLimits(auth.supabase, userId)
    if (limits.tier === 'free') {
      return NextResponse.json({ ok: false, error: 'vip_required' }, { status: 403 })
    }

    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response) return parsed.response
    const q = parsed.data as VipPeriodizationQuestionnaire

    const admin = createAdminClient()
    await ensureExerciseLibrarySeeded(admin)

    const { data: historyRows } = await admin
      .from('workouts')
      .select('created_at, notes')
      .eq('user_id', userId)
      .eq('is_template', false)
      .order('created_at', { ascending: false })
      .limit(120)

    const history = (historyRows || []) as Array<{ created_at: string; notes: unknown }>
    const oneRmMap = buildUser1rmMapFromHistory(history)

    const plan = buildWorkoutPlan(q, {
      getEst1rm: (normalizedName: string) => {
        const key = safeString(normalizedName)
        if (!key) return null
        return oneRmMap.get(key) || null
      },
    })

    const { data: existingActive } = await admin
      .from('vip_periodization_programs')
      .select('id, status')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingActive?.id) {
      const prevProgramId = String(existingActive.id)
      const { data: prevLinks } = await admin
        .from('vip_periodization_workouts')
        .select('workout_id')
        .eq('user_id', userId)
        .eq('program_id', prevProgramId)
        .limit(500)
      
      const prevWorkoutIds = (prevLinks || [])
        .map((r) => String((r as any)?.workout_id || '').trim())
        .filter(Boolean)

      if (prevWorkoutIds.length) {
        await admin
          .from('workouts')
          .update({ archived_at: new Date().toISOString() })
          .eq('user_id', userId)
          .eq('is_template', true)
          .in('id', prevWorkoutIds)
      }
      await admin.from('vip_periodization_programs')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', existingActive.id)
    }

    const programId = crypto.randomUUID()
    const createdAtIso = new Date().toISOString()

    const { data: programRow, error: pErr } = await admin
      .from('vip_periodization_programs')
      .insert({
        id: programId,
        user_id: userId,
        status: 'active',
        model: q.model,
        weeks: q.weeks,
        goal: q.goal,
        split: plan.split.split,
        days_per_week: plan.split.days.length,
        time_minutes: q.timeMinutes,
        equipment: q.equipment || [],
        limitations: q.limitations || null,
        start_date: q.startDate ? String(q.startDate).slice(0, 10) : null,
        config: { created_at: createdAtIso },
        questionnaire: q as any,
      })
      .select('id')
      .single()

    if (pErr || !programRow?.id) return NextResponse.json({ ok: false, error: pErr?.message || 'failed_to_create_program' }, { status: 400 })

    const overview = await generateProgramOverviewWithGemini(q, plan.split.split)
    if (overview) {
      await admin.from('vip_periodization_programs').update({ config: { created_at: createdAtIso, overview } }).eq('id', programId)
    }

    const createdWorkoutIds: string[] = []

    for (const day of plan.days) {
      const exercisesPayload = day.exercises.map((ex) => ({
        name: ex.name,
        notes: safeString(ex.primary_muscle) ? `Alvo: ${safeString(ex.primary_muscle)}\n${safeString(day.phase)}` : safeString(day.phase),
        video_url: ex.video_url ?? null,
        rest_time: ex.rest_time ?? null,
        cadence: ex.cadence ?? null,
        method: ex.method ?? null,
        order: ex.order,
        sets: ex.sets.map((s) => ({
          weight: s.weight ?? null,
          reps: s.reps ?? null,
          rpe: s.rpe ?? null,
          set_number: s.set_number,
          completed: false,
          is_warmup: !!s.is_warmup,
          advanced_config: s.advanced_config ?? null,
        })),
      }))

      const { data: savedId, error: sErr } = await admin.rpc('save_workout_atomic', {
        p_workout_id: null,
        p_user_id: userId,
        p_created_by: userId,
        p_is_template: true,
        p_name: `VIP • ${day.name}`,
        p_notes: day.notes || '',
        p_exercises: exercisesPayload,
      })

      if (sErr) return NextResponse.json({ ok: false, error: sErr.message }, { status: 400 })
      const workoutId = String(savedId || '').trim()
      if (!workoutId) return NextResponse.json({ ok: false, error: 'failed_to_create_workout' }, { status: 400 })
      createdWorkoutIds.push(workoutId)

      const { error: linkErr } = await admin.from('vip_periodization_workouts').insert({
        program_id: programId,
        user_id: userId,
        week_number: day.weekNumber,
        day_number: day.dayNumber,
        phase: day.phase,
        is_deload: day.isDeload,
        is_test: day.isTest,
        scheduled_date: day.scheduledDate,
        workout_id: workoutId,
      })
      if (linkErr) return NextResponse.json({ ok: false, error: linkErr.message }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      program: { id: programId, createdWorkoutIds },
      split: plan.split,
      weeks: plan.weeks,
    })
  } catch (e: any) {
    return errorResponse(e)
  }
}

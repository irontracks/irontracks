import { NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'
import { getVipPlanLimits } from '@/utils/vip/limits'
import { createAdminClient } from '@/utils/supabase/admin'
import { getErrorMessage } from '@/utils/errorMessage'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const userId = String(auth.user.id || '').trim()
    const limits = await getVipPlanLimits(auth.supabase, userId)
    if (limits.tier === 'free') {
      return NextResponse.json({ ok: false, error: 'vip_required' }, { status: 403 })
    }

    const admin = createAdminClient()

    const { data: program, error: pErr } = await admin
      .from('vip_periodization_programs')
      .select('id, status, model, weeks, goal, split, days_per_week, time_minutes, equipment, limitations, start_date, config, questionnaire, created_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (pErr) return NextResponse.json({ ok: false, error: pErr.message }, { status: 400 })
    if (!program?.id) return NextResponse.json({ ok: true, program: null, workouts: [] })

    const { data: workouts, error: wErr } = await admin
      .from('vip_periodization_workouts')
      .select('id, week_number, day_number, phase, is_deload, is_test, scheduled_date, workout_id')
      .eq('user_id', userId)
      .eq('program_id', String(program.id))
      .order('week_number', { ascending: true })
      .order('day_number', { ascending: true })
      .limit(200)

    if (wErr) return NextResponse.json({ ok: false, error: wErr.message }, { status: 400 })

    const workoutIds = (Array.isArray(workouts) ? workouts : []).map((w: Record<string, unknown>) => String(w?.workout_id || '').trim()).filter(Boolean)
    const { data: workoutRows } = workoutIds.length
      ? await admin.from('workouts').select('id, name').in('id', workoutIds).limit(workoutIds.length)
      : ({ data: [] } as any)

    const nameById = new Map<string, string>()
    ;(Array.isArray(workoutRows) ? workoutRows : []).forEach((r: Record<string, unknown>) => {
      const id = String(r?.id || '').trim()
      const name = String(r?.name || '').trim()
      if (id && name) nameById.set(id, name)
    })

    const exerciseCountByWorkoutId = new Map<string, number>()
    if (workoutIds.length) {
      const { data: exerciseRows } = await admin
        .from('exercises')
        .select('workout_id')
        .in('workout_id', workoutIds)
        .limit(5000)
      ;(Array.isArray(exerciseRows) ? exerciseRows : []).forEach((r: Record<string, unknown>) => {
        const wid = String(r?.workout_id || '').trim()
        if (!wid) return
        exerciseCountByWorkoutId.set(wid, (exerciseCountByWorkoutId.get(wid) || 0) + 1)
      })
    }

    const enriched = (Array.isArray(workouts) ? workouts : []).map((w: Record<string, unknown>) => ({
      ...w,
      workout_name: nameById.get(String(w?.workout_id || '').trim()) || null,
      exercise_count: exerciseCountByWorkoutId.get(String(w?.workout_id || '').trim()) || 0,
    }))

    return NextResponse.json({ ok: true, program, workouts: enriched })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) ?? String(e) }, { status: 500 })
  }
}

/**
 * GET /api/nutrition/correlation
 *
 * Returns the last 30 days with flags indicating:
 * - had_workout: user trained on that day
 * - had_nutrition: user logged nutrition on that day
 * - workout_calories: estimated kcal burned (from cardio/sessions)
 * - nutrition_calories: kcal logged in nutrition on that day
 */
import { NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

const isoDate = (d: Date) => d.toISOString().slice(0, 10)

export async function GET() {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const admin = createAdminClient()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const from = isoDate(thirtyDaysAgo)
  const today = isoDate(new Date())

  // Workout days from workout_sessions
  const { data: sessions } = await admin
    .from('workout_sessions')
    .select('started_at, calories_estimate')
    .eq('user_id', auth.user.id)
    .gte('started_at', thirtyDaysAgo.toISOString())
    .order('started_at', { ascending: true })

  // Nutrition days from daily_nutrition_logs
  const { data: nutLogs } = await admin
    .from('daily_nutrition_logs')
    .select('date, calories')
    .eq('user_id', auth.user.id)
    .gte('date', from)
    .lte('date', today)

  // Build lookup maps
  const workoutByDay = new Map<string, number>()
  for (const s of Array.isArray(sessions) ? sessions : []) {
    const day = isoDate(new Date(String(s.started_at)))
    const cal = Number(s.calories_estimate) || 0
    workoutByDay.set(day, (workoutByDay.get(day) || 0) + cal)
  }

  const nutritionByDay = new Map<string, number>()
  for (const n of Array.isArray(nutLogs) ? nutLogs : []) {
    const day = String(n.date).slice(0, 10)
    nutritionByDay.set(day, Number(n.calories) || 0)
  }

  // Build 30-day array
  const days = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
    const key = isoDate(d)
    days.push({
      date: key,
      weekday: d.getDay(), // 0=sun, 6=sat
      had_workout: workoutByDay.has(key),
      had_nutrition: nutritionByDay.has(key),
      workout_calories: workoutByDay.get(key) || 0,
      nutrition_calories: nutritionByDay.get(key) || 0,
    })
  }

  const workoutDays = days.filter(d => d.had_workout).length
  const nutritionDays = days.filter(d => d.had_nutrition).length
  const bothDays = days.filter(d => d.had_workout && d.had_nutrition).length
  const workoutWithoutNutrition = days.filter(d => d.had_workout && !d.had_nutrition).length

  return NextResponse.json({
    ok: true,
    days,
    stats: {
      workoutDays,
      nutritionDays,
      bothDays,
      workoutWithoutNutrition,
      correlationPct: workoutDays > 0 ? Math.round((bothDays / workoutDays) * 100) : 0,
    },
  })
}

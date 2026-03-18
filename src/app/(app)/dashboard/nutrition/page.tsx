import Link from 'next/link'

import NutritionMixer from '@/components/dashboard/nutrition/NutritionMixer'
import NutritionConsoleShell from '@/components/dashboard/nutrition/NutritionConsoleShell'
import { createClient } from '@/utils/supabase/server'
import { checkVipFeatureAccess } from '@/utils/vip/limits'
import { getErrorMessage } from '@/utils/errorMessage'
import { calculateNutritionGoals } from '@/lib/nutrition/engine'
import type { Gender, ActivityLevel, Goal } from '@/lib/nutrition/engine'

export const dynamic = 'force-dynamic'

const DEFAULT_GOALS = {
  calories: 2000,
  protein: 150,
  carbs: 200,
  fat: 60,
}

/** Map user settings fitnessGoal to nutrition Goal */
function mapFitnessGoal(fg: string | null | undefined): Goal {
  switch (fg) {
    case 'weight_loss': return 'CUT'
    case 'hypertrophy':
    case 'strength': return 'BULK'
    default: return 'MAINTAIN'
  }
}

/** Map biologicalSex to nutrition Gender */
function mapGender(sex: string | null | undefined): Gender | null {
  if (sex === 'male') return 'MALE'
  if (sex === 'female') return 'FEMALE'
  return null
}

/** Map settings to ActivityLevel */
function mapActivityLevel(freq: number | null | undefined): ActivityLevel {
  const f = Number(freq)
  if (!Number.isFinite(f) || f <= 0) return 'MODERATE'
  if (f <= 1) return 'LIGHT'
  if (f <= 3) return 'MODERATE'
  if (f <= 5) return 'VERY_ACTIVE'
  return 'EXTRA_ACTIVE'
}

/** Try to compute personalized goals from user settings preferences */
function computeGoalsFromProfile(prefs: Record<string, unknown>): { calories: number; protein: number; carbs: number; fat: number } | null {
  try {
    const weight = Number(prefs?.bodyWeightKg)
    const height = Number(prefs?.heightCm)
    const age = Number(prefs?.age)
    const gender = mapGender(prefs?.biologicalSex as string)
    if (!Number.isFinite(weight) || weight <= 0) return null
    if (!Number.isFinite(height) || height <= 0) return null
    if (!Number.isFinite(age) || age <= 0) return null
    if (!gender) return null

    const activityLevel = mapActivityLevel(prefs?.trainingFrequencyPerWeek as number)
    const goal = mapFitnessGoal(prefs?.fitnessGoal as string)

    return calculateNutritionGoals({ weight, height, age, gender, activityLevel }, goal)
  } catch { return null }
}

function safeNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function normalizeGoalRow(row: Record<string, unknown>) {
  const calories = safeNumber(row?.calories ?? row?.cals ?? row?.kcal)
  const protein = safeNumber(row?.protein ?? row?.prot ?? row?.p)
  const carbs = safeNumber(row?.carbs ?? row?.carb ?? row?.c)
  const fat = safeNumber(row?.fat ?? row?.f)

  return {
    calories: calories > 0 ? calories : DEFAULT_GOALS.calories,
    protein: protein > 0 ? protein : DEFAULT_GOALS.protein,
    carbs: carbs > 0 ? carbs : DEFAULT_GOALS.carbs,
    fat: fat > 0 ? fat : DEFAULT_GOALS.fat,
  }
}

function isSchemaMissingError(e: unknown) {
  const message = getErrorMessage(e)
  const m = message.toLowerCase()
  return m.includes('could not find the table') || m.includes('schema cache')
}

export default async function NutritionPage() {
  const supabase = await createClient()
  let authUserId: string | null = null
  try {
    const { data, error } = await supabase.auth.getUser()
    if (error) throw error
    authUserId = data?.user?.id ?? null
  } catch {
    authUserId = null
  }

  if (!authUserId) {
    return (
      <div className="min-h-screen bg-neutral-900 text-white p-6 md:p-10 pt-safe">
        <div className="mx-auto w-full max-w-lg">
          <div className="rounded-xl bg-neutral-800 p-6 border border-neutral-700">
            <h1 className="text-2xl font-black text-white">Acesso restrito</h1>
            <p className="text-neutral-400 mt-2">Faça login para acessar o Nutrition Mixer.</p>
            <Link
              href="/"
              className="mt-5 inline-flex items-center justify-center rounded-xl bg-yellow-500 px-4 py-3 font-black text-black hover:bg-yellow-400"
            >
              Voltar para o início
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const dateKey = (() => {
    try {
      const tz = 'America/Sao_Paulo'
      return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    } catch {
      return new Date().toISOString().slice(0, 10)
    }
  })()

  let initialTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 }
  let schemaMissing = false
  try {
    const { data: row, error } = await supabase
      .from('daily_nutrition_logs')
      .select('calories,protein,carbs,fat')
      .eq('user_id', authUserId)
      .eq('date', dateKey)
      .maybeSingle()
    if (error) throw error
    initialTotals = {
      calories: safeNumber(row?.calories),
      protein: safeNumber(row?.protein),
      carbs: safeNumber(row?.carbs),
      fat: safeNumber(row?.fat),
    }
  } catch (e) {
    schemaMissing = schemaMissing || isSchemaMissingError(e)
    initialTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 }
  }

  // Fetch user profile for personalized goal calculation
  let userPrefs: Record<string, unknown> | null = null
  try {
    const { data: settingsRow } = await supabase
      .from('user_settings')
      .select('preferences')
      .eq('user_id', authUserId)
      .maybeSingle()
    userPrefs = settingsRow?.preferences && typeof settingsRow.preferences === 'object'
      ? (settingsRow.preferences as Record<string, unknown>) : null
  } catch { /* silent */ }

  let goals = DEFAULT_GOALS
  let goalsSource: 'saved' | 'profile' | 'default' = 'default'
  try {
    const { data: row, error } = await supabase
      .from('nutrition_goals')
      .select('id, calories, protein, carbs, fat')
      .eq('user_id', authUserId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    if (row) {
      goals = normalizeGoalRow(row)
      goalsSource = 'saved'
    }
  } catch (e) {
    schemaMissing = schemaMissing || isSchemaMissingError(e)
  }

  // When no saved goals exist, try computing from user profile (TDEE-based)
  if (goalsSource === 'default' && userPrefs) {
    const computed = computeGoalsFromProfile(userPrefs)
    if (computed) {
      goals = computed
      goalsSource = 'profile'
    }
  }

  // Fetch today's workout calories from completed sessions
  let workoutCaloriesToday = 0
  try {
    const todayStart = `${dateKey}T00:00:00`
    const todayEnd = `${dateKey}T23:59:59`
    const { data: sessions } = await supabase
      .from('workout_sessions')
      .select('calories_estimate')
      .eq('user_id', authUserId)
      .gte('completed_at', todayStart)
      .lte('completed_at', todayEnd)
    if (Array.isArray(sessions)) {
      for (const s of sessions) {
        const kcal = Number((s as Record<string, unknown>)?.calories_estimate)
        if (Number.isFinite(kcal) && kcal > 0) workoutCaloriesToday += kcal
      }
    }
  } catch { /* silent — table may not exist or have no data */ }

  // Check VIP Access for Macros
  let canViewMacros = false
  try {
    const access = await checkVipFeatureAccess(supabase, authUserId, 'nutrition_macros')
    canViewMacros = !!access.allowed
  } catch {
    canViewMacros = false
  }

  try {
    const { error } = await supabase.from('nutrition_meal_entries').select('id').limit(1)
    if (error) throw error
  } catch (e) {
    schemaMissing = schemaMissing || isSchemaMissingError(e)
  }

  return (
    <NutritionConsoleShell title="Nutrition Console" subtitle={`Hoje · ${dateKey}`}>
      <NutritionMixer dateKey={dateKey} initialTotals={initialTotals} goals={goals} schemaMissing={schemaMissing} canViewMacros={canViewMacros} workoutCaloriesToday={workoutCaloriesToday} goalsSource={goalsSource} />
    </NutritionConsoleShell>
  )
}

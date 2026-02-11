import Link from 'next/link'

import NutritionMixer from '@/components/dashboard/nutrition/NutritionMixer'
import { createClient } from '@/utils/supabase/server'
import { checkVipFeatureAccess } from '@/utils/vip/limits'

export const dynamic = 'force-dynamic'

const DEFAULT_GOALS = {
  calories: 2000,
  protein: 150,
  carbs: 200,
  fat: 60,
}

function safeNumber(value: any): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function normalizeGoalRow(row: any) {
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

function isSchemaMissingError(e: any) {
  const message = String(e?.message || e || '')
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
      <div className="min-h-screen bg-neutral-900 text-white p-6 md:p-10">
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

  const dateKey = new Date().toISOString().slice(0, 10)

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
  } catch (e: any) {
    schemaMissing = schemaMissing || isSchemaMissingError(e)
    initialTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 }
  }

  let goals = DEFAULT_GOALS
  try {
    const { data: row, error } = await supabase
      .from('nutrition_goals')
      .select('*')
      .eq('user_id', authUserId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    goals = row ? normalizeGoalRow(row) : DEFAULT_GOALS
  } catch (e: any) {
    schemaMissing = schemaMissing || isSchemaMissingError(e)
    goals = DEFAULT_GOALS
  }

  // Check VIP Access for Macros
  const { allowed: canViewMacros } = await checkVipFeatureAccess(supabase, authUserId, 'nutrition_macros')

  return <NutritionMixer dateKey={dateKey} initialTotals={initialTotals} goals={goals} schemaMissing={schemaMissing} canViewMacros={canViewMacros} />
}

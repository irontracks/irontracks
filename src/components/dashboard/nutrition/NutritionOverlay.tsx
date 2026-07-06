'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import NutritionMixer from './NutritionMixer'
import { SkeletonList } from '@/components/ui/Skeleton'
import { estimateSessionKcal } from '@/utils/calories/sessionKcal'
import { getNutritionOverlayCache, setNutritionOverlayCache } from '@/lib/offline/nutritionCache'
import { calculateNutritionGoals } from '@/lib/nutrition/goals'
import { computeRestDayAdjustment } from '@/lib/nutrition/restDay'

type Totals = { calories: number; protein: number; carbs: number; fat: number }
type Gender = 'MALE' | 'FEMALE'
type ActivityLevel = 'SEDENTARY' | 'LIGHT' | 'MODERATE' | 'VERY_ACTIVE' | 'EXTRA_ACTIVE'
type Goal = 'CUT' | 'MAINTAIN' | 'BULK'

const DEFAULT_GOALS: Totals = { calories: 2000, protein: 150, carbs: 200, fat: 60 }

function safeNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

// O cálculo de metas (BMR + TDEE + macros) vive numa fonte ÚNICA no engine
// (@/lib/nutrition/engine → calculateNutritionGoals). Antes o overlay tinha uma
// cópia própria com Harris-Benedict + proteína por %, que divergia do resto do
// app. Agora reusa o engine (Mifflin-St Jeor + proteína g/kg).

function mapFitnessGoal(fg: string | null | undefined): Goal {
  switch (fg) {
    case 'weight_loss': return 'CUT'
    case 'hypertrophy':
    case 'strength': return 'BULK'
    default: return 'MAINTAIN'
  }
}

function mapGender(sex: string | null | undefined): Gender | null {
  if (sex === 'male') return 'MALE'
  if (sex === 'female') return 'FEMALE'
  return null
}

function mapActivityLevel(freq: number | null | undefined): ActivityLevel {
  const f = Number(freq)
  if (!Number.isFinite(f) || f <= 0) return 'MODERATE'
  if (f <= 1) return 'LIGHT'
  if (f <= 3) return 'MODERATE'
  if (f <= 5) return 'VERY_ACTIVE'
  return 'EXTRA_ACTIVE'
}

interface NutritionOverlayProps {
  onClose: () => void
  canViewMacros?: boolean
}

export default function NutritionOverlay({ onClose: _onClose, canViewMacros }: NutritionOverlayProps) {
  const supabase = useMemo(() => createClient(), [])
  const [data, setData] = useState<{
    dateKey: string
    totals: Totals
    goals: Totals
    goalsSource: 'saved' | 'profile' | 'default'
    workoutCalories: number
    restDayReduction: number
  } | null>(null)

  const dateKey = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date())
    } catch {
      return new Date().toISOString().slice(0, 10)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    // uid offline-safe: getUser() valida no servidor (falha sem rede); cai pra
    // getSession() que lê a sessão local. Pro cache offline precisamos do id.
    const getUid = async (): Promise<string> => {
      try {
        const { data } = await supabase.auth.getUser()
        if (data?.user?.id) return String(data.user.id)
      } catch { /* offline → tenta a sessão local */ }
      try {
        const { data } = await supabase.auth.getSession()
        if (data?.session?.user?.id) return String(data.session.user.id)
      } catch { /* sem sessão legível */ }
      return ''
    }

    const serveFromCache = async (uid: string): Promise<boolean> => {
      const c = await getNutritionOverlayCache(uid, dateKey)
      if (c && !cancelled) {
        setData({
          dateKey,
          totals: c.totals,
          goals: c.goals,
          goalsSource: (c.goalsSource as 'saved' | 'profile' | 'default') || 'default',
          workoutCalories: safeNumber(c.workoutCalories),
          restDayReduction: 0,
        })
        return true
      }
      return false
    }

    const load = async () => {
      const uid = await getUid()
      if (!uid || cancelled) return

      // Offline: serve do cache na hora, sem travar nas 4 queries de rede.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        if (await serveFromCache(uid)) return
      }

      try {
        const [totalsRes, goalsRes, settingsRes, sessionsRes, intentRes, recentRes] = await Promise.all([
          supabase.from('daily_nutrition_logs').select('calories,protein,carbs,fat').eq('user_id', uid).eq('date', dateKey).maybeSingle(),
          supabase.from('nutrition_goals').select('calories,protein,carbs,fat').eq('user_id', uid).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
          supabase.from('user_settings').select('preferences').eq('user_id', uid).maybeSingle(),
          supabase.from('workouts').select('id, notes').eq('user_id', uid).eq('is_template', false).gte('completed_at', `${dateKey}T00:00:00`).lte('completed_at', `${dateKey}T23:59:59`),
          supabase.from('rest_day_intents').select('will_train').eq('user_id', uid).eq('date_key', dateKey).maybeSingle(),
          supabase.from('workouts').select('notes').eq('user_id', uid).eq('is_template', false).order('date', { ascending: false }).limit(30),
        ])

        if (cancelled) return

        const totals: Totals = {
          calories: safeNumber(totalsRes.data?.calories),
          protein: safeNumber(totalsRes.data?.protein),
          carbs: safeNumber(totalsRes.data?.carbs),
          fat: safeNumber(totalsRes.data?.fat),
        }

        let goals = DEFAULT_GOALS
        let goalsSource: 'saved' | 'profile' | 'default' = 'default'

        if (goalsRes.data) {
          goals = {
            calories: safeNumber(goalsRes.data.calories) || DEFAULT_GOALS.calories,
            protein: safeNumber(goalsRes.data.protein) || DEFAULT_GOALS.protein,
            carbs: safeNumber(goalsRes.data.carbs) || DEFAULT_GOALS.carbs,
            fat: safeNumber(goalsRes.data.fat) || DEFAULT_GOALS.fat,
          }
          goalsSource = 'saved'
        } else {
          const prefs = settingsRes.data?.preferences as Record<string, unknown> | null
          if (prefs) {
            const weight = Number(prefs.bodyWeightKg)
            const height = Number(prefs.heightCm)
            const age = Number(prefs.age)
            const gender = mapGender(prefs.biologicalSex as string)
            if (Number.isFinite(weight) && weight > 0 && Number.isFinite(height) && height > 0 && Number.isFinite(age) && age > 0 && gender) {
              try {
                goals = calculateNutritionGoals(
                  { weight, height, age, gender, activityLevel: mapActivityLevel(prefs.trainingFrequencyPerWeek as number) },
                  mapFitnessGoal(prefs.fitnessGoal as string),
                )
                goalsSource = 'profile'
              } catch { /* entradas inválidas → mantém DEFAULT_GOALS */ }
            }
          }
        }

        // Real per-session kcal from the saved session JSON (`notes`), using the
        // SAME MET model as the workout report — so this matches the "~X kcal" the
        // report shows, instead of a flat 300/session estimate.
        const kcalPrefs = settingsRes.data?.preferences as Record<string, unknown> | null
        const kcalBodyWeight = Number(kcalPrefs?.bodyWeightKg)
        const kcalSex = typeof kcalPrefs?.biologicalSex === 'string' ? (kcalPrefs.biologicalSex as string) : null
        let workoutCalories = 0
        for (const w of Array.isArray(sessionsRes.data) ? sessionsRes.data : []) {
          try {
            const notes = JSON.parse(String((w as { notes?: unknown }).notes ?? ''))
            workoutCalories += estimateSessionKcal(notes, {
              bodyWeightKg: Number.isFinite(kcalBodyWeight) ? kcalBodyWeight : null,
              biologicalSex: kcalSex,
            })
          } catch { /* sem JSON de sessão → ignora este treino */ }
        }

        // Modo dia de descanso: se respondeu "vou descansar" hoje e não treinou,
        // desconta ~1 treino da meta (proteína intacta). Rede de segurança: se
        // treinou hoje (sessão concluída), segue a meta cheia.
        let restDayReduction = 0
        try {
          const rdPrefs = settingsRes.data?.preferences as Record<string, unknown> | null
          const restEnabled = rdPrefs?.restDayAdjustEnabled !== false
          const willTrain = (intentRes.data as { will_train?: boolean } | null)?.will_train
          const trainedToday = Array.isArray(sessionsRes.data) && sessionsRes.data.length > 0
          if (restEnabled && intentRes.data && willTrain === false && !trainedToday) {
            const kcals: number[] = []
            for (const w of Array.isArray(recentRes.data) ? recentRes.data : []) {
              if (kcals.length >= 10) break
              let session: unknown = (w as { notes?: unknown }).notes
              if (typeof session === 'string') { try { session = JSON.parse(session) } catch { session = null } }
              if (!session || typeof session !== 'object') continue
              const k = estimateSessionKcal(session, {
                bodyWeightKg: Number.isFinite(kcalBodyWeight) ? kcalBodyWeight : null,
                biologicalSex: kcalSex,
              })
              if (k > 0) kcals.push(k)
            }
            const avgWorkoutKcal = kcals.length ? kcals.reduce((a, b) => a + b, 0) / kcals.length : 0
            const adjusted = computeRestDayAdjustment(goals, avgWorkoutKcal)
            if (adjusted.reduction > 0) {
              goals = { calories: adjusted.calories, protein: adjusted.protein, carbs: adjusted.carbs, fat: adjusted.fat }
              restDayReduction = adjusted.reduction
            }
          }
        } catch { /* sem ajuste */ }

        if (!cancelled) {
          setData({ dateKey, totals, goals, goalsSource, workoutCalories, restDayReduction })
          void setNutritionOverlayCache(uid, dateKey, { totals, goals, goalsSource, workoutCalories })
        }
      } catch {
        // Falha (rede/transitória): tenta o cache antes de cair pro estado vazio.
        if (await serveFromCache(uid)) return
        if (!cancelled) setData({ dateKey, totals: { calories: 0, protein: 0, carbs: 0, fat: 0 }, goals: DEFAULT_GOALS, goalsSource: 'default', workoutCalories: 0, restDayReduction: 0 })
      }
    }

    load()
    return () => { cancelled = true }
  }, [supabase, dateKey])

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[25] bg-neutral-950 overflow-y-auto overscroll-none"
      style={{ top: 'calc(4rem + env(safe-area-inset-top) + 64px)' }}
    >
      <div className="mx-auto w-full max-w-md px-4 pb-28 pt-4">
        {data ? (
          <NutritionMixer
            dateKey={data.dateKey}
            initialTotals={data.totals}
            goals={data.goals}
            canViewMacros={canViewMacros}
            workoutCaloriesToday={data.workoutCalories}
            goalsSource={data.goalsSource}
            restDayReduction={data.restDayReduction}
          />
        ) : (
          <div className="space-y-4">
            <div className="animate-pulse space-y-3">
              <div className="h-6 w-40 bg-neutral-800 rounded" />
              <div className="h-4 w-64 bg-neutral-800/60 rounded" />
            </div>
            <div className="grid grid-cols-3 gap-3 animate-pulse">
              {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-xl bg-neutral-800/40 border border-neutral-800/50" />)}
            </div>
            <SkeletonList count={4} />
          </div>
        )}
      </div>
    </div>
  )
}

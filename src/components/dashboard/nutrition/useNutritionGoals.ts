'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'
import { getErrorMessage } from '@/utils/errorMessage'

type Totals = { calories: number; protein: number; carbs: number; fat: number }

function safeNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export function useNutritionGoals(
  initialGoals: Totals,
  userId: string | undefined,
  canViewMacros: boolean,
) {
  const supabase = createClient()
  const [goalsState, setGoalsState] = useState<Totals>({
    calories: safeNumber(initialGoals?.calories),
    protein: safeNumber(initialGoals?.protein),
    carbs: safeNumber(initialGoals?.carbs),
    fat: safeNumber(initialGoals?.fat),
  })
  const [draft, setDraft] = useState<Totals>(() => ({
    calories: safeNumber(initialGoals?.calories),
    protein: safeNumber(initialGoals?.protein),
    carbs: safeNumber(initialGoals?.carbs),
    fat: safeNumber(initialGoals?.fat),
  }))
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const openEditor = useCallback(() => {
    setDraft({
      calories: safeNumber(goalsState?.calories),
      protein: safeNumber(goalsState?.protein),
      carbs: safeNumber(goalsState?.carbs),
      fat: safeNumber(goalsState?.fat),
    })
    setError('')
    setOpen(true)
  }, [goalsState])

  const closeEditor = useCallback(() => setOpen(false), [])

  const saveGoals = useCallback(async () => {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const { data: auth } = await supabase.auth.getUser()
      const uid = String(auth?.user?.id || userId || '').trim()
      if (!uid) { setError('Você precisa estar logado.'); return }

      const { data: latest } = await supabase
        .from('nutrition_goals')
        .select('id')
        .eq('user_id', uid)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const payload = {
        user_id: uid,
        calories: safeNumber(draft.calories),
        protein: safeNumber(draft.protein),
        carbs: safeNumber(draft.carbs),
        fat: safeNumber(draft.fat),
        updated_at: new Date().toISOString(),
      }

      if (latest?.id) {
        const { error: e } = await supabase.from('nutrition_goals').update(payload).eq('id', latest.id)
        if (e) throw e
      } else {
        const { error: e } = await supabase.from('nutrition_goals').insert(payload)
        if (e) throw e
      }

      setGoalsState({
        calories: safeNumber(draft.calories),
        protein: safeNumber(draft.protein),
        carbs: safeNumber(draft.carbs),
        fat: safeNumber(draft.fat),
      })
      setOpen(false)
    } catch (e: unknown) {
      setError(getErrorMessage(e) ? String(getErrorMessage(e)) : 'Falha ao salvar metas.')
    } finally {
      setSaving(false)
    }
  }, [saving, draft, supabase, userId])

  // Sync when parent goals change (e.g. after page reload)
  const syncFromParent = useCallback((newGoals: Totals) => {
    setGoalsState({
      calories: safeNumber(newGoals?.calories),
      protein: safeNumber(newGoals?.protein),
      carbs: safeNumber(newGoals?.carbs),
      fat: safeNumber(newGoals?.fat),
    })
    setDraft({
      calories: safeNumber(newGoals?.calories),
      protein: safeNumber(newGoals?.protein),
      carbs: safeNumber(newGoals?.carbs),
      fat: safeNumber(newGoals?.fat),
    })
  }, [])

  return {
    goalsState,
    draft,
    setDraft,
    open,
    openEditor,
    closeEditor,
    saving,
    error,
    saveGoals,
    syncFromParent,
    canViewMacros,
  }
}

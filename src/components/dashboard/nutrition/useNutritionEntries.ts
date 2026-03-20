'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { deleteMealAction, editMealAction } from '@/app/(app)/dashboard/nutrition/actions'
import { createClient } from '@/utils/supabase/client'
import type { MealEntry, EditDraft } from './NutritionEntryCard'

function safeNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

type Totals = { calories: number; protein: number; carbs: number; fat: number }

type UseNutritionEntriesOptions = {
  activeDate: string
  schemaMissing?: boolean
  userId?: string
  onTotalsChange: (totals: Totals) => void
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void
}

export function useNutritionEntries({
  activeDate,
  schemaMissing,
  userId,
  onTotalsChange,
  showToast,
}: UseNutritionEntriesOptions) {
  const supabase = useMemo(() => createClient(), [])
  const [entries, setEntries] = useState<MealEntry[]>([])
  const [entriesLoading, setEntriesLoading] = useState(false)
  const [entriesError, setEntriesError] = useState('')
  const [entriesTick, setEntriesTick] = useState(0)
  const [entryBusyId, setEntryBusyId] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState('')
  const [expandedEntryId, setExpandedEntryId] = useState('')

  // ── Edit state ──────────────────────────────────────────────────
  const [editingId, setEditingId] = useState('')
  const [editDraft, setEditDraft] = useState<EditDraft>({ food_name: '', calories: 0, protein: 0, carbs: 0, fat: 0 })
  const [editBusy, setEditBusy] = useState(false)

  const safeEntries = Array.isArray(entries) ? entries : []

  // ── Load entries ────────────────────────────────────────────────
  useEffect(() => {
    if (schemaMissing) {
      setEntries([])
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        setEntriesLoading(true)
        setEntriesError('')
        let query = supabase
          .from('nutrition_meal_entries')
          .select('id, created_at, food_name, calories, protein, carbs, fat')
          .eq('date', activeDate)
        if (userId) query = query.eq('user_id', userId)
        const { data, error } = await query
          .order('created_at', { ascending: false })
          .limit(20)
        if (cancelled) return
        if (error) throw error
        const list = Array.isArray(data) ? data : []
        const mapped = list
          .map((r: Record<string, unknown>) => ({
            id: String(r?.id || '').trim(),
            created_at: String(r?.created_at || '').trim(),
            food_name: String(r?.food_name || '').trim(),
            calories: safeNumber(r?.calories),
            protein: safeNumber(r?.protein),
            carbs: safeNumber(r?.carbs),
            fat: safeNumber(r?.fat),
          }))
          .filter((r: MealEntry) => Boolean(r.id))
        setEntries(mapped)
      } catch {
        if (!cancelled) setEntriesError('Falha ao carregar lançamentos.')
      } finally {
        if (!cancelled) setEntriesLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [activeDate, entriesTick, schemaMissing, supabase, userId])

  // ── Add entry (from parent submit/AI/photo) ─────────────────────
  const addEntry = useCallback((entry: MealEntry) => {
    setEntries((prev) => [entry, ...(Array.isArray(prev) ? prev : [])].slice(0, 20))
  }, [])

  // ── Delete entry ────────────────────────────────────────────────
  const deleteEntry = useCallback(async (id: string) => {
    const entryId = String(id || '').trim()
    if (!entryId || entryBusyId) return
    setEntryBusyId(entryId)
    setConfirmDeleteId('')
    try {
      const res = await deleteMealAction(entryId)
      if (!res?.ok) {
        showToast(String((res as Record<string, unknown>)?.error || 'Falha ao remover lançamento.'), 'error')
        return
      }
      const totalsResult = (res as Record<string, unknown>)?.totals as Totals | undefined
      if (totalsResult) {
        onTotalsChange({
          calories: safeNumber(totalsResult.calories),
          protein: safeNumber(totalsResult.protein),
          carbs: safeNumber(totalsResult.carbs),
          fat: safeNumber(totalsResult.fat),
        })
      }
      setEntries((prev) => (Array.isArray(prev) ? prev : []).filter((x) => x.id !== entryId))
      showToast('Refeição removida.', 'info')
    } catch {
      showToast('Falha ao remover lançamento.', 'error')
    } finally {
      setEntryBusyId('')
    }
  }, [entryBusyId, showToast, onTotalsChange])

  // ── Edit handlers ───────────────────────────────────────────────
  const startEdit = useCallback((item: MealEntry) => {
    setEditingId(item.id)
    setEditDraft({
      food_name: item.food_name,
      calories: Math.round(item.calories),
      protein: Math.round(item.protein),
      carbs: Math.round(item.carbs),
      fat: Math.round(item.fat),
    })
  }, [])

  const cancelEdit = useCallback(() => { setEditingId('') }, [])

  const saveEdit = useCallback(async () => {
    if (editBusy || !editingId) return
    setEditBusy(true)
    try {
      const res = await editMealAction(editingId, editDraft)
      if (!res?.ok) {
        showToast(String((res as Record<string, unknown>)?.error || 'Falha ao editar.'), 'error')
        return
      }
      setEntries((prev) =>
        (Array.isArray(prev) ? prev : []).map((e) =>
          e.id === editingId
            ? { ...e, food_name: editDraft.food_name, calories: editDraft.calories, protein: editDraft.protein, carbs: editDraft.carbs, fat: editDraft.fat }
            : e,
        ),
      )
      if ((res as { totals?: Record<string, unknown> })?.totals) {
        const t = (res as { totals: Record<string, unknown> }).totals
        onTotalsChange({
          calories: Number(t.calories) || 0,
          protein: Number(t.protein) || 0,
          carbs: Number(t.carbs) || 0,
          fat: Number(t.fat) || 0,
        })
      }
      setEditingId('')
      showToast('Refeição editada! ✏️', 'success')
    } catch {
      showToast('Falha ao editar.', 'error')
    } finally {
      setEditBusy(false)
    }
  }, [editBusy, editingId, editDraft, showToast, onTotalsChange])

  // ── Reset on date change ────────────────────────────────────────
  const resetForDate = useCallback(() => {
    setEntries([])
    setExpandedEntryId('')
    setConfirmDeleteId('')
    setEditingId('')
    setEntriesTick((v) => v + 1)
  }, [])

  return {
    // Data
    entries: safeEntries,
    entriesLoading,
    entriesError,
    supabase,
    // Entry actions
    addEntry,
    deleteEntry,
    refreshEntries: () => setEntriesTick((v) => v + 1),
    resetForDate,
    // Expand
    expandedEntryId,
    setExpandedEntryId,
    // Delete confirm
    confirmDeleteId,
    setConfirmDeleteId,
    entryBusyId,
    // Edit
    editingId,
    editDraft,
    editBusy,
    startEdit,
    cancelEdit,
    saveEdit,
    setEditDraft,
  }
}

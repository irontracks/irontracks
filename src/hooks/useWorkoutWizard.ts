'use client'

import { useCallback } from 'react'
import { createWorkout } from '@/actions/workout-actions'
import { generateWorkoutFromWizard } from '@/utils/workoutAutoGenerator'
import { formatProgramWorkoutTitle } from '@/utils/workoutTitle'
import { getErrorMessage } from '@/utils/errorMessage'
import { logError } from '@/lib/logger'
import type { ActiveSession, Exercise } from '@/types/app'
import type { WorkoutWizardAnswers, WorkoutDraft } from '@/components/dashboard/WorkoutWizardModal'

type GenerateMode = 'single' | 'program'
type GenerateResult = WorkoutDraft | { drafts: WorkoutDraft[] }

interface UseWorkoutWizardParams {
  setCurrentWorkout: (v: ActiveSession | null) => void
  setView: (v: string) => void
  setCreateWizardOpen: (v: boolean) => void
  fetchWorkouts: () => Promise<void>
  alert: (msg: string, title?: string) => Promise<boolean>
  programTitleStartDay?: string | null
}

interface UseWorkoutWizardReturn {
  handleWizardGenerate: (answers: WorkoutWizardAnswers, options?: { mode?: GenerateMode }) => Promise<GenerateResult>
  handleWizardSaveDrafts: (drafts: WorkoutDraft[]) => Promise<void>
  handleWizardUseDraft: (draft: WorkoutDraft) => void
}

export function useWorkoutWizard({
  setCurrentWorkout,
  setView,
  setCreateWizardOpen,
  fetchWorkouts,
  alert,
  programTitleStartDay,
}: UseWorkoutWizardParams): UseWorkoutWizardReturn {

  const handleWizardGenerate = useCallback(async (
    answers: WorkoutWizardAnswers,
    options?: { mode?: GenerateMode },
  ): Promise<GenerateResult> => {
    const mode = String(options?.mode || 'single').trim().toLowerCase() as GenerateMode
    try {
      const res = await fetch('/api/ai/workout-wizard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers, mode }),
      })
      const data = await res.json().catch((): unknown => null) as Record<string, unknown> | null
      if (!res.ok) {
        const msg = data?.error ? String(data.error) : 'Falha ao gerar treino com IA.'
        throw new Error(msg)
      }
      if (mode === 'program') {
        const drafts = Array.isArray(data?.drafts) ? (data.drafts as WorkoutDraft[]) : null
        if (drafts && drafts.length) return { drafts }
        if (data?.ok === false && Array.isArray(data?.drafts) && (data.drafts as WorkoutDraft[]).length) return { drafts: data.drafts as WorkoutDraft[] }
        throw new Error(data?.error ? String(data.error) : 'Resposta inválida da IA.')
      }
      const draft = data?.draft && typeof data.draft === 'object' ? (data.draft as WorkoutDraft) : null
      if (draft?.exercises && Array.isArray(draft.exercises) && draft.exercises.length > 0) return draft
      if (data?.ok === false && data?.draft) return data.draft as WorkoutDraft
      throw new Error(data?.error ? String(data.error) : 'Resposta inválida da IA.')
    } catch (e: unknown) {
      const msg = getErrorMessage(e)
      const lower = msg.toLowerCase()
      const isConfig = lower.includes('api de ia não configurada') || lower.includes('google_generative_ai_api_key')
      if (isConfig) throw e
      if (mode === 'program') {
        const days = Math.max(2, Math.min(6, Number(answers?.daysPerWeek || 3) || 3))
        const drafts: WorkoutDraft[] = []
        for (let i = 0; i < days; i++) {
          drafts.push(generateWorkoutFromWizard(answers, i))
        }
        return { drafts }
      }
      return generateWorkoutFromWizard(answers, 0)
    }
  }, [])

  const handleWizardSaveDrafts = useCallback(async (drafts: WorkoutDraft[]) => {
    const list = Array.isArray(drafts) ? drafts : []
    if (!list.length) return
    try {
      for (let i = 0; i < list.length; i += 1) {
        const d = list[i]
        const baseTitle = String(d?.title || 'Treino').trim() || 'Treino'
        const finalTitle = formatProgramWorkoutTitle(baseTitle, i, { startDay: programTitleStartDay ?? undefined })
        const exercises = Array.isArray(d?.exercises) ? d.exercises : []
        const res = await createWorkout({ title: finalTitle, exercises })
        if (!res?.ok) throw new Error(String(res?.error || 'Falha ao salvar treino'))
      }
      try {
        await fetchWorkouts()
      } catch (e) { logError('useWorkoutWizard.saveDrafts', e) }
      setCreateWizardOpen(false)
      await alert(`Plano salvo: ${list.length} treinos criados.`)
    } catch (e: unknown) {
      const msg = getErrorMessage(e)
      await alert('Erro ao salvar plano: ' + msg)
    }
  }, [programTitleStartDay, fetchWorkouts, setCreateWizardOpen, alert])

  const handleWizardUseDraft = useCallback((draft: WorkoutDraft) => {
    try {
      const title = String(draft?.title || '').trim() || 'Treino'
      const exercises = (Array.isArray(draft?.exercises) ? draft.exercises : []) as Exercise[]
      setCurrentWorkout({ title, exercises } as unknown as ActiveSession)
      setView('edit')
    } finally {
      setCreateWizardOpen(false)
    }
  }, [setCurrentWorkout, setView, setCreateWizardOpen])

  return {
    handleWizardGenerate,
    handleWizardSaveDrafts,
    handleWizardUseDraft,
  }
}

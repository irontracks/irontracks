'use client'

import { useState, useCallback } from 'react'
import { logError } from '@/lib/logger'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActiveSession, Exercise, UserRecord } from '@/types/app'

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────
interface UseAppHandlersParams {
  user: UserRecord | null
  supabase: SupabaseClient
  profileDraftName: string
  setProfileIncomplete: (v: boolean) => void
  setShowCompleteProfile: (v: boolean) => void
  setCurrentWorkout: (v: ActiveSession | null) => void
  setView: (v: string) => void
  clearClientSessionState: () => void
  confirm: (msg: string, title?: string) => Promise<boolean>
  alert: (msg: string, title?: string) => Promise<boolean>
}

/**
 * Bundles remaining inline handlers from IronTracksAppClientImpl:
 * - handleLogout
 * - handleSaveProfile
 * - openManualWorkoutEditor
 * - alertVoid (Promise<void> adapter for alert)
 */
export function useAppHandlers({
  user,
  supabase,
  profileDraftName,
  setProfileIncomplete,
  setShowCompleteProfile,
  setCurrentWorkout,
  setView,
  clearClientSessionState,
  confirm,
  alert,
}: UseAppHandlersParams) {
  const [savingProfile, setSavingProfile] = useState(false)

  // alert from useDialog returns Promise<boolean>; hooks expect Promise<void>
  const alertVoid = useCallback(
    async (msg: string, title?: string): Promise<void> => { await alert(msg, title) },
    [alert]
  )

  const handleLogout = useCallback(async () => {
    const ok = await confirm('Deseja realmente sair da sua conta?', 'Sair')
    if (!ok) return
    try { clearClientSessionState() } catch { }
    try { window.location.href = '/auth/logout' } catch { }
  }, [confirm, clearClientSessionState])

  const handleSaveProfile = useCallback(async () => {
    if (!user?.id) return
    const nextName = String(profileDraftName || '').trim()
    if (!nextName) {
      await alert('Informe seu nome para completar o perfil.', 'Perfil incompleto')
      return
    }

    setSavingProfile(true)
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({
          display_name: nextName,
          photo_url: user.photoURL ?? null,
          last_seen: new Date().toISOString(),
        })
        .eq('id', user.id)
        .select('id')
        .maybeSingle()
      if (error) throw error
      if (!data?.id) {
        await alert('Não foi possível salvar seu perfil (registro não encontrado).', 'Perfil')
        return
      }
      setProfileIncomplete(false)
      setShowCompleteProfile(false)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e || '')
      await alert('Erro ao salvar perfil: ' + message)
    } finally {
      setSavingProfile(false)
    }
  }, [user, supabase, profileDraftName, alert, setProfileIncomplete, setShowCompleteProfile])

  const openManualWorkoutEditor = useCallback(() => {
    setCurrentWorkout({ title: '', exercises: [] as Exercise[] } as unknown as ActiveSession)
    setView('edit')
  }, [setCurrentWorkout, setView])

  const handleAddStory = useCallback(() => {
    try { window.dispatchEvent(new CustomEvent('irontracks:stories:open-creator')) } catch { }
  }, [])

  return {
    savingProfile,
    setSavingProfile,
    alertVoid,
    handleLogout,
    handleSaveProfile,
    openManualWorkoutEditor,
    handleAddStory,
  }
}

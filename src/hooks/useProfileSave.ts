'use client'

import { useCallback, useState } from 'react'
import { createClient } from '@/utils/supabase/client'

interface UseProfileSaveOptions {
  userId?: string
  user?: { photoURL?: string | null } | null
  alert: (msg: string, title?: string) => Promise<unknown>
}

export function useProfileSave({ userId, user, alert }: UseProfileSaveOptions) {
  const supabase = createClient()
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileDraftName, setProfileDraftName] = useState('')
  const [profileIncomplete, setProfileIncomplete] = useState(false)
  const [showCompleteProfile, setShowCompleteProfile] = useState(false)

  const handleSaveProfile = useCallback(async () => {
    if (!userId) return
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
          photo_url: user?.photoURL ?? null,
          last_seen: new Date().toISOString(),
        })
        .eq('id', userId)
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
  }, [userId, profileDraftName, user?.photoURL, alert, supabase])

  return {
    savingProfile,
    profileDraftName,
    setProfileDraftName,
    profileIncomplete,
    setProfileIncomplete,
    showCompleteProfile,
    setShowCompleteProfile,
    handleSaveProfile,
  }
}

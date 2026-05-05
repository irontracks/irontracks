/**
 * useSiriWorkoutSuggestions
 *
 * Pushes the user's recent / favourite workouts into the iOS native cache so
 * Siri's `StartSpecificWorkoutIntent` can offer them as voice-triggered
 * shortcuts ("Hey Siri, iniciar Treino A no IronTracks").
 *
 * Re-syncs whenever the workout list changes. Capped at 10 entries on the
 * native side — Siri ignores larger lists. No-op on non-iOS.
 */
'use client'

import { useEffect } from 'react'
import { updateSiriWorkoutSuggestions } from '@/utils/native/irontracksNative'
import { isIosNative } from '@/utils/platform'

export interface SiriWorkoutSuggestion {
  id: string
  name: string
}

export function useSiriWorkoutSuggestions(workouts: ReadonlyArray<SiriWorkoutSuggestion>): void {
  useEffect(() => {
    if (!isIosNative()) return
    const safe = (workouts || [])
      .filter((w) => w && typeof w.id === 'string' && typeof w.name === 'string' && w.id.trim() && w.name.trim())
      .slice(0, 10)
    if (safe.length === 0) return
    void updateSiriWorkoutSuggestions(safe.map((w) => ({ id: w.id, name: w.name })))
  }, [workouts])
}

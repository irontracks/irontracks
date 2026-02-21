'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { getLatestWhatsNew } from '@/content/whatsNew'
import type { PendingUpdate } from '@/types/app'
import type { useUserSettings } from '@/hooks/useUserSettings'

type UserSettingsApi = ReturnType<typeof useUserSettings>

interface UseWhatsNewOptions {
  userId?: string | null
  userSettingsApi?: UserSettingsApi | null
}

interface UseWhatsNewReturn {
  whatsNewOpen: boolean
  setWhatsNewOpen: (open: boolean) => void
  pendingUpdate: PendingUpdate | null
  setPendingUpdate: (update: PendingUpdate | null) => void
  closeWhatsNew: () => Promise<void>
}

/**
 * Manages "What's New" modal state.
 * Auto-opens once per session when new updates are available,
 * respecting the user's whatsNewAutoOpen preference.
 */
export function useWhatsNew({ userId, userSettingsApi }: UseWhatsNewOptions): UseWhatsNewReturn {
  const [whatsNewOpen, setWhatsNewOpen] = useState(false)
  const [pendingUpdate, setPendingUpdate] = useState<PendingUpdate | null>(null)
  const shownRef = useRef(false)

  useEffect(() => {
    if (shownRef.current) return
    const uid = userId ? String(userId) : ''
    if (!uid) return
    if (!userSettingsApi?.loaded) return

    const prefs =
      userSettingsApi?.settings && typeof userSettingsApi.settings === 'object'
        ? userSettingsApi.settings
        : {}
    if ((prefs as Record<string, unknown>)?.whatsNewAutoOpen === false) return

    ;(async () => {
      try {
        const res = await fetch(`/api/updates/unseen?limit=1`)
        const data = await res.json().catch(() => ({}))
        const updates = Array.isArray(data?.updates) ? data.updates : []
        const first = updates[0] || null
        if (!first) return

        try {
          await fetch('/api/updates/mark-prompted', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updateId: String(first.id) }),
          })
        } catch { }

        shownRef.current = true
        setWhatsNewOpen(true)
        setPendingUpdate(first as PendingUpdate)
      } catch { }
    })()
  }, [userId, userSettingsApi?.loaded, userSettingsApi?.settings])

  const closeWhatsNew = useCallback(async () => {
    try {
      setWhatsNewOpen(false)
      const updateId = pendingUpdate?.id ? String(pendingUpdate.id) : ''

      if (updateId) {
        try {
          await fetch('/api/updates/mark-viewed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updateId }),
          })
        } catch { }
        setPendingUpdate(null)
        return
      }

      const entry = getLatestWhatsNew()
      if (!entry?.id) return

      const prev =
        userSettingsApi?.settings && typeof userSettingsApi.settings === 'object'
          ? userSettingsApi.settings
          : {}
      const nextSeenAt = Date.now()
      const next = {
        ...(prev || {}),
        whatsNewLastSeenId: String(entry.id),
        whatsNewLastSeenAt: nextSeenAt,
      }

      try {
        userSettingsApi?.setSettings?.(
          next as Parameters<NonNullable<typeof userSettingsApi>['setSettings']>[0],
        )
      } catch { }
      try {
        await userSettingsApi?.save?.(
          next as Parameters<NonNullable<typeof userSettingsApi>['save']>[0],
        )
      } catch { }
    } catch { }
  }, [userSettingsApi, pendingUpdate])

  return {
    whatsNewOpen,
    setWhatsNewOpen,
    pendingUpdate,
    setPendingUpdate,
    closeWhatsNew,
  }
}

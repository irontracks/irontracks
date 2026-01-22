'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/utils/supabase/client'

export const DEFAULT_SETTINGS = {
  units: 'kg',
  dashboardDensity: 'comfortable',
  showNewRecordsCard: true,
  showIronRank: true,
  showBadges: true,
  whatsNewLastSeenId: '',
  whatsNewLastSeenAt: 0,
  whatsNewAutoOpen: true,
  whatsNewRemind24h: true,
  enableSounds: true,
  allowTeamInvites: true,
  allowSocialFollows: true,
  allowDirectMessages: true,
  notifyDirectMessages: true,
  notifyAppointments: true,
  notifySocialFollows: true,
  notifyFriendOnline: true,
  notifyFriendWorkoutEvents: true,
  notifyFriendPRs: true,
  notifyFriendStreaks: true,
  notifyFriendGoals: true,
  soundVolume: 100,
  inAppToasts: true,
  notificationPermissionPrompt: true,
  restTimerNotify: true,
  restTimerVibrate: true,
  restTimerRepeatAlarm: true,
  restTimerRepeatIntervalMs: 1500,
  restTimerTickCountdown: true,
  restTimerDefaultSeconds: 90,
  autoRestTimerWhenMissing: false,
}

const STORAGE_KEY = 'irontracks.userSettings.v1'
const TABLE_MISSING_KEY = 'irontracks.userSettings.user_settings_table_missing.v1'

const safeJsonParse = (raw) => {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function useUserSettings(userId) {
  const supabase = useMemo(() => {
    try {
      return createClient()
    } catch {
      return null
    }
  }, [])
  const safeUserId = userId ? String(userId) : ''
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const lastSavedRef = useRef(null)
  const tableMissingRef = useRef(false)

  useEffect(() => {
    if (!safeUserId) return
    if (!supabase) {
      setLoaded(true)
      return
    }
    let cancelled = false

    try {
      if (typeof window !== 'undefined') {
        const missingRaw = window.localStorage.getItem(TABLE_MISSING_KEY) || ''
        tableMissingRef.current = missingRaw === '1'
        const cachedRaw = window.localStorage.getItem(`${STORAGE_KEY}.${safeUserId}`) || ''
        const cached = cachedRaw ? safeJsonParse(cachedRaw) : null
        if (cached && typeof cached === 'object') {
          setSettings((prev) => ({ ...prev, ...cached }))
        }
      }
    } catch {}

    ;(async () => {
      try {
        if (tableMissingRef.current) return
        const { data, error } = await supabase
          .from('user_settings')
          .select('preferences, updated_at')
          .eq('user_id', safeUserId)
          .maybeSingle()

        if (cancelled) return
        if (error) {
          const status = Number(error?.status)
          const code = error?.code ? String(error.code) : ''
          const msg = error?.message ? String(error.message) : ''
          const isMissing = status === 404 || code === '42P01' || /does not exist/i.test(msg) || /not found/i.test(msg)
          if (isMissing) {
            tableMissingRef.current = true
            try {
              if (typeof window !== 'undefined') window.localStorage.setItem(TABLE_MISSING_KEY, '1')
            } catch {}
            return
          }
          throw error
        }

        const prefs = data?.preferences && typeof data.preferences === 'object' ? data.preferences : null
        if (prefs) {
          setSettings((prev) => ({ ...prev, ...prefs }))
        }
        lastSavedRef.current = data?.updated_at || null
      } catch {
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [supabase, safeUserId])

  const updateSetting = useCallback((key, value) => {
    if (!key) return
    setSettings((prev) => ({ ...prev, [key]: value }))
  }, [])

  const save = useCallback(async (overrideSettings) => {
    if (!safeUserId) return { ok: false, error: 'missing_user' }
    if (saving) return { ok: false, error: 'saving' }
    if (!supabase) return { ok: false, error: 'missing_supabase' }
    setSaving(true)
    try {
      const nextSettings = overrideSettings && typeof overrideSettings === 'object' ? overrideSettings : settings

      if (tableMissingRef.current) {
        try {
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(`${STORAGE_KEY}.${safeUserId}`, JSON.stringify(nextSettings))
          }
        } catch {}
        try {
          setSettings((prev) => ({ ...(prev || {}), ...(nextSettings || {}) }))
        } catch {}
        return { ok: true, localOnly: true }
      }

      const payload = {
        user_id: safeUserId,
        preferences: nextSettings,
        updated_at: new Date().toISOString(),
      }

      const { error } = await supabase
        .from('user_settings')
        .upsert(payload, { onConflict: 'user_id' })

      if (error) {
        const status = Number(error?.status)
        const code = error?.code ? String(error.code) : ''
        const msg = error?.message ? String(error.message) : ''
        const isMissing = status === 404 || code === '42P01' || /does not exist/i.test(msg) || /not found/i.test(msg)
        if (isMissing) {
          tableMissingRef.current = true
          try {
            if (typeof window !== 'undefined') window.localStorage.setItem(TABLE_MISSING_KEY, '1')
          } catch {}
          try {
            if (typeof window !== 'undefined') {
              window.localStorage.setItem(`${STORAGE_KEY}.${safeUserId}`, JSON.stringify(nextSettings))
            }
          } catch {}
          return { ok: true, localOnly: true }
        }
        throw error
      }

      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(`${STORAGE_KEY}.${safeUserId}`, JSON.stringify(nextSettings))
        }
      } catch {}

      try {
        setSettings((prev) => ({ ...(prev || {}), ...(nextSettings || {}) }))
      } catch {}

      return { ok: true }
    } catch (e) {
      return { ok: false, error: e?.message ?? String(e) }
    } finally {
      setSaving(false)
    }
  }, [safeUserId, saving, settings, supabase])

  return {
    loaded,
    saving,
    settings,
    setSettings,
    updateSetting,
    save,
  }
}

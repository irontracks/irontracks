'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { UserSettingsSchema, type UserSettings, DEFAULT_USER_SETTINGS } from '@/schemas/settings'
import { getErrorMessage } from '@/utils/errorMessage'
import { parseJsonWithSchema } from '@/utils/zod'
import { z } from 'zod'

export const DEFAULT_SETTINGS = DEFAULT_USER_SETTINGS

const STORAGE_KEY = 'irontracks.userSettings.v1'
const TABLE_MISSING_KEY = 'irontracks.userSettings.user_settings_table_missing.v1'

const safeJsonParse = (raw: string): unknown => parseJsonWithSchema(raw, z.record(z.unknown()))

export function useUserSettings(userId: string | null | undefined) {
  const supabase = useMemo(() => {
    try {
      return createClient()
    } catch {
      return null
    }
  }, [])
  const safeUserId = userId ? String(userId) : ''
  const [loaded, setLoaded] = useState<boolean>(false)
  const [saving, setSaving] = useState<boolean>(false)
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS)
  const lastSavedRef = useRef<string | null>(null)
  const tableMissingRef = useRef<boolean>(false)

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
          setSettings((prev) => ({ ...prev, ...(cached as unknown as Partial<UserSettings>) }))
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
          const e = error as unknown as { status?: unknown; code?: unknown; message?: unknown }
          const status = Number(e?.status)
          const code = e?.code ? String(e.code) : ''
          const msg = getErrorMessage(e) ? String(e.message) : ''
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
          setSettings((prev) => ({ ...prev, ...(prefs as unknown as Partial<UserSettings>) }))
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

  const updateSetting = useCallback(<K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    if (!key) return
    setSettings((prev) => ({ ...prev, [key]: value }))
  }, [])

  const save = useCallback(
    async (
      overrideSettings?: Partial<UserSettings> | null | undefined,
    ): Promise<{ ok: boolean; error?: string; localOnly?: boolean }> => {
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
        const e = error as unknown as { status?: unknown; code?: unknown; message?: unknown }
        const status = Number(e?.status)
        const code = e?.code ? String(e.code) : ''
        const msg = getErrorMessage(e) ? String(e.message) : ''
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
      const message = e instanceof Error ? e.message : String(e)
      return { ok: false, error: message }
    } finally {
      setSaving(false)
    }
  },
    [safeUserId, saving, settings, supabase],
  )

  return {
    loaded,
    saving,
    settings,
    setSettings,
    updateSetting,
    save,
  }
}

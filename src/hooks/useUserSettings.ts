/**
 * @module useUserSettings
 *
 * Reads and writes the per-user settings object from the `user_settings` table.
 * Provides a typed `settings` state with defaults, `updateSetting` for partial
 * updates, and `save()` to persist to Supabase + localStorage.
 *
 * Reescrito em PR-B (REACT19_MIGRATION_PLAN) usando TanStack Query v5.
 * API pública 100% preservada: `loaded`, `saving`, `settings`, `setSettings`,
 * `updateSetting`, `save`. Consumers não precisam mudar.
 *
 * Camadas de dados (de menor pra maior latência):
 *   1. localStorage `irontracks.userSettings.v1.<userId>` — initialData, sem flicker
 *   2. Supabase `user_settings.preferences` (jsonb) — fonte da verdade
 *   3. Fallback localStorage-only quando tabela não existe (`tableMissingRef`)
 *
 * @returns `{ loaded, saving, settings, setSettings, updateSetting, save }`
 */
'use client'
import { logWarn } from '@/lib/logger'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useStableSupabaseClient } from '@/hooks/useStableSupabaseClient'
import { type UserSettings, DEFAULT_USER_SETTINGS } from '@/schemas/settings'
import { getErrorMessage } from '@/utils/errorMessage'
import { parseJsonWithSchema } from '@/utils/zod'
import { z } from 'zod'

export const DEFAULT_SETTINGS = DEFAULT_USER_SETTINGS

const STORAGE_KEY = 'irontracks.userSettings.v1'
const TABLE_MISSING_KEY = 'irontracks.userSettings.user_settings_table_missing.v1'

const safeJsonParse = (raw: string): unknown => parseJsonWithSchema(raw, z.record(z.unknown()))

const buildStorageKey = (userId: string) => `${STORAGE_KEY}.${userId}`

const readFromLocalStorage = (userId: string): Partial<UserSettings> | null => {
  if (typeof window === 'undefined' || !userId) return null
  try {
    const raw = window.localStorage.getItem(buildStorageKey(userId)) || ''
    if (!raw) return null
    const parsed = safeJsonParse(raw)
    if (parsed && typeof parsed === 'object') return parsed as Partial<UserSettings>
    return null
  } catch (e) {
    logWarn('useUserSettings', 'localStorage read failed', e)
    return null
  }
}

const writeToLocalStorage = (userId: string, settings: UserSettings) => {
  if (typeof window === 'undefined' || !userId) return
  try {
    window.localStorage.setItem(buildStorageKey(userId), JSON.stringify(settings))
  } catch (e) {
    logWarn('useUserSettings', 'localStorage write failed', e)
  }
}

const isTableMissingError = (error: { status?: unknown; code?: unknown; message?: unknown }): boolean => {
  const status = Number(error?.status)
  const code = error?.code ? String(error.code) : ''
  const msg = getErrorMessage(error) ? String(error.message) : ''
  return status === 404 || code === '42P01' || /does not exist/i.test(msg) || /not found/i.test(msg)
}

interface SaveResult {
  ok: boolean
  error?: string
  localOnly?: boolean
}

export function useUserSettings(userId: string | null | undefined) {
  const supabase = useStableSupabaseClient()
  const safeUserId = userId ? String(userId) : ''
  const queryClient = useQueryClient()

  // `tableMissingRef` é ref (não state) porque queremos persistir entre renders
  // e atualizá-lo dentro de queryFn/mutationFn sem disparar re-render.
  // Sincronizado com localStorage no mount (idempotente).
  const tableMissingRef = useRef<boolean>(false)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      tableMissingRef.current = window.localStorage.getItem(TABLE_MISSING_KEY) === '1'
    }
  }, [])

  // Memoizado pra não invalidar deps de useCallback/useMemo abaixo a cada render.
  const queryKey = useMemo(() => ['user-settings', safeUserId] as const, [safeUserId])

  const query = useQuery<UserSettings>({
    queryKey,
    enabled: !!safeUserId,
    // initialData: localStorage. Zero-flicker startup — UI já tem dado válido
    // antes do fetch do Supabase voltar.
    initialData: () => {
      if (!safeUserId) return DEFAULT_USER_SETTINGS
      const cached = readFromLocalStorage(safeUserId)
      if (!cached) return DEFAULT_USER_SETTINGS
      return { ...DEFAULT_USER_SETTINGS, ...cached } as UserSettings
    },
    initialDataUpdatedAt: 0, // força refetch após mount pra pegar versão remota
    queryFn: async (): Promise<UserSettings> => {
      // Tabela ausente: localStorage-only mode
      if (tableMissingRef.current) {
        const cached = readFromLocalStorage(safeUserId)
        return cached
          ? ({ ...DEFAULT_USER_SETTINGS, ...cached } as UserSettings)
          : DEFAULT_USER_SETTINGS
      }

      if (!supabase) return DEFAULT_USER_SETTINGS

      const { data, error } = await supabase
        .from('user_settings')
        .select('preferences, updated_at')
        .eq('user_id', safeUserId)
        .maybeSingle()

      if (error) {
        if (isTableMissingError(error as { status?: unknown; code?: unknown; message?: unknown })) {
          tableMissingRef.current = true
          if (typeof window !== 'undefined') {
            try { window.localStorage.setItem(TABLE_MISSING_KEY, '1') } catch (e) { logWarn('useUserSettings', 'mark missing failed', e) }
          }
          const cached = readFromLocalStorage(safeUserId)
          return cached
            ? ({ ...DEFAULT_USER_SETTINGS, ...cached } as UserSettings)
            : DEFAULT_USER_SETTINGS
        }
        throw error
      }

      const prefs = data?.preferences && typeof data.preferences === 'object'
        ? (data.preferences as Partial<UserSettings>)
        : null
      return prefs
        ? ({ ...DEFAULT_USER_SETTINGS, ...prefs } as UserSettings)
        : DEFAULT_USER_SETTINGS
    },
  })

  // `settings` sempre tem valor (fallback pro default) — UI nunca quebra.
  const settings: UserSettings = query.data ?? DEFAULT_USER_SETTINGS

  // setSettings local — atualiza apenas o cache do Query (sem disparar save).
  // Compat 100% com a API anterior que era `React.Dispatch<SetStateAction<UserSettings>>`.
  const setSettings = useCallback(
    (updater: UserSettings | ((prev: UserSettings) => UserSettings)) => {
      queryClient.setQueryData<UserSettings>(queryKey, (prev) => {
        const base = prev ?? DEFAULT_USER_SETTINGS
        return typeof updater === 'function'
          ? (updater as (p: UserSettings) => UserSettings)(base)
          : updater
      })
    },
    [queryClient, queryKey],
  )

  const updateSetting = useCallback(
    <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
      if (!key) return
      setSettings((prev) => ({ ...prev, [key]: value }))
    },
    [setSettings],
  )

  const saveMutation = useMutation<SaveResult, Error, Partial<UserSettings> | null | undefined>({
    mutationFn: async (overrideSettings): Promise<SaveResult> => {
      if (!safeUserId) return { ok: false, error: 'missing_user' }
      if (!supabase) return { ok: false, error: 'missing_supabase' }

      const nextSettings = (overrideSettings && typeof overrideSettings === 'object'
        ? { ...settings, ...overrideSettings }
        : settings) as UserSettings

      // Fallback localStorage-only
      if (tableMissingRef.current) {
        writeToLocalStorage(safeUserId, nextSettings)
        queryClient.setQueryData<UserSettings>(queryKey, nextSettings)
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
        if (isTableMissingError(error as { status?: unknown; code?: unknown; message?: unknown })) {
          tableMissingRef.current = true
          if (typeof window !== 'undefined') {
            try { window.localStorage.setItem(TABLE_MISSING_KEY, '1') } catch (e) { logWarn('useUserSettings', 'mark missing failed', e) }
          }
          writeToLocalStorage(safeUserId, nextSettings)
          queryClient.setQueryData<UserSettings>(queryKey, nextSettings)
          return { ok: true, localOnly: true }
        }
        throw error
      }

      writeToLocalStorage(safeUserId, nextSettings)
      queryClient.setQueryData<UserSettings>(queryKey, nextSettings)
      return { ok: true }
    },
  })

  const save = useCallback(
    async (overrideSettings?: Partial<UserSettings> | null): Promise<SaveResult> => {
      try {
        return await saveMutation.mutateAsync(overrideSettings)
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        return { ok: false, error: message }
      }
    },
    [saveMutation],
  )

  return {
    // `loaded` true quando a query terminou (sucesso OU erro) — equivale ao
    // antigo `setLoaded(true)` no finally do fetch.
    loaded: !query.isLoading || query.isFetched,
    saving: saveMutation.isPending,
    settings,
    setSettings,
    updateSetting,
    save,
  }
}

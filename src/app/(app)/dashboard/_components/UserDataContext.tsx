/**
 * @module UserDataContext
 *
 * Context que agrega dados de usuário + settings + VIP + workouts/streak
 * já consumidos pelo IronTracksAppClientImpl. PR#3 do refactor do god
 * component (REACT_AUDIT.md #20 / plano em REACT19_MIGRATION_PLAN.md).
 *
 * Esta primeira versão é "fold-only": o god component continua dono dos
 * `useState`/hooks e passa tudo via `value` pro Provider. Consumers
 * (DashboardModals, StudentDashboard, sub-rotas) migrarão GRADUALMENTE
 * em PRs separados — substituindo prop drilling por `useDashboardData()`.
 *
 * Por que centralizar:
 *   - Hoje IronTracksAppClientImpl passa 30+ props pra DashboardModals.
 *   - DashboardHeader, StudentDashboard e modais inline também recebem
 *     subsets que podem virar lookups via context.
 *   - Sub-rotas futuras (`/dashboard/history`, `/dashboard/active`)
 *     precisarão do mesmo user/settings sem voltar prop drilling.
 *
 * Memoização:
 *   - O `value` PRECISA ser memoizado pelo caller (audit React Finding #4).
 *   - Tipo `UserData` é "shape de referência estável" — caller usa `useMemo`
 *     com deps explícitas pra criar o objeto.
 */
'use client'

import { createContext, useContext } from 'react'
import type { UserRecord } from '@/types/app'
import type { UserSettings } from '@/schemas/settings'

export interface VipAccess {
  hasVip?: boolean
  [key: string]: unknown
}

export interface VipStatus {
  [key: string]: unknown
}

export interface StreakStats {
  currentStreak?: number
  weekWorkouts?: number
  [key: string]: unknown
}

export interface WorkoutStats {
  workouts: number
  exercises: number
  activeStreak: number
}

export interface UserSettingsApi {
  loaded: boolean
  saving: boolean
  settings: UserSettings
  setSettings: (updater: UserSettings | ((prev: UserSettings) => UserSettings)) => void
  updateSetting: <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => void
  save: (overrideSettings?: Partial<UserSettings> | null) => Promise<{ ok: boolean; error?: string; localOnly?: boolean }>
}

export interface UserData {
  /** Authenticated user record (server-derived + client refinements). */
  user: UserRecord | null
  /** Setter pra IronTracksApp ainda usar localmente; será removido em PRs futuros. */
  setUser: (next: UserRecord | null) => void
  /** True quando role é admin ou teacher. */
  isCoach: boolean
  /** Setter exposto pelo mesmo motivo de `setUser`. */
  setIsCoach: (v: boolean) => void
  /** Hook completo de user_settings (Query-backed após PR-B). */
  userSettingsApi: UserSettingsApi | null
  /** VIP access + status (vem de useVipAccess). */
  vipAccess: VipAccess | null
  vipStatus: VipStatus | null
  /** Esconde tab VIP no iOS (compliance App Store). */
  hideVipOnIos: boolean
  /** Workouts cacheados + stats (vem de useWorkoutFetch). */
  workouts: Array<Record<string, unknown>>
  stats: WorkoutStats
  /** Streak stats (vem de useWorkoutStreak). */
  streakStats: StreakStats | null
  /** Triggers de refetch — expostos pra sub-rotas invalidarem dados. */
  fetchWorkouts: (specificUser?: { id: string; role?: string } | null) => Promise<void>
}

const UserDataContext = createContext<UserData | null>(null)

export const UserDataProvider = UserDataContext.Provider

/**
 * Hook pra acessar dados de usuário/settings/VIP sem prop drilling.
 *
 * Lança se chamado fora do Provider — força consumers a estarem dentro
 * da árvore correta. Use `useDashboardDataOptional` se precisar de
 * defensive read (raro — só pra componentes de erro/fallback).
 */
export function useDashboardData(): UserData {
  const ctx = useContext(UserDataContext)
  if (!ctx) {
    throw new Error('useDashboardData must be used inside <UserDataProvider>')
  }
  return ctx
}

export function useDashboardDataOptional(): UserData | null {
  return useContext(UserDataContext)
}

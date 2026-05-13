'use client'
/**
 * useTeacherPlan
 * Fetches the current teacher's plan status, student count and upgrade eligibility.
 *
 * Reescrito em PR-C (REACT19_MIGRATION_PLAN) usando TanStack Query v5.
 * API pública preservada (TeacherPlanState).
 */
import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiTeacherBilling } from '@/lib/api/teacher-billing'
import type { TeacherMyPlanResult, TeacherPlanRow } from '@/lib/api/teacher-billing'

export interface TeacherPlanState {
  loading: boolean
  plan: TeacherPlanRow | null
  status: string
  validUntil: string | null
  studentCount: number
  maxStudents: number        // 0 = unlimited
  canAddStudent: boolean
  error: string | null
  refetch: () => void
}

export function useTeacherPlan(): TeacherPlanState {
  const query = useQuery<TeacherMyPlanResult>({
    queryKey: ['teacher-plan'],
    queryFn: () => apiTeacherBilling.getMyPlan(),
    staleTime: 60_000,
  })

  const data = query.data

  const refetch = useCallback(() => {
    void query.refetch()
  }, [query])

  return {
    loading: query.isLoading,
    plan: (data?.plan as TeacherPlanRow | undefined) ?? null,
    status: data?.status ?? 'active',
    validUntil: data?.valid_until ?? null,
    studentCount: data?.student_count ?? 0,
    maxStudents: data?.max_students ?? 2,
    canAddStudent: data?.can_add_student ?? true,
    error: query.error ? (query.error as Error).message : null,
    refetch,
  }
}

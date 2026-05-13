/**
 * useStudentSubscription — fetches the student's active/pending subscription,
 * teacher info, and latest charge from /api/student/my-subscription.
 *
 * Reescrito em PR-C (REACT19_MIGRATION_PLAN) usando TanStack Query v5.
 * API pública preservada (StudentSubscriptionState).
 */
'use client'

import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiStudentBilling } from '@/lib/api/student-billing'
import type { StudentSubscription, StudentCharge } from '@/lib/api/student-billing'

interface StudentSubscriptionResponse {
  subscription?: StudentSubscription | null
  teacher?: Record<string, unknown> | null
  charge?: StudentCharge | null
}

export interface StudentSubscriptionState {
  loading: boolean
  subscription: StudentSubscription | null
  teacher: Record<string, unknown> | null
  charge: StudentCharge | null
  refetch: () => void
}

export function useStudentSubscription(): StudentSubscriptionState {
  const query = useQuery<StudentSubscriptionResponse>({
    queryKey: ['student-subscription'],
    queryFn: () => apiStudentBilling.getMySubscription(),
    staleTime: 60_000,
  })

  const data = query.data

  const refetch = useCallback(() => {
    void query.refetch()
  }, [query])

  return {
    loading: query.isLoading,
    subscription: data?.subscription ?? null,
    teacher: data?.teacher ?? null,
    charge: data?.charge ?? null,
    refetch,
  }
}

'use client'
/**
 * useTeacherPlan
 * Fetches the current teacher's plan status, student count and upgrade eligibility.
 */
import { useCallback, useEffect, useState } from 'react'
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
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<TeacherMyPlanResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await apiTeacherBilling.getMyPlan()
      setData(result)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetch() }, [fetch])

  return {
    loading,
    plan: (data?.plan as TeacherPlanRow | undefined) ?? null,
    status: data?.status ?? 'active',
    validUntil: data?.valid_until ?? null,
    studentCount: data?.student_count ?? 0,
    maxStudents: data?.max_students ?? 2,
    canAddStudent: data?.can_add_student ?? true,
    error,
    refetch: fetch,
  }
}

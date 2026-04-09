/**
 * useStudentSubscription — fetches the student's active/pending subscription,
 * teacher info, and latest charge from /api/student/my-subscription.
 */
import { useCallback, useEffect, useState } from 'react'
import { apiStudentBilling } from '@/lib/api/student-billing'
import type { StudentSubscription, StudentCharge } from '@/lib/api/student-billing'

export interface StudentSubscriptionState {
  loading: boolean
  subscription: StudentSubscription | null
  teacher: Record<string, unknown> | null
  charge: StudentCharge | null
  refetch: () => void
}

export function useStudentSubscription(): StudentSubscriptionState {
  const [loading, setLoading] = useState(true)
  const [subscription, setSubscription] = useState<StudentSubscription | null>(null)
  const [teacher, setTeacher] = useState<Record<string, unknown> | null>(null)
  const [charge, setCharge] = useState<StudentCharge | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiStudentBilling.getMySubscription()
      setSubscription(res.subscription ?? null)
      setTeacher(res.teacher ?? null)
      setCharge(res.charge ?? null)
    } catch {
      setSubscription(null)
      setTeacher(null)
      setCharge(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetch() }, [fetch])

  return { loading, subscription, teacher, charge, refetch: fetch }
}

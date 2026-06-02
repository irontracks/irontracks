'use client'

import { useCallback, useEffect, useState } from 'react'
import type { LabExam } from '@/types/labExam'

interface UseLabExamsResult {
  exams: LabExam[]
  loading: boolean
  error: string
  reload: () => Promise<void>
  removeExam: (id: string) => Promise<boolean>
}

/**
 * Lista os exames laboratoriais do usuário (ou de um aluno, quando studentUserId
 * é passado no fluxo personal). Expõe reload e remoção.
 */
export function useLabExams(studentUserId?: string | null): UseLabExamsResult {
  const [exams, setExams] = useState<LabExam[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const qs = studentUserId ? `?studentUserId=${encodeURIComponent(studentUserId)}` : ''
      const res = await fetch(`/api/lab-exams/list${qs}`)
      const json = await res.json().catch(() => ({ ok: false }))
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Falha ao carregar exames.')
      setExams(Array.isArray(json.exams) ? json.exams : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar.')
    } finally {
      setLoading(false)
    }
  }, [studentUserId])

  const removeExam = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/lab-exams/${encodeURIComponent(id)}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({ ok: false }))
      if (!res.ok || !json?.ok) return false
      setExams((prev) => prev.filter((e) => e.id !== id))
      return true
    } catch {
      return false
    }
  }, [])

  useEffect(() => { void reload() }, [reload])

  return { exams, loading, error, reload, removeExam }
}

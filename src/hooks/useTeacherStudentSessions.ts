/**
 * @module useTeacherStudentSessions
 *
 * Subscribes to active_workout_sessions for all of the teacher's students.
 * Returns a map of studentUserId → { startedAt, controlledBy, controlStatus }
 * so StudentsTab can show a "Treinando agora" badge on active students.
 *
 * Uses Supabase Realtime (postgres_changes) — the SELECT RLS policy for
 * teachers ensures only their students' rows are delivered.
 */
'use client'

import { useEffect, useRef, useState } from 'react'
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js'
import { logError, logWarn } from '@/lib/logger'

export interface StudentActiveSession {
  startedAt: string
  updatedAt: string
  controlledBy: string | null
  controlStatus: string | null
}

type ActiveMap = Record<string, StudentActiveSession>

export function useTeacherStudentSessions(
  supabase: SupabaseClient | null,
  teacherUserId: string | undefined,
  /**
   * Lista opcional de student IDs. Quando passada, filtra a query inicial e o
   * canal Realtime por `user_id=in.(...)` — reduz spam de UPDATEs em teachers
   * com muitos alunos (RLS já filtra mas continua entregando todas as linhas
   * permitidas). Em horários de pico isso é significativo: cada keystroke do
   * aluno gera UPDATE; sem filtro, todos os alunos triplicam o tráfego.
   */
  studentUserIds?: readonly string[],
): ActiveMap {
  const [activeMap, setActiveMap] = useState<ActiveMap>({})
  const channelRef = useRef<RealtimeChannel | null>(null)

  // Memoiza o filtro pra não recriar o canal a cada render quando a lista
  // tem o mesmo conteúdo. Stringify ordenado pra deps estáveis.
  const filterKey = studentUserIds && studentUserIds.length > 0
    ? [...studentUserIds].sort().join(',')
    : ''

  useEffect(() => {
    if (!supabase || !teacherUserId) return
    let mounted = true
    const ids = filterKey ? filterKey.split(',') : null
    const realtimeFilter = ids ? `user_id=in.(${ids.join(',')})` : undefined

    const load = async () => {
      try {
        let query = supabase
          .from('active_workout_sessions')
          .select('user_id, started_at, updated_at, controlled_by, control_status')
        if (ids) query = query.in('user_id', ids)
        const { data, error } = await query

        if (!mounted) return
        if (error) { logError('useTeacherStudentSessions.load', error); return }
        if (!data) return

        const map: ActiveMap = {}
        for (const row of data) {
          map[String(row.user_id)] = {
            startedAt: String(row.started_at ?? ''),
            updatedAt: String(row.updated_at ?? ''),
            controlledBy: row.controlled_by ? String(row.controlled_by) : null,
            controlStatus: row.control_status ? String(row.control_status) : null,
          }
        }
        setActiveMap(map)
      } catch (e) { logError('useTeacherStudentSessions.load', e) }
    }
    load()

    try {
      const ch = supabase
        .channel(`teacher-student-sessions:${teacherUserId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'active_workout_sessions',
            ...(realtimeFilter ? { filter: realtimeFilter } : {}),
          },
          (payload: Record<string, unknown>) => {
            if (!mounted) return
            const ev = String(payload?.eventType ?? '').toUpperCase()

            if (ev === 'DELETE') {
              const oldRow = payload?.old as Record<string, unknown> | null
              const uid = String(oldRow?.user_id ?? '')
              if (!uid) return
              setActiveMap(prev => {
                const next = { ...prev }
                delete next[uid]
                return next
              })
              return
            }

            const newRow = payload?.new as Record<string, unknown> | null
            if (!newRow?.user_id) return
            const uid = String(newRow.user_id)

            if (ev === 'INSERT' || ev === 'UPDATE') {
              setActiveMap(prev => ({
                ...prev,
                [uid]: {
                  startedAt: String(newRow.started_at ?? ''),
                  updatedAt: String(newRow.updated_at ?? ''),
                  controlledBy: newRow.controlled_by ? String(newRow.controlled_by) : null,
                  controlStatus: newRow.control_status ? String(newRow.control_status) : null,
                },
              }))
            }
          }
        )
        .subscribe()

      channelRef.current = ch
    } catch (e) { logError('useTeacherStudentSessions.subscribe', e) }

    return () => {
      mounted = false
      try {
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current)
          channelRef.current = null
        }
      } catch (e) { logWarn('useTeacherStudentSessions', 'cleanup failed', { error: String(e) }) }
    }
  }, [supabase, teacherUserId, filterKey])

  return activeMap
}

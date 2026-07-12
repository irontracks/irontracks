/**
 * @module useStudentWorkoutStartAlerts
 *
 * Para o professor: escuta o evento Realtime INSERT em active_workout_sessions e emite um
 * alerta "aluno X iniciou o treino" (pro banner de assumir controle). Usa SÓ o INSERT (início
 * inequívoco) — os alunos que já estavam treinando no load chegam pelo SELECT do outro hook,
 * não por aqui, então não geram alerta falso ao montar o dashboard.
 *
 * A RLS de SELECT de active_workout_sessions só entrega ao professor as linhas dos alunos
 * dele (EXISTS students WHERE teacher_id = auth.uid()) — logo o canal já vem escopado.
 * O nome vem de profiles (a policy de SELECT permite o professor ler o perfil de quem ensina).
 */
'use client'

import { useCallback, useEffect, useState } from 'react'
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js'
import { logError, logWarn } from '@/lib/logger'

export interface StudentStartAlert {
  userId: string
  name: string
  at: number
}

export function useStudentWorkoutStartAlerts(
  supabase: SupabaseClient | null,
  teacherUserId: string | undefined,
): { alerts: StudentStartAlert[]; dismiss: (userId: string) => void } {
  const [alerts, setAlerts] = useState<StudentStartAlert[]>([])

  useEffect(() => {
    if (!supabase || !teacherUserId) return
    let mounted = true
    let channel: RealtimeChannel | null = null

    try {
      channel = supabase
        .channel(`teacher-start-alerts:${teacherUserId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'active_workout_sessions' },
          (payload: Record<string, unknown>) => {
            if (!mounted) return
            const row = (payload?.new as Record<string, unknown> | null) ?? null
            const uid = String(row?.user_id ?? '').trim()
            if (!uid || uid === teacherUserId) return
            // Já sob controle (ex.: sessão recriada durante controle) — não alerta.
            if (String(row?.control_status ?? '') === 'active') return

            void (async () => {
              let name = 'Seu aluno'
              try {
                const { data } = await supabase
                  .from('profiles')
                  .select('display_name')
                  .eq('id', uid)
                  .maybeSingle()
                const dn = String(data?.display_name ?? '').trim()
                if (dn) name = dn
              } catch (e) { logWarn('useStudentWorkoutStartAlerts', 'name fetch failed', { error: String(e) }) }
              if (!mounted) return
              setAlerts((prev) => (prev.some((a) => a.userId === uid) ? prev : [...prev, { userId: uid, name, at: Date.now() }]))
            })()
          },
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'active_workout_sessions' },
          (payload: Record<string, unknown>) => {
            if (!mounted) return
            const old = (payload?.old as Record<string, unknown> | null) ?? null
            const uid = String(old?.user_id ?? '').trim()
            if (uid) setAlerts((prev) => prev.filter((a) => a.userId !== uid))
          },
        )
        .subscribe()
    } catch (e) { logError('useStudentWorkoutStartAlerts.subscribe', e) }

    return () => {
      mounted = false
      try { if (channel) supabase.removeChannel(channel) } catch (e) { logWarn('useStudentWorkoutStartAlerts', 'cleanup failed', { error: String(e) }) }
    }
  }, [supabase, teacherUserId])

  const dismiss = useCallback((userId: string) => {
    setAlerts((prev) => prev.filter((a) => a.userId !== userId))
  }, [])

  return { alerts, dismiss }
}

/**
 * @module useStudentWorkoutStartAlerts
 *
 * Para o professor: alerta "aluno X iniciou o treino" (pro banner de assumir controle).
 * Duas fontes:
 *   1. FETCH inicial no mount — alunos que JÁ estavam treinando quando o dashboard
 *      montou (ex.: o professor abriu o app DEPOIS do aluno iniciar, com o app fechado
 *      — não há INSERT ao vivo pra capturar). Semeia o banner pras sessões ativas
 *      RECENTES e ainda não controladas.
 *   2. Realtime INSERT ao vivo — quando o aluno inicia com o app aberto.
 * DELETE/UPDATE tiram o alerta quando o treino acaba ou o controle é aceito.
 *
 * A RLS de SELECT de active_workout_sessions só entrega ao professor as linhas dos alunos
 * dele (EXISTS students WHERE teacher_id = auth.uid()) — logo o canal e o fetch já vêm
 * escopados. O nome vem de profiles (a policy permite o professor ler o perfil do aluno).
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

// Janela do fetch inicial: só semeia banner pra treinos iniciados na última hora —
// evita "nag" sobre um aluno que está treinando há muito tempo, mas cobre o caso do
// professor abrir o app logo após o aluno iniciar.
const INITIAL_LOOKBACK_MS = 60 * 60 * 1000

export function useStudentWorkoutStartAlerts(
  supabase: SupabaseClient | null,
  teacherUserId: string | undefined,
): { alerts: StudentStartAlert[]; dismiss: (userId: string) => void } {
  const [alerts, setAlerts] = useState<StudentStartAlert[]>([])

  useEffect(() => {
    if (!supabase || !teacherUserId) return
    let mounted = true
    let channel: RealtimeChannel | null = null

    // ── Fetch inicial: alunos que já estavam treinando quando o dashboard montou.
    void (async () => {
      try {
        const sinceIso = new Date(Date.now() - INITIAL_LOOKBACK_MS).toISOString()
        const { data } = await supabase
          .from('active_workout_sessions')
          .select('user_id, started_at, control_status')
          .gte('started_at', sinceIso)
        if (!mounted || !Array.isArray(data)) return
        const seed = data.filter((r) => {
          const uid = String(r?.user_id ?? '').trim()
          if (!uid || uid === teacherUserId) return false
          // Já sob controle ativo → não precisa do alerta de "assumir".
          return String(r?.control_status ?? '') !== 'active'
        })
        if (!seed.length) return
        const ids = [...new Set(seed.map((r) => String(r.user_id)))]
        const { data: profs } = await supabase.from('profiles').select('id, display_name').in('id', ids)
        const nameById = new Map(
          (Array.isArray(profs) ? profs : []).map((p) => [String(p.id), String(p.display_name ?? '').trim()]),
        )
        if (!mounted) return
        setAlerts((prev) => {
          const have = new Set(prev.map((a) => a.userId))
          const add = seed
            .map((r) => {
              const uid = String(r.user_id)
              return { userId: uid, name: nameById.get(uid) || 'Seu aluno', at: new Date(String(r.started_at ?? '')).getTime() || Date.now() }
            })
            .filter((a) => !have.has(a.userId))
          return add.length ? [...prev, ...add] : prev
        })
      } catch (e) { logWarn('useStudentWorkoutStartAlerts', 'initial load failed', { error: String(e) }) }
    })()

    try {
      // UM ÚNICO binding event:'*' (o realtime-js do Supabase pode registrar só o 1º de
      // múltiplos postgres_changes no mesmo canal — com dois bindings o DELETE não disparava
      // e o banner ficava "pra sempre"). Aqui trato INSERT/UPDATE/DELETE no mesmo callback,
      // igual o useTeacherStudentSessions (que funciona).
      channel = supabase
        .channel(`teacher-start-alerts:${teacherUserId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'active_workout_sessions' },
          (payload: Record<string, unknown>) => {
            if (!mounted) return
            const ev = String(payload?.eventType ?? '').toUpperCase()

            // Sessão apagada (aluno OU professor finalizou/cancelou) → tira o alerta.
            if (ev === 'DELETE') {
              const old = (payload?.old as Record<string, unknown> | null) ?? null
              const uid = String(old?.user_id ?? '').trim()
              if (uid) setAlerts((prev) => prev.filter((a) => a.userId !== uid))
              return
            }

            const row = (payload?.new as Record<string, unknown> | null) ?? null
            const uid = String(row?.user_id ?? '').trim()
            if (!uid || uid === teacherUserId) return

            // Controle já ativo (aluno aceitou) → não precisa mais do alerta.
            if (String(row?.control_status ?? '') === 'active') {
              setAlerts((prev) => prev.filter((a) => a.userId !== uid))
              return
            }

            // Só o INSERT vira alerta novo (início do treino). UPDATE que não zerou o controle
            // não faz nada aqui (evita re-alertar a cada save do aluno).
            if (ev !== 'INSERT') return

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

'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Activity, Dumbbell, Loader2, RefreshCw, Zap } from 'lucide-react'
import { useAdminPanel } from '@/components/admin-panel/AdminPanelContext'
import type { ActiveWorkoutSession } from '@/types/app'

const ActiveWorkout = dynamic(() => import('@/components/ActiveWorkout'), { ssr: false })

interface LiveSession {
  user_id: string
  state: ActiveWorkoutSession
  started_at: string
  updated_at: string
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

export function TeacherStudentWorkout() {
  const { selectedStudent, supabase } = useAdminPanel()
  const [session, setSession] = useState<LiveSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isControlling, setIsControlling] = useState(false)
  const studentUserId = String(selectedStudent?.user_id || '')
  const patchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastPatchRef = useRef<number>(0)
  const isControllingRef = useRef(false)
  useEffect(() => { isControllingRef.current = isControlling }, [isControlling])

  const fetchSession = useCallback(async () => {
    if (!studentUserId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/teacher/student-session/${studentUserId}`)
      const json = await res.json() as { ok: boolean; session: LiveSession | null; error?: string }
      if (json.ok) {
        setSession(json.session)
      } else {
        setError(json.error ?? 'Erro ao carregar sessão')
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro de rede')
    } finally {
      setLoading(false)
    }
  }, [studentUserId])

  useEffect(() => {
    if (!studentUserId) return
    void fetchSession()

    const ch = supabase
      .channel(`teacher-ctrl:${studentUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'active_workout_sessions',
          filter: `user_id=eq.${studentUserId}`,
        },
        (payload) => {
          // Ignore echoes from our own PATCH (within 2 s)
          if (Date.now() - lastPatchRef.current < 2000) return
          if (payload.eventType === 'DELETE') {
            setSession(null)
            if (isControllingRef.current) setIsControlling(false)
            return
          }
          const row = payload.new as LiveSession
          setSession(row)
        }
      )
      .subscribe()

    return () => { void supabase.removeChannel(ch) }
  }, [studentUserId, supabase, fetchSession])

  const patchStudentSession = useCallback((state: unknown) => {
    if (patchTimerRef.current) clearTimeout(patchTimerRef.current)
    patchTimerRef.current = setTimeout(async () => {
      try {
        lastPatchRef.current = Date.now()
        await fetch(`/api/teacher/student-session/${studentUserId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state }),
        })
      } catch { /* non-critical — student has own sync */ }
    }, 800)
  }, [studentUserId])

  const handleUpdateLog = useCallback((key: string, updates: Record<string, unknown>) => {
    setSession((prev) => {
      if (!prev) return prev
      const prevState = prev.state as unknown as Record<string, unknown>
      const logs = isRecord(prevState?.logs) ? (prevState.logs as Record<string, unknown>) : {}
      const existing = isRecord(logs[key]) ? (logs[key] as Record<string, unknown>) : {}
      const merged = { ...existing, ...updates }
      const nextState = { ...prevState, logs: { ...logs, [key]: merged } } as unknown as ActiveWorkoutSession
      patchStudentSession(nextState)
      return { ...prev, state: nextState }
    })
  }, [patchStudentSession])

  const handleUpdateSession = useCallback((updates: Record<string, unknown>) => {
    setSession((prev) => {
      if (!prev) return prev
      const nextState = { ...(prev.state as unknown as Record<string, unknown>), ...updates } as unknown as ActiveWorkoutSession
      patchStudentSession(nextState)
      return { ...prev, state: nextState }
    })
  }, [patchStudentSession])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 size={28} className="text-yellow-500 animate-spin" />
        <p className="text-sm text-neutral-400">Buscando treino ao vivo...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
        <Activity size={32} className="text-red-400" />
        <p className="text-sm text-red-400 font-bold">{error}</p>
        <button
          type="button"
          onClick={() => void fetchSession()}
          className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-xs text-white font-bold transition-colors"
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
        <div className="w-16 h-16 rounded-3xl bg-neutral-800/60 border border-neutral-700 flex items-center justify-center">
          <Dumbbell size={28} className="text-neutral-600" />
        </div>
        <div>
          <p className="text-sm font-bold text-neutral-300">Nenhum treino em andamento</p>
          <p className="text-xs text-neutral-600 mt-1">
            {String(selectedStudent?.name ?? 'O aluno')} não está treinando agora.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchSession()}
          className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-xs text-white font-bold transition-colors"
        >
          <RefreshCw size={13} /> Atualizar
        </button>
      </div>
    )
  }

  const workoutName = String(
    isRecord(session.state)
      ? isRecord((session.state as Record<string, unknown>).workout)
        ? String((session.state as Record<string, unknown> & { workout: Record<string, unknown> }).workout?.name ?? 'Treino')
        : 'Treino'
      : 'Treino'
  )

  return (
    <>
      <div className="space-y-4 animate-in fade-in duration-300">
        <div className="bg-gradient-to-r from-yellow-500/10 to-amber-500/5 border border-yellow-500/20 rounded-2xl px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse shadow-[0_0_6px_rgba(74,222,128,0.8)]" />
            <span className="text-xs font-black uppercase tracking-widest text-green-400">Ao Vivo</span>
            <span className="text-xs text-neutral-400 font-bold truncate">{workoutName}</span>
          </div>
          <button
            type="button"
            onClick={() => void fetchSession()}
            className="p-1.5 rounded-lg hover:bg-white/10 text-neutral-500 hover:text-white transition-colors shrink-0"
            title="Atualizar"
          >
            <RefreshCw size={13} />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setIsControlling(true)}
          className="w-full flex items-center justify-center gap-3 px-4 py-4 bg-yellow-500 hover:bg-yellow-400 text-black rounded-2xl font-black text-sm shadow-lg shadow-yellow-500/20 active:scale-95 transition-all duration-150"
        >
          <Zap size={18} />
          Controlar Treino do Aluno
        </button>
      </div>

      {isControlling && (
        <ActiveWorkout
          session={session.state as unknown as Record<string, unknown>}
          user={selectedStudent as unknown as { id?: string }}
          onUpdateLog={handleUpdateLog}
          onUpdateSession={handleUpdateSession}
          onFinish={() => { /* teacher does not finish the student's workout */ }}
          onBack={() => setIsControlling(false)}
          isCoach
        />
      )}
    </>
  )
}

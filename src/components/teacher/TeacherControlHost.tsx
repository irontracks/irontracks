'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useTeacherStudentSessions } from '@/hooks/useTeacherStudentSessions'
import { getAdminAuthHeaders } from '@/utils/admin/adminFetch'
import { logWarn } from '@/lib/logger'

const TeacherControlModal = dynamic(
  () => import('@/components/teacher/TeacherControlModal').then((m) => ({ default: m.TeacherControlModal })),
  { ssr: false },
)

/** Evento pra abrir o controle explicitamente (botão do StudentsTab, tap no push). */
export const OPEN_TEACHER_CONTROL_EVENT = 'irontracks:teacher-control:open'

/**
 * Host GLOBAL do controle de treino do professor.
 *
 * Montado no SHELL do dashboard (não só na aba de alunos) — assim, quando o aluno
 * ACEITA o pedido de controle, o TeacherControlModal abre em QUALQUER tela em que o
 * professor esteja. Antes a auto-abertura vivia só no StudentsTab: se o professor
 * pedisse pelo banner do dashboard e não estivesse na aba de alunos, o aceite não
 * abria nada (o sintoma reportado: "aceita e não abre o treino do aluno").
 *
 * Abre por:
 *  - TRANSIÇÃO pra controle ativo (control_status vira 'active' comigo no comando) —
 *    detectada por transição, não por estado, pra não reabrir sozinho depois que o
 *    professor fecha manualmente.
 *  - Evento `OPEN_TEACHER_CONTROL_EVENT` (botão "No controle" do StudentsTab, tap no
 *    push "Controle aceito!") — reabre mesmo já ativo.
 * Fecha quando a sessão do aluno acaba ou o controle deixa de ser meu.
 */
export default function TeacherControlHost({
  supabase,
  teacherUserId,
}: {
  supabase: SupabaseClient | null
  teacherUserId?: string
}) {
  const myId = teacherUserId ? String(teacherUserId) : ''
  // Sufixo de canal 'host' pra não colidir com o useTeacherStudentSessions do
  // StudentsTab (mesmo teacher, canal com tópico distinto).
  const activeSessionsMap = useTeacherStudentSessions(supabase, myId || undefined, undefined, 'host')
  const [controlTarget, setControlTarget] = useState<{ userId: string; name: string } | null>(null)
  const nameCacheRef = useRef<Record<string, string>>({})
  // Guarda o control_status "ativo-pra-mim" visto por aluno, pra detectar a
  // TRANSIÇÃO requested→active (aceite) em vez do estado parado.
  const prevActiveRef = useRef<Record<string, boolean>>({})

  const resolveName = useCallback(async (uid: string): Promise<string> => {
    if (nameCacheRef.current[uid]) return nameCacheRef.current[uid]
    if (!supabase) return 'Aluno'
    try {
      const { data } = await supabase.from('profiles').select('display_name').eq('id', uid).maybeSingle()
      const dn = String(data?.display_name ?? '').trim()
      if (dn) { nameCacheRef.current[uid] = dn; return dn }
    } catch (e) { logWarn('TeacherControlHost', 'name fetch failed', { error: String(e) }) }
    return 'Aluno'
  }, [supabase])

  const openFor = useCallback((uid: string) => {
    if (!uid) return
    const cached = nameCacheRef.current[uid]
    setControlTarget({ userId: uid, name: cached || 'Aluno' })
    if (!cached) {
      void resolveName(uid).then((name) => {
        setControlTarget((prev) => (prev && prev.userId === uid ? { userId: uid, name } : prev))
      })
    }
  }, [resolveName])

  // Auto-abre na transição pra ativo + auto-fecha quando o controle acaba.
  useEffect(() => {
    if (!myId) return
    const nextActive: Record<string, boolean> = {}
    let justAccepted: string | null = null
    for (const [uid, s] of Object.entries(activeSessionsMap)) {
      const activeForMe = s.controlStatus === 'active' && s.controlledBy === myId
      nextActive[uid] = activeForMe
      if (activeForMe && !prevActiveRef.current[uid] && !controlTarget) justAccepted = uid
    }
    prevActiveRef.current = nextActive

    let shouldClose = false
    if (controlTarget) {
      const s = activeSessionsMap[controlTarget.userId]
      shouldClose = !s || s.controlStatus !== 'active' || s.controlledBy !== myId
    }

    if (!justAccepted && !shouldClose) return
    // Defer o setState pra fora do corpo síncrono do effect (evita cascading render
    // e satisfaz react-hooks/set-state-in-effect).
    queueMicrotask(() => {
      if (justAccepted) openFor(justAccepted)
      else if (shouldClose) setControlTarget(null)
    })
  }, [activeSessionsMap, myId, controlTarget, openFor])

  // Abertura explícita via evento (botão do StudentsTab / tap no push).
  useEffect(() => {
    if (typeof window === 'undefined' || !myId) return
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail as { userId?: string; name?: string } | undefined
      const uid = String(detail?.userId ?? '').trim()
      if (!uid) return
      const name = String(detail?.name ?? '').trim()
      if (name) nameCacheRef.current[uid] = name
      openFor(uid)
    }
    window.addEventListener(OPEN_TEACHER_CONTROL_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_TEACHER_CONTROL_EVENT, onOpen)
  }, [myId, openFor])

  if (!controlTarget || !supabase) return null

  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const h = await getAdminAuthHeaders(supabase)
    return h.Authorization ? { Authorization: h.Authorization } : {}
  }

  return (
    <TeacherControlModal
      supabase={supabase}
      studentUserId={controlTarget.userId}
      studentName={controlTarget.name}
      getAuthHeaders={getAuthHeaders}
      onClose={() => setControlTarget(null)}
    />
  )
}

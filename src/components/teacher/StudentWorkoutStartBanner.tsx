'use client'

import { useCallback, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Gamepad2, X, Loader2 } from 'lucide-react'
import { useStudentWorkoutStartAlerts } from '@/hooks/useStudentWorkoutStartAlerts'
import { logError } from '@/lib/logger'

/**
 * Banner no dashboard do professor: aparece em tempo real quando um aluno dele inicia um
 * treino, com o botão "Assumir" (dispara o request de controle — o aluno ainda precisa
 * aceitar). Some sozinho quando a sessão do aluno acaba (DELETE) ou ao dispensar.
 *
 * Recebe o cliente supabase COMPARTILHADO do dashboard (não cria um novo) — um cliente
 * fresco pode conectar o socket do realtime antes de ter o token de auth e a RLS bloqueia
 * a entrega dos eventos.
 */
export default function StudentWorkoutStartBanner({ teacherUserId, supabase }: { teacherUserId?: string; supabase: SupabaseClient | null }) {
  const { alerts, dismiss } = useStudentWorkoutStartAlerts(supabase, teacherUserId)
  const [busy, setBusy] = useState<string | null>(null)
  const [requested, setRequested] = useState<Record<string, boolean>>({})

  const assumir = useCallback(async (userId: string) => {
    setBusy(userId)
    try {
      const res = await fetch(`/api/teacher/control/${userId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'request' }),
      })
      const j = await res.json().catch((): null => null)
      if (res.ok && j?.ok) {
        setRequested((p) => ({ ...p, [userId]: true }))
        setTimeout(() => dismiss(userId), 4000)
      }
    } catch (e) { logError('StudentWorkoutStartBanner.assumir', e) }
    finally { setBusy(null) }
  }, [dismiss])

  if (!alerts.length) return null

  return (
    <div className="px-3 pt-2 space-y-2">
      {alerts.slice(0, 3).map((a) => (
        <div
          key={a.userId}
          className="rounded-2xl p-[1px] shadow-lg shadow-black/40"
          style={{ background: 'linear-gradient(135deg, rgba(234,179,8,0.4) 0%, rgba(255,255,255,0.05) 100%)' }}
        >
          <div className="rounded-[15px] bg-neutral-900/95 px-3 py-2.5 flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
              <Gamepad2 size={15} className="text-amber-400" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-black text-amber-200 truncate">{a.name} iniciou o treino</div>
              <div className="text-[11px] text-neutral-400">
                {requested[a.userId] ? 'Aguardando o aluno aceitar…' : 'Deseja assumir o treino?'}
              </div>
            </div>
            {!requested[a.userId] && (
              <button
                type="button"
                onClick={() => assumir(a.userId)}
                disabled={busy === a.userId}
                className="text-[12px] font-black bg-amber-500 text-black px-3 py-1.5 rounded-xl hover:bg-amber-400 transition-colors shrink-0 active:scale-95 disabled:opacity-60 inline-flex items-center gap-1"
              >
                {busy === a.userId ? <Loader2 size={13} className="animate-spin" /> : null}
                Assumir
              </button>
            )}
            <button
              type="button"
              aria-label="Dispensar"
              onClick={() => dismiss(a.userId)}
              className="h-7 w-7 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 flex items-center justify-center shrink-0"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

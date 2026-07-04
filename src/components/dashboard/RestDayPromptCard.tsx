'use client'

/**
 * RestDayPromptCard — pergunta matinal "Vai treinar hoje?".
 *
 * Aparece no dashboard quando o usuário ainda não respondeu hoje e não treinou.
 * "Vou treinar" → nada muda. "Vou descansar" → a tela de nutrição desconta ~1
 * treino da meta (proteína mantida). A resposta é guardada em rest_day_intents
 * (RLS protege). Some assim que respondida. Silêncio nunca vira mudança.
 */
import { useEffect, useState } from 'react'
import { Dumbbell, Moon } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { triggerHaptic } from '@/utils/native/irontracksNative'
import { getTodayRestDayIntent, setRestDayIntent, brtDateKey } from '@/lib/nutrition/restDayIntent'

type CardState = 'loading' | 'show' | 'hidden'

export default function RestDayPromptCard({ userId }: { userId?: string }) {
  const [state, setState] = useState<CardState>('loading')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    const uid = String(userId || '').trim()
    // Sem usuário: permanece em 'loading' (renderiza null) — nada a fazer.
    if (!uid) return

    void (async () => {
      // Já respondeu hoje? Não pergunta de novo.
      const intent = await getTodayRestDayIntent(uid)
      if (cancelled) return
      if (intent) { setState('hidden'); return }

      // Já treinou hoje? Está claramente treinando — não faz sentido perguntar.
      try {
        const supabase = createClient()
        const day = brtDateKey()
        const { data } = await supabase
          .from('workout_session_logs')
          .select('id')
          .eq('user_id', uid)
          .gte('finished_at', `${day}T00:00:00`)
          .lte('finished_at', `${day}T23:59:59`)
          .limit(1)
        if (cancelled) return
        if (Array.isArray(data) && data.length > 0) { setState('hidden'); return }
      } catch { /* sem dados / tabela ausente — segue mostrando */ }

      if (!cancelled) setState('show')
    })()

    return () => { cancelled = true }
  }, [userId])

  const answer = async (willTrain: boolean) => {
    if (saving) return
    setSaving(true)
    triggerHaptic('light').catch(() => {})
    const ok = await setRestDayIntent(String(userId || '').trim(), willTrain)
    setSaving(false)
    if (ok) setState('hidden')
  }

  if (state !== 'show') return null

  return (
    <div className="mb-3 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
      <div className="flex items-center gap-2.5 mb-1.5">
        <Dumbbell className="h-5 w-5 text-yellow-400" aria-hidden="true" />
        <span className="text-[17px] font-semibold text-neutral-50">Vai treinar hoje?</span>
      </div>
      <p className="text-xs text-neutral-400 leading-relaxed mb-4">
        Se for descansar, ajusto sua meta de calorias do dia automaticamente.
      </p>
      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={() => answer(true)}
          disabled={saving}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-yellow-500 px-3 py-3 text-sm font-semibold text-black hover:bg-yellow-400 disabled:opacity-60"
        >
          <Dumbbell className="h-4 w-4" aria-hidden="true" />
          Vou treinar
        </button>
        <button
          type="button"
          onClick={() => answer(false)}
          disabled={saving}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-800 bg-transparent px-3 py-3 text-sm font-semibold text-sky-300 hover:bg-sky-500/10 disabled:opacity-60"
        >
          <Moon className="h-4 w-4" aria-hidden="true" />
          Vou descansar
        </button>
      </div>
    </div>
  )
}

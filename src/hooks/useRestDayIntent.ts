'use client'

/**
 * `useRestDayIntent` — a resposta de HOJE para "vai treinar hoje?", reativa.
 *
 * Retorna `null` enquanto não sabe ou quando o usuário não respondeu. Quem
 * consome trata o desconhecido como "vai treinar": esconder a ação primária
 * durante a consulta deixaria a primeira dobra vazia em toda abertura do app.
 *
 * A atualização ao vivo vem do evento `REST_DAY_INTENT_EVENT` — o card que
 * pergunta e o card do topo são irmãos, sem estado em comum.
 */
import { useEffect, useState } from 'react'
import {
  REST_DAY_INTENT_EVENT,
  brtDateKey,
  getTodayRestDayIntent,
  type RestDayIntentEventDetail,
} from '@/lib/nutrition/restDayIntent'

export function useRestDayIntent(userId?: string): { willTrain: boolean } | null {
  const [intent, setIntent] = useState<{ willTrain: boolean } | null>(null)

  useEffect(() => {
    const uid = String(userId || '').trim()
    let cancelado = false

    void (async () => {
      const r = uid ? await getTodayRestDayIntent(uid) : null
      if (!cancelado) setIntent(r)
    })()

    const aoResponder = (ev: Event) => {
      const d = (ev as CustomEvent<RestDayIntentEventDetail>).detail
      if (!d || !uid || d.userId !== uid) return
      // Resposta carimbada de outro dia não vale para hoje — o app pode ter
      // ficado aberto pela virada da meia-noite.
      if (d.dateKey !== brtDateKey()) return
      setIntent({ willTrain: Boolean(d.willTrain) })
    }

    if (typeof window !== 'undefined') window.addEventListener(REST_DAY_INTENT_EVENT, aoResponder)
    return () => {
      cancelado = true
      if (typeof window !== 'undefined') window.removeEventListener(REST_DAY_INTENT_EVENT, aoResponder)
    }
  }, [userId])

  return intent
}

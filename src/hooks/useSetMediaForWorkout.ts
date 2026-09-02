'use client'
import { useEffect, useState } from 'react'
import { groupSetMediaByKey, type SetMediaView } from '@/lib/workout/setMediaView'

/** Reconsulta enquanto a IA ainda não respondeu: 10 s × 12 = 2 min, o `maxDuration` da finalização. */
export const SET_MEDIA_REPOLL_MS = 10_000
export const SET_MEDIA_REPOLL_MAX = 12

/**
 * Mídias (foto/vídeo) anexadas às séries de um treino concluído, agrupadas
 * por "exIdx-setIdx". Consulta a rota `set-media/list` (dono ou professor).
 * Treino sem id (sessão não gravada) devolve vazio sem ir à rede.
 */
export function useSetMediaForWorkout(workoutId: string | null | undefined): {
  byKey: Record<string, SetMediaView[]>
  items: SetMediaView[]
  loading: boolean
} {
  const [items, setItems] = useState<SetMediaView[]>([])
  const [loading, setLoading] = useState(false)
  const id = typeof workoutId === 'string' && /^[0-9a-f-]{36}$/i.test(workoutId) ? workoutId : null

  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | null = null
    let tentativas = 0
    const carregar = async () => {
      if (!id) { setItems([]); return }
      setLoading(true)
      try {
        const r = await fetch(`/api/workouts/set-media/list?workoutId=${encodeURIComponent(id)}`, { credentials: 'include' })
        const json = await r.json().catch((): null => null)
        if (!alive) return
        const list = json?.ok && Array.isArray(json.items) ? json.items : []
        const agrupado = Object.values(groupSetMediaByKey(list)).flat()
        setItems(agrupado)
        // O relatório abre SEGUNDOS depois da finalização e a IA responde em
        // `waitUntil` — visto no aparelho (02/09/2026): a resposta já estava no
        // banco e a tela dizia "IA analisando…" porque só consultou uma vez.
        // Enquanto houver mídia sem resposta, consulta de novo, com teto.
        const emAndamento = agrupado.some((m) => m.aiStatus === 'pending' || m.aiStatus === 'analyzing')
        if (emAndamento && tentativas < SET_MEDIA_REPOLL_MAX) {
          tentativas += 1
          timer = setTimeout(() => { void carregar() }, SET_MEDIA_REPOLL_MS)
        }
      } catch {
        if (alive) setItems([])
      } finally {
        if (alive) setLoading(false)
      }
    }
    void carregar()
    return () => { alive = false; if (timer) clearTimeout(timer) }
  }, [id])

  return { byKey: groupSetMediaByKey(items), items, loading }
}

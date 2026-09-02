'use client'
import { useEffect, useState } from 'react'
import { groupSetMediaByKey, type SetMediaView } from '@/lib/workout/setMediaView'

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
    const carregar = async () => {
      if (!id) { setItems([]); return }
      setLoading(true)
      try {
        const r = await fetch(`/api/workouts/set-media/list?workoutId=${encodeURIComponent(id)}`, { credentials: 'include' })
        const json = await r.json().catch((): null => null)
        if (!alive) return
        const list = json?.ok && Array.isArray(json.items) ? json.items : []
        setItems(Object.values(groupSetMediaByKey(list)).flat())
      } catch {
        if (alive) setItems([])
      } finally {
        if (alive) setLoading(false)
      }
    }
    void carregar()
    return () => { alive = false }
  }, [id])

  return { byKey: groupSetMediaByKey(items), items, loading }
}

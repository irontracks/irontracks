'use client'
import { useEffect, useMemo, useState } from 'react'
import {
  groupExerciseChatSummariesByIndex,
  parseExerciseChatSummaries,
  type ExerciseChatSummaryView,
} from '@/lib/workout/exerciseChatSummary'

/**
 * Os resumos que a IA escreveu no chat de cada exercício de um treino
 * concluído, por índice de exercício. A mesma lista alimenta os cards da tela E
 * o PDF.
 *
 * **Sem repoll, de propósito.** O irmão antigo desta tela
 * (`useSetMediaForWorkout`) reconsultava por 2 min porque a IA só era chamada
 * DEPOIS da finalização, em `waitUntil` — a tela abria antes da resposta
 * existir. Aqui o resumo é escrito DURANTE a sessão, quando o aluno responde
 * que aquilo entra no relatório: quando o relatório abre, ou ele está no banco
 * ou nunca vai estar.
 *
 * Treino sem id (sessão não gravada) devolve vazio sem ir à rede.
 */
export function useExerciseChatSummaries(workoutId: string | null | undefined): {
  items: ExerciseChatSummaryView[]
  byExercise: Record<number, ExerciseChatSummaryView>
} {
  const [items, setItems] = useState<ExerciseChatSummaryView[]>([])
  const id = typeof workoutId === 'string' && /^[0-9a-f-]{36}$/i.test(workoutId) ? workoutId : null

  useEffect(() => {
    let alive = true
    const carregar = async () => {
      if (!id) { setItems([]); return }
      try {
        const r = await fetch(
          `/api/workouts/exercise-chat-summaries?workoutId=${encodeURIComponent(id)}`,
          { credentials: 'include' },
        )
        const json = await r.json().catch((): null => null)
        if (!alive) return
        // Falha (rede, 429, 500) vira lista vazia: o relatório fica igual ao de
        // quem não conversou com a IA. Bloco de erro aqui seria alarme falso
        // numa seção que a maioria das sessões simplesmente não tem.
        setItems(json?.ok ? parseExerciseChatSummaries(json.items) : [])
      } catch {
        if (alive) setItems([])
      }
    }
    void carregar()
    return () => { alive = false }
  }, [id])

  const byExercise = useMemo(() => groupExerciseChatSummariesByIndex(items), [items])
  return { items, byExercise }
}

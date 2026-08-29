'use client'

/**
 * Quando cada treino foi feito pela última vez.
 *
 * UMA consulta, colunas estreitas (`name`, `completed_at`) — nunca
 * `workouts.notes`, que é onde a sessão inteira mora e já engordou uma rota
 * quente antes (ver `slimHistoryRow` no CLAUDE.md). O agrupamento é no cliente
 * porque o volume é ínfimo: 120 linhas de duas colunas curtas.
 *
 * Falhar aqui devolve um mapa vazio, e o card simplesmente não mostra a linha —
 * a lista de treinos não pode depender deste enfeite para aparecer.
 */
import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { buildLastPerformedMap } from '@/lib/workout/lastPerformed'

/** Quantas sessões olhar para trás. 120 cobre meses de treino real. */
const LIMITE_DE_SESSOES = 120

export function useLastPerformed(userId?: string | null): Map<string, number> {
    const [mapa, setMapa] = useState<Map<string, number>>(() => new Map())

    useEffect(() => {
        const uid = String(userId || '').trim()
        if (!uid) {
            setMapa(new Map())
            return
        }
        let cancelado = false

        void (async () => {
            try {
                const supabase = createClient()
                const { data, error } = await supabase
                    .from('workouts')
                    .select('name, completed_at')
                    .eq('user_id', uid)
                    .eq('is_template', false)
                    .not('completed_at', 'is', null)
                    .order('completed_at', { ascending: false })
                    .limit(LIMITE_DE_SESSOES)
                if (error) throw error
                if (cancelado) return
                setMapa(buildLastPerformedMap(data || []))
            } catch {
                if (!cancelado) setMapa(new Map())
            }
        })()

        return () => { cancelado = true }
    }, [userId])

    return mapa
}

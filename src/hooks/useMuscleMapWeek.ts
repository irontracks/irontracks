'use client'

import { useEffect, useState } from 'react'
import { getMuscleMapWeek } from '@/actions/workout-actions'

export type MuscleMapWeekStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface MuscleMapWeekState {
    status: MuscleMapWeekStatus
    data: Record<string, unknown> | null
    error: string | null
}

/**
 * Lightweight fetch of the user's current weekly muscle map. Used in
 * WorkoutReport to render the weekly state inline + embed it in the PDF.
 *
 * Intentionally minimal: no localStorage cache (the existing dashboard's
 * MuscleMapCard already warms the server-side cache via its own request),
 * no auto-refresh (the report is a snapshot at completion time). Fires once
 * when `enabled` becomes true.
 */
export function useMuscleMapWeek(enabled: boolean): MuscleMapWeekState {
    const [state, setState] = useState<MuscleMapWeekState>({ status: 'idle', data: null, error: null })

    useEffect(() => {
        if (!enabled) return
        let cancelled = false
        setState({ status: 'loading', data: null, error: null })
        ;(async () => {
            try {
                const res = await getMuscleMapWeek({}) as { ok?: boolean; muscles?: unknown; error?: string } & Record<string, unknown>
                if (cancelled) return
                if (!res?.ok) {
                    setState({ status: 'error', data: null, error: String(res?.error || 'Falha ao carregar mapa') })
                    return
                }
                setState({ status: 'ready', data: res as Record<string, unknown>, error: null })
            } catch (e) {
                if (cancelled) return
                setState({ status: 'error', data: null, error: e instanceof Error ? e.message : String(e) })
            }
        })()
        return () => { cancelled = true }
    }, [enabled])

    return state
}

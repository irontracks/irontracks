'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'

/**
 * A single ghost set entry — mirroring a partner's past workout log.
 */
export interface GhostLogEntry {
    exIdx: number
    sIdx: number
    exName: string
    weight: number
    reps: number
}

export interface GhostPartnerData {
    partnerId: string
    partnerName: string
    photoURL: string | null
    workoutName: string
    sessionDate: string
    logs: GhostLogEntry[]
}

/**
 * useGhostPartner — fetches a specific partner's most recent (or specified) workout session logs
 * so the current user can "compete" against their past performance during a solo or team workout.
 *
 * Data source: team_sessions table (workout_state.workout_data contains exercises + logs).
 */
export function useGhostPartner(myUserId: string, partnerUserId: string | null) {
    const [ghost, setGhost] = useState<GhostPartnerData | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(async () => {
        if (!myUserId || !partnerUserId) { setGhost(null); return }
        setLoading(true)
        setError(null)
        try {
            const supabase = createClient()

            // Fetch latest shared team session between myUserId and partnerUserId
            const { data, error: err } = await supabase
                .from('team_sessions')
                .select('id, created_at, participants, workout_state')
                .filter('participants', 'cs', JSON.stringify([{ uid: myUserId }]))
                .filter('participants', 'cs', JSON.stringify([{ uid: partnerUserId }]))
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()
            if (err) throw err
            if (!data) { setGhost(null); return }

            const ws = data.workout_state && typeof data.workout_state === 'object'
                ? data.workout_state as Record<string, unknown>
                : {}
            const wd = ws.workout_data && typeof ws.workout_data === 'object'
                ? ws.workout_data as Record<string, unknown>
                : {}
            const workoutName = String(wd.title || wd.name || 'Treino anterior')

            const exercises = Array.isArray(wd.exercises)
                ? wd.exercises as Array<Record<string, unknown>>
                : []

            // Partner's logs: stored in workout_state.logs or participant_logs[partnerUserId]
            const rawLogs = (() => {
                // Try participant-specific logs
                const partLogs = ws[`logs_${partnerUserId}`]
                if (partLogs && typeof partLogs === 'object') return partLogs as Record<string, unknown>
                // Fallback to generic logs (if session had only 2 participants)
                return ws.logs && typeof ws.logs === 'object' ? ws.logs as Record<string, unknown> : {}
            })()

            const ghostLogs: GhostLogEntry[] = []
            for (const [key, val] of Object.entries(rawLogs)) {
                const parts = String(key).split('-')
                const exIdx = parseInt(parts[0], 10)
                const sIdx = parseInt(parts[1] ?? '0', 10)
                if (!Number.isFinite(exIdx) || !Number.isFinite(sIdx)) continue
                const v = val && typeof val === 'object' ? val as Record<string, unknown> : {}
                const weight = Number(v.weight ?? 0)
                const reps = Number(v.reps ?? 0)
                if (weight <= 0 && reps <= 0) continue
                const exName = String(exercises[exIdx]?.name || `Exercício ${exIdx + 1}`)
                ghostLogs.push({ exIdx, sIdx, exName, weight, reps })
            }

            const parts = Array.isArray(data.participants)
                ? data.participants as Array<Record<string, unknown>>
                : []
            const partnerInfo = parts.find(p => String(p.uid || '') === partnerUserId)
            const partnerName = String(partnerInfo?.name || partnerInfo?.display_name || 'Parceiro')
            const photoURL = partnerInfo?.photo ? String(partnerInfo.photo) : null

            setGhost({
                partnerId: partnerUserId,
                partnerName,
                photoURL,
                workoutName,
                sessionDate: String(data.created_at),
                logs: ghostLogs,
            })
        } catch (e: unknown) {
            setError('Erro ao carregar dados do ghost.')
            console.error(e)
        } finally {
            setLoading(false)
        }
    }, [myUserId, partnerUserId])

    useEffect(() => { load() }, [load])

    return { ghost, loading, error, reload: load }
}

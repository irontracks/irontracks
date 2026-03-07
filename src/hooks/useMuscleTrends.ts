/**
 * @module useMuscleTrends
 *
 * Computes weekly muscle-group volume distribution for the muscle heatmap.
 * Aggregates workout sessions into per-muscle set counts, mapping exercise
 * names to muscle groups via the canonical exercise library.
 *
 * @param supabase  - Supabase client
 * @param userId    - Current user ID
 * @param weekCount - Number of weeks to look back (default 4)
 * @returns `{ trends, loading, error }`
 */
'use client'
import { useState, useEffect } from 'react'
import { getMuscleMapWeek } from '@/actions/workout-actions'
import { parseJsonWithSchema } from '@/utils/zod'
import { normalizeExerciseName } from '@/utils/normalizeExerciseName'
import { MUSCLE_BY_ID } from '@/utils/muscleMapConfig'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'

type AnyObj = Record<string, unknown>

// ── Internal helpers ──────────────────────────────────────────────────────────

const getWeekStartIso = (date: Date): string => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  })
  const parts = formatter.formatToParts(date)
  const map = parts.reduce<Record<string, string>>((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value
    return acc
  }, {})
  const weekday = String(map.weekday || '').toLowerCase()
  const weekdayIndex =
    weekday === 'mon' ? 1 : weekday === 'tue' ? 2 : weekday === 'wed' ? 3
    : weekday === 'thu' ? 4 : weekday === 'fri' ? 5 : weekday === 'sat' ? 6 : 0
  const y = Number(map.year)
  const m = Number(map.month)
  const d = Number(map.day) - ((weekdayIndex + 6) % 7)
  const base = new Date(Date.UTC(y, m - 1, d, 3, 0, 0))
  return base.toISOString().slice(0, 10)
}

const getMuscles = (res: unknown): Record<string, unknown> => {
  const r = res && typeof res === 'object' ? (res as AnyObj) : null
  return (r?.ok && r?.muscles && typeof r.muscles === 'object')
    ? (r.muscles as Record<string, unknown>) : {}
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MuscleTrendState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  data: null | { current: Record<string, number>; previous: Record<string, number> }
}

export interface MuscleTrend4wState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  data: null | { weeks: string[]; series: Record<string, number[]> }
}

export interface ExerciseTrendState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  data: null | { weeks: string[]; series: Array<{ name: string; values: number[] }> }
}

interface UseMuscleTrendsParams {
  sessionDate: string | null | undefined
  sessionReportMeta: AnyObj | null | undefined
  userId: string | null | undefined
  supabase: SupabaseClient | null
}

interface UseMuscleTrendsReturn {
  muscleTrend: MuscleTrendState
  muscleTrend4w: MuscleTrend4wState
  exerciseTrend: ExerciseTrendState
}

/**
 * Fetches muscle activation and exercise volume trends for a workout session.
 *
 * Two parallel async flows:
 * 1. `muscleTrend` + `muscleTrend4w` — 5 weeks of muscle map data from the server action
 * 2. `exerciseTrend` — per-exercise weekly volume from Supabase workouts table
 */
export const useMuscleTrends = ({
  sessionDate,
  sessionReportMeta,
  userId,
  supabase,
}: UseMuscleTrendsParams): UseMuscleTrendsReturn => {
  const [muscleTrend, setMuscleTrend] = useState<MuscleTrendState>({ status: 'idle', data: null })
  const [muscleTrend4w, setMuscleTrend4w] = useState<MuscleTrend4wState>({ status: 'idle', data: null })
  const [exerciseTrend, setExerciseTrend] = useState<ExerciseTrendState>({ status: 'idle', data: null })

  // ── Effect 1: Combined muscle trend (current vs prev) + 4w ─────────────────
  useEffect(() => {
    let cancelled = false
    if (!sessionDate) return

    const run = async () => {
      setMuscleTrend({ status: 'loading', data: null })
      setMuscleTrend4w({ status: 'loading', data: null })
      try {
        const base = new Date(String(sessionDate))
        const baseWeek = getWeekStartIso(base)
        // 5 week dates: W0, W-1, W-2, W-3, W-4
        const weekDates: string[] = [0, 1, 2, 3, 4].map((idx) => {
          const d = new Date(`${baseWeek}T00:00:00.000Z`)
          d.setDate(d.getDate() - idx * 7)
          return d.toISOString().slice(0, 10)
        })

        const responses = await Promise.all(weekDates.map((weekStart) => getMuscleMapWeek({ weekStart })))
        if (cancelled) return

        // muscleTrend: W0 vs W-1
        const curMuscles = getMuscles(responses[0])
        const prevMuscles = getMuscles(responses[1])
        const current = Object.fromEntries(Object.entries(curMuscles).map(([id, v]) => [id, Number((v as AnyObj)?.sets || 0)]))
        const previous = Object.fromEntries(Object.entries(prevMuscles).map(([id, v]) => [id, Number((v as AnyObj)?.sets || 0)]))
        setMuscleTrend({ status: 'ready', data: { current, previous } })

        // muscleTrend4w: W0..W-3 (first 4 responses)
        const trend4wWeeks = weekDates.slice(0, 4)
        const series: Record<string, number[]> = {}
        Object.keys(MUSCLE_BY_ID).forEach((id) => {
          series[id] = responses.slice(0, 4).map((res) => {
            const muscles = getMuscles(res)
            const entry = muscles[id]
            const sets = entry && typeof entry === 'object' ? Number((entry as AnyObj).sets || 0) : 0
            return Number.isFinite(sets) ? sets : 0
          }).reverse()
        })
        setMuscleTrend4w({ status: 'ready', data: { weeks: [...trend4wWeeks].reverse(), series } })
      } catch {
        if (!cancelled) {
          setMuscleTrend({ status: 'error', data: null })
          setMuscleTrend4w({ status: 'error', data: null })
        }
      }
    }

    run()
    return () => { cancelled = true }
  }, [sessionDate])

  // ── Effect 2: Exercise trend (per-exercise weekly volume) ───────────────────
  useEffect(() => {
    let cancelled = false
    if (!sessionDate || !supabase) return

    const run = async () => {
      setExerciseTrend({ status: 'loading', data: null })
      try {
        const base = new Date(String(sessionDate))
        const baseWeek = getWeekStartIso(base)
        const weekDates: string[] = [0, 1, 2, 3].map((idx) => {
          const d = new Date(`${baseWeek}T00:00:00.000Z`)
          d.setDate(d.getDate() - idx * 7)
          return d.toISOString().slice(0, 10)
        })
        const startDate = new Date(`${weekDates[weekDates.length - 1]}T00:00:00.000Z`)

        const { data: rows } = await supabase
          .from('workouts')
          .select('notes, date, created_at')
          .eq('user_id', userId || '')
          .eq('is_template', false)
          .gte('date', startDate.toISOString())
          .order('date', { ascending: false })
          .limit(220)

        const sessions = (Array.isArray(rows) ? rows : [])
          .map((row: AnyObj) => {
            if (row?.notes && typeof row.notes === 'object') return row.notes as AnyObj
            if (typeof row?.notes === 'string') return parseJsonWithSchema(row.notes, z.record(z.unknown()))
            return null
          })
          .filter((s): s is AnyObj => Boolean(s && typeof s === 'object'))

        const reportMeta = sessionReportMeta && typeof sessionReportMeta === 'object' ? sessionReportMeta : null
        const keyExercises = Array.isArray(reportMeta?.exercises)
          ? (reportMeta?.exercises as Array<AnyObj>)
              .map((e) => ({ name: String(e?.name || '').trim(), volume: Number((e?.volumeKg ?? 0) as number) || 0 }))
              .filter((e) => e.name)
              .sort((a, b) => b.volume - a.volume)
              .slice(0, 4)
              .map((e) => e.name)
          : []

        if (!keyExercises.length) {
          setExerciseTrend({ status: 'ready', data: { weeks: weekDates.reverse(), series: [] } })
          return
        }

        const weekIndexByDate = new Map<string, number>(weekDates.map((w, idx) => [w, idx]))
        const series = keyExercises.map((name) => ({ name, values: [0, 0, 0, 0] }))
        const normalizeKey = (value: string) => normalizeExerciseName(value).toLowerCase()
        const seriesByKey = new Map(series.map((s) => [normalizeKey(s.name), s]))

        const addToSeries = (sessionObj: AnyObj) => {
          const dateRaw = sessionObj?.date ?? sessionObj?.created_at ?? null
          const dateMs = dateRaw ? new Date(String(dateRaw)).getTime() : 0
          if (!Number.isFinite(dateMs)) return
          const weekStart = getWeekStartIso(new Date(dateMs))
          const weekIdx = weekIndexByDate.get(weekStart)
          if (weekIdx == null) return
          const exercises = Array.isArray(sessionObj.exercises) ? (sessionObj.exercises as unknown[]) : []
          const logs = sessionObj.logs && typeof sessionObj.logs === 'object'
            ? (sessionObj.logs as Record<string, unknown>) : {}
          exercises.forEach((raw, exIdx) => {
            if (!raw || typeof raw !== 'object') return
            const exObj = raw as AnyObj
            const name = String(exObj.name || '').trim()
            if (!name) return
            const bucket = seriesByKey.get(normalizeKey(name))
            if (!bucket) return
            let volume = 0
            Object.entries(logs).forEach(([k, v]) => {
              const parts = String(k || '').split('-')
              const eIdx = Number(parts[0])
              if (!Number.isFinite(eIdx) || eIdx !== exIdx) return
              if (!v || typeof v !== 'object') return
              const obj = v as AnyObj
              const w = Number(String(obj.weight ?? '').replace(',', '.'))
              const r = Number(String(obj.reps ?? '').replace(',', '.'))
              if (!Number.isFinite(w) || !Number.isFinite(r) || w <= 0 || r <= 0) return
              volume += w * r
            })
            bucket.values[weekIdx] += volume
          })
        }

        sessions.forEach(addToSeries)
        const normalizedSeries = series.map((s) => ({
          name: s.name,
          values: s.values.map((v) => Math.round(v * 10) / 10).reverse(),
        }))
        setExerciseTrend({ status: 'ready', data: { weeks: weekDates.reverse(), series: normalizedSeries } })
      } catch {
        if (!cancelled) setExerciseTrend({ status: 'error', data: null })
      }
    }

    run()
    return () => { cancelled = true }
  }, [sessionDate, sessionReportMeta, supabase, userId])

  return { muscleTrend, muscleTrend4w, exerciseTrend }
}

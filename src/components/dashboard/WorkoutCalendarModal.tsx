'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'

type Props = {
  isOpen: boolean
  onClose: () => void
  userId?: string
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

const toIsoDate = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

const weekdayLabel = (idx: number) => {
  const base = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM']
  return base[idx] || ''
}

const formatMonthTitle = (d: Date) => {
  try {
    return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  } catch {
    return `${d.getMonth() + 1}/${d.getFullYear()}`
  }
}

export default function WorkoutCalendarModal(props: Props) {
  const isOpen = !!props.isOpen
  const uid = props.userId ? String(props.userId) : ''
  const [view, setView] = useState<'month' | 'week'>('month')
  const [cursor, setCursor] = useState(() => startOfDay(new Date()))
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<any[]>([])
  const [checkinsByWorkoutId, setCheckinsByWorkoutId] = useState<Record<string, { pre: boolean; post: boolean }>>({})
  const [selectedDayIso, setSelectedDayIso] = useState(() => toIsoDate(new Date()))

  useEffect(() => {
    if (!isOpen) return
    setSelectedDayIso(toIsoDate(new Date()))
  }, [isOpen])

  const range = useMemo(() => {
    const today = startOfDay(new Date())
    const base = startOfDay(cursor)
    const mondayIndex = (base.getDay() + 6) % 7
    if (view === 'week') {
      const start = addDays(base, -mondayIndex)
      const end = addDays(start, 6)
      return { start, end, today }
    }
    const firstOfMonth = new Date(base.getFullYear(), base.getMonth(), 1)
    const lastOfMonth = new Date(base.getFullYear(), base.getMonth() + 1, 0)
    const firstMondayIndex = (firstOfMonth.getDay() + 6) % 7
    const start = addDays(firstOfMonth, -firstMondayIndex)
    const lastMondayIndex = (lastOfMonth.getDay() + 6) % 7
    const end = addDays(lastOfMonth, 6 - lastMondayIndex)
    return { start, end, today }
  }, [cursor, view])

  const daysGrid = useMemo(() => {
    const days: Date[] = []
    const start = range.start
    const end = range.end
    const total = Math.max(1, Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1)
    for (let i = 0; i < total; i += 1) days.push(addDays(start, i))
    return days
  }, [range.end, range.start])

  useEffect(() => {
    if (!isOpen) return
    if (!uid) return
    const supabase = createClient()
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const startIso = range.start.toISOString()
        const endIso = new Date(range.end.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString()
        const { data, error } = await supabase
          .from('workouts')
          .select('id, user_id, date, name, notes')
          .eq('user_id', uid)
          .eq('is_template', false)
          .gte('date', startIso)
          .lte('date', endIso)
          .order('date', { ascending: true })
          .limit(2000)
        if (error) throw error
        if (cancelled) return
        const list = Array.isArray(data) ? data : []
        setRows(list)
        const ids = list.map((w) => String(w?.id || '').trim()).filter(Boolean)
        if (!ids.length) {
          setCheckinsByWorkoutId({})
          return
        }
        const { data: chkData } = await supabase
          .from('workout_checkins')
          .select('workout_id, kind')
          .in('workout_id', ids)
          .limit(5000)
        if (cancelled) return
        const map: Record<string, { pre: boolean; post: boolean }> = {}
        for (const r of Array.isArray(chkData) ? chkData : []) {
          const wid = String((r as Record<string, unknown>)?.workout_id || '').trim()
          if (!wid) continue
          const kind = String((r as Record<string, unknown>)?.kind || '').trim()
          if (!map[wid]) map[wid] = { pre: false, post: false }
          if (kind === 'pre') map[wid].pre = true
          if (kind === 'post') map[wid].post = true
        }
        setCheckinsByWorkoutId(map)
      } catch {
        if (cancelled) return
        setRows([])
        setCheckinsByWorkoutId({})
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isOpen, uid, range.end, range.start])

  const workoutsByDayIso = useMemo(() => {
    const map = new Map<string, any[]>()
    for (const w of Array.isArray(rows) ? rows : []) {
      const d = w?.date ? new Date(String(w.date)) : null
      if (!d || Number.isNaN(d.getTime())) continue
      const key = toIsoDate(d)
      const prev = map.get(key) || []
      prev.push(w)
      map.set(key, prev)
    }
    return map
  }, [rows])

  const selectedWorkouts = useMemo(() => workoutsByDayIso.get(selectedDayIso) || [], [selectedDayIso, workoutsByDayIso])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[1200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe">
      <div className="w-full max-w-3xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Calendário</div>
            <div className="text-white font-black text-lg truncate">Treinos realizados</div>
            <div className="text-xs text-neutral-400">Clique em um dia para ver os treinos.</div>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 border-b border-neutral-800 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCursor((d) => addDays(d, view === 'month' ? -30 : -7))}
                className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center"
                aria-label="Anterior"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                onClick={() => setCursor(startOfDay(new Date()))}
                className="min-h-[40px] px-3 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800"
              >
                Hoje
              </button>
              <button
                type="button"
                onClick={() => setCursor((d) => addDays(d, view === 'month' ? 30 : 7))}
                className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center"
                aria-label="Próximo"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="text-sm font-black text-white capitalize">{formatMonthTitle(cursor)}</div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setView('week')}
                className={
                  view === 'week'
                    ? 'min-h-[40px] px-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest'
                    : 'min-h-[40px] px-3 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800'
                }
              >
                Semana
              </button>
              <button
                type="button"
                onClick={() => setView('month')}
                className={
                  view === 'month'
                    ? 'min-h-[40px] px-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest'
                    : 'min-h-[40px] px-3 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800'
                }
              >
                Mês
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={String(i)} className="text-[10px] font-black uppercase tracking-widest text-neutral-500 text-center">
                {weekdayLabel(i)}
              </div>
            ))}
          </div>
        </div>

        <div className="p-4">
          <div className="grid grid-cols-7 gap-2">
            {daysGrid.map((d) => {
              const iso = toIsoDate(d)
              const isToday = isSameDay(d, range.today)
              const inMonth = d.getMonth() === cursor.getMonth()
              const dayWorkouts = workoutsByDayIso.get(iso) || []
              const hasWorkout = dayWorkouts.length > 0
              const hasAnyCheckin = hasWorkout
                ? dayWorkouts.some((w) => {
                    const wid = String(w?.id || '').trim()
                    const chk = wid ? checkinsByWorkoutId[wid] : null
                    return !!(chk?.pre || chk?.post)
                  })
                : false
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => setSelectedDayIso(iso)}
                  className={`min-h-[54px] rounded-xl border text-left p-2 transition-colors ${
                    selectedDayIso === iso ? 'border-yellow-500/50 bg-yellow-500/10' : 'border-neutral-800 bg-neutral-950/30 hover:bg-neutral-950/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className={`text-sm font-black ${inMonth ? 'text-white' : 'text-neutral-600'}`}>{d.getDate()}</div>
                    {isToday ? <div className="text-[10px] font-black text-yellow-500">HOJE</div> : null}
                  </div>
                  <div className="mt-1 flex items-center gap-1">
                    {hasWorkout ? <div className="w-2 h-2 rounded-full bg-yellow-500" /> : <div className="w-2 h-2 rounded-full bg-neutral-700" />}
                    {hasWorkout ? (
                      <div className="text-[10px] font-bold text-neutral-300">{dayWorkouts.length} treino(s)</div>
                    ) : (
                      <div className="text-[10px] font-bold text-neutral-600">—</div>
                    )}
                  </div>
                  {hasAnyCheckin ? <div className="mt-1 text-[10px] font-bold text-neutral-300">check-in</div> : <div className="mt-1 text-[10px] text-neutral-700"> </div>}
                </button>
              )
            })}
          </div>

          <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Dia selecionado</div>
                <div className="text-white font-black">{selectedDayIso}</div>
              </div>
              <div className="text-xs text-neutral-500">{loading ? 'Carregando…' : `${selectedWorkouts.length} treino(s)`}</div>
            </div>
            {selectedWorkouts.length ? (
              <div className="mt-3 space-y-2">
                {selectedWorkouts.map((w) => {
                  const title = String(w?.name || 'Treino').trim() || 'Treino'
                  const wid = String(w?.id || '').trim()
                  const chk = wid ? checkinsByWorkoutId[wid] : null
                  const badge = chk?.pre && chk?.post ? 'Pré+Pós' : chk?.pre ? 'Pré' : chk?.post ? 'Pós' : ''
                  return (
                    <div key={wid || title} className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-black text-white truncate">{title}</div>
                        {badge ? <div className="text-[10px] font-black uppercase tracking-widest text-yellow-500 mt-1">{badge}</div> : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="mt-2 text-sm text-neutral-500">Sem treinos nesse dia.</div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-neutral-800 flex items-center justify-end">
          <button
            type="button"
            onClick={props.onClose}
            className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}


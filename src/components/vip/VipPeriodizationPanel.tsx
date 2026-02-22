'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Bar } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js'
import { CalendarDays, Crown, RefreshCw, Sparkles, TrendingUp } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { getErrorMessage } from '@/utils/errorMessage'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

type WeeklyStat = { weekStart: string; volume: number; best1rm: number }

type ActiveProgramResponse = {
  ok: boolean
  program: Record<string, unknown> | null
  workouts: Array<unknown>
}

type StatsResponse = { ok: boolean; weekly?: WeeklyStat[]; error?: string }

const safeString = (v: unknown) => {
  try {
    return String(v ?? '').trim()
  } catch {
    return ''
  }
}

const formatBrazilDate = (raw: string) => {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 8)
  const dd = digits.slice(0, 2)
  const mm = digits.slice(2, 4)
  const yyyy = digits.slice(4, 8)
  if (digits.length <= 2) return dd
  if (digits.length <= 4) return `${dd}/${mm}`
  return `${dd}/${mm}/${yyyy}`
}

const brToIsoDate = (raw: string): string | null => {
  const s = String(raw || '').trim()
  if (!s) return null
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  const dd = Number(m[1])
  const mm = Number(m[2])
  const yyyy = Number(m[3])
  if (!Number.isFinite(dd) || !Number.isFinite(mm) || !Number.isFinite(yyyy)) return null
  if (yyyy < 2000 || yyyy > 2100) return null
  if (mm < 1 || mm > 12) return null
  if (dd < 1 || dd > 31) return null
  const iso = `${String(yyyy).padStart(4, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
  const dt = new Date(`${iso}T00:00:00.000Z`)
  if (Number.isNaN(dt.getTime())) return null
  if (dt.toISOString().slice(0, 10) !== iso) return null
  return iso
}

const friendlyCreateError = (codeRaw: unknown) => {
  const code = String(codeRaw || '').trim().toLowerCase()
  if (!code) return 'Falha ao criar periodização.'
  if (code === 'workout_not_found') return 'Falha ao salvar os treinos do programa. Tente criar novamente.'
  if (code === 'vip_required') return 'Disponível apenas no VIP pago.'
  if (code === 'failed_to_create_workout') return 'Não foi possível criar um dos treinos. Tente novamente.'
  if (code === 'failed_to_create_program') return 'Não foi possível criar o programa. Tente novamente.'
  return String(codeRaw || 'Falha ao criar periodização.')
}

const formatMoneyLike = (n: number) => {
  const v = Number.isFinite(n) ? n : 0
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`
  return String(Math.round(v))
}

export default function VipPeriodizationPanel({
  locked,
  onStartSession,
  onOpenWorkoutEditor,
}: {
  locked: boolean
  onStartSession: (workout: Record<string, unknown>) => void
  onOpenWorkoutEditor?: (workout: Record<string, unknown>) => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const isLocked = !!locked

  const [loading, setLoading] = useState(false)
  const [program, setProgram] = useState<Record<string, unknown> | null>(null)
  const [schedule, setSchedule] = useState<Record<string, unknown>[]>([])
  const [stats, setStats] = useState<WeeklyStat[]>([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [cleaning, setCleaning] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({
    model: 'linear',
    weeks: 6,
    goal: 'hypertrophy',
    level: 'intermediate',
    daysPerWeek: 4,
    timeMinutes: 60,
    equipment: ['gym'],
    limitations: '',
    startDate: '',
  })

  const loadActive = useCallback(async () => {
    if (isLocked) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/vip/periodization/active', { method: 'GET', credentials: 'include', cache: 'no-store' })
      const json = (await res.json().catch((): null => null)) as ActiveProgramResponse | null
      if (!json?.ok) {
        setProgram(null)
        setSchedule([])
        if (json && 'error' in json && typeof json.error === 'string') setError(json.error)
        return
      }
      setProgram(json.program || null)
      setSchedule(Array.isArray(json.workouts) ? (json.workouts as unknown[]).filter((w): w is Record<string, unknown> => !!w && typeof w === 'object') : [])
    } catch (e: unknown) {
      setError(getErrorMessage(e) ? String(getErrorMessage(e)) : 'Falha ao carregar periodização.')
    } finally {
      setLoading(false)
    }
  }, [isLocked])

  const loadStats = useCallback(async () => {
    if (isLocked) return
    try {
      const res = await fetch('/api/vip/periodization/stats', { method: 'GET', credentials: 'include', cache: 'no-store' })
      const json = (await res.json().catch((): null => null)) as StatsResponse | null
      if (!json?.ok) return
      setStats(Array.isArray(json.weekly) ? json.weekly : [])
    } catch {}
  }, [isLocked])

  useEffect(() => {
    loadActive()
    loadStats()
  }, [loadActive, loadStats])

  useEffect(() => {
    if (!success) return
    const t = window.setTimeout(() => setSuccess(''), 6000)
    return () => window.clearTimeout(t)
  }, [success])

  const createProgram = useCallback(async () => {
    if (isLocked) return
    if (loading) return
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const startDateIso = brToIsoDate(form.startDate)
      if (String(form.startDate || '').trim() && !startDateIso) {
        setError('Data inválida. Use o formato dd/mm/aaaa.')
        return
      }
      const payload = {
        model: form.model,
        weeks: Number(form.weeks) === 4 ? 4 : Number(form.weeks) === 8 ? 8 : 6,
        goal: form.goal,
        level: form.level,
        daysPerWeek: Math.max(2, Math.min(6, Number(form.daysPerWeek) || 4)),
        timeMinutes: Math.max(30, Math.min(90, Number(form.timeMinutes) || 60)),
        equipment: Array.isArray(form.equipment) ? form.equipment : [],
        limitations: safeString(form.limitations),
        startDate: startDateIso,
      }
      const res = await fetch('/api/vip/periodization/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch((): null => null)
      if (!json?.ok) {
        setError(friendlyCreateError(json?.error))
        return
      }
      await loadActive()
      await loadStats()
      setCreateOpen(false)
      setSuccess('Programa criado! Os treinos já estão em Treinos Periodizados.')
    } catch (e: unknown) {
      setError(getErrorMessage(e) ? String(getErrorMessage(e)) : 'Falha ao criar periodização.')
    } finally {
      setLoading(false)
    }
  }, [form, isLocked, loadActive, loadStats, loading])

  const cleanupOld = useCallback(async () => {
    if (isLocked) return
    if (cleaning) return
    setCleaning(true)
    setError('')
    setSuccess('')
    try {
      const res = await fetch('/api/vip/periodization/cleanup', { method: 'POST', credentials: 'include', cache: 'no-store' })
      const json = await res.json().catch((): null => null)
      if (!json?.ok) {
        setError(friendlyCreateError(json?.error))
        return
      }
      const n = Number(json?.archived || 0)
      setSuccess(n > 0 ? `Treinos antigos arquivados: ${n}.` : 'Nenhum treino antigo para arquivar.')
    } catch (e: unknown) {
      setError(getErrorMessage(e) ? String(getErrorMessage(e)) : 'Falha ao limpar treinos antigos.')
    } finally {
      setCleaning(false)
    }
  }, [cleaning, isLocked])

  const startWorkoutById = useCallback(
    async (workoutId: string) => {
      const id = safeString(workoutId)
      if (!id) return
      try {
        const { data, error } = await supabase
          .from('workouts')
          .select(
            `
            id,
            name,
            notes,
            exercises (
              id,
              name,
              notes,
              video_url,
              rest_time,
              cadence,
              method,
              "order",
              sets ( id, set_number, weight, reps, rpe, completed, is_warmup, advanced_config )
            )
          `,
          )
          .eq('id', id)
          .maybeSingle()
        if (error || !data?.id) {
          setError('Não foi possível carregar o treino. Tente novamente.')
          return
        }
        const workoutObj: Record<string, unknown> = { ...(data as Record<string, unknown>), title: (data as Record<string, unknown>).name }
        onStartSession(workoutObj)
      } catch {
        setError('Não foi possível iniciar o treino.')
      }
    },
    [onStartSession, supabase],
  )

  const editWorkoutById = useCallback(
    async (workoutId: string) => {
      const id = safeString(workoutId)
      if (!id || typeof onOpenWorkoutEditor !== 'function') return
      try {
        const { data } = await supabase.from('workouts').select('id, name').eq('id', id).maybeSingle()
        if (!data?.id) return
        onOpenWorkoutEditor({ id: data.id, name: data.name })
      } catch {}
    },
    [onOpenWorkoutEditor, supabase],
  )

  const chart = useMemo(() => {
    const labels = stats.map((s) => s.weekStart)
    return {
      labels,
      datasets: [
        {
          label: 'Volume semanal',
          data: stats.map((s) => Math.round(s.volume)),
          backgroundColor: 'rgba(234,179,8,0.65)',
          borderRadius: 8,
        },
      ],
    }
  }, [stats])

  const daysPerWeekN = Number(form.daysPerWeek)
  const timeMinutesN = Number(form.timeMinutes)
  const daysPerWeekInvalid = !Number.isFinite(daysPerWeekN) || daysPerWeekN < 2 || daysPerWeekN > 6
  const timeMinutesInvalid = !Number.isFinite(timeMinutesN) || timeMinutesN < 30 || timeMinutesN > 90

  if (isLocked) {
    return (
      <div className="rounded-2xl border border-yellow-500/20 bg-neutral-900/60 p-5">
        <div className="flex items-center gap-3">
          <Crown className="text-yellow-500" />
          <div className="font-black text-white">Periodização VIP</div>
        </div>
        <div className="mt-2 text-sm text-neutral-400">Disponível apenas no VIP pago.</div>
        <button
          type="button"
          onClick={() => (window.location.href = '/marketplace')}
          className="mt-4 inline-flex items-center justify-center rounded-xl bg-yellow-500 px-4 py-3 font-black text-black hover:bg-yellow-400"
        >
          Ver planos
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 space-y-4">
      <div className="flex flex-col gap-3">
        {/* Título */}
        <div className="flex items-center gap-3">
          <Sparkles className="text-yellow-500 shrink-0" />
          <div>
            <div className="font-black text-white">Periodização VIP</div>
            <div className="text-xs text-neutral-400">Planos estruturados de 4, 6 ou 8 semanas</div>
          </div>
        </div>
        {/* Botões — linha própria, cada um com flex-1 */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={cleanupOld}
            disabled={cleaning}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-800 border border-neutral-700 px-3 py-2 text-neutral-200 font-black text-sm hover:bg-neutral-700 disabled:opacity-60"
          >
            <RefreshCw size={15} />
            {cleaning ? 'Limpando...' : 'Limpar antigos'}
          </button>
          <button
            type="button"
            onClick={() => {
              setCreateOpen(true)
              setError('')
            }}
            disabled={loading}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-yellow-500/10 border border-yellow-500/25 px-3 py-2 text-yellow-400 font-black text-sm hover:bg-yellow-500/15 disabled:opacity-60"
          >
            <CalendarDays size={15} />
            {program?.id ? 'Refazer' : 'Criar'}
          </button>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div> : null}
      {success ? <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-200">{success}</div> : null}

      {program && typeof program === 'object' && program.config && typeof (program as Record<string, unknown>).config === 'object' && (program as Record<string, unknown>).config && (program as Record<string, unknown> & { config?: Record<string, unknown> }).config?.overview ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4 whitespace-pre-wrap text-sm text-neutral-200">
          {String(((program as unknown as { config?: Record<string, unknown> }).config?.overview))}
        </div>
      ) : null}

      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-green-400" />
            <div className="font-black text-white text-sm">Progresso (14 semanas)</div>
          </div>
          <button type="button" onClick={loadStats} className="inline-flex items-center gap-2 text-xs font-black text-neutral-300 hover:text-white">
            <RefreshCw size={14} />
            Atualizar
          </button>
        </div>
        {stats.length ? (
          <div className="mt-3">
            <Bar
              data={chart}
              options={{
                responsive: true,
                plugins: { legend: { display: false }, title: { display: false } },
                scales: { x: { ticks: { color: '#a3a3a3' } }, y: { ticks: { color: '#a3a3a3' } } },
              }}
            />
          </div>
        ) : (
          <div className="mt-3 text-sm text-neutral-400">Sem dados suficientes ainda.</div>
        )}
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="font-black text-white text-sm">Calendário do programa</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCalendarOpen((v) => !v)}
              className="inline-flex items-center justify-center rounded-xl bg-neutral-800 border border-neutral-700 px-3 py-2 text-xs font-black text-white hover:bg-neutral-700"
            >
              {calendarOpen ? 'Esconder' : 'Mostrar'}
            </button>
            <button type="button" onClick={loadActive} className="inline-flex items-center gap-2 text-xs font-black text-neutral-300 hover:text-white">
              <RefreshCw size={14} />
              Atualizar
            </button>
          </div>
        </div>

        {!program?.id ? <div className="mt-2 text-sm text-neutral-400">Crie um programa para ver o calendário.</div> : null}

        {program?.id && schedule.length && calendarOpen ? (
          <div className="mt-3 space-y-2">
            {(schedule as Record<string, unknown>[]).map((w) => {
              const week = Number(w?.week_number || 0)
              const day = Number(w?.day_number || 0)
              const phase = safeString(w?.phase) || '-'
              const date = safeString(w?.scheduled_date) || ''
              const title = safeString(w?.workout_name) || `VIP • W${week} D${day}`
              const workoutId = safeString(w?.workout_id)
              return (
                <div key={safeString(w?.id) || `${week}-${day}`} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl border border-neutral-800 bg-black/30 px-3 py-3">
                  <div className="min-w-0">
                    <div className="text-xs text-neutral-500 font-black uppercase tracking-widest">
                      Semana {week} • Dia {day} • {phase}{date ? ` • ${date}` : ''}
                    </div>
                    <div className="text-sm text-white font-black truncate">{title}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => startWorkoutById(workoutId)}
                      className="inline-flex items-center justify-center rounded-xl bg-yellow-500 px-3 py-2 text-xs font-black text-black hover:bg-yellow-400"
                    >
                      Iniciar
                    </button>
                    <button
                      type="button"
                      onClick={() => editWorkoutById(workoutId)}
                      className="inline-flex items-center justify-center rounded-xl bg-neutral-800 border border-neutral-700 px-3 py-2 text-xs font-black text-white hover:bg-neutral-700"
                    >
                      Editar
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}
      </div>

      {createOpen ? (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 pt-safe">
          <div className="w-full max-w-lg rounded-3xl border border-neutral-800 bg-neutral-900 overflow-hidden">
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
              <div className="font-black text-white">Criar periodização</div>
              <button type="button" onClick={() => setCreateOpen(false)} className="rounded-xl bg-neutral-800 border border-neutral-700 px-3 py-2 text-xs font-black text-white">
                Fechar
              </button>
            </div>
            <div className="p-5 space-y-3">
              {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div> : null}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Duração do programa</div>
                  <select
                    value={form.weeks}
                    onChange={(e) => setForm((p) => ({ ...p, weeks: Number(e.target.value) }))}
                    className="w-full rounded-xl bg-neutral-950 border border-neutral-800 px-3 py-3 text-white font-bold"
                    aria-label="Duração do programa"
                  >
                    <option value={4}>4 semanas</option>
                    <option value={6}>6 semanas</option>
                    <option value={8}>8 semanas</option>
                  </select>
                  <div className="text-[11px] text-neutral-500">Escolha 4, 6 ou 8 semanas.</div>
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Modelo de progressão</div>
                  <select
                    value={form.model}
                    onChange={(e) => setForm((p) => ({ ...p, model: e.target.value }))}
                    className="w-full rounded-xl bg-neutral-950 border border-neutral-800 px-3 py-3 text-white font-bold"
                    aria-label="Modelo de progressão"
                  >
                    <option value="linear">Linear</option>
                    <option value="undulating">Undulatória</option>
                  </select>
                  <div className="text-[11px] text-neutral-500">Linear sobe gradualmente. Undulatória varia estímulo na semana.</div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Objetivo</div>
                  <select
                    value={form.goal}
                    onChange={(e) => setForm((p) => ({ ...p, goal: e.target.value }))}
                    className="w-full rounded-xl bg-neutral-950 border border-neutral-800 px-3 py-3 text-white font-bold"
                    aria-label="Objetivo"
                  >
                    <option value="hypertrophy">Hipertrofia</option>
                    <option value="strength">Força</option>
                    <option value="recomp">Recomposição</option>
                  </select>
                  <div className="text-[11px] text-neutral-500">Define foco de reps, carga e volume.</div>
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Nível</div>
                  <select
                    value={form.level}
                    onChange={(e) => setForm((p) => ({ ...p, level: e.target.value }))}
                    className="w-full rounded-xl bg-neutral-950 border border-neutral-800 px-3 py-3 text-white font-bold"
                    aria-label="Nível"
                  >
                    <option value="beginner">Iniciante</option>
                    <option value="intermediate">Intermediário</option>
                    <option value="advanced">Avançado</option>
                  </select>
                  <div className="text-[11px] text-neutral-500">Ajusta complexidade e volume do programa.</div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Frequência</div>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={2}
                    max={6}
                    value={String(form.daysPerWeek)}
                    onChange={(e) => setForm((p) => ({ ...p, daysPerWeek: Number(e.target.value) }))}
                    placeholder="Ex.: 4"
                    className="w-full rounded-xl bg-neutral-950 border border-neutral-800 px-3 py-3 text-white font-bold"
                    aria-label="Dias por semana"
                  />
                  {daysPerWeekInvalid ? <div className="text-[11px] text-red-300">Use de 2 a 6 dias por semana.</div> : <div className="text-[11px] text-neutral-500">Quantos dias você treina por semana.</div>}
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Duração da sessão</div>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={30}
                    max={90}
                    value={String(form.timeMinutes)}
                    onChange={(e) => setForm((p) => ({ ...p, timeMinutes: Number(e.target.value) }))}
                    placeholder="Ex.: 60"
                    className="w-full rounded-xl bg-neutral-950 border border-neutral-800 px-3 py-3 text-white font-bold"
                    aria-label="Minutos por sessão"
                  />
                  {timeMinutesInvalid ? <div className="text-[11px] text-red-300">Use de 30 a 90 minutos.</div> : <div className="text-[11px] text-neutral-500">Tempo médio disponível por treino.</div>}
                </div>
              </div>

              <div className="space-y-2">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Equipamentos disponíveis</div>
                  <div className="text-[11px] text-neutral-500">Marque onde você realmente vai treinar nesse ciclo.</div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="flex items-center gap-2 rounded-xl bg-neutral-950 border border-neutral-800 px-3 py-3 text-sm text-white font-bold">
                    <input
                      type="checkbox"
                      checked={form.equipment.includes('gym')}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, equipment: e.target.checked ? Array.from(new Set([...p.equipment, 'gym'])) : p.equipment.filter((x) => x !== 'gym') }))
                      }
                    />
                    Academia completa
                  </label>
                  <label className="flex items-center gap-2 rounded-xl bg-neutral-950 border border-neutral-800 px-3 py-3 text-sm text-white font-bold">
                    <input
                      type="checkbox"
                      checked={form.equipment.includes('home')}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, equipment: e.target.checked ? Array.from(new Set([...p.equipment, 'home'])) : p.equipment.filter((x) => x !== 'home') }))
                      }
                    />
                    Casa (home gym)
                  </label>
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Data de início (opcional)</div>
                <input
                  inputMode="numeric"
                  value={form.startDate}
                  onChange={(e) => setForm((p) => ({ ...p, startDate: formatBrazilDate(e.target.value) }))}
                  placeholder="dd/mm/aaaa"
                  className="w-full rounded-xl bg-neutral-950 border border-neutral-800 px-3 py-3 text-white font-bold"
                  aria-label="Data de início"
                />
                <div className="text-[11px] text-neutral-500">Define o calendário do programa (formato dd/mm/aaaa). Se vazio, fica sem datas.</div>
              </div>

              <div className="space-y-1">
                <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Limitações (opcional)</div>
                <textarea
                  value={form.limitations}
                  onChange={(e) => setForm((p) => ({ ...p, limitations: e.target.value }))}
                  placeholder="Ex.: dor no ombro, evitar agachamento, sem barra, sem polia..."
                  rows={3}
                  className="w-full rounded-xl bg-neutral-950 border border-neutral-800 px-3 py-3 text-white font-medium"
                  aria-label="Limitações"
                />
                <div className="text-[11px] text-neutral-500">Isso ajuda o sistema a ajustar exercícios e volume.</div>
              </div>

              <button
                type="button"
                onClick={createProgram}
                disabled={loading}
                className="w-full rounded-xl bg-yellow-500 px-4 py-3.5 font-black text-black hover:bg-yellow-400 disabled:opacity-60"
              >
                {loading ? 'Criando...' : 'Criar programa'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

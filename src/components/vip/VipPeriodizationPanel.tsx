'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Bar } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js'
import { CalendarDays, Crown, RefreshCw, Sparkles, TrendingUp } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { getErrorMessage, getFriendlyApiError } from '@/utils/errorMessage'
import { apiVip } from '@/lib/api'
import PeriodizationCreateModal, { friendlyCreateError } from '@/components/vip/PeriodizationCreateModal'
import { useDialog } from '@/contexts/DialogContext'

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

const _formatMoneyLike = (n: number) => {
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
  const { confirm } = useDialog()
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
  const loadActive = useCallback(async () => {
    if (isLocked) return
    setLoading(true)
    setError('')
    try {
      const json = await apiVip.getPeriodizationActive().catch(() => null) as ActiveProgramResponse | null
      if (!json?.ok) {
        setProgram(null)
        setSchedule([])
        if (json && 'error' in json && typeof (json as Record<string, unknown>).error === 'string')
          setError(getFriendlyApiError((json as Record<string, unknown>).error as string, 'Falha ao carregar periodização.'))
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
      const json = await apiVip.getPeriodizationStats().catch(() => null) as StatsResponse | null
      if (!json?.ok) return
      setStats(Array.isArray((json as unknown as { weekly?: WeeklyStat[] }).weekly) ? (json as unknown as { weekly: WeeklyStat[] }).weekly : [])
    } catch { }
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

  /**
   * Arquivar em massa sem perguntar nada.
   *
   * O botão dizia "Limpar antigos" e disparava direto: arquiva TODOS os
   * templates `VIP •` do usuário que não pertencem ao programa ativo (teto de
   * 2.000 na rota). Um toque, e a lista de treinos muda sem o usuário saber o
   * que saiu nem quantos.
   *
   * A confirmação diz o ESCOPO (o que sai, o que fica) e a REVERSIBILIDADE —
   * que é o fato que muda a decisão. E não usa `destructive`: arquivar não
   * apaga nada, e o vermelho é o pigmento de alarme do app; gastá-lo aqui é o
   * mesmo erro de gastá-lo em categoria, e deixa sem cor o que de fato não tem
   * volta.
   *
   * Polaridade: o `confirm` resolve `false` ao fechar por fora, então arquivar
   * é o `confirmText` e um toque fora do diálogo NÃO mexe na lista.
   */
  const cleanupOld = useCallback(async () => {
    if (isLocked) return
    if (cleaning) return
    const ok = await confirm(
      'Os treinos das periodizações anteriores saem da lista. Os do plano atual ficam, e você pode desarquivar depois em ARQUIVADOS.',
      'Arquivar treinos VIP antigos?',
      { confirmText: 'Arquivar', cancelText: 'Manter' },
    )
    if (!ok) return
    setCleaning(true)
    setError('')
    setSuccess('')
    try {
      const json = await apiVip.cleanupPeriodization().catch(() => null)
      if (!json?.ok) {
        setError(friendlyCreateError((json as Record<string, unknown> | null)?.error))
        return
      }
      const n = Number((json as Record<string, unknown> | null)?.archived ?? 0)
      setSuccess(n > 0 ? `Treinos antigos arquivados: ${n}.` : 'Nenhum treino antigo para arquivar.')
    } catch (e: unknown) {
      setError(getErrorMessage(e) ? String(getErrorMessage(e)) : 'Falha ao limpar treinos antigos.')
    } finally {
      setCleaning(false)
    }
  }, [cleaning, isLocked, confirm])

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
              sets ( id, set_number, weight, reps, rpe, completed, is_warmup, advanced_config, per_set_method )
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
      } catch { }
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
          <button type="button" onClick={loadStats} disabled={loading} className="inline-flex items-center gap-2 text-xs font-black text-neutral-300 hover:text-white disabled:opacity-60">
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
              className="inline-flex items-center justify-center rounded-xl px-3 py-2 text-xs font-black text-white transition-all active:scale-95"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              {calendarOpen ? 'Esconder' : 'Mostrar'}
            </button>
            <button aria-label="Atualizar" type="button" onClick={loadActive} disabled={loading} className="inline-flex items-center gap-2 text-xs font-black text-neutral-300 hover:text-white disabled:opacity-60">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {!program?.id ? <div className="mt-2 text-sm text-neutral-400">Crie um programa para ver o calendário.</div> : null}

        {program?.id && schedule.length && calendarOpen ? (() => {
          // Group schedule by week_number
          const weeks = new Map<number, Record<string, unknown>[]>()
          for (const w of schedule as Record<string, unknown>[]) {
            const wn = Number(w?.week_number || 0)
            if (!weeks.has(wn)) weeks.set(wn, [])
            weeks.get(wn)!.push(w)
          }
          const weekEntries = Array.from(weeks.entries()).sort(([a], [b]) => a - b)
          // Detect current week (first week with future dates or most recent)
          const now = new Date()
          const currentWeek = weekEntries.find(([, items]) =>
            items.some(w => {
              const d = new Date(String(w?.scheduled_date || ''))
              return !Number.isNaN(d.getTime()) && d >= now
            })
          )?.[0] ?? weekEntries[0]?.[0] ?? 0

          return (
            <div className="mt-3 space-y-2">
              {weekEntries.map(([weekNum, items]) => {
                const isCurrent = weekNum === currentWeek
                const phase = safeString(items[0]?.phase) || '-'
                return (
                  <details key={weekNum} open={isCurrent} className="group rounded-xl overflow-hidden" style={{ border: isCurrent ? '1px solid rgba(234,179,8,0.2)' : '1px solid rgba(255,255,255,0.06)' }}>
                    <summary className="cursor-pointer select-none flex items-center justify-between px-3 py-2.5 transition-all" style={{ background: isCurrent ? 'rgba(234,179,8,0.06)' : 'rgba(255,255,255,0.02)' }}>
                      <div className="flex items-center gap-2">
                        <div className={`text-xs font-black uppercase tracking-wider ${isCurrent ? 'text-yellow-400' : 'text-neutral-400'}`}>
                          Semana {weekNum}
                        </div>
                        <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isCurrent ? 'bg-yellow-500/10 text-yellow-400' : 'bg-neutral-800 text-neutral-400'}`}>
                          {phase}
                        </div>
                        {isCurrent && (
                          <div className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-500 border border-yellow-500/25">
                            Atual
                          </div>
                        )}
                      </div>
                      <div className="text-[10px] text-neutral-400 font-bold">{items.length} treino{items.length !== 1 ? 's' : ''}</div>
                    </summary>
                    <div className="px-2 pb-2 space-y-1.5">
                      {items.map((w) => {
                        const day = Number(w?.day_number || 0)
                        const date = safeString(w?.scheduled_date) || ''
                        const title = safeString(w?.workout_name) || `VIP • W${weekNum} D${day}`
                        const workoutId = safeString(w?.workout_id)
                        return (
                          <div key={safeString(w?.id) || `${weekNum}-${day}`} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                            <div className="min-w-0">
                              <div className="text-[10px] text-neutral-400 font-bold">
                                Dia {day}{date ? ` • ${date}` : ''}
                              </div>
                              <div className="text-sm text-white font-bold truncate">{title}</div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => startWorkoutById(workoutId)}
                                className="inline-flex items-center justify-center rounded-lg px-2.5 py-1.5 text-[11px] font-black text-black transition-all active:scale-95"
                                style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
                              >
                                Iniciar
                              </button>
                              <button
                                type="button"
                                onClick={() => editWorkoutById(workoutId)}
                                className="inline-flex items-center justify-center rounded-lg px-2.5 py-1.5 text-[11px] font-black text-neutral-300 transition-all active:scale-95"
                                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                              >
                                Editar
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </details>
                )
              })}
            </div>
          )
        })() : null}
      </div>

      <PeriodizationCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={async () => {
          await loadActive()
          await loadStats()
          setSuccess('Programa criado! Os treinos já estão em Treinos Periodizados.')
        }}
      />
    </div>
  )
}
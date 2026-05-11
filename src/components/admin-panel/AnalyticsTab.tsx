'use client'

/**
 * AnalyticsTab — KPIs de engajamento do app.
 *
 * Resolve "estou no escuro sobre uso real": DAU/WAU/MAU, stickiness,
 * volume de treinos, pushes enviadas. Sem schema novo — agregação
 * sobre tabelas existentes (user_activity_events, workouts, profiles,
 * notifications).
 *
 * Carregamento sob demanda: as queries fazem count exato no banco, são
 * razoáveis pra base atual (~35 users) mas escalam linearmente. Se
 * crescer pra 10k+ usuários vai pedir cache (Redis 5min).
 */

import { useCallback, useEffect, useState } from 'react'
import {
  Activity, Users, TrendingUp, Dumbbell, Send, RefreshCw, Loader2,
  AlertCircle, BarChart3,
} from 'lucide-react'

interface AnalyticsSummary {
  dau: number
  wau: number
  mau: number
  stickiness: number
  workoutsToday: number
  workouts7d: number
  workouts30d: number
  newSignups7d: number
  newSignups30d: number
  pushes24h: number
  pushes7d: number
  topPushTypes: Array<{ type: string; count: number }>
  totalUsers: number
  totalActiveUsers30d: number
}

const PUSH_TYPE_LABELS: Record<string, string> = {
  streak_at_risk: 'Streak em risco',
  morning_briefing: 'Bom dia',
  friends_trained_today: 'Amigos treinaram',
  water_reminder: 'Lembrete de água',
  inactivity_nudge: 'Aluno inativo',
  birthday: 'Aniversário',
  weekly_recap: 'Resumo semanal',
  friend_online: 'Amigo online (desligado)',
  workout_start: 'Início de treino',
  trial_ending: 'Trial acabando',
  teacher_plan_expiring: 'Plano expirando',
}

const labelForPushType = (t: string): string =>
  PUSH_TYPE_LABELS[t] ?? t.replace(/_/g, ' ')

export function AnalyticsTab() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSummary = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/analytics-summary', { cache: 'no-store' })
      const json = await res.json().catch(() => null) as
        | { ok: true; summary: AnalyticsSummary }
        | { ok: false; error: string }
        | null
      if (!json || !res.ok || !json.ok) {
        setError((json && 'error' in json) ? json.error : `Erro HTTP ${res.status}`)
        return
      }
      setSummary(json.summary)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro de rede')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchSummary() }, [fetchSummary])

  // KPI card auxiliar — mantém o estilo dos outros painéis.
  const KpiCard = ({
    icon: Icon,
    iconColor,
    iconBg,
    label,
    value,
    suffix,
    sub,
  }: {
    icon: React.ElementType
    iconColor: string
    iconBg: string
    label: string
    value: string | number
    suffix?: string
    sub?: string
  }) => (
    <div
      className="rounded-2xl p-4"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: iconBg }}
        >
          <Icon size={16} className={iconColor} />
        </div>
        <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="text-2xl font-black text-white">
        {value}
        {suffix ? <span className="text-sm text-neutral-400 ml-1 font-bold">{suffix}</span> : null}
      </div>
      {sub ? <div className="text-[11px] text-neutral-500 mt-0.5">{sub}</div> : null}
    </div>
  )

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <BarChart3 size={20} className="text-yellow-500" />
            Analytics
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            Engajamento e uso do app. Dados em tempo real.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchSummary()}
          disabled={loading}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold text-neutral-300 hover:text-white hover:bg-white/5 disabled:opacity-50 transition-all active:scale-95"
          style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Atualizar
        </button>
      </div>

      {error && (
        <div
          className="rounded-xl p-3 flex gap-2 text-xs"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}
        >
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-red-200">{error}</p>
        </div>
      )}

      {loading && !summary ? (
        <div className="flex items-center justify-center py-16 text-neutral-500">
          <Loader2 size={28} className="animate-spin" />
        </div>
      ) : summary ? (
        <>
          {/* ── Usuários ativos (DAU/WAU/MAU + stickiness) ──────── */}
          <section className="space-y-2">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 px-1">
              Usuários ativos
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <KpiCard
                icon={Activity}
                iconColor="text-yellow-400"
                iconBg="rgba(234,179,8,0.15)"
                label="DAU"
                value={summary.dau}
                sub="Últimas 24h"
              />
              <KpiCard
                icon={Activity}
                iconColor="text-blue-400"
                iconBg="rgba(59,130,246,0.15)"
                label="WAU"
                value={summary.wau}
                sub="Últimos 7d"
              />
              <KpiCard
                icon={Activity}
                iconColor="text-emerald-400"
                iconBg="rgba(34,197,94,0.15)"
                label="MAU"
                value={summary.mau}
                sub="Últimos 30d"
              />
              <KpiCard
                icon={TrendingUp}
                iconColor="text-purple-400"
                iconBg="rgba(168,85,247,0.15)"
                label="Stickiness"
                value={summary.stickiness}
                suffix="%"
                sub="DAU ÷ MAU"
              />
            </div>
            <p className="text-[10px] text-neutral-600 px-1">
              Stickiness alto (&gt;20%) = usuários voltam frequente. &lt;10% = app usado pontual.
            </p>
          </section>

          {/* ── Treinos ─────────────────────────────────────────── */}
          <section className="space-y-2">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 px-1">
              Treinos realizados
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <KpiCard
                icon={Dumbbell}
                iconColor="text-yellow-400"
                iconBg="rgba(234,179,8,0.15)"
                label="Hoje"
                value={summary.workoutsToday}
              />
              <KpiCard
                icon={Dumbbell}
                iconColor="text-yellow-400"
                iconBg="rgba(234,179,8,0.15)"
                label="7 dias"
                value={summary.workouts7d}
              />
              <KpiCard
                icon={Dumbbell}
                iconColor="text-yellow-400"
                iconBg="rgba(234,179,8,0.15)"
                label="30 dias"
                value={summary.workouts30d}
              />
            </div>
          </section>

          {/* ── Aquisição ───────────────────────────────────────── */}
          <section className="space-y-2">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 px-1">
              Aquisição
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <KpiCard
                icon={Users}
                iconColor="text-emerald-400"
                iconBg="rgba(34,197,94,0.15)"
                label="Novos 7d"
                value={summary.newSignups7d}
              />
              <KpiCard
                icon={Users}
                iconColor="text-emerald-400"
                iconBg="rgba(34,197,94,0.15)"
                label="Novos 30d"
                value={summary.newSignups30d}
              />
              <KpiCard
                icon={Users}
                iconColor="text-neutral-300"
                iconBg="rgba(255,255,255,0.05)"
                label="Total"
                value={summary.totalUsers}
                sub={`${summary.totalActiveUsers30d} ativos`}
              />
            </div>
          </section>

          {/* ── Pushes ──────────────────────────────────────────── */}
          <section className="space-y-2">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 px-1">
              Push notifications
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <KpiCard
                icon={Send}
                iconColor="text-blue-400"
                iconBg="rgba(59,130,246,0.15)"
                label="Últimas 24h"
                value={summary.pushes24h}
              />
              <KpiCard
                icon={Send}
                iconColor="text-blue-400"
                iconBg="rgba(59,130,246,0.15)"
                label="Últimos 7d"
                value={summary.pushes7d}
              />
            </div>

            {summary.topPushTypes.length > 0 && (
              <div
                className="rounded-2xl p-4 mt-2"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div className="text-[10px] font-black uppercase tracking-wider text-neutral-400 mb-3">
                  Top tipos enviados (7 dias)
                </div>
                <div className="space-y-2">
                  {summary.topPushTypes.map(({ type, count }) => {
                    const max = summary.topPushTypes[0]?.count ?? 1
                    const pct = max > 0 ? (count / max) * 100 : 0
                    return (
                      <div key={type} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-neutral-300 truncate">{labelForPushType(type)}</span>
                          <span className="text-neutral-500 font-bold tabular-nums shrink-0 ml-2">{count}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-neutral-800 overflow-hidden">
                          <div
                            className="h-full bg-yellow-500 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  )
}

export default AnalyticsTab

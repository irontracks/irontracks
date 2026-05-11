'use client'

/**
 * CronsStatusTab — visão dos crons configurados em vercel.json.
 *
 * Resolve o problema "será que o cron rodou hoje?" — depois dos bugs
 * em produção (streak-at-risk e morning-briefing disparando errado),
 * passou a ser importante saber em 1 olhada que todos rodaram.
 *
 * Não inventamos uma tabela de logs nova — usamos o rastro que cada
 * cron já deixa em `notifications` (presence da row recente do tipo
 * certo = cron rodou). Crons que fazem só UPDATE silencioso ficam
 * como 'unknown' (sem juízo de valor).
 */

import { useCallback, useEffect, useState } from 'react'
import { Activity, CheckCircle2, AlertTriangle, XCircle, HelpCircle, RefreshCw, Loader2, Clock } from 'lucide-react'

interface CronStatus {
  id: string
  path: string
  schedule: string
  label: string
  lastRunAt: string | null
  hoursSinceLastRun: number | null
  status: 'ok' | 'stale' | 'silent' | 'unknown'
}

const STATUS_CONFIG: Record<CronStatus['status'], {
  label: string
  icon: React.ElementType
  textColor: string
  bgColor: string
  borderColor: string
}> = {
  ok: {
    label: 'OK',
    icon: CheckCircle2,
    textColor: 'text-emerald-300',
    bgColor: 'rgba(34,197,94,0.10)',
    borderColor: 'rgba(34,197,94,0.30)',
  },
  stale: {
    label: 'Atrasado',
    icon: AlertTriangle,
    textColor: 'text-amber-300',
    bgColor: 'rgba(245,158,11,0.10)',
    borderColor: 'rgba(245,158,11,0.30)',
  },
  silent: {
    label: 'Silencioso',
    icon: XCircle,
    textColor: 'text-red-300',
    bgColor: 'rgba(239,68,68,0.10)',
    borderColor: 'rgba(239,68,68,0.30)',
  },
  unknown: {
    label: 'Sem trace',
    icon: HelpCircle,
    textColor: 'text-neutral-400',
    bgColor: 'rgba(255,255,255,0.03)',
    borderColor: 'rgba(255,255,255,0.10)',
  },
}

const formatTimeSince = (hours: number | null, lastIso: string | null): string => {
  if (hours == null) return 'Nunca'
  if (lastIso) {
    try {
      return new Date(lastIso).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      })
    } catch { /* fallback */ }
  }
  if (hours < 1) return `${Math.round(hours * 60)} min atrás`
  if (hours < 24) return `${Math.round(hours)} h atrás`
  const days = Math.round(hours / 24)
  return `${days} dia${days === 1 ? '' : 's'} atrás`
}

const formatCronSchedule = (cron: string): string => {
  // "0 11 * * *" → "11:00 UTC (08:00 BRT) todo dia"
  // Não é cronômetro mestre, só uma tradução simples.
  const parts = cron.split(' ')
  if (parts.length !== 5) return cron
  const [min, hour, , , weekday] = parts
  const hh = String(hour).padStart(2, '0')
  const mm = String(min).padStart(2, '0')
  const hourBrt = (Number(hour) - 3 + 24) % 24
  const brtLabel = `${String(hourBrt).padStart(2, '0')}:${mm}`
  const utcLabel = `${hh}:${mm}`
  const day = weekday === '*' ? 'todo dia' : `dia ${weekday} da semana`
  return `${utcLabel} UTC (${brtLabel} BRT) — ${day}`
}

export function CronsStatusTab() {
  const [crons, setCrons] = useState<CronStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/crons-status', { cache: 'no-store' })
      const json = await res.json().catch(() => null) as
        | { ok: true; crons: CronStatus[] }
        | { ok: false; error: string }
        | null
      if (!json || !res.ok || !json.ok) {
        setError((json && 'error' in json) ? json.error : `Erro HTTP ${res.status}`)
        return
      }
      setCrons(json.crons)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro de rede')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchStatus() }, [fetchStatus])

  // Resumo do estado: quantos OK / Atrasados / Silenciosos
  const counts = crons.reduce<Record<CronStatus['status'], number>>(
    (acc, c) => { acc[c.status] = (acc[c.status] ?? 0) + 1; return acc },
    { ok: 0, stale: 0, silent: 0, unknown: 0 },
  )

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      {/* Header com resumo */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <Activity size={20} className="text-yellow-500" />
            Status dos Crons
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            Status baseado no rastro que cada cron deixa em notifications.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchStatus()}
          disabled={loading}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold text-neutral-300 hover:text-white hover:bg-white/5 disabled:opacity-50 transition-all active:scale-95"
          style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Atualizar
        </button>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-4 gap-2">
        {(['ok', 'stale', 'silent', 'unknown'] as const).map((s) => {
          const cfg = STATUS_CONFIG[s]
          const Icon = cfg.icon
          return (
            <div
              key={s}
              className="rounded-xl p-3 text-center border"
              style={{ background: cfg.bgColor, borderColor: cfg.borderColor }}
            >
              <Icon size={16} className={`mx-auto mb-1 ${cfg.textColor}`} />
              <div className={`text-xl font-black ${cfg.textColor}`}>{counts[s]}</div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-neutral-400 mt-0.5">
                {cfg.label}
              </div>
            </div>
          )
        })}
      </div>

      {error && (
        <div
          className="rounded-xl p-3 flex gap-2 text-xs"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}
        >
          <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-red-200">{error}</p>
        </div>
      )}

      {/* Lista de crons */}
      {loading && crons.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-neutral-500">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : (
        <div className="space-y-2">
          {crons.map((c) => {
            const cfg = STATUS_CONFIG[c.status]
            const Icon = cfg.icon
            return (
              <div
                key={c.id}
                className="rounded-xl p-4 border flex items-center gap-3"
                style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: cfg.bgColor, border: `1px solid ${cfg.borderColor}` }}
                >
                  <Icon size={16} className={cfg.textColor} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-black text-white truncate">{c.label}</span>
                    <span
                      className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full ${cfg.textColor}`}
                      style={{ background: cfg.bgColor, border: `1px solid ${cfg.borderColor}` }}
                    >
                      {cfg.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-neutral-400">
                    <span className="flex items-center gap-1">
                      <Clock size={11} />
                      {formatCronSchedule(c.schedule)}
                    </span>
                  </div>
                  <div className="text-[11px] text-neutral-500 mt-0.5">
                    Última execução: {formatTimeSince(c.hoursSinceLastRun, c.lastRunAt)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default CronsStatusTab

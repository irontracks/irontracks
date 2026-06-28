'use client'

import { useCallback, useState } from 'react'
import { ChevronLeft, Trash2 } from 'lucide-react'
import { useBackHandler } from '@/hooks/useBackHandler'
import type { WorkoutSummary } from '@/components/historyListTypes'
import { ACTIVITY_TYPES } from '@/components/workout/CardioGPSPanel'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CardioSessionModalProps {
  session: WorkoutSummary
  onClose: () => void
  onDeleted: () => void
  onUpdated: (changes: Partial<WorkoutSummary>) => void
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`
  return `${Math.round(meters)} m`
}

function formatPaceText(paceMinKm: number | null | undefined): string {
  if (!paceMinKm || paceMinKm <= 0) return '—'
  const totalSec = Math.round(paceMinKm * 60)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}/km`
}

// ─── Effort options ───────────────────────────────────────────────────────────

const EFFORT_OPTIONS: { value: number; emoji: string; label: string; color: string }[] = [
  { value: 1, emoji: '😴', label: 'Leve', color: '#6b7280' },
  { value: 2, emoji: '😐', label: 'Moderado', color: '#84cc16' },
  { value: 3, emoji: '🙂', label: 'Bom', color: '#22c55e' },
  { value: 4, emoji: '😊', label: 'Intenso', color: '#f97316' },
  { value: 5, emoji: '🔥', label: 'Máximo', color: '#ef4444' },
]

// ─── Metric card ──────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  accent,
  orange,
}: {
  label: string
  value: string
  accent?: boolean
  orange?: boolean
}) {
  const color = accent ? '#22c55e' : orange ? '#f97316' : 'white'
  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-1"
      style={{
        background: accent ? 'rgba(34,197,94,0.08)' : orange ? 'rgba(249,115,22,0.08)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${accent ? 'rgba(34,197,94,0.2)' : orange ? 'rgba(249,115,22,0.2)' : 'rgba(255,255,255,0.06)'}`,
      }}
    >
      <p className="text-[10px] font-black uppercase tracking-widest text-white/40">{label}</p>
      <p className="text-2xl font-black font-mono" style={{ color }}>{value}</p>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CardioSessionModal({
  session,
  onClose,
  onDeleted,
  onUpdated,
}: CardioSessionModalProps) {
  const [activityType, setActivityType] = useState(session.activityType ?? 'running')
  const [effort, setEffort] = useState<number | null>(session.perceivedEffort ?? null)
  const [notes, setNotes] = useState(session.cardioNotes ?? '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useBackHandler(true, onClose)

  const isDirty =
    activityType !== (session.activityType ?? 'running') ||
    effort !== (session.perceivedEffort ?? null) ||
    notes !== (session.cardioNotes ?? '')

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await fetch(`/api/gps/cardio/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activity_type: activityType,
          perceived_effort: effort,
          notes: notes.trim() || null,
        }),
      })
      onUpdated({
        activityType,
        perceivedEffort: effort,
        cardioNotes: notes.trim() || null,
      })
    } finally {
      setSaving(false)
    }
  }, [session.id, activityType, effort, notes, onUpdated])

  const handleDelete = useCallback(async () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    try {
      const resp = await fetch(`/api/gps/cardio/${session.id}`, { method: 'DELETE' })
      const json = await resp.json()
      if (json.ok) onDeleted()
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }, [session.id, confirmDelete, onDeleted])

  const activityInfo = ACTIVITY_TYPES.find(t => t.value === activityType) ?? ACTIVITY_TYPES[0]

  const distM = session.distanceMeters ?? 0
  const totalSec = session.totalTime ?? 0
  const dateText = session.date
    ? new Date(session.date).toLocaleDateString('pt-BR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    : 'Data desconhecida'

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[1200] flex flex-col overflow-hidden"
      style={{ background: 'linear-gradient(180deg, rgba(8,18,12,0.99) 0%, rgba(5,5,5,0.99) 100%)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 pb-3 flex-shrink-0"
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 16px)' }}
      >
        <button
          type="button"
          onClick={onClose}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-neutral-400 active:scale-95 transition-all"
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <ChevronLeft size={18} />
        </button>
        <div className="text-center">
          <p className="text-sm font-black text-white">
            {activityInfo.emoji} {activityInfo.label}
          </p>
          <p className="text-[11px] text-white/40 mt-0.5">{dateText}</p>
        </div>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-95 disabled:opacity-50"
          style={{
            background: confirmDelete ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.07)',
            border: confirmDelete ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.1)',
          }}
          aria-label="Excluir sessão"
        >
          <Trash2 size={16} className={confirmDelete ? 'text-red-400' : 'text-neutral-400'} />
        </button>
      </div>

      {confirmDelete && (
        <div className="mx-4 mb-3 flex-shrink-0 rounded-xl px-3 py-2.5 flex items-center justify-between gap-3" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
          <p className="text-xs text-red-300 font-bold">Confirmar exclusão?</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfirmDelete(false)} className="text-xs text-white/50 px-2 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)' }}>Cancelar</button>
            <button type="button" onClick={handleDelete} disabled={deleting} className="text-xs text-red-400 font-bold px-2 py-1 rounded-lg" style={{ background: 'rgba(239,68,68,0.15)' }}>{deleting ? '...' : 'Excluir'}</button>
          </div>
        </div>
      )}

      <div className="h-px flex-shrink-0" style={{ background: 'rgba(34,197,94,0.1)' }} />

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-5">

        {/* Metrics */}
        <div className="grid grid-cols-2 gap-3">
          <MetricCard label="Distância" value={distM > 0 ? formatDistance(distM) : '—'} accent />
          <MetricCard label="Tempo" value={totalSec > 0 ? formatDuration(totalSec) : '—'} />
          <MetricCard label="Pace Médio" value={formatPaceText(session.avgPaceMinKm)} />
          <MetricCard
            label="Calorias"
            value={(session.caloriesEstimated ?? 0) > 0 ? `~${Math.round(session.caloriesEstimated!)} kcal` : '—'}
            orange
          />
        </div>

        {/* Activity type selector */}
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-2">Tipo de atividade</p>
          <div className="flex gap-2">
            {ACTIVITY_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setActivityType(t.value)}
                className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border transition-all active:scale-95"
                style={{
                  background: activityType === t.value ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.03)',
                  borderColor: activityType === t.value ? 'rgba(34,197,94,0.45)' : 'rgba(255,255,255,0.07)',
                }}
              >
                <span className="text-lg leading-none">{t.emoji}</span>
                <span className="text-[9px] font-black uppercase tracking-wide" style={{ color: activityType === t.value ? '#22c55e' : 'rgba(255,255,255,0.35)' }}>
                  {t.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-white/[0.06]" />

        {/* Perceived effort */}
        <div>
          <p className="text-sm font-black text-white mb-3">Como foi?</p>
          <div className="flex gap-2 justify-between">
            {EFFORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setEffort(effort === opt.value ? null : opt.value)}
                className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-2xl border transition-all active:scale-95"
                style={{
                  background: effort === opt.value ? `${opt.color}20` : 'rgba(255,255,255,0.03)',
                  borderColor: effort === opt.value ? `${opt.color}60` : 'rgba(255,255,255,0.07)',
                  boxShadow: effort === opt.value ? `0 0 14px ${opt.color}30` : 'none',
                }}
              >
                <span className="text-2xl">{opt.emoji}</span>
                <span
                  className="text-[9px] font-black uppercase tracking-wider"
                  style={{ color: effort === opt.value ? opt.color : 'rgba(255,255,255,0.3)' }}
                >
                  {opt.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <p className="text-sm font-black text-white mb-2">
            Observações <span className="text-white/30 font-normal">(opcional)</span>
          </p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Como foi a atividade? Algum detalhe que queira lembrar..."
            rows={3}
            aria-label="Observações"
            className="w-full rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/20 resize-none focus:outline-none"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          />
        </div>

        {/* Save */}
        {isDirty && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded-2xl py-3.5 text-sm font-black text-black transition-all active:scale-95 disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}
          >
            {saving ? 'Salvando...' : '✓ Salvar alterações'}
          </button>
        )}
      </div>
    </div>
  )
}

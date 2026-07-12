'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, MapPin, Satellite } from 'lucide-react'
import { useCardioTracking } from '@/hooks/useCardioTracking'
import { formatDistance, formatPace } from '@/utils/geoUtils'
import RouteMapLeaflet from './RouteMapLeaflet'

interface CardioGPSPanelProps {
  /** If provided, links the track to a workout */
  workoutId?: string
  /** Called after saving the track */
  onSaved?: (trackId: string) => void
  /** Body weight in kg for accurate calorie calculation */
  bodyWeightKg?: number
  /**
   * Standalone mode: no accordion wrapper, full-height layout, post-cardio
   * completion screen with perceived_effort + notes.
   */
  standalone?: boolean
  /** Called when user finishes the post-cardio flow in standalone mode */
  onRequestClose?: () => void
  /**
   * Owner user id. Enables IDB-backed crash recovery — without it,
   * a kill mid-run still drops the GPS trail (legacy behavior).
   */
  userId?: string | null
}

// ─── Utils ────────────────────────────────────────────────────────────────────

/** Format seconds as "HH:MM:SS" or "MM:SS" */
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Human-readable GPS signal bucket based on accuracy (in meters). */
function gpsSignalLabel(accuracy: number | null): { label: string; color: string } {
  if (accuracy === null) return { label: 'Sem sinal', color: '#6b7280' }
  if (accuracy <= 10) return { label: 'Excelente', color: '#22c55e' }
  if (accuracy <= 20) return { label: 'Bom', color: '#84cc16' }
  if (accuracy <= 30) return { label: 'Aceitável', color: '#eab308' }
  return { label: 'Fraco', color: '#ef4444' }
}

const EFFORT_OPTIONS: { value: number; emoji: string; label: string; color: string }[] = [
  { value: 1, emoji: '😴', label: 'Leve', color: '#6b7280' },
  { value: 2, emoji: '😐', label: 'Moderado', color: '#84cc16' },
  { value: 3, emoji: '🙂', label: 'Bom', color: '#22c55e' },
  { value: 4, emoji: '😊', label: 'Intenso', color: '#f97316' },
  { value: 5, emoji: '🔥', label: 'Máximo', color: '#ef4444' },
]

export const ACTIVITY_TYPES: { value: string; emoji: string; label: string }[] = [
  { value: 'running', emoji: '🏃', label: 'Corrida' },
  { value: 'walking', emoji: '🚶', label: 'Caminhada' },
  { value: 'cycling', emoji: '🚴', label: 'Bike' },
  { value: 'swimming', emoji: '🏊', label: 'Natação' },
  { value: 'other', emoji: '⚡', label: 'Outro' },
]

// ─── Post-cardio completion screen ───────────────────────────────────────────

interface CompletionScreenProps {
  trackId: string
  distanceMeters: number
  durationSeconds: number
  paceMinKm: number | null
  caloriesEstimated: number
  onReset: () => void
  onClose?: () => void
}

function CompletionScreen({
  trackId,
  distanceMeters,
  durationSeconds,
  paceMinKm,
  caloriesEstimated,
  onReset,
  onClose,
}: CompletionScreenProps) {
  const [effort, setEffort] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const resp = await fetch(`/api/gps/cardio/${trackId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: notes.trim() || null,
          perceived_effort: effort,
        }),
      })
      // Só marca como salvo se REALMENTE salvou — antes marcava "✓" mesmo em
      // falha (o catch setava saved=true). A rota em si já foi salva no stop();
      // aqui é só notas/esforço, então uma falha não bloqueia o fechar.
      if (resp.ok) setSaved(true)
    } catch {
      // falha de rede — não marca como salvo; o usuário pode tentar de novo.
    } finally {
      setSaving(false)
    }
  }, [trackId, effort, notes])

  const handleClose = useCallback(async () => {
    if (!saved) await handleSave()
    onClose?.()
  }, [saved, handleSave, onClose])

  // Format pace
  const paceText = (() => {
    if (paceMinKm == null || paceMinKm <= 0) return null
    const totalSec = Math.round(paceMinKm * 60)
    const m = Math.floor(totalSec / 60)
    const s = totalSec % 60
    return `${m}:${String(s).padStart(2, '0')}/km`
  })()

  return (
    <div className="flex flex-col gap-5 px-4 py-5">
      {/* Header */}
      <div className="flex flex-col items-center gap-2 pt-2">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center shadow-lg"
          style={{ background: 'rgba(34,197,94,0.15)', border: '2px solid rgba(34,197,94,0.4)' }}
        >
          <span className="text-3xl">✅</span>
        </div>
        <div className="text-center">
          <p className="text-lg font-black text-white">Cardio Concluído!</p>
          <p className="text-xs text-white/40">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3">
        <MetricBig
          label="Distância"
          value={formatDistance(distanceMeters)}
          accent
        />
        <MetricBig
          label="Tempo"
          value={formatDuration(durationSeconds)}
        />
        <MetricBig
          label="Pace Médio"
          value={paceText ?? '—'}
        />
        <MetricBig
          label="Calorias"
          value={caloriesEstimated > 0 ? `~${Math.round(caloriesEstimated)} kcal` : '—'}
          orange
        />
      </div>

      {/* Divider */}
      <div className="h-px bg-white/[0.06]" />

      {/* Como foi? */}
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
        <p className="text-sm font-black text-white mb-2">Observações <span className="text-white/30 font-normal">(opcional)</span></p>
        <textarea
          ref={textareaRef}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Como foi a corrida? Algum detalhe que queira lembrar..."
          rows={3}
          aria-label="Observações do cardio"
          className="w-full rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/20 resize-none focus:outline-none"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        />
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 pb-2">
        <button
          type="button"
          onClick={handleClose}
          disabled={saving}
          className="w-full rounded-2xl py-3.5 text-sm font-black text-black transition-all active:scale-95 disabled:opacity-60"
          style={{
            background: saved
              ? 'linear-gradient(135deg, #22c55e, #16a34a)'
              : 'linear-gradient(135deg, #22c55e, #16a34a)',
          }}
        >
          {saving ? 'Salvando...' : saved ? '✓ Fechar' : 'Salvar e Fechar'}
        </button>
        <button
          type="button"
          onClick={onReset}
          className="w-full rounded-2xl py-3 text-sm font-bold text-white/50 transition-all active:scale-95"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          Novo Cardio
        </button>
      </div>
    </div>
  )
}

function MetricBig({
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
        background: accent
          ? 'rgba(34,197,94,0.08)'
          : orange
            ? 'rgba(249,115,22,0.08)'
            : 'rgba(255,255,255,0.04)',
        border: `1px solid ${accent ? 'rgba(34,197,94,0.2)' : orange ? 'rgba(249,115,22,0.2)' : 'rgba(255,255,255,0.06)'}`,
      }}
    >
      <p className="text-[10px] font-black uppercase tracking-widest text-white/40">{label}</p>
      <p className="text-2xl font-black font-mono" style={{ color }}>{value}</p>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CardioGPSPanel({
  workoutId,
  onSaved,
  bodyWeightKg,
  standalone,
  onRequestClose,
  userId,
}: CardioGPSPanelProps) {
  const {
    isTracking,
    isPaused,
    metrics,
    trackPoints,
    gpsStatus,
    gpsError,
    hasReliableFix,
    isBackgroundTracking,
    start,
    pause,
    resume,
    stop,
    reset,
    recoveredCardio,
    resumeRecoveredCardio,
    discardRecoveredCardio,
    finalizePersistedCardio,
  } = useCardioTracking({ bodyWeightKg, userId })
  const [saving, setSaving] = useState(false)
  const [savedTrackId, setSavedTrackId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedMetrics, setSavedMetrics] = useState<{
    distanceMeters: number
    durationSeconds: number
    paceMinKm: number | null
    caloriesEstimated: number
  } | null>(null)
  const [activityType, setActivityType] = useState('running')

  // Accordion state — only used when NOT in standalone mode
  const [isOpen, setIsOpen] = useState(false)
  useEffect(() => {
    if (isTracking && !standalone) setIsOpen(true)
  }, [isTracking, standalone])

  const handleStart = useCallback(() => {
    setSaveError(null)
    void start()
  }, [start])

  const handleResume = useCallback(() => { void resume() }, [resume])

  const handleStop = useCallback(async () => {
    const result = await stop()
    if (!result) {
      // Sem nenhum ponto de GPS válido (indoor, permissão negada ou sinal fraco
      // o tempo todo). Antes a sessão sumia sem aviso — agora avisa.
      setSaveError('Nenhum ponto de GPS foi registrado — verifique o sinal (uso interno/indoor ou GPS fraco). A sessão não foi salva.')
      return
    }

    setSaving(true)
    setSaveError(null)
    try {
      const resp = await fetch('/api/gps/cardio/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workout_id: workoutId || null,
          activity_type: activityType,
          distance_meters: result.metrics.distanceMeters,
          duration_seconds: result.metrics.durationSeconds,
          avg_pace_min_km: result.metrics.paceMinKm,
          max_speed_kmh: result.metrics.maxSpeedKmh,
          calories_estimated: result.metrics.caloriesEstimated,
          route: result.points.map((p) => ({
            lat: p.latitude,
            lng: p.longitude,
            ts: p.timestamp,
            alt: p.altitude || null,
          })),
          started_at: result.startedAt,
          finished_at: result.finishedAt,
        }),
      })
      const data = await resp.json()
      if (data.ok && data.track?.id) {
        setSavedTrackId(data.track.id)
        setSavedMetrics({
          distanceMeters: result.metrics.distanceMeters,
          durationSeconds: result.metrics.durationSeconds,
          paceMinKm: result.metrics.paceMinKm,
          caloriesEstimated: result.metrics.caloriesEstimated,
        })
        // Server save succeeded — clear the IDB zombie so recovery on next
        // mount doesn't offer to resume a run that already lives in the DB.
        await finalizePersistedCardio()
        onSaved?.(data.track.id)
      } else {
        setSaveError('Não foi possível salvar a rota. Tente novamente.')
      }
    } catch {
      setSaveError('Não foi possível salvar a rota. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }, [stop, workoutId, onSaved, activityType, finalizePersistedCardio])

  const handleReset = useCallback(() => {
    reset()
    setSavedTrackId(null)
    setSavedMetrics(null)
    setSaveError(null)
    setActivityType('running')
  }, [reset])

  // Derived UI state
  const gpsIsDenied = gpsStatus === 'denied'
  const gpsIsUnavailable = gpsStatus === 'unavailable'
  const gpsIsAcquiring =
    isTracking && (gpsStatus === 'requesting-permission' || gpsStatus === 'acquiring' || !hasReliableFix)
  const startDisabled = gpsIsDenied || gpsIsUnavailable
  const signal = gpsSignalLabel(metrics.accuracyMeters)

  // ── Recovery banner: only when we have persisted state AND no live run ─────
  const recoveryBanner = recoveredCardio && !isTracking && !savedTrackId ? (
    <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 mb-3 flex flex-col gap-3">
      <p className="text-sm text-yellow-100">
        🏃 Você tem uma corrida em andamento. Retomar?
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => { void resumeRecoveredCardio() }}
          className="px-3 py-1.5 rounded-lg bg-yellow-500 text-black font-semibold text-sm"
        >
          Retomar
        </button>
        <button
          type="button"
          onClick={() => { void discardRecoveredCardio() }}
          className="px-3 py-1.5 rounded-lg bg-neutral-700 text-white text-sm"
        >
          Descartar
        </button>
      </div>
    </div>
  ) : null

  // ── Shared pieces ──────────────────────────────────────────────────────────

  const gpsBanners = (
    <>
      {gpsIsDenied && (
        <div
          className="mb-3 flex items-start gap-2 rounded-xl p-3 flex-shrink-0"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}
        >
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-red-400" />
          <div className="text-xs text-white/80">
            <p className="font-bold text-red-400">GPS bloqueado</p>
            <p className="mt-0.5 text-white/60">
              {gpsError ?? 'Permissão de localização negada. Ative o GPS nas configurações.'}
            </p>
          </div>
        </div>
      )}
      {gpsIsUnavailable && (
        <div
          className="mb-3 flex items-start gap-2 rounded-xl p-3 flex-shrink-0"
          style={{ background: 'rgba(107,114,128,0.1)', border: '1px solid rgba(107,114,128,0.3)' }}
        >
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-neutral-400" />
          <div className="text-xs text-white/80">
            <p className="font-bold text-neutral-300">GPS indisponível</p>
            <p className="mt-0.5 text-white/60">Este dispositivo não possui GPS.</p>
          </div>
        </div>
      )}
      {gpsError && !gpsIsDenied && !gpsIsUnavailable && (
        <div
          className="mb-3 flex items-start gap-2 rounded-xl p-3 flex-shrink-0"
          style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.3)' }}
        >
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-yellow-400" />
          <div className="text-xs text-white/80">
            <p className="font-bold text-yellow-400">Atenção</p>
            <p className="mt-0.5 text-white/60">{gpsError}</p>
          </div>
        </div>
      )}
      {saveError && (
        <div
          className="mb-3 flex items-start gap-2 rounded-xl p-3 flex-shrink-0"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}
        >
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-red-400" />
          <span className="text-xs text-white/80">{saveError}</span>
        </div>
      )}
      {isTracking && isBackgroundTracking && (
        <div
          className="mb-3 flex items-start gap-2 rounded-xl p-2.5 flex-shrink-0"
          style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)' }}
        >
          <Satellite size={14} className="mt-0.5 flex-shrink-0 text-green-300" />
          <span className="text-[11px] text-white/70">
            Rastreando em segundo plano — pode bloquear a tela ou trocar de app que o GPS continua contando.
          </span>
        </div>
      )}
      {isTracking && !isBackgroundTracking && (
        <div
          className="mb-3 flex items-start gap-2 rounded-xl p-2.5 flex-shrink-0"
          style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)' }}
        >
          <Satellite size={14} className="mt-0.5 flex-shrink-0 text-blue-300" />
          <span className="text-[11px] text-white/70">
            Mantenha o app aberto durante a atividade — o GPS pausa em segundo plano (tela bloqueada ou outro app).
          </span>
        </div>
      )}
    </>
  )

  const gpsSignalBar = isTracking && !gpsIsDenied && !gpsIsUnavailable ? (
    <div
      className="mb-3 flex items-center justify-between rounded-xl px-3 py-2 flex-shrink-0"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
    >
      <div className="flex items-center gap-2">
        <Satellite size={14} style={{ color: signal.color }} />
        <span className="text-xs text-white/60">Sinal GPS</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold" style={{ color: signal.color }}>{signal.label}</span>
        {metrics.accuracyMeters !== null && (
          <span className="text-xs text-white/40">±{Math.round(metrics.accuracyMeters)}m</span>
        )}
      </div>
    </div>
  ) : null

  const metricsGrid = (
    <div className="grid grid-cols-3 gap-2 mb-3 flex-shrink-0">
      <MetricCard label="Distância" value={formatDistance(metrics.distanceMeters)} accent />
      <MetricCard label="Tempo" value={formatDuration(metrics.durationSeconds)} />
      <MetricCard label="Pace" value={formatPace(metrics.paceMinKm)} unit="/km" />
      <MetricCard label="Velocidade" value={`${metrics.currentSpeedKmh}`} unit="km/h" />
      <MetricCard label="Max" value={`${metrics.maxSpeedKmh}`} unit="km/h" />
      <MetricCard label="Calorias" value={`${metrics.caloriesEstimated}`} unit="kcal" />
    </div>
  )

  const activityTypeSelector = !isTracking && !savedTrackId ? (
    <div className="mb-3 flex-shrink-0">
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
            <span
              className="text-[9px] font-black uppercase tracking-wide"
              style={{ color: activityType === t.value ? '#22c55e' : 'rgba(255,255,255,0.35)' }}
            >
              {t.label}
            </span>
          </button>
        ))}
      </div>
      <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-snug text-white/40">
        <MapPin size={11} className="mt-0.5 flex-shrink-0" />
        <span>Rastreamento por GPS (atividades ao ar livre). Para esteira, elíptico ou outro cardio indoor, use o cardio do treino com Tempo e Intensidade — o GPS não registra distância parado.</span>
      </p>
    </div>
  ) : null

  const controls = (
    <div className="flex gap-2 flex-shrink-0">
      {!isTracking && !savedTrackId ? (
        <button
          onClick={handleStart}
          disabled={startDisabled}
          aria-label={startDisabled ? 'GPS indisponível' : 'Iniciar sessão de cardio'}
          className="flex-1 min-h-[44px] rounded-xl py-3 text-sm font-bold text-black transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            background: startDisabled
              ? 'rgba(107,114,128,0.5)'
              : 'linear-gradient(135deg, #22c55e, #16a34a)',
          }}
        >
          {startDisabled ? (
            <span className="inline-flex items-center gap-2">
              <MapPin size={14} /> GPS indisponível
            </span>
          ) : `▶ Iniciar ${ACTIVITY_TYPES.find(t => t.value === activityType)?.label ?? 'Cardio'}`}
        </button>
      ) : isTracking ? (
        <>
          <button
            onClick={isPaused ? handleResume : pause}
            aria-label={isPaused ? 'Retomar sessão' : 'Pausar sessão'}
            className="flex-1 min-h-[44px] rounded-xl py-3 text-sm font-bold text-black transition-all active:scale-95"
            style={{
              background: isPaused
                ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                : 'linear-gradient(135deg, #eab308, #ca8a04)',
            }}
          >
            {isPaused ? '▶ Retomar' : '⏸ Pausar'}
          </button>
          <button
            onClick={handleStop}
            disabled={saving}
            aria-label="Parar e salvar sessão"
            className="min-h-[44px] rounded-xl border px-5 py-3 text-sm font-bold text-red-400 transition-all active:scale-95 disabled:opacity-50"
            style={{ borderColor: 'rgba(239,68,68,0.3)' }}
          >
            {saving ? '...' : '⏹ Parar'}
          </button>
        </>
      ) : savedTrackId && !standalone ? (
        <div className="flex-1 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-green-400">✓</span>
            <span className="text-sm text-white/60">Cardio salvo!</span>
          </div>
          <button
            onClick={handleReset}
            className="rounded-lg px-3 py-1.5 text-xs text-white/40 hover:text-white transition-colors"
            style={{ background: 'rgba(255,255,255,0.05)' }}
          >
            Novo
          </button>
        </div>
      ) : null}
    </div>
  )

  // ── Standalone mode: no accordion, flex layout so map fills screen ─────────
  if (standalone) {
    return (
      <div className="flex flex-col flex-1 min-h-0" style={{ background: 'transparent' }}>
        <style jsx>{`
          @keyframes gps-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
        `}</style>

        {/* Completion screen — scrollable */}
        {savedTrackId && savedMetrics ? (
          <div className="flex-1 overflow-y-auto">
            <CompletionScreen
              trackId={savedTrackId}
              distanceMeters={savedMetrics.distanceMeters}
              durationSeconds={savedMetrics.durationSeconds}
              paceMinKm={savedMetrics.paceMinKm}
              caloriesEstimated={savedMetrics.caloriesEstimated}
              onReset={handleReset}
              onClose={onRequestClose}
            />
          </div>
        ) : (
          /* Tracking / idle view — flex column so map grows */
          <div className="flex flex-col flex-1 min-h-0 px-4 pb-4">
            {/* Live tracking badge */}
            {isTracking && (
              <div className="flex items-center justify-center gap-1.5 py-2 flex-shrink-0">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    background: isPaused ? '#eab308' : hasReliableFix ? '#22c55e' : '#6b7280',
                    animation: isPaused || !hasReliableFix ? 'none' : 'gps-pulse 1.5s ease-in-out infinite',
                  }}
                />
                <span className="text-xs text-white/50 font-semibold">
                  {isPaused ? 'Pausado' : hasReliableFix ? 'Gravando' : 'Buscando GPS...'}
                </span>
              </div>
            )}
            {recoveryBanner}
            {gpsBanners}
            {gpsSignalBar}
            {activityTypeSelector}
            {/* Map grows to fill all available vertical space */}
            <RouteMapLeaflet
              points={trackPoints}
              grow
              live={isTracking}
              acquiring={gpsIsAcquiring}
            />
            {metricsGrid}
            {controls}
          </div>
        )}
      </div>
    )
  }

  // ── Accordion content (inside a workout) — keep the old flat layout ────────
  const content = (
    <div className="px-4 pb-4">
      {recoveryBanner}
      {gpsBanners}
      {gpsSignalBar}
      {activityTypeSelector}
      <RouteMapLeaflet
        points={trackPoints}
        height={200}
        live={isTracking}
        acquiring={gpsIsAcquiring}
      />
      {metricsGrid}
      {controls}
    </div>
  )

  // ── Accordion mode (inside a workout) ─────────────────────────────────────
  return (
    <div
      className="mx-4 rounded-2xl border overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(15,15,15,0.98) 0%, rgba(10,20,15,0.98) 100%)',
        borderColor: isTracking ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.08)',
      }}
    >
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-label={isOpen ? 'Recolher painel de cardio' : 'Expandir painel de cardio'}
        className="w-full min-h-[44px] flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">🏃</span>
          <span className="text-sm font-bold text-white">Cardio</span>
          {isTracking && (
            <div className="flex items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background: isPaused ? '#eab308' : hasReliableFix ? '#22c55e' : '#6b7280',
                  animation: isPaused || !hasReliableFix ? 'none' : 'gps-pulse 1.5s ease-in-out infinite',
                }}
              />
              <span className="text-xs text-white/50">
                {isPaused ? 'Pausado' : hasReliableFix ? 'Gravando' : 'Buscando GPS'}
              </span>
            </div>
          )}
        </div>
        {isOpen
          ? <ChevronUp size={15} className="text-neutral-500" />
          : <ChevronDown size={15} className="text-neutral-500" />}
      </button>

      {isOpen && content}

      <style jsx>{`
        @keyframes gps-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}

function MetricCard({
  label,
  value,
  unit,
  accent,
}: {
  label: string
  value: string
  unit?: string
  accent?: boolean
}) {
  return (
    <div
      className="rounded-xl p-2 text-center"
      style={{
        background: accent ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${accent ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.05)'}`,
      }}
    >
      <p className="text-xs text-white/40">{label}</p>
      <p className={`text-base font-bold ${accent ? 'text-green-400' : 'text-white'}`}>
        {value}
        {unit && <span className="text-xs text-white/30 ml-0.5">{unit}</span>}
      </p>
    </div>
  )
}

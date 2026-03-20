'use client'
/**
 * MealRemindersEditor
 *
 * UI to add/remove/toggle meal reminder push notifications.
 * Each reminder has: time (hour:minute), label, enabled toggle.
 */
import { memo, useCallback, useEffect, useState } from 'react'

interface Reminder {
  id?: string
  hour: number
  minute: number
  label: string
  enabled: boolean
}

interface Props {
  onClose: () => void
}

const PRESETS = [
  { label: 'Café da manhã', hour: 7, minute: 0 },
  { label: 'Almoço', hour: 12, minute: 0 },
  { label: 'Lanche', hour: 15, minute: 0 },
  { label: 'Jantar', hour: 19, minute: 0 },
]

function pad2(n: number) { return String(n).padStart(2, '0') }
function toTime(h: number, m: number) { return `${pad2(h)}:${pad2(m)}` }
function fromTime(t: string): { hour: number; minute: number } {
  const [h, m] = t.split(':').map(Number)
  return { hour: h || 0, minute: m || 0 }
}

const MealRemindersEditor = memo(function MealRemindersEditor({ onClose }: Props) {
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Load existing reminders
  useEffect(() => {
    let cancelled = false
    fetch('/api/nutrition/reminders', { credentials: 'include' })
      .then(r => r.json())
      .then(json => {
        if (cancelled) return
        if (json.ok) setReminders(json.reminders || [])
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const addFromPreset = useCallback((preset: typeof PRESETS[0]) => {
    setReminders(prev => {
      if (prev.some(r => r.hour === preset.hour && r.minute === preset.minute)) return prev
      if (prev.length >= 10) return prev
      return [...prev, { ...preset, enabled: true }]
    })
  }, [])

  const addCustom = useCallback(() => {
    setReminders(prev => {
      if (prev.length >= 10) return prev
      return [...prev, { hour: 8, minute: 0, label: 'Refeição', enabled: true }]
    })
  }, [])

  const removeReminder = useCallback((i: number) => {
    setReminders(prev => prev.filter((_, idx) => idx !== i))
  }, [])

  const updateReminder = useCallback((i: number, patch: Partial<Reminder>) => {
    setReminders(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const res = await fetch('/api/nutrition/reminders', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reminders }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Erro ao salvar')
      setSuccess(true)
      setTimeout(() => onClose(), 800)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }, [reminders, onClose])

  return (
    <div className="rounded-3xl bg-neutral-950 border border-neutral-800 p-5 space-y-4 shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-neutral-400">Notificações</div>
          <div className="mt-0.5 text-base font-semibold text-white">🔔 Lembretes de Refeição</div>
        </div>
        <button type="button" onClick={onClose} className="text-neutral-500 hover:text-white text-xl transition">✕</button>
      </div>

      <div className="text-xs text-neutral-400">
        Você receberá uma notificação push nesses horários para registrar suas refeições.
        Funciona em iPhone mesmo com o app fechado.
      </div>

      {/* Preset chips */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-neutral-500 mb-2">Adicionar rápido</div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(p => (
            <button
              key={p.label}
              type="button"
              onClick={() => addFromPreset(p)}
              className="rounded-xl bg-neutral-900 border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200 hover:border-yellow-500/40 hover:text-yellow-300 transition"
            >
              {p.label} • {toTime(p.hour, p.minute)}
            </button>
          ))}
          <button
            type="button"
            onClick={addCustom}
            disabled={reminders.length >= 10}
            className="rounded-xl bg-neutral-900 border border-dashed border-neutral-700 px-3 py-1.5 text-xs text-neutral-400 hover:border-neutral-500 hover:text-neutral-200 transition disabled:opacity-40"
          >
            + Personalizado
          </button>
        </div>
      </div>

      {/* Reminder list */}
      {loading ? (
        <div className="py-4 text-center text-xs text-neutral-500">Carregando...</div>
      ) : reminders.length === 0 ? (
        <div className="rounded-2xl bg-neutral-900/40 border border-neutral-800 px-4 py-6 text-center text-xs text-neutral-500">
          Nenhum lembrete configurado. Adicione um acima.
        </div>
      ) : (
        <div className="space-y-2">
          {reminders.map((r, i) => (
            <div key={i} className="flex items-center gap-3 rounded-2xl bg-neutral-900/60 border border-neutral-800 px-3 py-2.5">
              {/* Toggle */}
              <button
                type="button"
                onClick={() => updateReminder(i, { enabled: !r.enabled })}
                className={`shrink-0 w-8 h-4 rounded-full border transition-all ${r.enabled ? 'bg-yellow-400 border-yellow-400' : 'bg-neutral-800 border-neutral-700'}`}
              >
                <div className={`w-3 h-3 rounded-full bg-white shadow transition-transform ${r.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>

              {/* Time */}
              <input
                type="time"
                value={toTime(r.hour, r.minute)}
                onChange={e => { const t = fromTime(e.target.value); updateReminder(i, t) }}
                className="w-20 bg-transparent text-sm font-semibold text-white focus:outline-none"
              />

              {/* Label */}
              <input
                type="text"
                value={r.label}
                maxLength={40}
                onChange={e => updateReminder(i, { label: e.target.value })}
                className="flex-1 bg-transparent text-xs text-neutral-300 placeholder-neutral-600 focus:outline-none min-w-0"
                placeholder="Nome do lembrete"
              />

              {/* Delete */}
              <button
                type="button"
                onClick={() => removeReminder(i)}
                className="shrink-0 text-neutral-600 hover:text-red-400 transition text-lg leading-none"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-2xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-200">{error}</div>
      )}
      {success && (
        <div className="rounded-2xl bg-green-500/10 border border-green-500/20 px-4 py-3 text-sm text-green-300">✅ Lembretes salvos!</div>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full h-11 rounded-2xl bg-gradient-to-r from-yellow-400 to-yellow-500 text-black font-semibold text-sm shadow-lg shadow-yellow-500/30 hover:from-yellow-300 hover:to-yellow-400 active:scale-95 transition disabled:opacity-50"
      >
        {saving ? 'Salvando...' : '🔔 Salvar lembretes'}
      </button>
    </div>
  )
})

export default MealRemindersEditor

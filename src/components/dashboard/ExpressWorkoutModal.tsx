'use client'
/**
 * ExpressWorkoutModal
 *
 * Quick-start AI workout in 2 taps: pick time + muscle focus.
 * Uses the same /api/ai/workout-wizard endpoint but skips the multi-step wizard.
 */
import React, { useState } from 'react'
import { X, Zap, Loader2 } from 'lucide-react'

interface WorkoutDraft {
  title: string
  exercises: unknown[]
}

interface Props {
  isOpen: boolean
  onClose: () => void
  onUseDraft: (draft: WorkoutDraft) => void
}

const TIME_OPTIONS = [
  { value: 15, label: '15 min', desc: 'Super rápido' },
  { value: 20, label: '20 min', desc: 'Rápido' },
  { value: 30, label: '30 min', desc: 'Express' },
  { value: 45, label: '45 min', desc: 'Completo' },
]

const FOCUS_OPTIONS = [
  { value: 'balanced', label: 'Corpo Todo', emoji: '💪' },
  { value: 'upper', label: 'Superior', emoji: '🏋️' },
  { value: 'lower', label: 'Inferior', emoji: '🦵' },
  { value: 'push', label: 'Empurrar', emoji: '🫸' },
  { value: 'pull', label: 'Puxar', emoji: '🫷' },
  { value: 'legs', label: 'Pernas', emoji: '🦵' },
]

const EQUIPMENT_OPTIONS = [
  { value: 'gym', label: 'Academia', emoji: '🏟️' },
  { value: 'home', label: 'Casa', emoji: '🏠' },
  { value: 'minimal', label: 'Mínimo', emoji: '🪢' },
]

export default function ExpressWorkoutModal({ isOpen, onClose, onUseDraft }: Props) {
  const [time, setTime] = useState(30)
  const [focus, setFocus] = useState('balanced')
  const [equipment, setEquipment] = useState('gym')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!isOpen) return null

  const handleGenerate = async () => {
    setLoading(true)
    setError('')
    try {
      const answers = {
        goal: 'hypertrophy',
        split: 'full_body',
        daysPerWeek: 3,
        timeMinutes: time,
        equipment,
        level: 'intermediate',
        focus,
        constraints: '',
      }
      const res = await fetch('/api/ai/workout-wizard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers, mode: 'single' }),
      })
      const json = await res.json()
      if (!json.ok) {
        setError(json.error || 'Erro ao gerar treino')
        return
      }
      const draft = json.draft as WorkoutDraft
      if (!draft) {
        setError('Treino não gerado')
        return
      }
      onUseDraft(draft)
      onClose()
    } catch {
      setError('Falha na conexão')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[1500] flex items-end justify-center bg-black/70 backdrop-blur-sm">
      <div
        className="w-full max-w-md rounded-t-3xl overflow-hidden"
        style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(234,179,8,0.15)' }}
            >
              <Zap size={16} className="text-yellow-400" />
            </div>
            <div>
              <p className="font-black text-white text-sm">Treino Express</p>
              <p className="text-xs text-white/30">IA gera seu treino em segundos</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="w-8 h-8 rounded-full bg-neutral-900 flex items-center justify-center text-neutral-400 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-5 pb-6 space-y-4">
          {/* Time */}
          <div className="space-y-2">
            <p className="text-xs font-black text-white/40 uppercase tracking-widest">Tempo disponível</p>
            <div className="grid grid-cols-4 gap-2">
              {TIME_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTime(opt.value)}
                  className="flex flex-col items-center gap-0.5 py-2.5 rounded-xl transition-all"
                  style={{
                    background: time === opt.value ? 'rgba(234,179,8,0.15)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${time === opt.value ? 'rgba(234,179,8,0.4)' : 'rgba(255,255,255,0.06)'}`,
                  }}
                >
                  <span className={`text-sm font-black ${time === opt.value ? 'text-yellow-400' : 'text-white/60'}`}>{opt.label}</span>
                  <span className="text-[9px] text-white/30">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Focus */}
          <div className="space-y-2">
            <p className="text-xs font-black text-white/40 uppercase tracking-widest">Foco muscular</p>
            <div className="grid grid-cols-3 gap-2">
              {FOCUS_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFocus(opt.value)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all"
                  style={{
                    background: focus === opt.value ? 'rgba(234,179,8,0.15)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${focus === opt.value ? 'rgba(234,179,8,0.4)' : 'rgba(255,255,255,0.06)'}`,
                  }}
                >
                  <span className="text-base">{opt.emoji}</span>
                  <span className={`text-xs font-bold truncate ${focus === opt.value ? 'text-yellow-400' : 'text-white/50'}`}>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Equipment */}
          <div className="space-y-2">
            <p className="text-xs font-black text-white/40 uppercase tracking-widest">Equipamento</p>
            <div className="grid grid-cols-3 gap-2">
              {EQUIPMENT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setEquipment(opt.value)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all"
                  style={{
                    background: equipment === opt.value ? 'rgba(234,179,8,0.15)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${equipment === opt.value ? 'rgba(234,179,8,0.4)' : 'rgba(255,255,255,0.06)'}`,
                  }}
                >
                  <span className="text-base">{opt.emoji}</span>
                  <span className={`text-xs font-bold truncate ${equipment === opt.value ? 'text-yellow-400' : 'text-white/50'}`}>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-400 text-center">{error}</p>}

          {/* Generate button */}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            className="w-full py-4 rounded-2xl font-black text-sm text-black disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 60%, #b45309 100%)', boxShadow: '0 4px 20px rgba(234,179,8,0.3)' }}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Gerando treino com IA...
              </>
            ) : (
              <>
                <Zap size={16} />
                Gerar Treino Express
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

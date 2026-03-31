'use client'
/**
 * SupplementAnalysis
 *
 * VIP feature: AI-powered supplement recommendations based on user profile.
 */
import React, { useState } from 'react'
import { FlaskConical, Loader2, Star, ChevronDown, ChevronUp } from 'lucide-react'

interface SupplementRec {
  name: string
  priority: 'essencial' | 'importante' | 'opcional'
  benefit: string
  dosage: string
  timing: string
  cost_level: 'baixo' | 'médio' | 'alto'
  vegan_ok: boolean
}

interface AnalysisResult {
  recommendations: SupplementRec[]
  summary: string
}

const PRIORITY_COLORS = {
  essencial: { bg: 'rgba(234,179,8,0.15)', border: 'rgba(234,179,8,0.4)', text: '#f59e0b', label: 'Essencial' },
  importante: { bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.3)', text: '#60a5fa', label: 'Importante' },
  opcional: { bg: 'rgba(107,114,128,0.1)', border: 'rgba(107,114,128,0.2)', text: '#9ca3af', label: 'Opcional' },
}

const COST_DOTS = { baixo: 1, médio: 2, alto: 3 }

const GOAL_OPTIONS = [
  { value: 'hypertrophy', label: 'Hipertrofia' },
  { value: 'strength', label: 'Força' },
  { value: 'fat_loss', label: 'Emagrecimento' },
  { value: 'conditioning', label: 'Condicionamento' },
  { value: 'health', label: 'Saúde Geral' },
]

const BUDGET_OPTIONS = [
  { value: 'low', label: 'Baixo (<R$200)' },
  { value: 'medium', label: 'Médio (R$200-500)' },
  { value: 'high', label: 'Alto (>R$500)' },
]

const DIET_OPTIONS = [
  { value: 'omnivore', label: 'Onívoro' },
  { value: 'vegetarian', label: 'Vegetariano' },
  { value: 'vegan', label: 'Vegano' },
  { value: 'keto', label: 'Cetogênica' },
]

function SupplementCard({ rec }: { rec: SupplementRec }) {
  const [open, setOpen] = useState(false)
  const colors = PRIORITY_COLORS[rec.priority] || PRIORITY_COLORS.opcional
  const dots = COST_DOTS[rec.cost_level] || 1

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all"
      style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: i < dots ? colors.text : 'rgba(255,255,255,0.1)' }}
              />
            ))}
          </div>
          <span className="text-sm font-black text-white">{rec.name}</span>
          {rec.vegan_ok && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80' }}>🌱 Vegano</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}>{colors.label}</span>
          {open ? <ChevronUp size={12} className="text-white/30" /> : <ChevronDown size={12} className="text-white/30" />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-3 space-y-2">
          <p className="text-xs text-white/70">{rec.benefit}</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl p-2" style={{ background: 'rgba(0,0,0,0.2)' }}>
              <p className="text-[9px] font-black text-white/30 uppercase mb-0.5">Dose</p>
              <p className="text-xs text-white/70">{rec.dosage}</p>
            </div>
            <div className="rounded-xl p-2" style={{ background: 'rgba(0,0,0,0.2)' }}>
              <p className="text-[9px] font-black text-white/30 uppercase mb-0.5">Quando</p>
              <p className="text-xs text-white/70">{rec.timing}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function SupplementAnalysis() {
  const [goal, setGoal] = useState('hypertrophy')
  const [freq, setFreq] = useState(4)
  const [diet, setDiet] = useState('omnivore')
  const [budget, setBudget] = useState('medium')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState('')

  const handleAnalyze = async () => {
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch('/api/ai/supplement-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal, trainingFrequency: freq, dietType: diet, budget }),
      })
      const json = await res.json()
      if (json.ok) {
        setResult(json)
      } else {
        setError(json.error === 'vip_required' ? 'Recurso exclusivo VIP.' : (json.error || 'Erro ao analisar'))
      }
    } catch {
      setError('Falha na conexão')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <FlaskConical size={16} className="text-yellow-500" />
        <h3 className="text-sm font-black text-white">Análise de Suplementação IA</h3>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-black" style={{ background: 'rgba(234,179,8,0.15)', color: '#f59e0b' }}>VIP</span>
      </div>

      {!result && (
        <div className="space-y-3">
          {/* Goal */}
          <div className="space-y-1.5">
            <p className="text-xs font-black text-white/40 uppercase tracking-widest">Objetivo</p>
            <div className="flex flex-wrap gap-1.5">
              {GOAL_OPTIONS.map(g => (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => setGoal(g.value)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                  style={{
                    background: goal === g.value ? 'rgba(234,179,8,0.15)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${goal === g.value ? 'rgba(234,179,8,0.4)' : 'rgba(255,255,255,0.06)'}`,
                    color: goal === g.value ? '#f59e0b' : 'rgba(255,255,255,0.5)',
                  }}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          {/* Frequency */}
          <div className="space-y-1.5">
            <p className="text-xs font-black text-white/40 uppercase tracking-widest">Dias de treino/semana: {freq}</p>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7].map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setFreq(d)}
                  className="w-9 h-9 rounded-xl text-sm font-black transition-all"
                  style={{
                    background: freq === d ? 'rgba(234,179,8,0.15)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${freq === d ? 'rgba(234,179,8,0.4)' : 'rgba(255,255,255,0.06)'}`,
                    color: freq === d ? '#f59e0b' : 'rgba(255,255,255,0.4)',
                  }}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Diet */}
          <div className="space-y-1.5">
            <p className="text-xs font-black text-white/40 uppercase tracking-widest">Dieta</p>
            <div className="flex flex-wrap gap-1.5">
              {DIET_OPTIONS.map(d => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setDiet(d.value)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                  style={{
                    background: diet === d.value ? 'rgba(234,179,8,0.15)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${diet === d.value ? 'rgba(234,179,8,0.4)' : 'rgba(255,255,255,0.06)'}`,
                    color: diet === d.value ? '#f59e0b' : 'rgba(255,255,255,0.5)',
                  }}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Budget */}
          <div className="space-y-1.5">
            <p className="text-xs font-black text-white/40 uppercase tracking-widest">Orçamento mensal</p>
            <div className="flex gap-1.5">
              {BUDGET_OPTIONS.map(b => (
                <button
                  key={b.value}
                  type="button"
                  onClick={() => setBudget(b.value)}
                  className="flex-1 py-2 rounded-xl text-xs font-bold transition-all text-center"
                  style={{
                    background: budget === b.value ? 'rgba(234,179,8,0.15)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${budget === b.value ? 'rgba(234,179,8,0.4)' : 'rgba(255,255,255,0.06)'}`,
                    color: budget === b.value ? '#f59e0b' : 'rgba(255,255,255,0.4)',
                  }}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            type="button"
            onClick={handleAnalyze}
            disabled={loading}
            className="w-full py-3.5 rounded-2xl font-black text-sm text-black flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', boxShadow: '0 4px 16px rgba(234,179,8,0.25)' }}
          >
            {loading ? (
              <><Loader2 size={15} className="animate-spin" />Analisando com IA...</>
            ) : (
              <><Star size={15} />Analisar Suplementação</>
            )}
          </button>
        </div>
      )}

      {result && (
        <div className="space-y-3">
          {/* Summary */}
          <div
            className="rounded-2xl p-3"
            style={{ background: 'rgba(234,179,8,0.05)', border: '1px solid rgba(234,179,8,0.15)' }}
          >
            <p className="text-xs text-white/70 leading-relaxed">{result.summary}</p>
          </div>

          {/* Recommendations */}
          <div className="space-y-2">
            {result.recommendations.map((rec, i) => (
              <SupplementCard key={i} rec={rec} />
            ))}
          </div>

          <button
            type="button"
            onClick={() => setResult(null)}
            className="w-full py-2.5 rounded-xl text-sm font-bold text-white/40 hover:text-white transition-colors"
          >
            Refazer análise
          </button>
        </div>
      )}
    </div>
  )
}

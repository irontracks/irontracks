'use client'

import { useState } from 'react'

type AiSuggestion = {
  food: string
  portion: string
  calories: number
  protein: number
  carbs: number
  fat: number
}

type SmartSuggestionsProps = {
  goals: { calories: number; protein: number; carbs: number; fat: number }
  consumed: { calories: number; protein: number; carbs: number; fat: number }
  onSelect: (text: string) => void
}

export default function SmartSuggestions({ goals, consumed, onSelect }: SmartSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([])
  const [tip, setTip] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  // Check if there are remaining macros worth suggesting
  const remaining = {
    calories: Math.max(0, goals.calories - consumed.calories),
    protein: Math.max(0, goals.protein - consumed.protein),
  }
  const hasGoals = goals.calories > 0
  const worthSuggesting = remaining.calories > 100 || remaining.protein > 10

  const fetchSuggestions = async () => {
    if (loading) return
    setLoading(true)
    setError(null)
    setSuggestions([])
    setTip('')
    setOpen(true)
    try {
      const res = await fetch('/api/ai/nutrition-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goals, consumed }),
      })
      const json = await res.json().catch((): null => null)
      if (!json?.ok) {
        const msg = json?.upgradeRequired ? 'Recurso VIP Pro.' : String(json?.error || 'Falha ao buscar sugestões.')
        setError(msg)
        return
      }
      setSuggestions(json.suggestions || [])
      setTip(json.tip || '')
    } catch {
      setError('Falha na conexão.')
    } finally {
      setLoading(false)
    }
  }

  if (!hasGoals) return null

  return (
    <div>
      {/* Trigger button */}
      {!open && worthSuggesting && (
        <button
          type="button"
          onClick={fetchSuggestions}
          className="
            w-full rounded-2xl border border-purple-500/20 bg-purple-500/8
            px-4 py-3 text-sm text-purple-200
            hover:bg-purple-500/15 hover:border-purple-500/30 transition-all
            flex items-center justify-center gap-2
          "
        >
          <span className="text-base">🧠</span>
          <span>O que comer para bater as metas?</span>
        </button>
      )}

      {/* Suggestions panel */}
      {open && (
        <div className="rounded-2xl border border-purple-500/20 bg-neutral-900/90 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-[0.22em] text-purple-300 flex items-center gap-1.5">
              <span>🧠</span> Sugestões IA
            </div>
            <button
              type="button"
              onClick={() => { setOpen(false); setSuggestions([]); setTip(''); setError(null) }}
              className="text-xs text-neutral-500 hover:text-neutral-300"
            >
              ✕
            </button>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-4 gap-2">
              <span className="animate-spin text-base">⏳</span>
              <span className="text-xs text-neutral-400">Pensando...</span>
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}

          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                onSelect(`${s.portion} ${s.food}`)
                setOpen(false)
              }}
              className="
                w-full text-left rounded-xl border border-neutral-800/50 bg-neutral-800/40
                px-3 py-2.5 hover:bg-neutral-800/60 hover:border-purple-500/20 transition-all
              "
            >
              <div className="flex items-center justify-between">
                <div className="text-sm text-neutral-100 font-medium">{s.food}</div>
                <div className="text-xs text-yellow-400">{s.calories} kcal</div>
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-[10px] text-neutral-400">{s.portion}</span>
                <span className="text-[10px] text-blue-400">P {s.protein}g</span>
                <span className="text-[10px] text-yellow-300">C {s.carbs}g</span>
                <span className="text-[10px] text-red-400">G {s.fat}g</span>
              </div>
            </button>
          ))}

          {tip && (
            <div className="rounded-xl bg-purple-500/10 border border-purple-500/15 px-3 py-2 text-xs text-purple-200 italic">
              💡 {tip}
            </div>
          )}

          {!loading && suggestions.length === 0 && !error && (
            <div className="text-center text-xs text-neutral-400 py-2">
              🎯 Você já atingiu suas metas!
            </div>
          )}
        </div>
      )}
    </div>
  )
}

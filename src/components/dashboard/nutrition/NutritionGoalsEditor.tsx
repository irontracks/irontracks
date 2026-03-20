'use client'

import { memo } from 'react'

type Totals = { calories: number; protein: number; carbs: number; fat: number }

function safeNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

type Props = {
  draft: Totals
  setDraft: (updater: (prev: Totals) => Totals) => void
  saving: boolean
  error: string
  canViewMacros: boolean
  hideVipCtas: boolean
  onSave: () => void
  onClose: () => void
}

const NutritionGoalsEditor = memo(function NutritionGoalsEditor({
  draft,
  setDraft,
  saving,
  error,
  canViewMacros,
  hideVipCtas,
  onSave,
  onClose,
}: Props) {
  return (
    <div className="mt-4 rounded-2xl bg-neutral-950/80 border border-neutral-800 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.45)] ring-1 ring-neutral-800/80">
      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">Calorias (kcal)</div>
          <input
            value={String(draft.calories)}
            onChange={(e) => setDraft((p) => ({ ...p, calories: safeNumber(e.target.value) }))}
            inputMode="numeric"
            className="w-full rounded-2xl bg-neutral-900/90 border border-neutral-800 px-3 py-3 text-neutral-100 font-semibold focus:outline-none focus:ring-1 focus:ring-yellow-500/40"
            placeholder="2000"
            aria-label="Meta de calorias"
          />
        </div>
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">Proteína (g)</div>
          <input
            value={String(draft.protein)}
            onChange={(e) => setDraft((p) => ({ ...p, protein: safeNumber(e.target.value) }))}
            inputMode="numeric"
            className="w-full rounded-2xl bg-neutral-900/90 border border-neutral-800 px-3 py-3 text-neutral-100 font-semibold focus:outline-none focus:ring-1 focus:ring-yellow-500/40 disabled:opacity-40"
            placeholder="150"
            aria-label="Meta de proteína"
            disabled={!canViewMacros}
          />
        </div>
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">Carboidratos (g)</div>
          <input
            value={String(draft.carbs)}
            onChange={(e) => setDraft((p) => ({ ...p, carbs: safeNumber(e.target.value) }))}
            inputMode="numeric"
            className="w-full rounded-2xl bg-neutral-900/90 border border-neutral-800 px-3 py-3 text-neutral-100 font-semibold focus:outline-none focus:ring-1 focus:ring-yellow-500/40 disabled:opacity-40"
            placeholder="200"
            aria-label="Meta de carboidratos"
            disabled={!canViewMacros}
          />
        </div>
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">Gordura (g)</div>
          <input
            value={String(draft.fat)}
            onChange={(e) => setDraft((p) => ({ ...p, fat: safeNumber(e.target.value) }))}
            inputMode="numeric"
            className="w-full rounded-2xl bg-neutral-900/90 border border-neutral-800 px-3 py-3 text-neutral-100 font-semibold focus:outline-none focus:ring-1 focus:ring-yellow-500/40 disabled:opacity-40"
            placeholder="60"
            aria-label="Meta de gordura"
            disabled={!canViewMacros}
          />
        </div>
      </div>
      {error ? <div className="mt-3 text-sm text-red-200">{error}</div> : null}
      {!canViewMacros && !hideVipCtas ? (
        <div className="mt-3 text-xs text-neutral-400">Macros liberado no VIP Pro.</div>
      ) : null}
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-2xl bg-neutral-900/90 border border-neutral-800 px-4 py-2 text-xs font-semibold text-neutral-200 hover:bg-neutral-900 transition"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-2xl bg-yellow-500 px-4 py-2 text-xs font-semibold text-black hover:bg-yellow-400 disabled:opacity-60 shadow-lg shadow-yellow-500/20 active:scale-95 transition duration-300"
        >
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  )
})

export default NutritionGoalsEditor

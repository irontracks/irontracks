'use client'

/**
 * Card da simulação — a AUTORIDADE dos números do chat.
 *
 * A prosa acima dele é do modelo e pode falhar, truncar ou escorregar no
 * significado. Este card é renderizado a partir do `projectMeal` (puro, testado),
 * então é o que o usuário confere. Se a prosa cair, ele sozinho responde a
 * pergunta.
 *
 * O peso de cada item é exibido de propósito: o parser chuta 50g/unidade quando o
 * alimento não declara peso, e "uma pizza grande (50g)" é o tipo de coisa que só o
 * usuário percebe.
 */
import React from 'react'
import { Check, Loader2, Plus } from 'lucide-react'
import type { MealProjection, MacroKey } from '@/lib/nutrition/chatProjection'

export interface SimulationItem {
  label: string
  grams: number
  calories: number
  protein: number
  carbs: number
  fat: number
}

export interface Simulation {
  foodText: string
  /** Nome limpo pro diário/card — nunca a pergunta crua. */
  foodName?: string
  items: SimulationItem[]
  projection: MealProjection
  source: string
}

const MACROS: ReadonlyArray<{ key: MacroKey; label: string; unit: string }> = [
  { key: 'calories', label: 'Calorias', unit: '' },
  { key: 'protein', label: 'Proteína', unit: 'g' },
  { key: 'carbs', label: 'Carbo', unit: 'g' },
  { key: 'fat', label: 'Gordura', unit: 'g' },
]

export default function NutritionSimulationCard({
  sim,
  onLog,
  logging,
  logged,
  canLog,
}: {
  sim: Simulation
  onLog: () => void
  logging: boolean
  logged: boolean
  canLog: boolean
}) {
  const totalGrams = sim.items.reduce((s, i) => s + (Number(i.grams) || 0), 0)

  return (
    <div className="mt-2 rounded-2xl border border-yellow-500/20 bg-yellow-500/[0.04] p-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-widest text-yellow-500">Simulação</div>
          <div className="truncate text-sm font-bold text-white">
            {sim.foodName || sim.foodText}
            {totalGrams > 0 && <span className="ml-1 font-normal text-neutral-400">({Math.round(totalGrams)}g)</span>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-lg font-black leading-none text-white">{sim.projection.calories.add}</div>
          <div className="text-[10px] uppercase tracking-wider text-neutral-500">kcal</div>
        </div>
      </div>

      {/* Breakdown por alimento — onde o peso assumido fica à vista. */}
      {sim.items.length > 1 && (
        <ul className="mt-2 space-y-0.5 border-t border-white/[0.06] pt-2">
          {sim.items.map((it, i) => (
            <li key={`${it.label}-${i}`} className="flex items-baseline justify-between gap-2 text-[11px]">
              <span className="min-w-0 truncate text-neutral-300">
                {it.label}
                {it.grams > 0 && <span className="text-neutral-500"> · {Math.round(it.grams)}g</span>}
              </span>
              <span className="shrink-0 text-neutral-400">{Math.round(it.calories)} kcal</span>
            </li>
          ))}
        </ul>
      )}

      {/* Onde o dia FICA. É isto que responde a pergunta. */}
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-white/[0.06] pt-2">
        {MACROS.map(({ key, label, unit }) => {
          const m = sim.projection[key]
          return (
            <div key={key} className="flex items-baseline justify-between gap-2 text-[11px]">
              <span className="text-neutral-500">{label}</span>
              <span className="tabular-nums">
                <span className={m.over ? 'font-bold text-red-300' : 'font-bold text-neutral-100'}>
                  {m.projected}
                  {unit}
                </span>
                {m.goal !== null && <span className="text-neutral-500">/{m.goal}{unit}</span>}
              </span>
            </div>
          )
        })}
      </div>

      {canLog && (
        <button
          type="button"
          onClick={onLog}
          disabled={logging || logged}
          className="mt-3 inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl bg-yellow-500 px-4 text-sm font-black text-black transition hover:bg-yellow-400 disabled:opacity-60"
        >
          {logged ? (
            <>
              <Check size={15} /> Lançado
            </>
          ) : logging ? (
            <>
              <Loader2 size={15} className="animate-spin" /> Lançando…
            </>
          ) : (
            <>
              <Plus size={15} /> Lançar no diário
            </>
          )}
        </button>
      )}
    </div>
  )
}

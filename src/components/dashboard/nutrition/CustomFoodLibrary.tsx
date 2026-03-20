'use client'
/**
 * CustomFoodLibrary
 *
 * Shows the user's saved custom food products.
 * Each card shows name, macros per 100g, and allows deletion.
 * Also allows clicking a food to populate the input with the product name.
 */
import { memo } from 'react'
import type { CustomFood } from './useCustomFoods'

interface Props {
  foods: CustomFood[]
  loading: boolean
  onUse: (text: string) => void
  onDelete: (id: string) => void
  onScan: () => void
}

const CustomFoodLibrary = memo(function CustomFoodLibrary({ foods, loading, onUse, onDelete, onScan }: Props) {
  if (loading) {
    return (
      <div className="space-y-2 mt-3">
        {[1, 2].map(i => (
          <div key={i} className="h-14 rounded-2xl bg-neutral-900/50 border border-neutral-800 animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="mt-3 space-y-2">
      {foods.length === 0 ? (
        <div className="rounded-2xl bg-neutral-900/40 border border-neutral-800 px-4 py-5 text-center">
          <div className="text-2xl mb-1">🏷️</div>
          <div className="text-sm font-semibold text-white">Nenhum alimento cadastrado</div>
          <div className="text-xs text-neutral-400 mt-1">Fotografe o rótulo de qualquer produto para cadastrá-lo</div>
          <button
            type="button"
            onClick={onScan}
            className="mt-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 px-4 py-2 text-xs font-semibold text-yellow-300 hover:bg-yellow-500/20 transition"
          >
            📷 Escanear primeiro produto
          </button>
        </div>
      ) : (
        foods.map(food => (
          <div
            key={food.id}
            className="group flex items-center gap-3 rounded-2xl bg-neutral-900/60 border border-neutral-800 hover:border-neutral-700 px-4 py-3 transition"
          >
            {/* Tap to use */}
            <button
              type="button"
              onClick={() => onUse(`${Math.round(food.serving_size_g)}g ${food.name}`)}
              className="flex-1 text-left min-w-0"
            >
              <div className="text-sm font-semibold text-white truncate">{food.name}</div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                <span className="text-[11px] text-neutral-400">{Math.round(food.kcal_per100g)} kcal/100g</span>
                <span className="text-[11px] text-blue-400">P {food.protein_per100g.toFixed(1)}g</span>
                <span className="text-[11px] text-orange-400">C {food.carbs_per100g.toFixed(1)}g</span>
                <span className="text-[11px] text-yellow-400">G {food.fat_per100g.toFixed(1)}g</span>
                {food.aliases.length > 0 && (
                  <span className="text-[11px] text-neutral-500">· {food.aliases.slice(0, 2).join(', ')}</span>
                )}
              </div>
            </button>

            {/* Delete */}
            <button
              type="button"
              onClick={() => onDelete(food.id)}
              className="opacity-0 group-hover:opacity-100 shrink-0 text-neutral-600 hover:text-red-400 transition text-lg leading-none"
              title="Excluir alimento"
            >
              ×
            </button>
          </div>
        ))
      )}
    </div>
  )
})

export default CustomFoodLibrary

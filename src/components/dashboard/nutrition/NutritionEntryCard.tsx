'use client'

import { memo } from 'react'

type MealEntry = {
  id: string
  created_at: string
  food_name: string
  calories: number
  protein: number
  carbs: number
  fat: number
}

type EditDraft = {
  food_name: string
  calories: number
  protein: number
  carbs: number
  fat: number
}

type NutritionEntryCardProps = {
  item: MealEntry
  isExpanded: boolean
  onToggleExpand: (id: string) => void
  // Edit
  editingId: string
  editDraft: EditDraft
  editBusy: boolean
  onStartEdit: (item: MealEntry) => void
  onCancelEdit: () => void
  onSaveEdit: () => void
  onEditDraftChange: (updater: (draft: EditDraft) => EditDraft) => void
  // Delete
  confirmDeleteId: string
  entryBusyId: string
  onConfirmDelete: (id: string) => void
  onCancelDelete: () => void
  onDelete: (id: string) => void
}

function formatClock(iso: string) {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function NutritionEntryCard({
  item,
  isExpanded,
  onToggleExpand,
  editingId,
  editDraft,
  editBusy,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onEditDraftChange,
  confirmDeleteId,
  entryBusyId,
  onConfirmDelete,
  onCancelDelete,
  onDelete,
}: NutritionEntryCardProps) {
  const totalMacroG = item.protein + item.carbs + item.fat
  const proteinPct = totalMacroG > 0 ? Math.round((item.protein / totalMacroG) * 100) : 0
  const carbsPct = totalMacroG > 0 ? Math.round((item.carbs / totalMacroG) * 100) : 0
  const fatPct = totalMacroG > 0 ? 100 - proteinPct - carbsPct : 0

  return (
    <div className="rounded-2xl bg-neutral-950/70 border border-neutral-800 ring-1 ring-neutral-800/70 overflow-hidden transition-all duration-300">
      {/* Clickable header */}
      <button
        type="button"
        onClick={() => onToggleExpand(isExpanded ? '' : item.id)}
        className="w-full p-4 flex items-center justify-between gap-3 text-left hover:bg-white/[0.02] active:bg-white/[0.04] transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white truncate">{item.food_name}</div>
          <div className="mt-1 text-xs text-neutral-400">
            {formatClock(item.created_at)} · P {Math.round(item.protein)}g · C {Math.round(item.carbs)}g · G {Math.round(item.fat)}g
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-sm font-semibold text-neutral-200 whitespace-nowrap">{Math.round(item.calories)} kcal</div>
          <svg
            className={`w-4 h-4 text-neutral-500 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-0 border-t border-neutral-800/60 animate-in fade-in slide-in-from-top-1 duration-200">
          {/* Macro stacked bar */}
          <div className="mt-3 h-2.5 rounded-full overflow-hidden flex bg-neutral-800">
            {proteinPct > 0 && <div className="h-full" style={{ width: `${proteinPct}%`, backgroundColor: '#3b82f6' }} />}
            {carbsPct > 0 && <div className="h-full" style={{ width: `${carbsPct}%`, backgroundColor: '#facc15' }} />}
            {fatPct > 0 && <div className="h-full" style={{ width: `${fatPct}%`, backgroundColor: '#ef4444' }} />}
          </div>

          {/* Macro details */}
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-blue-500/8 border border-blue-500/15 p-3">
              <div className="text-[10px] uppercase tracking-wider text-blue-400/70 font-bold">Proteína</div>
              <div className="mt-1 text-base font-bold text-white">{Math.round(item.protein)}g</div>
              <div className="text-[10px] text-neutral-500">{proteinPct}%</div>
            </div>
            <div className="rounded-xl bg-yellow-500/8 border border-yellow-500/15 p-3">
              <div className="text-[10px] uppercase tracking-wider text-yellow-400/70 font-bold">Carboidrato</div>
              <div className="mt-1 text-base font-bold text-white">{Math.round(item.carbs)}g</div>
              <div className="text-[10px] text-neutral-500">{carbsPct}%</div>
            </div>
            <div className="rounded-xl bg-red-500/8 border border-red-500/15 p-3">
              <div className="text-[10px] uppercase tracking-wider text-red-400/70 font-bold">Gordura</div>
              <div className="mt-1 text-base font-bold text-white">{Math.round(item.fat)}g</div>
              <div className="text-[10px] text-neutral-500">{fatPct}%</div>
            </div>
          </div>

          {/* Inline edit form */}
          {editingId === item.id ? (
            <div className="mt-3 space-y-2" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                value={editDraft.food_name}
                onChange={(e) => onEditDraftChange((d) => ({ ...d, food_name: e.target.value }))}
                className="w-full h-9 rounded-xl bg-neutral-800/60 border border-neutral-700/50 px-3 text-sm text-white placeholder:text-neutral-500 outline-none focus:border-yellow-500/40"
                placeholder="Nome da refeição"
              />
              <div className="grid grid-cols-4 gap-1.5">
                {(['calories', 'protein', 'carbs', 'fat'] as const).map((field) => (
                  <div key={field}>
                    <label className="text-[9px] uppercase text-neutral-500 block mb-0.5">
                      {field === 'calories' ? 'Kcal' : field === 'protein' ? 'Prot' : field === 'carbs' ? 'Carb' : 'Gord'}
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={editDraft[field]}
                      onChange={(e) => onEditDraftChange((d) => ({ ...d, [field]: Number(e.target.value) || 0 }))}
                      className="w-full h-8 rounded-lg bg-neutral-800/60 border border-neutral-700/50 px-2 text-xs text-white text-center outline-none focus:border-yellow-500/40"
                    />
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-1.5 justify-end">
                <button
                  type="button"
                  onClick={onCancelEdit}
                  className="h-8 px-3 rounded-xl bg-neutral-900/90 border border-neutral-800 text-xs font-semibold text-neutral-300 hover:bg-neutral-900 transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={editBusy}
                  onClick={onSaveEdit}
                  className="h-8 px-4 rounded-xl bg-yellow-500/20 border border-yellow-500/30 text-xs font-semibold text-yellow-200 hover:bg-yellow-500/30 disabled:opacity-60 transition"
                >
                  {editBusy ? '...' : 'Salvar'}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Calories row + Edit / Remove */}
              <div className="mt-3 flex items-center justify-between">
                <div className="text-xs text-neutral-500">
                  Total: <span className="text-white font-semibold">{Math.round(item.calories)} kcal</span>
                  {' · '}{formatClock(item.created_at)}
                </div>
                <div className="flex items-center gap-1.5">
                  {confirmDeleteId === item.id ? (
                    <>
                      <button
                        type="button"
                        disabled={entryBusyId === item.id}
                        onClick={(e) => { e.stopPropagation(); onDelete(item.id) }}
                        className="h-8 px-3 rounded-xl bg-red-500/20 border border-red-500/30 text-xs font-semibold text-red-200 hover:bg-red-500/30 disabled:opacity-60 transition"
                      >
                        {entryBusyId === item.id ? '...' : 'Sim'}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onCancelDelete() }}
                        className="h-8 px-3 rounded-xl bg-neutral-900/90 border border-neutral-800 text-xs font-semibold text-neutral-300 hover:bg-neutral-900 transition"
                      >
                        Não
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onStartEdit(item) }}
                        className="h-8 px-3 rounded-xl bg-neutral-900/90 border border-neutral-800 text-xs font-semibold text-yellow-400 hover:bg-yellow-500/10 hover:border-yellow-500/20 transition"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        disabled={entryBusyId === item.id}
                        onClick={(e) => { e.stopPropagation(); onConfirmDelete(item.id) }}
                        className="h-8 px-3 rounded-xl bg-neutral-900/90 border border-neutral-800 text-xs font-semibold text-red-400 hover:bg-red-500/10 hover:border-red-500/20 disabled:opacity-60 transition"
                      >
                        {entryBusyId === item.id ? '...' : 'Remover'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default memo(NutritionEntryCard)
export type { MealEntry, EditDraft }

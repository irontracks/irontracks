'use client'

import { memo, useState } from 'react'

type MealItemView = { label: string; grams: number; calories: number; protein: number; carbs: number; fat: number }

type MealEntry = {
  id: string
  created_at: string
  food_name: string
  calories: number
  protein: number
  carbs: number
  fat: number
  items?: MealItemView[] | null
}

// O editor agora gerencia a LISTA DE ALIMENTOS; macros/calorias = soma dos itens.
type EditDraft = {
  food_name: string
  items: MealItemView[]
}

type AddFoodResult =
  | { ok: true; items: MealItemView[] }
  | { ok: false; error?: string; needsAi?: boolean }

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
  /** Resolve um texto de alimento → item(s) (parser/base + IA). */
  onAddFood?: (text: string) => Promise<AddFoodResult>
  // Delete
  confirmDeleteId: string
  entryBusyId: string
  onConfirmDelete: (id: string) => void
  onCancelDelete: () => void
  onDelete: (id: string) => void
  // Story
  onStory?: (item: MealEntry) => void
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
  onAddFood,
  confirmDeleteId,
  entryBusyId,
  onConfirmDelete,
  onCancelDelete,
  onDelete,
  onStory,
}: NutritionEntryCardProps) {
  const totalMacroG = item.protein + item.carbs + item.fat
  const proteinPct = totalMacroG > 0 ? Math.round((item.protein / totalMacroG) * 100) : 0
  const carbsPct = totalMacroG > 0 ? Math.round((item.carbs / totalMacroG) * 100) : 0
  const fatPct = totalMacroG > 0 ? 100 - proteinPct - carbsPct : 0

  // Estado local do "adicionar alimento" no editor.
  const [addText, setAddText] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')

  const draftItems = Array.isArray(editDraft?.items) ? editDraft.items : []
  const draftTotals = draftItems.reduce(
    (a, it) => ({
      calories: a.calories + (Number(it?.calories) || 0),
      protein: a.protein + (Number(it?.protein) || 0),
      carbs: a.carbs + (Number(it?.carbs) || 0),
      fat: a.fat + (Number(it?.fat) || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  )

  const handleAddFood = async () => {
    const text = addText.trim()
    if (!text || adding || !onAddFood) return
    setAdding(true); setAddError('')
    try {
      const res = await onAddFood(text)
      if (res.ok) {
        onEditDraftChange((d) => ({ ...d, items: [...(Array.isArray(d.items) ? d.items : []), ...res.items] }))
        setAddText('')
      } else {
        setAddError(res.error || 'Não reconheci esse alimento.')
      }
    } catch {
      setAddError('Falha ao adicionar.')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="rounded-2xl bg-neutral-950/70 border border-neutral-800 ring-1 ring-neutral-800/70 overflow-hidden transition-all duration-300">
      {/* Clickable header */}
      <button
        type="button"
        aria-label={isExpanded ? 'Recolher detalhes' : 'Expandir detalhes'}
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
            className={`w-4 h-4 text-neutral-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-0 border-t border-neutral-800/60 animate-in fade-in slide-in-from-top-1 duration-200">
          {editingId === item.id ? (
            /* ── Editor de ALIMENTOS (adicionar/remover; macros = soma) ── */
            <div className="mt-3 space-y-3" role="none" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                aria-label="Nome da refeição"
                value={editDraft.food_name}
                onChange={(e) => onEditDraftChange((d) => ({ ...d, food_name: e.target.value }))}
                className="w-full h-9 rounded-xl bg-neutral-800/60 border border-neutral-700/50 px-3 text-sm text-white placeholder:text-neutral-400 outline-none focus:border-yellow-500/40"
                placeholder="Nome da refeição"
              />

              {/* Lista de alimentos */}
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-400 font-semibold mb-1.5">Alimentos</div>
                {draftItems.length === 0 ? (
                  <div className="text-xs text-neutral-500 py-1.5">Nenhum alimento — adicione abaixo.</div>
                ) : (
                  <ul className="space-y-1.5">
                    {draftItems.map((food, i) => (
                      <li key={`${food.label}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-neutral-800/40 border border-neutral-700/40 px-2.5 py-1.5">
                        <div className="min-w-0">
                          <div className="text-xs text-neutral-100 truncate">{food.label}</div>
                          <div className="text-[10px] text-neutral-500">{Math.round(food.calories)} kcal · P{Math.round(food.protein)} C{Math.round(food.carbs)} G{Math.round(food.fat)}</div>
                        </div>
                        <button
                          type="button"
                          aria-label={`Remover ${food.label}`}
                          onClick={() => onEditDraftChange((d) => ({ ...d, items: (Array.isArray(d.items) ? d.items : []).filter((_, idx) => idx !== i) }))}
                          className="shrink-0 w-7 h-7 rounded-lg bg-neutral-900 border border-neutral-700/50 text-red-400 hover:bg-red-500/10 hover:border-red-500/30 flex items-center justify-center text-base leading-none transition"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Adicionar alimento */}
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  aria-label="Adicionar alimento"
                  value={addText}
                  disabled={adding}
                  onChange={(e) => { setAddText(e.target.value); if (addError) setAddError('') }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleAddFood() } }}
                  className="flex-1 h-9 rounded-xl bg-neutral-800/60 border border-neutral-700/50 px-3 text-sm text-white placeholder:text-neutral-400 outline-none focus:border-yellow-500/40 disabled:opacity-60"
                  placeholder="Adicionar alimento (ex.: 200g arroz)"
                />
                <button
                  type="button"
                  onClick={() => void handleAddFood()}
                  disabled={adding || !addText.trim()}
                  className="h-9 px-3 rounded-xl bg-yellow-500/20 border border-yellow-500/30 text-xs font-bold text-yellow-200 hover:bg-yellow-500/30 disabled:opacity-50 transition whitespace-nowrap"
                >
                  {adding ? '...' : '+ Add'}
                </button>
              </div>
              {addError && <div className="text-[11px] text-red-300">{addError}</div>}

              {/* Totais (somente leitura — soma dos itens) */}
              <div className="rounded-xl bg-neutral-800/40 border border-neutral-700/40 px-3 py-2 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold">Total</span>
                <span className="text-xs text-neutral-200 font-semibold">
                  {Math.round(draftTotals.calories)} kcal
                  <span className="ml-2 text-neutral-500 font-normal">P{Math.round(draftTotals.protein)} C{Math.round(draftTotals.carbs)} G{Math.round(draftTotals.fat)}</span>
                </span>
              </div>

              {/* Ações */}
              <div className="flex items-center gap-1.5 justify-end">
                <button
                  type="button"
                  onClick={() => { setAddText(''); setAddError(''); onCancelEdit() }}
                  className="h-8 px-3 rounded-xl bg-neutral-900/90 border border-neutral-800 text-xs font-semibold text-neutral-300 hover:bg-neutral-900 transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={editBusy || draftItems.length === 0}
                  onClick={onSaveEdit}
                  className="h-8 px-4 rounded-xl bg-yellow-500/20 border border-yellow-500/30 text-xs font-semibold text-yellow-200 hover:bg-yellow-500/30 disabled:opacity-60 transition"
                >
                  {editBusy ? '...' : 'Salvar'}
                </button>
              </div>
            </div>
          ) : (
            <>
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
                  <div className="text-[10px] text-neutral-400">{proteinPct}%</div>
                </div>
                <div className="rounded-xl bg-yellow-500/8 border border-yellow-500/15 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-yellow-400/70 font-bold">Carboidrato</div>
                  <div className="mt-1 text-base font-bold text-white">{Math.round(item.carbs)}g</div>
                  <div className="text-[10px] text-neutral-400">{carbsPct}%</div>
                </div>
                <div className="rounded-xl bg-red-500/8 border border-red-500/15 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-red-400/70 font-bold">Gordura</div>
                  <div className="mt-1 text-base font-bold text-white">{Math.round(item.fat)}g</div>
                  <div className="text-[10px] text-neutral-400">{fatPct}%</div>
                </div>
              </div>

              {/* Alimentos da refeição (breakdown por item) */}
              {Array.isArray(item.items) && item.items.length > 0 && (
                <div className="mt-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-400 font-semibold mb-1.5">Alimentos</div>
                  <ul className="space-y-1">
                    {item.items.map((food, i) => (
                      <li key={`${food.label}-${i}`} className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="min-w-0 truncate text-neutral-200">{food.label}</span>
                        <span className="shrink-0 whitespace-nowrap text-neutral-400">
                          <span className="font-semibold text-neutral-100">{Math.round(food.calories)}</span> kcal
                          <span className="ml-2 text-[10px] text-neutral-500">P{Math.round(food.protein)} C{Math.round(food.carbs)} G{Math.round(food.fat)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Calories row + Story / Edit / Remove */}
              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="min-w-0 truncate text-xs text-neutral-400">
                  Total: <span className="text-white font-semibold">{Math.round(item.calories)} kcal</span>
                  {' · '}{formatClock(item.created_at)}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
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
                      {onStory && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onStory(item) }}
                          aria-label="Compartilhar refeição (Story)"
                          className="h-8 px-3 rounded-xl bg-neutral-900/90 border border-neutral-800 text-xs font-semibold text-yellow-400 hover:bg-yellow-500/10 hover:border-yellow-500/20 transition"
                        >
                          Story
                        </button>
                      )}
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

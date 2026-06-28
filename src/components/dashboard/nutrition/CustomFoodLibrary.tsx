'use client'
/**
 * CustomFoodLibrary
 *
 * Shows the user's saved custom food products.
 * Each card shows name, macros per 100g, allows inline editing and deletion.
 * Tapping a food populates the input with the product name.
 */
import { memo, useState, useCallback } from 'react'
import { Pencil, Trash2, Check, X } from 'lucide-react'
import type { CustomFood, CustomFoodDraft } from './useCustomFoods'

interface Props {
  foods: CustomFood[]
  loading: boolean
  onUse: (text: string) => void
  onDelete: (id: string) => void
  onEdit: (id: string, draft: CustomFoodDraft) => Promise<{ ok: boolean; error?: string }>
  onScan: () => void
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const id = `cfl-${label.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <div className="flex flex-col gap-0.5">
      <label htmlFor={id} className="text-[9px] uppercase tracking-widest text-neutral-500">{label}</label>
      <input
        id={id}
        aria-label={label}
        type="number"
        inputMode="decimal"
        min="0"
        step="0.1"
        value={value}
        onChange={e => onChange(Math.max(0, parseFloat(e.target.value) || 0))}
        className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-2 py-1.5 text-[16px] text-white focus:outline-none focus:border-yellow-500/60"
      />
    </div>
  )
}

interface EditState {
  name: string
  aliases: string
  serving_size_g: number
  kcal_per100g: number
  protein_per100g: number
  carbs_per100g: number
  fat_per100g: number
  fiber_per100g: number
}

function foodToEditState(food: CustomFood): EditState {
  return {
    name: food.name,
    aliases: food.aliases.join(', '),
    serving_size_g: food.serving_size_g,
    kcal_per100g: food.kcal_per100g,
    protein_per100g: food.protein_per100g,
    carbs_per100g: food.carbs_per100g,
    fat_per100g: food.fat_per100g,
    fiber_per100g: food.fiber_per100g,
  }
}

const CustomFoodLibrary = memo(function CustomFoodLibrary({ foods, loading, onUse, onDelete, onEdit, onScan }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const startEdit = useCallback((food: CustomFood) => {
    setEditingId(food.id)
    setEditState(foodToEditState(food))
    setEditError(null)
  }, [])

  const cancelEdit = useCallback(() => {
    setEditingId(null)
    setEditState(null)
    setEditError(null)
  }, [])

  const confirmEdit = useCallback(async (id: string) => {
    if (!editState) return
    setSaving(true)
    setEditError(null)
    const draft: CustomFoodDraft = {
      name: editState.name.trim() || 'Alimento',
      aliases: editState.aliases.split(',').map(s => s.trim()).filter(Boolean),
      serving_size_g: editState.serving_size_g,
      kcal_per100g: editState.kcal_per100g,
      protein_per100g: editState.protein_per100g,
      carbs_per100g: editState.carbs_per100g,
      fat_per100g: editState.fat_per100g,
      fiber_per100g: editState.fiber_per100g,
      label_image_url: null,
    }
    const result = await onEdit(id, draft)
    setSaving(false)
    if (!result.ok) { setEditError(result.error ?? 'Erro ao salvar'); return }
    cancelEdit()
  }, [editState, onEdit, cancelEdit])

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
        foods.map(food => {
          const isEditing = editingId === food.id

          return (
            <div
              key={food.id}
              className="rounded-2xl bg-neutral-900/60 border border-neutral-800 overflow-hidden transition"
            >
              {/* ── Card header (always visible) ── */}
              <div className="flex items-center gap-3 px-4 py-3">
                {/* Tap to use */}
                <button
                  type="button"
                  onClick={() => !isEditing && onUse(`${Math.round(food.serving_size_g)}g ${food.name}`)}
                  className="flex-1 text-left min-w-0"
                  disabled={isEditing}
                >
                  <div className="text-sm font-semibold text-white truncate">{food.name}</div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                    <span className="text-[11px] text-neutral-400">{Math.round(food.kcal_per100g)} kcal/100g</span>
                    <span className="text-[11px] text-blue-400">P {food.protein_per100g.toFixed(1)}g</span>
                    <span className="text-[11px] text-orange-400">C {food.carbs_per100g.toFixed(1)}g</span>
                    <span className="text-[11px] text-yellow-400">G {food.fat_per100g.toFixed(1)}g</span>
                  </div>
                </button>

                {/* Action buttons — always visible */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => isEditing ? cancelEdit() : startEdit(food)}
                    className="p-2 rounded-xl text-neutral-500 hover:text-yellow-400 hover:bg-yellow-500/10 transition active:scale-95"
                    aria-label={isEditing ? 'Cancelar edição' : 'Editar alimento'}
                  >
                    {isEditing ? <X size={15} /> : <Pencil size={15} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(food.id)}
                    className="p-2 rounded-xl text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition active:scale-95"
                    aria-label="Excluir alimento"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* ── Inline edit form ── */}
              {isEditing && editState && (
                <div className="px-4 pb-4 border-t border-neutral-800 space-y-3 pt-3">
                  {/* Name */}
                  <div className="flex flex-col gap-0.5">
                    <label htmlFor={`cfl-name-${food.id}`} className="text-[9px] uppercase tracking-widest text-neutral-500">Nome</label>
                    <input
                      id={`cfl-name-${food.id}`}
                      aria-label="Nome do alimento"
                      type="text"
                      value={editState.name}
                      onChange={e => setEditState(s => s ? { ...s, name: e.target.value } : s)}
                      className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-2 py-1.5 text-xs text-white focus:outline-none focus:border-yellow-500/60"
                    />
                  </div>

                  {/* Aliases */}
                  <div className="flex flex-col gap-0.5">
                    <label htmlFor={`cfl-aliases-${food.id}`} className="text-[9px] uppercase tracking-widest text-neutral-500">Apelidos (separados por vírgula)</label>
                    <input
                      id={`cfl-aliases-${food.id}`}
                      type="text"
                      value={editState.aliases}
                      aria-label="Apelidos do alimento"
                      placeholder="ex: whey, proteína"
                      onChange={e => setEditState(s => s ? { ...s, aliases: e.target.value } : s)}
                      className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-2 py-1.5 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-yellow-500/60"
                    />
                  </div>

                  {/* Macros grid */}
                  <div className="grid grid-cols-2 gap-2">
                    <NumField label="Porção padrão (g)" value={editState.serving_size_g} onChange={v => setEditState(s => s ? { ...s, serving_size_g: v } : s)} />
                    <NumField label="Kcal / 100g" value={editState.kcal_per100g} onChange={v => setEditState(s => s ? { ...s, kcal_per100g: v } : s)} />
                    <NumField label="Proteína / 100g" value={editState.protein_per100g} onChange={v => setEditState(s => s ? { ...s, protein_per100g: v } : s)} />
                    <NumField label="Carbs / 100g" value={editState.carbs_per100g} onChange={v => setEditState(s => s ? { ...s, carbs_per100g: v } : s)} />
                    <NumField label="Gordura / 100g" value={editState.fat_per100g} onChange={v => setEditState(s => s ? { ...s, fat_per100g: v } : s)} />
                    <NumField label="Fibra / 100g" value={editState.fiber_per100g} onChange={v => setEditState(s => s ? { ...s, fiber_per100g: v } : s)} />
                  </div>

                  {editError && <p className="text-xs text-red-400">{editError}</p>}

                  <button
                    type="button"
                    onClick={() => confirmEdit(food.id)}
                    disabled={saving}
                    className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-black text-black transition active:scale-95 disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg,#facc15 0%,#eab308 100%)' }}
                  >
                    <Check size={14} />
                    {saving ? 'Salvando…' : 'Salvar alterações'}
                  </button>
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
})

export default CustomFoodLibrary

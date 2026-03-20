'use client'

import { useState, useCallback } from 'react'
import type { FavoriteMeal } from './useFavoriteMeals'

type Props = {
  favorites: FavoriteMeal[]
  loading: boolean
  onSelect: (mealText: string) => void
  onDelete: (id: string) => void
  onSave: (name: string, mealText: string) => Promise<boolean>
  currentInput: string
}

export default function FavoriteMeals({ favorites, loading, onSelect, onDelete, onSave, currentInput }: Props) {
  const [savingName, setSavingName] = useState('')
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState('')

  const hasMealToSave = currentInput.trim().length > 0
  const canAddMore = favorites.length < 10

  const handleSave = async () => {
    if (!savingName.trim() || !currentInput.trim() || saving) return
    setSaving(true)
    const ok = await onSave(savingName.trim(), currentInput.trim())
    setSaving(false)
    if (ok) {
      setSavingName('')
      setShowSaveForm(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (deletingId) return
    setDeletingId(id)
    await onDelete(id)
    setDeletingId('')
  }

  if (loading) return null

  return (
    <div className="space-y-2">
      {/* Save current input as favorite */}
      {hasMealToSave && canAddMore && (
        <div>
          {!showSaveForm ? (
            <button
              type="button"
              onClick={() => setShowSaveForm(true)}
              className="flex items-center gap-1.5 text-[11px] text-neutral-400 hover:text-yellow-400 transition-colors"
            >
              <span>⭐</span>
              <span>Salvar como favorita</span>
            </button>
          ) : (
            <div className="flex items-center gap-2 mt-2">
              <input
                autoFocus
                value={savingName}
                onChange={(e) => setSavingName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
                placeholder="Nome da favorita..."
                maxLength={60}
                className="flex-1 rounded-xl bg-neutral-900/90 border border-neutral-800 px-3 py-2 text-xs text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-yellow-500/40"
              />
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !savingName.trim()}
                className="rounded-xl bg-yellow-500 px-3 py-2 text-xs font-semibold text-black hover:bg-yellow-400 disabled:opacity-50 transition"
              >
                {saving ? '...' : '⭐'}
              </button>
              <button
                type="button"
                onClick={() => { setShowSaveForm(false); setSavingName('') }}
                className="rounded-xl bg-neutral-800 px-3 py-2 text-xs text-neutral-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      )}

      {/* List of saved favorites */}
      {favorites.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 mb-1.5">Favoritas</div>
          <div className="flex flex-wrap gap-1.5">
            {favorites.map((fav) => (
              <div
                key={fav.id}
                className="group flex items-center gap-1 rounded-xl bg-yellow-500/8 border border-yellow-500/15 px-2.5 py-1.5 hover:bg-yellow-500/15 transition-colors"
              >
                <button
                  type="button"
                  onClick={() => onSelect(fav.meal_text)}
                  className="text-xs text-yellow-200 font-medium max-w-[120px] truncate"
                  title={fav.meal_text}
                >
                  ⭐ {fav.name}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(fav.id)}
                  disabled={deletingId === fav.id}
                  className="ml-0.5 text-[10px] text-neutral-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                  title="Remover favorita"
                >
                  {deletingId === fav.id ? '...' : '×'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

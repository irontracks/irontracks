'use client'

import React, { useCallback } from 'react'
import { ArrowLeft, Save } from 'lucide-react'
import { Reorder } from 'framer-motion'
import { SortableWorkoutItem } from './SortableWorkoutItem'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { reassignWorkoutDaysByOrder } from '@/utils/workout/reassignDaysByOrder'

export type EditWorkoutListItem = {
  id: string
  title: string
  sort_order: number
}

interface EditWorkoutListModalProps {
  editListDraft: EditWorkoutListItem[]
  setEditListDraft: React.Dispatch<React.SetStateAction<EditWorkoutListItem[]>>
  savingListEdits: boolean
  onSave: (items: EditWorkoutListItem[]) => Promise<void>
  onClose: () => void
}

export function EditWorkoutListModal({
  editListDraft,
  setEditListDraft,
  savingListEdits,
  onSave,
  onClose,
}: EditWorkoutListModalProps) {
  // WCAG 2.4.3 + 2.1.2 — focus trap + Escape (ignora se está salvando)
  const handleEscape = useCallback(() => {
    if (!savingListEdits) onClose()
  }, [savingListEdits, onClose])
  const focusTrapRef = useFocusTrap(true, handleEscape)

  // Arrastar reescreve o dia no título seguindo a nova ordem (a ordem manda). O
  // ajuste é aplicado no RASCUNHO, não no save — o usuário vê o dia mudar na hora
  // e ainda pode cancelar. Editar o título à mão continua livre.
  const handleReorder = useCallback((next: EditWorkoutListItem[]) => {
    setEditListDraft(reassignWorkoutDaysByOrder(next))
  }, [setEditListDraft])

  return (
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center p-4 pt-safe"
      role="button"
      tabIndex={-1}
      aria-label="Fechar modal"
      style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(16px)' }}
      onClick={() => !savingListEdits && onClose()}
      onKeyDown={(e) => { if (e.key === 'Escape' && !savingListEdits) onClose() }}
    >
      {/* stopPropagation impede clique no painel de propagar para o backdrop (que fecha) */}
      <div
        role="presentation"
        className="w-full max-w-2xl"
        onClick={(e) => e.stopPropagation()}
      >
      <div
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-list-title"
        className="w-full rounded-2xl overflow-hidden"
        style={{
          background: 'rgba(10,10,10,0.99)',
          border: '1px solid rgba(234,179,8,0.2)',
          boxShadow: '0 0 40px rgba(234,179,8,0.07), 0 32px 80px rgba(0,0,0,0.7)',
        }}
      >
        <div
          className="p-4 flex items-center justify-between gap-3"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="min-w-0">
            <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Treinos</div>
            <div id="edit-list-title" className="text-white font-black text-lg truncate">Organizar</div>
            <div className="text-xs text-neutral-400">Arraste para reordenar e edite os títulos.</div>
            <div className="text-[11px] text-yellow-500/80 mt-0.5">Os dias (SEG, TER…) acompanham a ordem.</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={savingListEdits}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-neutral-400 hover:text-white transition-all active:scale-95 disabled:opacity-50"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
            aria-label="Voltar"
            title="Voltar"
          >
            <ArrowLeft size={18} />
          </button>
        </div>

        <div className="p-4 space-y-2 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {editListDraft.length === 0 ? (
            <div className="text-sm text-neutral-400">Nenhum treino para organizar.</div>
          ) : (
            <Reorder.Group axis="y" values={editListDraft} onReorder={handleReorder} className="space-y-2">
              {editListDraft.map((it, idx) => (
                <SortableWorkoutItem
                  key={it.id}
                  item={it}
                  index={idx}
                  saving={savingListEdits}
                  onChangeTitle={(id, val) => {
                    setEditListDraft((prev) => prev.map((x) => (x.id === id ? { ...x, title: val } : x)))
                  }}
                />
              ))}
            </Reorder.Group>
          )}
        </div>

        <div
          className="p-4 flex items-center justify-between gap-3"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={savingListEdits}
            className="min-h-[44px] px-4 py-3 rounded-xl text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-white/[0.05] disabled:opacity-50"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={savingListEdits || editListDraft.length === 0}
            onClick={async () => {
              await onSave(editListDraft)
            }}
            className="min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest hover:bg-yellow-400 inline-flex items-center gap-2 disabled:opacity-60"
          >
            <Save size={16} />
            Salvar
          </button>
        </div>
      </div>
      </div>
    </div>
  )
}

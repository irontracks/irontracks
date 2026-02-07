'use client'

import React, { useEffect } from 'react'
import { X } from 'lucide-react'
import type { WhatsNewEntry } from '@/content/whatsNew'

type Props = {
  isOpen: boolean
  entry: WhatsNewEntry | null
  onClose: () => void
}

export default function WhatsNewModal({ isOpen, entry, onClose }: Props) {
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      onClose()
    }
    try {
      window.addEventListener('keydown', onKeyDown)
    } catch {}
    return () => {
      try {
        window.removeEventListener('keydown', onKeyDown)
      } catch {}
    }
  }, [isOpen, onClose])

  if (!isOpen || !entry) return null

  const items = Array.isArray(entry.items) ? entry.items : []

  return (
    <div className="fixed inset-0 z-[1350] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe">
      <div className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Novidades</div>
            <div className="text-white font-black text-lg truncate">{entry.title}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-3 max-h-[75vh] overflow-y-auto custom-scrollbar">
          <div className="text-xs text-neutral-400 font-bold">
            {entry.dateIso}
          </div>

          <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-4">
            {items.length ? (
              <ul className="space-y-2 text-sm text-neutral-200">
                {items.map((it, idx) => (
                  <li key={`${entry.id}-${idx}`} className="flex gap-2">
                    <span className="text-yellow-500 font-black">•</span>
                    <span className="min-w-0">{it}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-neutral-400">Sem atualizações listadas.</div>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[44px] rounded-xl bg-yellow-500 text-black font-black hover:opacity-90"
          >
            Entendi
          </button>
        </div>
      </div>
    </div>
  )
}


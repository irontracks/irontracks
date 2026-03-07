'use client'

import React, { useEffect } from 'react'
import { X } from 'lucide-react'
import type { WhatsNewEntry } from '@/content/whatsNew'

type UpdateNotification = {
  id: string
  version?: string | null
  title: string
  description: string
  releaseDate?: string | null
  release_date?: string | null
}

type Props = {
  isOpen: boolean
  entry?: WhatsNewEntry | null
  update?: UpdateNotification | null
  onClose: () => void
}

export default function WhatsNewModal({ isOpen, entry, update, onClose }: Props) {
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

  const safeEntry = entry && typeof entry === 'object' ? entry : null
  const safeUpdate = update && typeof update === 'object' ? update : null
  if (!isOpen || (!safeEntry && !safeUpdate)) return null

  const items = Array.isArray(safeEntry?.items) ? safeEntry?.items ?? [] : []
  const rawDescription = String(safeUpdate?.description || '').trim()
  const descriptionLines = rawDescription
    ? rawDescription.split('\n').map((line) => line.trim()).filter(Boolean)
    : []
  const dateLabel =
    String(safeUpdate?.releaseDate || safeUpdate?.release_date || safeEntry?.dateIso || '').trim()
  const title = String(safeUpdate?.title || safeEntry?.title || '').trim()
  const versionLabel = String(safeUpdate?.version || '').trim()

  return (
    <div className="fixed inset-0 z-[1350] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe">
      <div className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Novidades</div>
            <div className="text-white font-black text-lg truncate">{title}</div>
            {versionLabel ? (
              <div className="text-xs text-neutral-400 font-bold">v{versionLabel}</div>
            ) : null}
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
            {dateLabel}
          </div>

          <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-4">
            {safeUpdate ? (
              descriptionLines.length > 1 ? (
                <ul className="space-y-2 text-sm text-neutral-200">
                  {descriptionLines.map((it, idx) => (
                    <li key={`${safeUpdate.id}-${idx}`} className="flex gap-2">
                      <span className="text-yellow-500 font-black">•</span>
                      <span className="min-w-0">{it}</span>
                    </li>
                  ))}
                </ul>
              ) : rawDescription ? (
                <div className="text-sm text-neutral-200">{rawDescription}</div>
              ) : (
                <div className="text-sm text-neutral-400">Sem atualizações listadas.</div>
              )
            ) : items.length ? (
              <ul className="space-y-2 text-sm text-neutral-200">
                {items.map((it, idx) => (
                  <li key={`${safeEntry?.id}-${idx}`} className="flex gap-2">
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

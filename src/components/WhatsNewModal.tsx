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
    } catch { }
    return () => {
      try {
        window.removeEventListener('keydown', onKeyDown)
      } catch { }
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
    <div className="fixed inset-0 z-[1350] flex items-center justify-center p-4 pt-safe" style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(16px)' }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl" style={{ background: 'rgba(12,12,12,0.99)', border: '1px solid rgba(234,179,8,0.22)', boxShadow: '0 0 40px rgba(234,179,8,0.10), 0 30px 80px rgba(0,0,0,0.65)' }}>
        <div className="px-5 pt-5 pb-4 flex items-center justify-between gap-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] mb-0.5" style={{ color: '#f59e0b' }}>Novidades</div>
            <div className="text-white font-black text-lg truncate">{title}</div>
            {versionLabel ? (
              <div className="text-xs text-neutral-400 font-bold">v{versionLabel}</div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-xl text-neutral-400 hover:text-white inline-flex items-center justify-center flex-shrink-0 transition-colors"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-3 max-h-[75vh] overflow-y-auto custom-scrollbar">
          <div className="text-xs text-neutral-400 font-bold">
            {dateLabel}
          </div>

          <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
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
            className="w-full min-h-[48px] rounded-xl font-black text-black text-sm active:scale-[0.98] transition-all"
            style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 60%, #b45309 100%)', boxShadow: '0 4px 16px rgba(234,179,8,0.3)' }}
          >
            Entendi
          </button>
        </div>
      </div>
    </div>
  )
}

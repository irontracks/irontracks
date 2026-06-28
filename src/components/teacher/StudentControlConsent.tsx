'use client'

import { useState } from 'react'
import { Gamepad2, X, Check, Loader2 } from 'lucide-react'

interface StudentControlConsentProps {
  teacherName: string
  onAccept: () => Promise<void>
  onReject: () => Promise<void>
}

export function StudentControlConsent({ teacherName, onAccept, onReject }: StudentControlConsentProps) {
  const [loading, setLoading] = useState<'accept' | 'reject' | null>(null)

  const handle = async (action: 'accept' | 'reject') => {
    setLoading(action)
    try {
      if (action === 'accept') await onAccept()
      else await onReject()
    } finally {
      setLoading(null)
    }
  }

  return (
    <div
      className="mx-3 mb-2 rounded-2xl px-4 py-3 flex items-center gap-3 animate-in slide-in-from-top duration-300"
      style={{
        background: 'rgba(245,158,11,0.12)',
        border: '1px solid rgba(245,158,11,0.35)',
        boxShadow: '0 4px 20px rgba(245,158,11,0.15)',
      }}
    >
      <div
        className="w-9 h-9 flex-shrink-0 rounded-xl flex items-center justify-center"
        style={{ background: 'rgba(245,158,11,0.2)' }}
      >
        <Gamepad2 size={18} className="text-amber-400" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-black text-white leading-snug">
          Prof. <span className="text-amber-300">{teacherName}</span> quer controlar seu treino
        </p>
        <p className="text-[10px] text-white/40 mt-0.5">Ele poderá anotar séries e editar exercícios</p>
      </div>

      <div className="flex gap-1.5 flex-shrink-0">
        <button
          type="button"
          disabled={loading !== null}
          onClick={() => handle('reject')}
          className="w-11 h-11 rounded-xl flex items-center justify-center transition-all active:scale-95 disabled:opacity-50"
          style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}
          aria-label="Recusar controle"
        >
          {loading === 'reject' ? <Loader2 size={14} className="text-red-400 animate-spin" /> : <X size={14} className="text-red-400" />}
        </button>
        <button
          type="button"
          disabled={loading !== null}
          onClick={() => handle('accept')}
          className="w-11 h-11 rounded-xl flex items-center justify-center transition-all active:scale-95 disabled:opacity-50"
          style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)' }}
          aria-label="Aceitar controle"
        >
          {loading === 'accept' ? <Loader2 size={14} className="text-green-400 animate-spin" /> : <Check size={14} className="text-green-400" />}
        </button>
      </div>
    </div>
  )
}

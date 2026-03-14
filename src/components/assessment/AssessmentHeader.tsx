'use client'

import { Upload, User, X } from 'lucide-react'
import { isIosNative } from '@/utils/platform'

type AssessmentHeaderProps = {
  onCreate: () => void
  onShowHistory: () => void
  onScan: () => void
  importing: boolean
  studentId: string | null | undefined
  onClose?: () => void
  scanInputRef: React.RefObject<HTMLInputElement | null>
  onScanFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void
}

export const AssessmentHeader = ({
  onCreate,
  onShowHistory,
  onScan,
  importing,
  studentId,
  onClose,
  scanInputRef,
  onScanFileChange,
}: AssessmentHeaderProps) => {
  const isIosNativeApp = isIosNative()
  const scanDisabled = importing || !studentId
  return (
    <div
      className="rounded-2xl border p-6 mb-6 relative overflow-hidden"
      style={{
        background: 'linear-gradient(160deg, rgba(20,18,10,0.9) 0%, rgba(12,12,12,0.95) 40%)',
        borderColor: 'rgba(234,179,8,0.15)',
        boxShadow: '0 8px 32px -8px rgba(0,0,0,0.6), inset 0 1px 0 rgba(234,179,8,0.1)',
      }}
    >
      {/* Gold shimmer top line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-500/60 to-transparent" />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 relative z-10">
        <div className="flex items-center">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center mr-3 shrink-0"
            style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.2)' }}
          >
            <User className="w-5 h-5 text-yellow-500" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Avaliações Físicas</h1>
            <p className="text-neutral-500 text-sm">Gerencie as avaliações e acompanhe a evolução</p>
          </div>
        </div>
        <div className="w-full sm:w-auto flex items-center gap-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 flex-1 sm:flex-none">
            <button
              onClick={onCreate}
              className="w-full min-h-[44px] px-4 py-2 rounded-xl text-black font-black shadow-lg shadow-yellow-500/20 hover:shadow-yellow-500/30 transition-all duration-300 active:scale-95 btn-gold-animated"
            >
              + Nova Avaliação
            </button>
            <button
              onClick={onShowHistory}
              className="w-full min-h-[44px] px-4 py-2 rounded-xl border text-neutral-200 font-bold hover:text-yellow-400 hover:border-yellow-500/40 transition-all duration-300 active:scale-95"
              style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
            >
              Ver Histórico
            </button>
            {!isIosNativeApp ? (
              <button
                onClick={onScan}
                disabled={scanDisabled}
                className={
                  scanDisabled
                    ? 'w-full min-h-[44px] px-4 py-2 rounded-xl text-neutral-600 border border-dashed border-neutral-800 cursor-not-allowed font-bold'
                    : 'w-full min-h-[44px] px-4 py-2 rounded-xl border border-dashed text-neutral-300 font-bold hover:border-yellow-500/50 hover:text-yellow-400 transition-all duration-300 active:scale-95'
                }
                style={!scanDisabled ? { background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.12)' } : undefined}
              >
                <span className="inline-flex items-center justify-center gap-2">
                  <Upload className="w-4 h-4" />
                  {importing ? 'Importando...' : 'Importar Foto/PDF'}
                </span>
              </button>
            ) : null}
          </div>
          {!onClose ? (
            <button
              onClick={() => {
                if (typeof window !== 'undefined') window.history.back()
              }}
              className="shrink-0 w-11 h-11 rounded-xl border text-neutral-400 hover:text-white hover:border-yellow-500/40 transition-all duration-300 active:scale-95 flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
              title="Fechar"
              type="button"
            >
              <X className="w-5 h-5" />
            </button>
          ) : null}
          {!isIosNativeApp ? (
            <input
              ref={scanInputRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="hidden"
              onChange={onScanFileChange}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}

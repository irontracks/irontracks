'use client'

import { Upload, User, X } from 'lucide-react'

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
  return (
    <div className="bg-neutral-800 rounded-xl border border-neutral-700 p-6 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        <div className="flex items-center">
          <User className="w-8 h-8 text-yellow-500 mr-3" />
          <div>
            <h1 className="text-xl font-black">Avaliações Físicas</h1>
            <p className="text-neutral-400 text-sm">Gerencie as avaliações e acompanhe a evolução</p>
          </div>
        </div>
        <div className="w-full sm:w-auto flex items-center gap-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 flex-1 sm:flex-none">
            <button
              onClick={onCreate}
              className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-yellow-500 text-black font-black shadow-lg shadow-yellow-500/20 hover:bg-yellow-400 transition-all duration-300 active:scale-95"
            >
              + Nova Avaliação
            </button>
            <button
              onClick={onShowHistory}
              className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-800 transition-all duration-300 active:scale-95"
            >
              Ver Histórico
            </button>
            <button
              onClick={onScan}
              disabled={importing || !studentId}
              className={
                importing || !studentId
                  ? 'w-full min-h-[44px] px-4 py-2 rounded-xl bg-neutral-900 text-neutral-500 border border-dashed border-neutral-800 cursor-not-allowed font-bold'
                  : 'w-full min-h-[44px] px-4 py-2 rounded-xl bg-neutral-900 border border-dashed border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-800 hover:border-yellow-500 hover:text-yellow-500 transition-all duration-300 active:scale-95'
              }
            >
              <span className="inline-flex items-center justify-center gap-2">
                <Upload className="w-4 h-4" />
                {importing ? 'Importando...' : 'Importar Foto/PDF'}
              </span>
            </button>
          </div>
          {!onClose ? (
            <button
              onClick={() => {
                if (typeof window !== 'undefined') window.history.back()
              }}
              className="shrink-0 w-11 h-11 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 hover:bg-neutral-800 transition-all duration-300 active:scale-95 flex items-center justify-center"
              title="Fechar"
              type="button"
            >
              <X className="w-5 h-5" />
            </button>
          ) : null}
          <input
            ref={scanInputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            onChange={onScanFileChange}
          />
        </div>
      </div>
    </div>
  )
}

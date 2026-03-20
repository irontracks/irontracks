'use client'
/**
 * NutritionPDFExport
 *
 * "Salvar PDF" button that opens the export in a popup window
 * so the browser's native Print → Save as PDF dialog handles generation.
 * Zero dependencies.
 */
import { memo, useCallback, useState } from 'react'

interface Props {
  dateKey: string
  /** If true, trigger print immediately after opening (for one-click flow) */
  autoPrint?: boolean
}

const NutritionPDFExport = memo(function NutritionPDFExport({ dateKey, autoPrint = false }: Props) {
  const [busy, setBusy] = useState(false)

  const handleExport = useCallback(() => {
    setBusy(true)
    const params = new URLSearchParams({ date: dateKey })
    if (autoPrint) params.set('autoprint', '1')
    const url = `/api/nutrition/export-pdf?${params.toString()}`
    const popup = window.open(url, '_blank', 'width=900,height=700,menubar=no,toolbar=no,scrollbars=yes')
    // If popup was blocked, fall back to new tab
    if (!popup) window.open(url, '_blank')
    // Reset busy after a short delay
    setTimeout(() => setBusy(false), 1500)
  }, [dateKey, autoPrint])

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={busy}
      title="Salvar diário como PDF"
      className={`
        inline-flex items-center gap-1.5 rounded-xl
        border border-neutral-700/50 bg-neutral-800/60
        px-3 py-1.5 text-xs font-medium text-neutral-300
        hover:bg-neutral-800 hover:text-white hover:border-neutral-600
        active:scale-95 transition-all duration-200
        disabled:opacity-50 disabled:cursor-not-allowed
      `}
    >
      {busy ? (
        <>
          <span className="animate-spin text-sm">⏳</span>
          <span>Gerando...</span>
        </>
      ) : (
        <>
          <span>📄</span>
          <span>Salvar PDF</span>
        </>
      )}
    </button>
  )
})

export default NutritionPDFExport

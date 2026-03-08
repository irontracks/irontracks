'use client'

import { useEffect } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { getErrorMessage } from '@/utils/errorMessage'
import { logError } from '@/lib/logger'

export default function AssessmentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { logError('AssessmentError', error) }, [error])

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-4 animate-pulse">
        <AlertCircle size={32} className="text-red-500" />
      </div>
      <h2 className="text-xl font-bold text-white mb-2">Erro na Avaliação</h2>
      <p className="text-neutral-400 mb-6 max-w-sm text-sm">
        Não foi possível carregar a avaliação. Tente novamente.
      </p>
      <div className="bg-black/50 p-3 rounded-xl mb-6 w-full max-w-md text-left border border-red-900/30">
        <p className="text-red-400 font-mono text-xs break-all">{getErrorMessage(error)}</p>
      </div>
      <button onClick={reset} className="flex items-center gap-2 bg-yellow-500 text-black px-5 py-2.5 rounded-xl font-bold hover:bg-yellow-400 transition-all active:scale-95">
        <RefreshCw size={18} />
        Tentar Novamente
      </button>
    </div>
  )
}

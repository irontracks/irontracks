'use client'

import { useEffect } from 'react'
import { AlertCircle, RefreshCw, LogIn } from 'lucide-react'
import { getErrorMessage } from '@/utils/errorMessage'

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const errorMessage = String(getErrorMessage(error) || '')
  useEffect(() => {
    try {
      const lower = errorMessage.toLowerCase()
      const shouldAutoReload =
        lower.includes('chunkloaderror') ||
        lower.includes('loading chunk') ||
        lower.includes('failed to fetch dynamically imported module')
      if (!shouldAutoReload) return

      const key = 'irontracks.dashboard.error.autoreload.v2'
      const seen = window.sessionStorage.getItem(key) || ''
      if (seen === '1') return
      window.sessionStorage.setItem(key, '1')
      window.location.reload()
    } catch {}
  }, [errorMessage])

  return (
    <div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mb-6 animate-pulse">
        <AlertCircle size={40} className="text-red-500" />
      </div>

      <h1 className="text-2xl font-black text-white mb-2 uppercase tracking-tight">Ops! Algo deu errado.</h1>
      <p className="text-neutral-400 mb-8 max-w-sm">Se isso persistir, recarregue o app ou volte para o login.</p>

      <div className="bg-black/50 p-4 rounded-xl mb-6 w-full max-w-md overflow-x-auto text-left border border-red-900/30">
        <p className="text-red-400 font-mono text-xs break-all">{String(errorMessage || error?.toString?.() || 'Erro desconhecido')}</p>
      </div>

      <div className="w-full max-w-md grid grid-cols-1 gap-3">
        <button
          type="button"
          onClick={() => {
            try {
              reset()
            } catch {}
            try {
              window.location.reload()
            } catch {}
          }}
          className="flex items-center justify-center gap-2 bg-yellow-500 text-black px-6 py-3 rounded-xl font-black hover:bg-yellow-400 transition-all active:scale-95"
        >
          <RefreshCw size={20} />
          Recarregar Aplicativo
        </button>

        <button
          type="button"
          onClick={() => {
            try {
              window.location.href = '/?next=/dashboard'
            } catch {}
          }}
          className="flex items-center justify-center gap-2 bg-neutral-900 border border-neutral-800 text-white px-6 py-3 rounded-xl font-black hover:bg-neutral-800 transition-all active:scale-95"
        >
          <LogIn size={20} />
          Ir para o Login
        </button>
      </div>
    </div>
  )
}

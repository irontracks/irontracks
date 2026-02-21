'use client';

import { AlertCircle, RefreshCw } from 'lucide-react';
import { getErrorMessage } from '@/utils/errorMessage'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body className="bg-neutral-950 text-white">
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
            <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mb-6">
                <AlertCircle size={40} className="text-red-500" />
            </div>
            
            <h1 className="text-2xl font-black text-white mb-2 uppercase tracking-tight">
                Erro Crítico
            </h1>
            
            <p className="text-neutral-400 mb-8 max-w-sm">
                Ocorreu um erro fatal no carregamento inicial.
            </p>

            <div className="bg-black/50 p-4 rounded-xl mb-8 w-full max-w-md overflow-x-auto text-left border border-red-900/30">
                <p className="text-red-400 font-mono text-xs break-all">
                    {getErrorMessage(error) || "Unknown Error"}
                </p>
            </div>

            <button
                onClick={() => window.location.reload()}
                className="flex items-center gap-2 bg-yellow-500 text-black px-6 py-3 rounded-xl font-bold hover:bg-yellow-400 transition-all active:scale-95"
            >
                <RefreshCw size={20} />
                Recarregar Tudo
            </button>
        </div>
      </body>
    </html>
  );
}

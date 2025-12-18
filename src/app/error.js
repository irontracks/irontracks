'use client';

import { useEffect } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function Error({ error, reset }) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Next.js App Error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mb-6 animate-pulse">
        <AlertCircle size={40} className="text-red-500" />
        </div>
        
        <h1 className="text-2xl font-black text-white mb-2 uppercase tracking-tight">
        Erro no Aplicativo
        </h1>
        
        <p className="text-neutral-400 mb-8 max-w-sm">
        O Next.js encontrou um erro inesperado.
        </p>

        <div className="bg-black/50 p-4 rounded-xl mb-8 w-full max-w-md overflow-x-auto text-left border border-red-900/30">
        <p className="text-red-400 font-mono text-xs break-all">
            {error?.message || "Erro desconhecido"}
        </p>
        {error?.digest && (
            <p className="text-neutral-600 font-mono text-[10px] mt-2">
                Digest: {error.digest}
            </p>
        )}
        </div>

        <button
        onClick={() => reset()}
        className="flex items-center gap-2 bg-yellow-500 text-black px-6 py-3 rounded-xl font-bold hover:bg-yellow-400 transition-all active:scale-95"
        >
        <RefreshCw size={20} />
        Tentar Novamente
        </button>
    </div>
  );
}

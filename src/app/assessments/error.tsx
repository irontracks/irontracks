'use client';

import { useEffect } from 'react';
import { AlertCircle, RefreshCw, ArrowLeft } from 'lucide-react';
import { getErrorMessage } from '@/utils/errorMessage'
import { logError } from '@/lib/logger'
import { useRouter } from 'next/navigation';

export default function AssessmentsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    const router = useRouter();

    useEffect(() => {
        logError('AssessmentsError', error);
    }, [error]);

    return (
        <div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mb-6 animate-pulse">
                <AlertCircle size={40} className="text-red-500" />
            </div>

            <h1 className="text-2xl font-black text-white mb-2 uppercase tracking-tight">
                Erro na Avaliação
            </h1>

            <p className="text-neutral-400 mb-8 max-w-sm">
                Não foi possível carregar os dados da avaliação física.
            </p>

            <div className="bg-black/50 p-4 rounded-xl mb-8 w-full max-w-md overflow-x-auto text-left border border-red-900/30">
                <p className="text-red-400 font-mono text-xs break-all">
                    {getErrorMessage(error) || "Erro desconhecido"}
                </p>
            </div>

            <div className="flex gap-3">
                <button
                    onClick={() => router.back()}
                    className="flex items-center gap-2 bg-neutral-800 text-white px-5 py-3 rounded-xl font-bold hover:bg-neutral-700 transition-all active:scale-95 border border-neutral-700"
                >
                    <ArrowLeft size={18} />
                    Voltar
                </button>
                <button
                    onClick={() => reset()}
                    className="flex items-center gap-2 bg-yellow-500 text-black px-5 py-3 rounded-xl font-bold hover:bg-yellow-400 transition-all active:scale-95"
                >
                    <RefreshCw size={18} />
                    Tentar Novamente
                </button>
            </div>
        </div>
    );
}

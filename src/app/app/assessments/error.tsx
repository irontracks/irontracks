'use client';

import { useEffect } from 'react';
import { AlertCircle, RefreshCw, ArrowLeft } from 'lucide-react';
import { logError } from '@/lib/logger'
import { useRouter } from 'next/navigation';
import { CodigoDoErro } from '@/components/errors/CodigoDoErro'

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

            <CodigoDoErro digest={error.digest} />

            <div className="flex gap-3">
                <button
                    onClick={() => router.back()}
                    aria-label="Voltar"
                    className="flex items-center gap-2 bg-neutral-800 text-white px-5 py-3 rounded-xl font-bold hover:bg-neutral-700 transition-all active:scale-95 border border-neutral-700"
                >
                    <ArrowLeft size={18} />
                    Voltar
                </button>
                <button
                    onClick={() => reset()}
                    aria-label="Tentar novamente"
                    className="flex items-center gap-2 bg-yellow-500 text-black px-5 py-3 rounded-xl font-bold hover:bg-yellow-400 transition-all active:scale-95"
                >
                    <RefreshCw size={18} />
                    Tentar Novamente
                </button>
            </div>
        </div>
    );
}

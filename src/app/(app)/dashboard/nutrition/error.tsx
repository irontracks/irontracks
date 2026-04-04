'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, RotateCcw } from 'lucide-react'

export default function NutritionError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const router = useRouter()

  useEffect(() => {
    console.error('[NutritionError]', error)
  }, [error])

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-30 border-b border-neutral-800/60 bg-neutral-950/80 backdrop-blur pt-safe">
        <div className="mx-auto w-full max-w-md px-4 pb-3 pt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="h-10 w-10 grid place-items-center rounded-xl bg-neutral-900/60 border border-neutral-800/60 hover:bg-neutral-900 transition"
            aria-label="Voltar"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="text-[15px] font-semibold tracking-tight">Nutrition Console</div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-5 text-center">
        <div className="text-5xl">😬</div>
        <div>
          <div className="text-white font-black text-lg">Não foi possível carregar</div>
          <p className="text-neutral-400 text-sm mt-1">
            Ocorreu um erro ao carregar a nutrição. Tente novamente.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="h-10 px-4 rounded-xl text-sm font-bold text-neutral-400 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 transition"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={reset}
            className="h-10 px-4 rounded-xl text-sm font-black text-black bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 transition flex items-center gap-2"
          >
            <RotateCcw size={14} />
            Tentar novamente
          </button>
        </div>
      </div>
    </div>
  )
}

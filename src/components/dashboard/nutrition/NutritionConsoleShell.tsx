'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

export default function NutritionConsoleShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  const router = useRouter()

  const goBack = () => {
    try {
      if (typeof window !== 'undefined' && window.history.length > 1) router.back()
      else router.push('/dashboard')
    } catch {
      router.push('/dashboard')
    }
  }

  return (
    <div className="min-h-dvh bg-neutral-950 text-white">
      <div className="sticky top-0 z-30 border-b border-neutral-800/60 bg-neutral-950/80 backdrop-blur">
        <div className="mx-auto w-full max-w-md px-4 py-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={goBack}
            className="h-10 w-10 grid place-items-center rounded-xl bg-neutral-900/60 border border-neutral-800/60 hover:bg-neutral-900 transition"
            aria-label="Voltar"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold tracking-tight truncate">{title}</div>
            {subtitle ? <div className="text-xs text-neutral-400 truncate">{subtitle}</div> : null}
          </div>
          <div className="w-10" />
        </div>
      </div>

      <div className="mx-auto w-full max-w-md px-4 pb-28 pt-4">{children}</div>
    </div>
  )
}

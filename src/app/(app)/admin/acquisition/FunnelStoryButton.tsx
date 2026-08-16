'use client'

/**
 * Entrada do Story de métricas, na página que já é o lar do funil.
 *
 * O composer é carregado sob demanda (`next/dynamic`, sem SSR): ele arrasta
 * framer-motion e o canvas do editor, e esta página é SSR com consultas
 * pesadas — não faz sentido pagar esse bundle para quem só veio ler a tabela.
 */

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { Share2 } from 'lucide-react'

const MetricsStoryComposer = dynamic(() => import('@/components/MetricsStoryComposer'), { ssr: false })

export function FunnelStoryButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 h-11 px-4 rounded-xl bg-yellow-500 text-black text-[11px] font-bold uppercase tracking-wider hover:bg-yellow-400 transition-colors active:scale-95"
      >
        <Share2 size={15} />
        Gerar story
      </button>

      <MetricsStoryComposer open={open} onClose={() => setOpen(false)} />
    </>
  )
}

'use client'

import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { FullscreenPortal } from '@/components/stories/FullscreenPortal'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { useFocusTrap } from '@/hooks/useFocusTrap'

type Props = {
  children: ReactNode
  onClose: () => void
}

export default function BodyMap3DModal({ children, onClose }: Props) {
  const focusTrapRef = useFocusTrap(true, onClose)
  useBodyScrollLock(true)

  return <FullscreenPortal>
    <div className="fixed inset-0 z-[2400] h-[100dvh] bg-black pt-safe pb-safe" role="presentation">
      <div ref={focusTrapRef} role="dialog" aria-modal="true" aria-labelledby="muscle-map-3d-title" className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-black text-white">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-neutral-800 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-yellow-500">Mapa muscular</p>
            <h2 id="muscle-map-3d-title" className="truncate text-lg font-black">Visualização 3D</h2>
          </div>
          <button type="button" onClick={onClose} className="tap-44 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-200" aria-label="Fechar mapa muscular 3D">
            <X size={20} />
          </button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col p-3 sm:p-5">
          {children}
        </div>
      </div>
    </div>
  </FullscreenPortal>
}

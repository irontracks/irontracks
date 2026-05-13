/**
 * MothersDayModal — celebratory popup shown once per user during the active
 * Mother's Day window. Image generated via Gemini Imagen 4 (see
 * `scripts/gen-image.mjs`) and stored in `public/seasonal/`.
 *
 * Wiring example (e.g. in `DashboardModals.tsx`):
 *   const { isOpen, close } = useSeasonalCampaign({
 *     id: 'mothersDay2026',
 *     activeFrom: '2026-05-07',
 *     activeUntil: '2026-05-12',
 *     userId,
 *     userSettingsApi,
 *   })
 *   {isOpen && <MothersDayModal onClose={close} />}
 */
'use client'

import { useEffect } from 'react'
import Image from 'next/image'
import { ArrowLeft } from 'lucide-react'
import { useFocusTrap } from '@/hooks/useFocusTrap'

interface Props {
  onClose: () => void
  /** Override default image src (e.g. for A/B variants). */
  imageSrc?: string
  /** Override CTA action — defaults to closing the modal. */
  onCtaClick?: () => void
  /** CTA label. */
  ctaLabel?: string
}

export default function MothersDayModal({
  onClose,
  imageSrc = '/seasonal/mothers-day-2026.webp',
  onCtaClick,
  ctaLabel = 'Treinar agora',
}: Props) {
  // WCAG 2.4.3 + 2.1.2 — focus trap + Escape
  const focusTrapRef = useFocusTrap(true, onClose)

  // Legacy useEffect kept as no-op for ABI parity (the hook above replaces it).
  useEffect(() => { /* handled by useFocusTrap */ }, [onClose])

  const handleCta = onCtaClick ?? onClose

  return (
    <div
      className="fixed inset-0 z-[1350] flex items-center justify-center p-4 pt-safe"
      style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(16px)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Feliz Dia das Mães"
    >
      <div
        ref={focusTrapRef}
        className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl relative"
        style={{
          background: 'rgba(12,12,12,0.99)',
          border: '1px solid rgba(244,114,182,0.28)',
          boxShadow:
            '0 0 40px rgba(244,114,182,0.18), 0 30px 80px rgba(0,0,0,0.65)',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-9 h-9 rounded-xl text-white/80 hover:text-white inline-flex items-center justify-center transition-colors"
          style={{
            background: 'rgba(0,0,0,0.5)',
            border: '1px solid rgba(255,255,255,0.15)',
            backdropFilter: 'blur(4px)',
          }}
          aria-label="Voltar"
          title="Voltar"
        >
          <ArrowLeft size={18} />
        </button>

        <div className="relative w-full" style={{ aspectRatio: '3 / 4' }}>
          <Image
            src={imageSrc}
            alt="Ilustração comemorativa de Feliz Dia das Mães"
            fill
            sizes="(max-width: 640px) 100vw, 384px"
            priority
            className="object-cover"
          />
        </div>

        <div className="p-5 space-y-3">
          <p className="text-sm text-neutral-300 text-center leading-relaxed">
            O exemplo é todo dia — mas essa semana é especial.
            <br />
            <span className="text-white font-bold">Que tal um treino dedicado a ela?</span>
          </p>

          <button
            type="button"
            onClick={handleCta}
            className="w-full min-h-[48px] rounded-xl font-black text-black text-sm active:scale-[0.98] transition-all"
            style={{
              background:
                'linear-gradient(135deg, #f472b6 0%, #ec4899 60%, #be185d 100%)',
              boxShadow: '0 4px 16px rgba(244,114,182,0.35)',
            }}
          >
            {ctaLabel}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[40px] rounded-xl font-bold text-neutral-400 hover:text-white text-xs transition-colors"
          >
            Mais tarde
          </button>
        </div>
      </div>
    </div>
  )
}

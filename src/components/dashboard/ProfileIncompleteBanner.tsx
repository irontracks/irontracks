'use client'

type ProfileIncompleteBannerProps = {
  onComplete: () => void
}

export const ProfileIncompleteBanner = ({ onComplete }: ProfileIncompleteBannerProps) => {
  return (
    <div className="bg-neutral-800 border border-yellow-500/30 rounded-xl p-4 flex items-start justify-between gap-3">
      <div>
        <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Perfil incompleto</div>
        <div className="text-sm text-neutral-300 mt-1">Complete seu nome de exibição para personalizar sua conta.</div>
      </div>
      <button
        type="button"
        onClick={onComplete}
        className="shrink-0 bg-yellow-500 text-black font-black px-4 py-2 rounded-xl active:scale-95 transition-transform"
      >
        Terminar cadastro
      </button>
    </div>
  )
}

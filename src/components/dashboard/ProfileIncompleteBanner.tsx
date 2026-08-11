'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { X } from 'lucide-react'
import { UserSettings } from '@/schemas/settings'
import { getProfileCompletenessScore } from '@/schemas/settings'

type ProfileIncompleteBannerProps = {
  settings?: UserSettings | null
  onComplete: () => void
}

/** Enquanto dispensado, o aviso some. Uma semana é tempo de sobra pra intenção mudar. */
const DISMISS_KEY = 'irontracks.profileBanner.dismissedUntil'
const DISMISS_DAYS = 7

/**
 * Aviso de perfil incompleto.
 *
 * Duas coisas que ele NÃO faz mais, e por quê:
 *
 * 1. **Não usa vermelho.** Vermelho é a cor de erro e de ação destrutiva. Perfil
 *    incompleto não é erro — é sugestão. Abrir um app de treino e receber alerta
 *    vermelho comunica "você está falhando" antes de qualquer coisa, e em produto
 *    de performance humana isso trabalha contra o usuário.
 * 2. **Não persegue.** Aparecia em Treinos, Comunidade, Nutrição e VIP, sem forma
 *    de dispensar. Agora vive só no dashboard (ver StudentDashboard) e tem "×".
 */
/** Assina o localStorage como o que ele é: estado EXTERNO ao React.
 *  `useState` + `useEffect` aqui significaria setState síncrono dentro de efeito
 *  (render em cascata, e a regra `react-hooks/set-state-in-effect` reprova). */
const dismissStore = {
  ouvintes: new Set<() => void>(),
  subscribe(fn: () => void) {
    dismissStore.ouvintes.add(fn)
    // `storage` cobre a mesma chave alterada em outra aba.
    if (typeof window !== 'undefined') window.addEventListener('storage', fn)
    return () => {
      dismissStore.ouvintes.delete(fn)
      if (typeof window !== 'undefined') window.removeEventListener('storage', fn)
    }
  },
  emitir() { dismissStore.ouvintes.forEach((fn) => fn()) },
  snapshot(): boolean {
    try {
      const until = Number(localStorage.getItem(DISMISS_KEY) || 0)
      return Number.isFinite(until) && until > Date.now()
    } catch { return false }
  },
  /** No servidor não há storage — e o banner não deve piscar antes da hidratação. */
  snapshotServidor(): boolean { return true },
  dispensar() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 86_400_000))
    } catch { /* sem storage: some nesta sessão, volta na próxima */ }
    dismissStore.emitir()
  },
}

export const ProfileIncompleteBanner = ({ settings, onComplete }: ProfileIncompleteBannerProps) => {
  const { score, missingFields } = getProfileCompletenessScore(settings)
  const dispensado = useSyncExternalStore(
    dismissStore.subscribe,
    dismissStore.snapshot,
    dismissStore.snapshotServidor,
  )

  const dispensar = useCallback(() => { dismissStore.dispensar() }, [])

  // Don't show banner if profile is ≥90% complete
  if (score >= 90) return null
  if (dispensado) return null

  const firstMissing = missingFields.slice(0, 2).join(', ')
  const extra = missingFields.length > 2 ? ` e mais ${missingFields.length - 2}` : ''

  return (
    <div className="rounded-2xl border p-4 flex items-center gap-4 bg-yellow-500/5 border-yellow-500/20">
      {/* Completion ring */}
      <div className="relative flex-shrink-0 w-12 h-12">
        <svg width="48" height="48" className="-rotate-90">
          <circle cx="24" cy="24" r="18" fill="none" stroke="#262626" strokeWidth="3" />
          <circle
            cx="24" cy="24" r="18" fill="none"
            stroke="#facc15"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 18}`}
            strokeDashoffset={`${2 * Math.PI * 18 * (1 - score / 100)}`}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[11px] font-black text-yellow-400">{score}%</span>
        </div>
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-black uppercase tracking-widest mb-0.5 text-yellow-400">
          Complete seu perfil
        </p>
        <p className="text-xs text-neutral-400 leading-snug truncate">
          {firstMissing ? `Falta: ${firstMissing}${extra}` : 'Adicione mais informações para cálculos mais precisos.'}
        </p>
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={onComplete}
        className="shrink-0 font-black text-[11px] uppercase tracking-wider px-3 py-2 rounded-xl active:scale-95 transition-all bg-yellow-500 text-black hover:bg-yellow-400"
      >
        Ver perfil
      </button>

      <button
        type="button"
        onClick={dispensar}
        aria-label="Dispensar aviso por 7 dias"
        className="shrink-0 -mr-1 p-1.5 rounded-lg text-neutral-400 hover:text-neutral-300 active:scale-95 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

'use client'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import { clearSessionBackup } from '@/utils/auth/sessionBackup'
import { readBounce, getBounceStorage, resetBounce } from '@/lib/auth/bootBounce'

// Module-level flag: true after the first LoadingScreen has been shown in this
// browser session. Subsequent mounts skip the splash-in animation so the logo
// appears instantly, preventing the "IRONTRACKS appears twice" double-blink on iOS.
let splashHasPlayed = false

const LoadingScreen = () => {
    // Capture before the effect sets it, so the FIRST mount gets the animation.
    const shouldAnimate = !splashHasPlayed
    // Safety valve: if still mounted after 8 s, it means we are stuck in a
    // redirect loop (e.g. failed Apple Sign-In left an inconsistent localStorage).
    // Show a soft offline / retry hint instead of looping indefinitely.
    //
    // ⚠️ Só o cronômetro NÃO bastava, e falhava exatamente no caso que ele
    // existe para cobrir: num ping-pong `/` ↔ `/dashboard` cada volta é uma
    // navegação COMPLETA, o componente morre e o `setTimeout` renasce do zero.
    // Com voltas de ~5 s (medido em produção) os 8 s nunca chegavam e o usuário
    // ficava piscando para sempre — a única saída era desinstalar o app.
    // Por isso o segundo gatilho lê o contador de ricochete, que vive no
    // storage e SOBREVIVE às recargas: houve ricochete recente, o socorro
    // aparece de imediato, sem esperar cronômetro nenhum.
    const [stuck, setStuck] = useState(false)

    useEffect(() => {
        splashHasPlayed = true
        let hadBounce = false
        try {
            hadBounce = readBounce(getBounceStorage(), Date.now()).count > 0
        } catch { /* sem storage: vale o cronômetro cheio */ }
        // Ricochete recente encurta a espera a zero em vez de marcar o estado
        // aqui: `setStuck` síncrono no corpo do efeito dispara render em
        // cascata (e o lint reprova), e decidir no `useState` inicializador
        // divergiria do servidor, que nunca tem storage — mismatch de hidratação.
        const t = setTimeout(() => setStuck(true), hadBounce ? 0 : 8000)
        return () => clearTimeout(t)
    }, [])

    if (stuck) {
        return (
            <div className="fixed inset-0 z-50 bg-neutral-950 flex flex-col items-center justify-center gap-4 px-8">
                <p className="text-neutral-400 text-sm text-center">
                    Não foi possível carregar o app.<br />
                    Verifique sua conexão e tente novamente.
                </p>
                <button
                    className="mt-2 px-6 py-2 rounded-full bg-amber-500 text-black text-sm font-bold"
                    onClick={() => {
                        try { localStorage.removeItem('it.logged_in') } catch { }
                        clearSessionBackup()
                        // Recomeço deliberado do usuário: zera o contador para o
                        // próximo boot nascer limpo em vez de já abrir no socorro.
                        resetBounce(getBounceStorage())
                        window.location.replace('/')
                    }}
                >
                    Voltar ao início
                </button>
            </div>
        )
    }

    return (
    <div className="fixed inset-0 z-50 bg-neutral-950 flex flex-col items-center justify-center pt-safe pb-safe overflow-hidden">
        {/* Logo + progress bar grouped, vertically centered */}
        <div
            className="flex flex-col items-center"
            style={shouldAnimate
                ? { animation: 'splash-in 0.9s cubic-bezier(0.16, 1, 0.3, 1) forwards', opacity: 0 }
                : { opacity: 1 }}
        >
            {/* Background removed via luminance-as-alpha so the gold mark
                floats freely over the splash bg with no card edges. */}
            <div className="relative w-[90vmin] h-[90vmin] max-w-[800px] max-h-[800px]">
                <Image
                    src="/logo-irontracks-splash.webp"
                    alt="IronTracks"
                    width={1024}
                    height={1024}
                    priority
                    unoptimized
                    sizes="(max-width: 800px) 90vmin, 800px"
                    className="w-full h-full object-contain"
                />
                {/* Brilho metálico: faixa de luz diagonal varrendo a FORMA do
                    logo (recortada via mask) em loop sutil, como metal polido. */}
                <div className="logo-shine absolute inset-0 pointer-events-none" aria-hidden="true" />
            </div>

            {/* Progress bar — directly under the logo */}
            <div className="mt-2 w-24 h-[3px] bg-neutral-800 rounded-full overflow-hidden">
                <div
                    className="h-full rounded-full relative overflow-hidden"
                    style={shouldAnimate ? {
                        background: 'linear-gradient(90deg, #92400e, #d97706, #fbbf24, #fde68a)',
                        animation: 'progress 1.8s cubic-bezier(0.4, 0, 0.2, 1) 0.4s forwards',
                        width: '0%',
                        boxShadow: '0 0 8px rgba(251,191,36,0.5)',
                    } : {
                        background: 'linear-gradient(90deg, #92400e, #d97706, #fbbf24, #fde68a)',
                        width: '100%',
                        boxShadow: '0 0 8px rgba(251,191,36,0.5)',
                    }}
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent" style={{ animation: 'shimmer 1.5s ease-in-out infinite' }} />
                </div>
            </div>
        </div>

        <style>{`
            @keyframes splash-in {
                0%   { opacity: 0; transform: translateY(12px) scale(0.97); }
                100% { opacity: 1; transform: translateY(0) scale(1); }
            }
            @keyframes progress {
                0%   { width: 0%; }
                60%  { width: 70%; }
                85%  { width: 88%; }
                100% { width: 100%; }
            }
            @keyframes shimmer {
                0%   { transform: translateX(-100%); }
                100% { transform: translateX(100%); }
            }
            .logo-shine {
                background: linear-gradient(115deg, transparent 40%, rgba(255,255,255,0.6) 50%, transparent 60%);
                background-size: 250% 100%;
                background-repeat: no-repeat;
                -webkit-mask: url('/logo-irontracks-splash.webp') center / contain no-repeat;
                        mask: url('/logo-irontracks-splash.webp') center / contain no-repeat;
                mix-blend-mode: screen;
                animation: logo-shine 3.5s ease-in-out infinite;
            }
            @keyframes logo-shine {
                0%   { background-position: 200% 0; }
                35%  { background-position: -120% 0; }
                100% { background-position: -120% 0; }
            }
            @media (prefers-reduced-motion: reduce) {
                .logo-shine { animation: none; }
            }
        `}</style>
    </div>
    )
}

export default LoadingScreen

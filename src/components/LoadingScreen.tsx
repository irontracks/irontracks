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
        {/* Logo + trilho de carga. O wrapper tem a LARGURA do logo de propósito:
            a compensação óptica abaixo é uma margem em %, e em CSS margem
            percentual se resolve sobre a largura do bloco pai — como o logo é
            quadrado, % da largura é % da altura, e o ajuste sobrevive a
            qualquer tamanho de tela sem uma segunda unidade para manter. */}
        {/* A entrada é CLASSE, não `style` inline: atributo inline não é
            alcançado por media query, então com o `splash-in` inline o
            `prefers-reduced-motion` desligava só o brilho e a barra — e, pior,
            um `opacity: 0` inline sem animação para desfazê-lo deixaria a marca
            invisível para quem pediu menos movimento. */}
        <div className={`relative w-[72vmin] max-w-[560px] ${shouldAnimate ? 'splash-enter' : ''}`}>
            {/* Background removed via luminance-as-alpha so the gold mark
                floats freely over the splash bg with no card edges. */}
            <div className="relative w-full aspect-square">
                <Image
                    src="/logo-irontracks-splash.webp"
                    alt="IronTracks"
                    width={1024}
                    height={1024}
                    priority
                    unoptimized
                    sizes="(max-width: 780px) 72vmin, 560px"
                    className="w-full h-full object-contain"
                />
                {/* Brilho metálico: faixa de luz diagonal varrendo a FORMA do
                    logo (recortada via mask) em loop sutil, como metal polido. */}
                <div className="logo-shine absolute inset-0 pointer-events-none" aria-hidden="true" />
            </div>

            {/* O trilho sai do FLUXO de propósito: assim o centro do logo é o
                centro geométrico da tela, e nada mais empurra a marca para
                baixo. Isso é o que permite o launch screen NATIVO — que o iOS
                desenha centralizado por `scaleAspectFill` — cair exatamente
                sobre esta mesma posição, sem salto na emenda nativo → web.

                ⚠️ O 90,5% não é gosto: o PNG carrega 16,6% de altura VAZIA
                abaixo da marca (medido no canal alfa — conteúdo entre y=176 e
                y=853 de 1024). Ancorado no fim do contêiner, o trilho nasceria
                a ~70px do logotipo e leria como elemento órfão. */}
            <div className="absolute left-1/2 -translate-x-1/2 top-[90.5%] w-24 h-[2px] rounded-full bg-white/[0.07] overflow-hidden">
                {/* Indicador INDETERMINADO, e isso é uma decisão, não um atalho.
                    A barra anterior corria 0→100% numa curva fixa de 1,8s sem
                    consultar o carregamento: em rede ruim ela cravava 100% e o
                    usuário encarava uma barra cheia até o socorro dos 8s. Progresso
                    que ninguém mede não é feedback, é promessa quebrada — e este
                    app pede credibilidade já no primeiro frame.

                    Anima `transform`, nunca `width`: transform roda no
                    compositor, e width dispara reflow a cada frame justamente
                    enquanto a main thread está ocupada subindo o app. */}
                <div className="splash-sweep h-full w-[45%] rounded-full" aria-hidden="true" />
            </div>
        </div>

        <style>{`
            .splash-enter {
                opacity: 0;
                animation: splash-in 0.52s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
            @keyframes splash-in {
                0%   { opacity: 0; transform: translateY(8px) scale(0.985); }
                100% { opacity: 1; transform: translateY(0) scale(1); }
            }
            .splash-sweep {
                background: linear-gradient(90deg, transparent, #d97706 18%, #fbbf24 50%, #fde68a 68%, transparent);
                box-shadow: 0 0 10px rgba(251,191,36,0.45);
                animation: splash-sweep 1.45s cubic-bezier(0.65, 0, 0.35, 1) infinite;
                will-change: transform;
            }
            @keyframes splash-sweep {
                0%   { transform: translateX(-105%); }
                100% { transform: translateX(228%); }
            }
            .logo-shine {
                background: linear-gradient(115deg, transparent 40%, rgba(255,255,255,0.6) 50%, transparent 60%);
                background-size: 250% 100%;
                background-repeat: no-repeat;
                -webkit-mask: url('/logo-irontracks-splash.webp') center / contain no-repeat;
                        mask: url('/logo-irontracks-splash.webp') center / contain no-repeat;
                mix-blend-mode: screen;
                animation: logo-shine 4s ease-in-out infinite;
            }
            @keyframes logo-shine {
                0%   { background-position: 200% 0; }
                28%  { background-position: -120% 0; }
                100% { background-position: -120% 0; }
            }
            /* Quem pediu ao sistema para não ver movimento tem que ser atendido
               nas QUATRO camadas — antes só o brilho do logo obedecia, e a
               entrada, a barra e o shimmer seguiam correndo. Nada se move, e
               nada some: o trilho continua aceso, só que parado. */
            @media (prefers-reduced-motion: reduce) {
                .splash-enter { animation: none; opacity: 1; }
                .logo-shine { animation: none; }
                .splash-sweep { animation: none; transform: none; width: 100%; }
            }
        `}</style>
    </div>
    )
}

export default LoadingScreen

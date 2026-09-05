'use client'
import { useEffect, useRef, useState } from 'react'
import { playFinishSound } from '@/lib/sounds'

/**
 * A celebração de FINALIZAR o treino: a frase entra em zoom a partir do centro,
 * com a fanfarra acompanhando.
 *
 * ⚠️ Só dispara na finalização DE VERDADE. O app já teve uma tela de vitória e
 * ela foi removida em 03/09/2026 por um motivo que não pode voltar: o estado
 * nascia `useState(true)`, então ela aparecia toda vez que QUALQUER relatório
 * era aberto — inclusive um treino de duas semanas atrás no histórico. Celebrar
 * o que já passou esvazia a celebração. Aqui quem decide é o chamador, com o
 * carimbo do instante da finalização.
 *
 * O som é o `playFinishSound`, que já existia em `lib/sounds` com ZERO
 * consumidores — um arpejo ascendente (C5→E5→G5→C6). Ele é Web Audio
 * TRANSITÓRIO de propósito: o player nativo dá um som melhor, mas segura a
 * sessão de áudio e isso já quebrou a notificação de tela bloqueada e roubou o
 * foco do Spotify do dono. Aqui vale a mesma escolha do alarme de descanso.
 */

/** Entrada + leitura + saída. Curto: é comemoração, não interrupção. */
const MS_ENTRADA = 620
const MS_LEITURA = 1400
const MS_SAIDA = 380

interface Props {
    /** Nome do treino, para a celebração dizer o que foi concluído. */
    workoutTitle?: string
    /** Respeita o ajuste de som do usuário (o mesmo do alarme de descanso). */
    soundEnabled?: boolean
    soundVolume?: number
    onDone: () => void
}

export default function WorkoutFinishCelebration({
    workoutTitle,
    soundEnabled = true,
    soundVolume = 1,
    onDone,
}: Props) {
    const [saindo, setSaindo] = useState(false)
    // O callback mais fresco, alimentado em EFEITO — escrever ref durante o
    // render é proibido no React 19 (e o ESLint reprova). Sem a ref, o efeito de
    // temporização precisaria de `onDone` nas dependências e reiniciaria a
    // contagem a cada render do pai, no meio da animação.
    const doneRef = useRef(onDone)
    useEffect(() => { doneRef.current = onDone }, [onDone])

    // `matchMedia` não existe no SSR nem em todo runtime de teste.
    const [reduzMovimento] = useState(() => {
        try {
            return typeof window !== 'undefined'
                && typeof window.matchMedia === 'function'
                && window.matchMedia('(prefers-reduced-motion: reduce)').matches
        } catch { return false }
    })

    useEffect(() => {
        // O som sai uma vez, no mesmo instante do zoom. Falhar aqui não pode
        // derrubar a celebração: em iOS o AudioContext pode estar interrompido
        // (ligação, Siri) e `playFinishSound` já engole isso por dentro.
        if (soundEnabled) {
            try { playFinishSound({ enabled: true, volume: soundVolume }) } catch { /* som é acessório */ }
        }

        const tSaida = setTimeout(() => setSaindo(true), MS_ENTRADA + MS_LEITURA)
        const tFim = setTimeout(() => doneRef.current(), MS_ENTRADA + MS_LEITURA + MS_SAIDA)
        return () => { clearTimeout(tSaida); clearTimeout(tFim) }
    }, [soundEnabled, soundVolume])

    // Tocar encerra na hora: quem já viu não deve esperar o relatório.
    const encerrarAgora = () => {
        setSaindo(true)
        setTimeout(() => doneRef.current(), MS_SAIDA)
    }

    return (
        // O contêiner ANUNCIA (status/aria-live) e o botão de dentro DISPENSA.
        // Separados de propósito: `<button role="status">` é contradição — o
        // leitor de tela precisa de um anúncio, não de um controle que promete
        // decisão; e um `role="dialog"` prenderia o foco num aviso que some
        // sozinho em ~2,4 s.
        <div
            role="status"
            aria-live="polite"
            className="fixed inset-0 z-[1300] flex flex-col items-center justify-center text-center"
            style={{
                background: 'rgba(10,10,10,0.94)',
                animation: `celebra-veu ${saindo ? MS_SAIDA : 200}ms ease-out ${saindo ? 'forwards' : 'backwards'}`,
                animationDirection: saindo ? 'reverse' : 'normal',
            }}
        >
            <button
                type="button"
                onClick={encerrarAgora}
                aria-label="Fechar celebração e ver o relatório"
                // `tap-44` é redundante aqui — o botão JÁ é a tela inteira (`inset-0`) —,
                // mas o guard de alvo de toque lê a classe literal e não enxerga
                // `h-full`. Como ele estende a área pelo `::after` sem mover pixel,
                // custa nada e mantém o ratchet honesto para os próximos botões.
                className="tap-44 absolute inset-0 h-full w-full cursor-pointer border-0 bg-transparent p-0"
            />

            <div
                className="pointer-events-none relative flex flex-col items-center gap-2 px-8"
                style={
                    reduzMovimento
                        ? { opacity: saindo ? 0 : 1, transition: `opacity ${MS_SAIDA}ms ease-out` }
                        : {
                            animation: saindo
                                ? `celebra-sai ${MS_SAIDA}ms ease-in forwards`
                                // O overshoot (o `back` na curva) é o que faz a frase
                                // "chegar" em vez de só aparecer maior.
                                : `celebra-zoom ${MS_ENTRADA}ms cubic-bezier(0.34, 1.56, 0.64, 1) both`,
                        }
                }
            >
                <div className="t-meta text-[11px] text-yellow-500">Parabéns</div>
                <div className="text-4xl sm:text-5xl font-black uppercase tracking-tight text-white leading-[1.05]">
                    Treino
                    <br />
                    Finalizado
                </div>
                {workoutTitle ? (
                    <div className="mt-1 max-w-[15rem] truncate text-sm font-black text-yellow-400">
                        {workoutTitle}
                    </div>
                ) : null}
            </div>

            <style>{`
                @keyframes celebra-veu {
                    from { opacity: 0; }
                    to   { opacity: 1; }
                }
                @keyframes celebra-zoom {
                    from { opacity: 0; transform: scale(0.35); }
                    to   { opacity: 1; transform: scale(1); }
                }
                @keyframes celebra-sai {
                    from { opacity: 1; transform: scale(1); }
                    to   { opacity: 0; transform: scale(1.06); }
                }
                @media (prefers-reduced-motion: reduce) {
                    /* O véu some junto com o resto — nada pulsa, e nada fica preso
                       na tela por causa de uma animação que não roda. */
                    [class*="celebra"] { animation: none !important; }
                }
            `}</style>
        </div>
    )
}

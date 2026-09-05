'use client'
import { useEffect, useRef, useState } from 'react'
import { playFinishSound } from '@/lib/sounds'

/**
 * A celebração de FINALIZAR o treino: a frase NASCE no centro da tela, quase um
 * ponto, e vem crescendo até o tamanho normal — como se saísse de dentro do
 * aparelho. Fundo opaco de ponta a ponta ("infinito"): nada do relatório
 * transparece, então não há moldura que denuncie que existe uma camada por
 * cima. É a tela inteira que está comemorando.
 *
 * ⚠️ Só dispara na finalização DE VERDADE. O app já teve uma tela de vitória e
 * ela foi removida em 03/09/2026 por um motivo que não pode voltar: o estado
 * nascia `useState(true)`, então ela aparecia toda vez que QUALQUER relatório
 * era aberto — inclusive um treino de duas semanas atrás no histórico. Celebrar
 * o que já passou esvazia a celebração. Aqui quem decide é o chamador, com o
 * carimbo do instante da finalização.
 *
 * ⚠️ **O botão de dispensar NÃO pode levar `tap-44`.** A primeira versão levava,
 * e o resultado no iPhone do dono foi a frase encostada no RODAPÉ: a utility é
 * `position: relative` (globals.css, depois do `@import "tailwindcss"`, mesma
 * especificidade → ela vence o `absolute` do Tailwind), o botão virou item de
 * flex com `h-full w-full` e comeu a coluna inteira. Ele já é a tela toda por
 * `inset-0`; o guard de alvo de toque só reclamava por causa do `p-0`, que
 * estimava uma caixa de 20px. Sem `p-0` o guard fica calado por mérito.
 *
 * O som é o `playFinishSound`, que já existia em `lib/sounds` com ZERO
 * consumidores — um arpejo ascendente (C5→E5→G5→C6). Ele é Web Audio
 * TRANSITÓRIO de propósito: o player nativo dá um som melhor, mas segura a
 * sessão de áudio e isso já quebrou a notificação de tela bloqueada e roubou o
 * foco do Spotify do dono. Aqui vale a mesma escolha do alarme de descanso.
 */

/**
 * A entrada é LENTA de propósito (pedido do dono, 05/09/2026): em ~600 ms a
 * frase só "aparecia maior"; é o tempo longo que compra a leitura de estar
 * saindo de dentro da tela. A leitura é curta porque a frase já passou 1,5 s
 * legível enquanto crescia.
 */
const MS_ENTRADA = 1500
const MS_LEITURA = 1100
const MS_SAIDA = 520

/**
 * O tamanho em que a frase NASCE. Precisa ser quase um ponto — em 0,35 (a
 * primeira versão) ela já entrava legível e o efeito virava um zoom curto, não
 * um nascimento.
 */
const ESCALA_INICIAL = 0.04

interface Props {
    /** Respeita o ajuste de som do usuário (o mesmo do alarme de descanso). */
    soundEnabled?: boolean
    soundVolume?: number
    onDone: () => void
}

export default function WorkoutFinishCelebration({
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
        // O som sai uma vez, no mesmo instante em que a frase nasce. Falhar aqui
        // não pode derrubar a celebração: em iOS o AudioContext pode estar
        // interrompido (ligação, Siri) e `playFinishSound` já engole isso.
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
        // sozinho em ~3 s.
        <div
            role="status"
            aria-live="polite"
            className="fixed inset-0 z-[1300] flex flex-col items-center justify-center overflow-hidden text-center"
            style={{
                // OPACO. Com alpha, o relatório aparecia por trás e entregava
                // que isto é uma camada — o "fundo infinito" pedido pelo dono é
                // justamente não haver borda nem transparência que denuncie.
                background: '#0a0a0a',
                animation: `celebra-veu ${saindo ? MS_SAIDA : 160}ms ease-out ${saindo ? 'forwards' : 'backwards'}`,
                animationDirection: saindo ? 'reverse' : 'normal',
            }}
        >
            <button
                type="button"
                onClick={encerrarAgora}
                aria-label="Fechar celebração e ver o relatório"
                className="absolute inset-0 h-full w-full cursor-pointer border-0 bg-transparent"
            />

            <div
                className="pointer-events-none relative px-8"
                style={
                    reduzMovimento
                        ? { opacity: saindo ? 0 : 1, transition: `opacity ${MS_SAIDA}ms ease-out` }
                        : {
                            animation: saindo
                                ? `celebra-sai ${MS_SAIDA}ms ease-in forwards`
                                // Curva com partida LENTA e cauda longa: o
                                // começo devagar é o que lê como profundidade
                                // (algo distante mal muda de tamanho), e a
                                // desaceleração no fim faz a frase POUSAR no
                                // tamanho normal em vez de bater nele. Sem
                                // overshoot: o repique é vocabulário de "pop",
                                // e aqui a frase está emergindo, não pipocando.
                                : `celebra-nasce ${MS_ENTRADA}ms cubic-bezier(0.5, 0, 0.2, 1) both`,
                        }
                }
            >
                {/* As três quebras são EXPLÍCITAS. Medido no navegador em
                    05/09/2026: "TREINO FINALIZADO" numa linha só ocupa 346px e
                    num iPhone de 390 sobram 326 (o `px-8` come 64) — ela
                    quebraria sozinha, no ponto que o navegador escolhesse, e em
                    375px a folga é ainda menor. Assim são 211px e o bloco cresce
                    como uma peça só. */}
                <div className="text-4xl sm:text-5xl font-black uppercase tracking-tight leading-[1.05] text-white">
                    <span className="text-yellow-500">Parabéns</span>
                    <br />
                    Treino
                    <br />
                    Finalizado
                </div>
            </div>

            <style>{`
                @keyframes celebra-veu {
                    from { opacity: 0; }
                    to   { opacity: 1; }
                }
                @keyframes celebra-nasce {
                    /* Sem \`filter: blur\`: o filtro é aplicado ANTES do
                       transform, então 7px a 0,04 de escala viram 0,28px na
                       tela — desfoque invisível justo quando deveria pesar, e
                       trabalho de GPU de graça no WKWebView. A profundidade sai
                       da escala inicial e da curva de partida lenta. */
                    from { opacity: 0; transform: scale(${ESCALA_INICIAL}); }
                    18%  { opacity: 1; }
                    to   { opacity: 1; transform: scale(1); }
                }
                @keyframes celebra-sai {
                    from { opacity: 1; transform: scale(1); }
                    to   { opacity: 0; transform: scale(1.08); }
                }
            `}</style>
        </div>
    )
}

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
 * ⚠️ Aqui nasceu o defeito do `tap-44`, e ele JÁ FOI ELIMINADO na origem (ver o
 * comentário da utility no `globals.css`): o botão de dispensar levava a classe
 * só para calar o guard de alvo de toque, e a frase apareceu encostada no
 * RODAPÉ do iPhone do dono. A utility era `position: relative` solta, e o
 * Tailwind v4 emite `.absolute` dentro de `@layer utilities` — CSS fora de
 * camada vence CSS em camada, então o `absolute` do botão era ignorado e ele
 * virava item de flex com `h-full w-full`, comendo a coluna inteira.
 *
 * Hoje a utility tem `:not(.absolute)` e a combinação é inofensiva. Ela segue
 * fora daqui por não servir para nada: o botão já é a tela toda por `inset-0`,
 * e o guard só reclamava por causa do `p-0`, que estimava uma caixa de 20px.
 *
 * O som é o `playFinishSound`, que já existia em `lib/sounds` com ZERO
 * consumidores — um arpejo ascendente (C5→E5→G5→C6). Ele é Web Audio
 * TRANSITÓRIO de propósito: o player nativo dá um som melhor, mas segura a
 * sessão de áudio e isso já quebrou a notificação de tela bloqueada e roubou o
 * foco do Spotify do dono. Aqui vale a mesma escolha do alarme de descanso.
 */

/**
 * A entrada é LENTA de propósito, e o dono pediu isso DUAS vezes (05/09/2026):
 * primeiro saindo de 620 ms — em que a frase só "aparecia maior" — e depois de
 * novo, saindo de 1,5 s. É o tempo longo que compra a leitura de estar saindo
 * de dentro da tela: em movimento, devagar é o que lê como profundidade.
 *
 * ⚠️ Antes de acelerar isto "porque 4,7 s é muito", saiba que os dois pedidos
 * foram nessa direção. Quem acha longo tem a saída: um toque encerra na hora,
 * e a celebração acontece UMA vez por treino.
 */
const MS_ENTRADA = 2400
const MS_LEITURA = 1100
const MS_SAIDA = 640

/**
 * A batida em que NADA acontece — o relatório fica sozinho na tela.
 *
 * ⚠️ Sem ela o véu entrava no mesmo instante do mount e o usuário nunca via o
 * relatório: a celebração parecia estar por cima de um vazio preto, e não
 * saindo de dentro da tela dele (pedido do dono, 05/09/2026 — "aparece a tela
 * do relatório, aí sim o Motion sai dessa tela").
 *
 * Não é um `setTimeout`: é `animation-delay` com `fill-mode: both`, então
 * durante a espera o véu já está em opacidade 0 e a frase em `ESCALA_INICIAL`.
 * Um estado a mais no React só para segurar meio segundo seria ruído.
 */
const MS_ESPERA = 520

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
        // O som sai uma vez, no mesmo instante em que a frase NASCE — por isso
        // ele também espera a batida em que o relatório fica sozinho. Tocando no
        // mount, a fanfarra chegava antes de haver o que comemorar na tela.
        // Falhar aqui não pode derrubar a celebração: em iOS o AudioContext pode
        // estar interrompido (ligação, Siri) e `playFinishSound` já engole isso.
        const tSom = setTimeout(() => {
            if (!soundEnabled) return
            try { playFinishSound({ enabled: true, volume: soundVolume }) } catch { /* som é acessório */ }
        }, MS_ESPERA)

        const tSaida = setTimeout(() => setSaindo(true), MS_ESPERA + MS_ENTRADA + MS_LEITURA)
        const tFim = setTimeout(() => doneRef.current(), MS_ESPERA + MS_ENTRADA + MS_LEITURA + MS_SAIDA)
        return () => { clearTimeout(tSom); clearTimeout(tSaida); clearTimeout(tFim) }
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
                // Poço RADIAL, não chapa opaca: escuro no centro (onde a frase
                // pousa e precisa de contraste) e TRANSPARENTE na borda, então o
                // relatório continua visível em volta e a celebração lê como
                // saindo de dentro dele. É o "fundo infinito" do pedido anterior
                // — o que não pode haver é BORDA denunciando uma camada —, agora
                // sem esconder a tela que o dono quer ver primeiro.
                background:
                    'radial-gradient(120% 75% at 50% 50%, rgba(10,10,10,0.97) 0%,'
                    + ' rgba(10,10,10,0.93) 38%, rgba(10,10,10,0.55) 72%, rgba(10,10,10,0) 100%)',
                // Entra JUNTO com o crescimento da frase (não antes), e depois da
                // batida em que o relatório fica sozinho.
                animation: saindo
                    ? `celebra-veu ${MS_SAIDA}ms ease-out forwards reverse`
                    : `celebra-veu ${Math.round(MS_ENTRADA * 0.7)}ms ease-out ${MS_ESPERA}ms both`,
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
                                // O `MS_ESPERA` de atraso com `both` deixa a
                                // frase parada em `ESCALA_INICIAL` e invisível
                                // enquanto o relatório fica sozinho na tela.
                                : `celebra-nasce ${MS_ENTRADA}ms cubic-bezier(0.5, 0, 0.2, 1) ${MS_ESPERA}ms both`,
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

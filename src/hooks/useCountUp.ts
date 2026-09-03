'use client'
import { useEffect, useRef, useState } from 'react'

/**
 * Número que sobe até o valor — para conquista, não para dado qualquer.
 *
 * Um número que cresce comunica ESFORÇO ACUMULADO; o mesmo número estático
 * comunica apenas um fato. Por isso isto pertence ao volume levantado, à kcal
 * gasta, ao PR — e não a um contador de itens de lista.
 *
 * Nasceu duplicando o hook privado de `ReportSummaryCards`, que era o único
 * count-up do produto (medido em 03/09/2026). Ao promovê-lo a fonte única,
 * três defeitos daquele foram corrigidos:
 *
 * 1. **Ignorava `prefers-reduced-motion`.** O reset global do `globals.css`
 *    corta `animation-duration` de CSS, e este hook é JS: `requestAnimationFrame`
 *    passa intocado por aquela regra. Quem pediu menos movimento via os números
 *    correndo do mesmo jeito. Aqui a contagem é pulada e o valor final aparece
 *    de imediato.
 * 2. **Easing linear.** `target * progress` sobe em velocidade constante, que
 *    lê como contador de máquina. `easeOutCubic` desacelera na chegada, que é
 *    como o olho espera que algo pare.
 * 3. **Recomeçava do ZERO a cada mudança de alvo.** Quando o dado é refinado
 *    depois da montagem (o histórico chega do cache e depois da rede, padrão
 *    deste app), o número despencava a zero e subia de novo. Agora parte de
 *    onde está.
 *
 * Um 4º defeito, achado pelo dono no aparelho em 03/09/2026: a animação
 * disparava na MONTAGEM, e o único consumidor de hoje (`ReportSummaryCards`)
 * fica abaixo da dobra — o usuário via um número já parado ao rolar até lá,
 * porque os 900ms tinham acabado bem antes. `start` resolve isso: por padrão
 * `true` (comportamento de sempre, não quebra chamador nenhum), e o chamador
 * que precisa de gatilho de scroll passa `false` até o elemento entrar em
 * viewport (ver `useInViewOnce`).
 */
/**
 * 2200ms, e não os 900 originais: com `easeOutCubic` a contagem gasta os
 * primeiros 25% do tempo cobrindo 58% do caminho, então em 900ms o que sobrava
 * de legível era um borrão de ~300ms. Relato do dono em 03/09/2026 — "está
 * muito rápido, quase não dá pra ver a animação". Em 2200ms a chegada lenta da
 * curva vira o que ela deveria ser: o número subindo à vista até parar.
 */
const DURACAO_PADRAO_MS = 2200

export function useCountUp(target: number, duration = DURACAO_PADRAO_MS, start = true): number {
    const [value, setValue] = useState(0)
    const raf = useRef(0)
    // Ponto de partida da PRÓXIMA contagem. Escrito só dentro do frame e lido só
    // dentro do efeito — nunca durante o render, que o React 19 proíbe (e a
    // primeira versão disto levou `react-hooks/refs` por exatamente isso).
    const de = useRef(0)

    useEffect(() => {
        if (!start) return
        if (!Number.isFinite(target)) return
        const partida = de.current
        if (partida === target) return

        // Movimento reduzido: publica o alvo NO PRÓXIMO FRAME, não com um
        // `setValue` síncrono aqui. Síncrono seria render em cascata (o ESLint
        // reprova, e com razão), e começar já no alvo divergiria do HTML do
        // servidor, que sempre renderiza 0 — mismatch de hidratação. Assim o
        // primeiro frame já mostra o número final: instantâneo aos olhos.
        if (prefereMenosMovimento()) {
            raf.current = requestAnimationFrame(() => { de.current = target; setValue(target) })
            return () => cancelAnimationFrame(raf.current)
        }

        // `t0`, não `start`: o parâmetro `start` (o gatilho) já ocupa esse nome
        // no escopo de fora — reusar daria shadow silencioso e confundiria
        // quem ler "start" aqui pensando que é o booleano.
        const t0 = performance.now()
        const tick = (now: number) => {
            const t = Math.min(1, (now - t0) / duration)
            const eased = 1 - Math.pow(1 - t, 3) // easeOutCubic
            const v = Math.round(partida + (target - partida) * eased)
            de.current = v
            setValue(v)
            if (t < 1) raf.current = requestAnimationFrame(tick)
        }
        raf.current = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(raf.current)
    }, [target, duration, start])

    return value
}

/** `matchMedia` não existe no SSR nem em todo runtime de teste. */
function prefereMenosMovimento(): boolean {
    try {
        return typeof window !== 'undefined'
            && typeof window.matchMedia === 'function'
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch {
        return false
    }
}

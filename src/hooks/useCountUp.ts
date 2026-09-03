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
 */
export function useCountUp(target: number, duration = 900): number {
    const [value, setValue] = useState(0)
    const raf = useRef(0)
    // Ponto de partida da PRÓXIMA contagem. Escrito só dentro do frame e lido só
    // dentro do efeito — nunca durante o render, que o React 19 proíbe (e a
    // primeira versão disto levou `react-hooks/refs` por exatamente isso).
    const de = useRef(0)

    useEffect(() => {
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

        const start = performance.now()
        const tick = (now: number) => {
            const t = Math.min(1, (now - start) / duration)
            const eased = 1 - Math.pow(1 - t, 3) // easeOutCubic
            const v = Math.round(partida + (target - partida) * eased)
            de.current = v
            setValue(v)
            if (t < 1) raf.current = requestAnimationFrame(tick)
        }
        raf.current = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(raf.current)
    }, [target, duration])

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

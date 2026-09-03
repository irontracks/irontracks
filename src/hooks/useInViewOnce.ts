'use client'
import { useEffect, useRef, useState, type RefObject } from 'react'

/**
 * Dispara uma vez quando o elemento entra na viewport, e nunca mais depois —
 * é gatilho de "primeira vez que o olho chega aqui", não um sensor contínuo.
 *
 * Nasceu do mesmo defeito relatado pelo dono em 03/09/2026 sobre o count-up do
 * relatório de treino: o `ReportSummaryCards` é o 8º bloco da tela (depois de
 * destaques, métricas, tempo, mapa muscular, exercícios, check-in e a seção de
 * IA) — a animação de 900ms disparava na MONTAGEM do componente, então por
 * volta do tempo em que o scroll chegava lá ela já tinha acabado há muito.
 * O padrão de IntersectionObserver já existia solto na landing comercial
 * (`ComercialContent.tsx`); isto o promove a hook reutilizável.
 *
 * `threshold` default 0.3 — visível o bastante para o olho já estar em cima,
 * não o pixel inicial encostando na borda da tela.
 */
export function useInViewOnce<T extends Element>(threshold = 0.3): [RefObject<T | null>, boolean] {
    const ref = useRef<T | null>(null)
    // Sem suporte (ambiente de teste, browser antigo): parte já `true`, na
    // INICIALIZAÇÃO — não trava a animação para sempre. Fazer essa checagem
    // dentro do efeito seria `setState` síncrono nele, que o ESLint reprova
    // (a mesma regra que já mordeu `useCountUp`).
    const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined')

    useEffect(() => {
        if (inView) return
        const el = ref.current
        if (!el) return

        const io = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting) { setInView(true); io.disconnect() } },
            { threshold },
        )
        io.observe(el)
        return () => io.disconnect()
    }, [threshold, inView])

    return [ref, inView]
}

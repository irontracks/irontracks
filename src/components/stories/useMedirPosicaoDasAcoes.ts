'use client'

import React from 'react'
import { trackUserEvent } from '@/lib/telemetry/userActivity'

/**
 * ⚠️ INSTRUMENTAÇÃO — mede ONDE a barra de ações caiu na tela do usuário.
 *
 * Relato (Diogo, 01/09/2026): "não consigo mudar o template nem salvar". A
 * barra de ações virou FIXA no rodapé em 01/09 e, no simulador de 390×844, ela
 * aparece. O banco mostra que ele carregou o app DEPOIS do deploy
 * (`user_activity_events`, TTFB às 10:08 UTC) e continua sem ver os botões: o
 * código novo está no aparelho dele e mesmo assim não funciona, e eu não
 * reproduzo. Chutar uma segunda correção às cegas já custou uma rodada aqui.
 *
 * A suspeita que este número confirma ou derruba: `position: fixed` dentro de
 * um ancestral com `transform` deixa de ser fixo à viewport e passa a ser
 * relativo ao ancestral — e o composer envolve tudo num `motion.div` que anima
 * `y`/`scale`. Se for isso, vem `position: fixed` com `fundo` maior que
 * `alturaViewport`.
 *
 * Hook (e não código solto em cada painel) porque são DOIS painéis servindo os
 * quatro composers: medir só num deles responderia por um quarto do problema.
 *
 * Sem PII: geometria e viewport, uma vez por abertura.
 */
export function useMedirPosicaoDasAcoes(origem: string): {
    acoes: React.RefObject<HTMLDivElement | null>
    estilo: React.RefObject<HTMLDivElement | null>
} {
    const ref = React.useRef<HTMLDivElement | null>(null)
    const estiloRef = React.useRef<HTMLDivElement | null>(null)

    React.useEffect(() => {
        try {
            const el = ref.current
            if (!el || typeof window === 'undefined') return
            // Espera o layout assentar: medir no frame da montagem pega a
            // animação de entrada no meio e reporta uma posição que não existe.
            const t = window.setTimeout(() => {
                try {
                    const r = el.getBoundingClientRect()
                    const vh = window.innerHeight || 0
                    // O seletor de ESTILO é a segunda metade da pergunta: a
                    // barra de ações pode estar visível (medido: topo 749 no
                    // aparelho do usuário) e o estilo cair POR BAIXO dela.
                    const e = estiloRef.current?.getBoundingClientRect() ?? null
                    trackUserEvent('story_actions_position', {
                        type: 'ui',
                        metadata: {
                            origem,
                            // Barra visível na tela? É a pergunta inteira.
                            visivel: r.top < vh && r.bottom > 0,
                            topo: Math.round(r.top),
                            fundo: Math.round(r.bottom),
                            alturaViewport: Math.round(vh),
                            larguraViewport: Math.round(window.innerWidth || 0),
                            posicao: window.getComputedStyle(el).position,
                            estiloTopo: e ? Math.round(e.top) : null,
                            estiloFundo: e ? Math.round(e.bottom) : null,
                            // Estilo alcançável SEM rolar: inteiro na tela e
                            // acima do topo da barra de ações.
                            estiloAlcancavel: e ? (e.top >= 0 && e.bottom <= r.top) : null,
                            versao: String(process.env.NEXT_PUBLIC_APP_VERSION || 'dev'),
                        },
                    })
                } catch { /* telemetria nunca derruba a tela */ }
            }, 900)
            return () => window.clearTimeout(t)
        } catch { /* idem */ }
    }, [origem])

    return { acoes: ref, estilo: estiloRef }
}

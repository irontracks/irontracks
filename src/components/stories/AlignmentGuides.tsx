'use client'

import React from 'react'

/**
 * Guias de alinhamento do arrasto — o comportamento do Instagram Stories: ao cruzar
 * o centro, o elemento gruda e uma linha aparece confirmando.
 *
 * `pointer-events-none` é o ponto crítico: a linha atravessa a área de gesto e, se
 * capturasse pointer, mataria o próprio arrasto que a fez aparecer.
 *
 * Fica ACIMA da alça da marca (z-40 contra z-30) porque é confirmação do que está
 * acontecendo agora — passar por baixo do que se arrasta a esconderia justo quando
 * ela importa.
 *
 * Componente único de propósito: os três composers (treino, nutrição, cardio) usam
 * o MESMO guia, para não replicar 3× e divergirem em silêncio.
 */

interface AlignmentGuidesProps {
    /** Grudado no eixo VERTICAL do canvas — linha em pé, no meio da largura. */
    x: boolean
    /** Grudado no eixo HORIZONTAL — linha deitada, no meio da altura. */
    y: boolean
}

export function AlignmentGuides({ x, y }: AlignmentGuidesProps) {
    if (!x && !y) return null

    return (
        <div className="pointer-events-none absolute inset-0 z-40" aria-hidden="true">
            {x && (
                <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-yellow-400/90 shadow-[0_0_6px_rgba(250,204,21,0.9)]" />
            )}
            {y && (
                <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-yellow-400/90 shadow-[0_0_6px_rgba(250,204,21,0.9)]" />
            )}
        </div>
    )
}

'use client'

import React from 'react'
import { CANVAS_W, CANVAS_H, brandHandlePct, measureBrandBox } from '../storyComposerUtils'
import type { StoryTemplate } from './storyTemplates'

/**
 * Alça de arrasto da MARCA (IRON·TRACKS) sobre a prévia do story.
 *
 * A marca é desenhada no canvas, então não dá pra arrastá-la direto: esta alça
 * é um retângulo HTML posicionado por cima dela e devolve o deslocamento ao
 * hook. Fica ACIMA do overlay de gesto (z-30) — o overlay move o bloco inteiro
 * e comeria o pointer.
 *
 * A alça NÃO acompanha o zoom/pan do bloco porque a marca também não: ela é
 * 100% independente (encolher os dados não encolhe a marca).
 *
 * Componente único de propósito: os três composers (treino, nutrição, cardio)
 * consomem o MESMO handle, para não repetir a alça 3× e divergirem em silêncio.
 */

interface BrandDragHandleProps {
    brandOffset: { x: number; y: number }
    /** Escala própria da marca — a caixa cresce junto, senão o traçado descola. */
    brandScale?: number
    /** Necessário para MEDIR a marca: a largura depende da fonte e do separador. */
    template: StoryTemplate
    previewRef: React.RefObject<HTMLDivElement | null>
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => void
    onPointerMove: (e: React.PointerEvent<HTMLElement>, rect: DOMRect | null) => void
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => void
}

export function BrandDragHandle({
    brandOffset, brandScale = 1, template, previewRef,
    onPointerDown, onPointerMove, onPointerUp,
}: BrandDragHandleProps) {
    const pct = brandHandlePct(brandOffset)
    // Caixa MEDIDA com a mesma fonte do desenho. Antes eram 380×66 chumbados, e o
    // traçado aparecia deslocado do logo — a largura muda com a fonte do template e
    // com o separador (`brandDivider`), então nenhum número fixo serve. (print do
    // dono, 03/08/2026)
    const box = React.useMemo(
        () => measureBrandBox(template, brandScale),
        [template, brandScale],
    )
    return (
        <button
            type="button"
            aria-label="Arrastar a marca IRONTRACKS"
            className="absolute z-30 touch-none select-none cursor-grab active:cursor-grabbing rounded-lg border border-dashed border-yellow-400/40 hover:border-yellow-400/80 bg-yellow-400/5 active:bg-yellow-400/15 transition-colors"
            style={{
                // TUDO em % do canvas — inclusive a folga. Antes o recuo saía por
                // `marginLeft/-Top: -6px`, pixels de TELA somados a dimensões em % do
                // CANVAS: na preview (~300px exibindo 720) aqueles 6px valiam 14,4px
                // de canvas, e a folga nem sequer acompanhava o tamanho do preview.
                left: `${((pct.x * CANVAS_W + box.dx) / CANVAS_W) * 100}%`,
                top: `${((pct.y * CANVAS_H + box.dy) / CANVAS_H) * 100}%`,
                width: `${(box.w / CANVAS_W) * 100}%`,
                height: `${(box.h / CANVAS_H) * 100}%`,
            }}
            onPointerDown={onPointerDown}
            onPointerMove={(e) => onPointerMove(e, previewRef.current?.getBoundingClientRect() ?? null)}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
        />
    )
}

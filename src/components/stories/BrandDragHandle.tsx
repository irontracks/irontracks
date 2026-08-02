'use client'

import React from 'react'
import { CANVAS_W, CANVAS_H, brandHandlePct } from '../storyComposerUtils'

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

/** Caixa aproximada da marca no canvas (largura do "IRON·TRACKS" + folga). */
const BRAND_BOX_W = 380
const BRAND_BOX_H = 66

interface BrandDragHandleProps {
    brandOffset: { x: number; y: number }
    previewRef: React.RefObject<HTMLDivElement | null>
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => void
    onPointerMove: (e: React.PointerEvent<HTMLElement>, rect: DOMRect | null) => void
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => void
}

export function BrandDragHandle({
    brandOffset, previewRef,
    onPointerDown, onPointerMove, onPointerUp,
}: BrandDragHandleProps) {
    const pct = brandHandlePct(brandOffset)

    return (
        <button
            type="button"
            aria-label="Arrastar a marca IRONTRACKS"
            className="absolute z-30 touch-none select-none cursor-grab active:cursor-grabbing rounded-lg border border-dashed border-yellow-400/40 hover:border-yellow-400/80 bg-yellow-400/5 active:bg-yellow-400/15 transition-colors"
            style={{
                left: `${pct.x * 100}%`,
                top: `${pct.y * 100}%`,
                width: `${(BRAND_BOX_W / CANVAS_W) * 100}%`,
                height: `${(BRAND_BOX_H / CANVAS_H) * 100}%`,
                marginLeft: '-6px',
                marginTop: '-6px',
            }}
            onPointerDown={onPointerDown}
            onPointerMove={(e) => onPointerMove(e, previewRef.current?.getBoundingClientRect() ?? null)}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
        />
    )
}

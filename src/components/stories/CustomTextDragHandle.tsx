'use client'

import React from 'react'
import { CANVAS_W, CANVAS_H } from '../storyComposerUtils'
import { CUSTOM_TEXT_BASE_X, CUSTOM_TEXT_BASE_Y, type CustomTextBox } from './customText'

/**
 * Alça de arrasto da LEGENDA sobre a prévia — irmã da `BrandDragHandle`.
 *
 * A legenda é desenhada no canvas, então não dá para arrastá-la direto: esta alça é
 * um retângulo HTML posicionado por cima dela.
 *
 * Some quando não há texto: um retângulo tracejado vazio no meio do story pareceria
 * defeito, e ainda roubaria o gesto de quem quisesse mover o bloco.
 *
 * Mesma matemática da marca — tudo em % do CANVAS, inclusive a folga, com `dx`/`dy`
 * levando da âncora ao canto da caixa da tinta. Misturar px de tela aqui foi
 * exatamente o que desalinhou o traçado da marca (#644).
 */

interface CustomTextDragHandleProps {
    box: CustomTextBox
    offset: { x: number; y: number }
    previewRef: React.RefObject<HTMLDivElement | null>
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => void
    onPointerMove: (e: React.PointerEvent<HTMLElement>, rect: DOMRect | null) => void
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => void
}

export function CustomTextDragHandle({
    box, offset, previewRef,
    onPointerDown, onPointerMove, onPointerUp,
}: CustomTextDragHandleProps) {
    if (!box.lines.length) return null

    const left = CUSTOM_TEXT_BASE_X + offset.x + box.dx
    const top = CUSTOM_TEXT_BASE_Y + offset.y + box.dy

    return (
        <button
            type="button"
            aria-label="Arrastar a legenda"
            className="absolute z-30 touch-none select-none cursor-grab active:cursor-grabbing rounded-lg border border-dashed border-yellow-400/40 hover:border-yellow-400/80 bg-yellow-400/5 active:bg-yellow-400/15 transition-colors"
            style={{
                left: `${(left / CANVAS_W) * 100}%`,
                top: `${(top / CANVAS_H) * 100}%`,
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

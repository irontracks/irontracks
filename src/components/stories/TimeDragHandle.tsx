'use client'

import React from 'react'
import { CANVAS_W, CANVAS_H, measureTimePillBox, timeHandlePct } from '../storyComposerUtils'

/**
 * Alça de arrasto do HORÁRIO sobre a prévia do story.
 *
 * Irmã da `BrandDragHandle`, e pelo mesmo motivo: a pílula é desenhada no
 * canvas, então não dá para arrastá-la direto — esta alça é um retângulo HTML
 * posicionado por cima dela, que devolve o deslocamento ao hook.
 *
 * Nasceu do pedido do dono (25/08/2026): "deixar o horário independente do
 * layout, igual o IRONTRACKS". Antes a pílula só existia em quatro dos sete
 * layouts e sempre no mesmo canto — um elemento da peça aparecia ou sumia
 * conforme uma escolha que nada tinha a ver com ele.
 *
 * Como a marca, ela NÃO acompanha o zoom/pan do bloco: encolher os dados não
 * encolhe o horário.
 */

interface TimeDragHandleProps {
    timeOffset: { x: number; y: number }
    previewRef: React.RefObject<HTMLDivElement | null>
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => void
    onPointerMove: (e: React.PointerEvent<HTMLElement>, rect: DOMRect | null) => void
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => void
}

export function TimeDragHandle({
    timeOffset, previewRef, onPointerDown, onPointerMove, onPointerUp,
}: TimeDragHandleProps) {
    const pct = timeHandlePct(timeOffset)
    // A MESMA caixa que o desenho e o hit-test usam. Medida, não chutada: a
    // largura muda com o texto ("09:01" ≠ "23:47").
    const box = React.useMemo(() => measureTimePillBox(), [])

    return (
        <div
            role="button"
            tabIndex={0}
            aria-label="Mover o horário"
            onPointerDown={onPointerDown}
            onPointerMove={(e) => onPointerMove(e, previewRef.current?.getBoundingClientRect() ?? null)}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="absolute z-30 cursor-move rounded-lg border border-dashed border-white/25 hover:border-yellow-400/60"
            style={{
                left: `${pct.x * 100}%`,
                top: `${pct.y * 100}%`,
                // Em % do CANVAS, nunca px de tela: a prévia muda de tamanho
                // conforme o aparelho, e px fixo desalinha a alça do desenho
                // (a alça da marca já teve esse defeito).
                width: `${(box.w / CANVAS_W) * 100}%`,
                height: `${(box.h / CANVAS_H) * 100}%`,
                touchAction: 'none',
            }}
        />
    )
}

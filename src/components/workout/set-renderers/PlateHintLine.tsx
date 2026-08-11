'use client'

import React from 'react'
import { plateHintFor, formatPerSide } from '@/utils/plates/plateHint'
import type { PlateInventory } from '@/utils/plates/plateInventory'

/**
 * "Por lado: 6×20 + 1×10" — abaixo do campo de peso.
 *
 * Widget COMPARTILHADO de propósito: os 14 renderers de série têm cada um o seu
 * campo de peso, e replicar esta linha em cada um é o caminho conhecido para as
 * telas divergirem em silêncio (ver o cabeçalho dos set-renderers no CLAUDE.md).
 * Aqui mora só a apresentação — a regra de quem tem anilha e a matemática vêm de
 * `utils/plates/plateHint`.
 *
 * Não renderiza nada quando não há o que dizer: exercício sem anilha, peso vazio
 * ou inválido. Silêncio é a resposta certa na maioria das séries.
 */
export function PlateHintLine({
  exerciseName,
  weight,
  inventory,
  className = '',
}: {
  exerciseName: string | null | undefined
  /** O valor que está NO CAMPO — não o sugerido pelo motor. */
  weight: string | number | null | undefined
  inventory: PlateInventory | null | undefined
  className?: string
}) {
  const hint = plateHintFor(exerciseName, weight, inventory)
  if (!hint) return null

  const perSide = formatPerSide(hint.perSide)
  if (!perSide) return null

  return (
    <div className={`text-[10px] leading-tight text-neutral-400 ${className}`}>
      <span className="font-bold text-neutral-300">Por lado:</span> {perSide}
      {hint.barKg > 0 ? <span className="text-neutral-400"> · barra {hint.barKg}kg</span> : null}
      {/* Fechar exato nem sempre é possível com o inventário do usuário. Dizer
          "≈" e mostrar o total montável é melhor que dar um número que ele vai
          tentar montar e não conseguir. */}
      {!hint.exact ? (
        <span className="text-amber-400/80"> · ≈{String(hint.total).replace('.', ',')}kg montável</span>
      ) : null}
    </div>
  )
}

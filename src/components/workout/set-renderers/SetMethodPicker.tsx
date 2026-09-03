'use client';

/**
 * @module SetMethodPicker
 *
 * Trocar o método de UMA série — inclusive **de volta para Normal**.
 *
 * O bug que originou (relato do dono, 24/08/2026): o seletor morava dentro do
 * `normalSet.tsx`. Assim que a série virava avançada, o `renderSet` passava a
 * devolver outro renderer (`DropSetSet`, `ClusterSet`…) e **o seletor sumia
 * junto** — não havia como voltar. Caminho de mão única, e a única saída era
 * apagar a série.
 *
 * Pior no caso real dele: o drop nem tinha sido escolhido. A nota do exercício
 * dizia *"DROP-SET na última série"*, e `shouldInjectDropSetForSet` injeta o
 * método na última série **de forma derivada** — não há dado nenhum na série
 * para desfazer. Sem este seletor, o usuário ficava sem saída.
 *
 * Por isso ele vive FORA dos renderers: é o `ExerciseCard` que o desenha, uma
 * vez por série, e vale para os 14 métodos sem tocar em nenhum deles. É a mesma
 * razão pela qual a escolha de qual série remover também mora no card.
 */
import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

/** Os métodos oferecidos na troca rápida. `Normal` limpa a marcação. */
export const SET_METHOD_OPTIONS = [
  'Normal',
  'Drop-Set',
  'SST',
  'Rest-Pause',
  'Cluster',
  'Stripping',
  'Bi-Set',
  'Super-Set',
] as const

export type SetMethodPickerProps = {
  /** Método efetivo que a série mostra HOJE — inclusive o inferido pela nota. */
  current: string
  /**
   * Recebe o rótulo escolhido — **`'Normal'` explícito**, nunca string vazia.
   * `''` cairia de volta na inferência por nota, e escolher "Normal" numa série
   * cujo drop vem de *"DROP-SET na última série"* não desfaria nada.
   */
  onSelect: (method: string) => void
  /** Série concluída não troca de método (o log já foi fechado). */
  disabled?: boolean
  className?: string
}

export function SetMethodPicker({ current, onSelect, disabled, className }: SetMethodPickerProps) {
  const [open, setOpen] = useState(false)
  if (disabled) return null

  const label = String(current || '').trim() || 'Normal'

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-expanded={open}
        aria-label={`Método da série: ${label}`}
        /*
         * `tap-44` SÓ com a lista fechada. Medido no iPhone 17 Pro Max: a área
         * estendida do `::after` tem 44pt de altura, o rótulo tem ~13pt, e a
         * lista abre ~22pt abaixo — ou seja, com a lista ABERTA essa área
         * invisível cobre a primeira fileira de chips e engole o toque em
         * "Normal". O clique fechava a lista e nada mudava.
         *
         * É a lição do PR dos dots do tour: alvo pequeno nem sempre se resolve
         * ampliando; quando não há espaço, ampliar acerta o alvo errado.
         */
        className={`inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-neutral-300 transition-colors ${open ? '' : 'tap-44'}`}
      >
        {label}
        <ChevronDown size={9} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="expand-enter flex flex-wrap gap-1 mt-1">
          {SET_METHOD_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => { onSelect(opt); setOpen(false) }}
              className={`tap-44 px-2 py-0.5 rounded-md text-[10px] font-black border transition-colors ${
                label === opt
                  ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-400'
                  : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:border-neutral-600 hover:text-neutral-300'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

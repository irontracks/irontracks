'use client';

import React from 'react';

/**
 * Escala numérica tocável do check-out (RPE / Satisfação / Dor).
 *
 * Antes, RPE e Dor eram <select> e só a Satisfação era botão — três escalas, dois
 * padrões. Pós-treino é tela de pressa (suado, com pressa): dropdown são 2+ toques,
 * botão é 1. Aqui os três ficam iguais, com alvo de 44px e um "Limpar" que preserva
 * o "não informar" (o campo é opcional e começa vazio).
 */
export interface CheckinScaleProps {
  label: string;
  /** Âncora curta da escala (ex.: o que significa 10 no RPE). */
  hint?: string;
  values: number[];
  /** Valor atual como string ('' = não informado). */
  value: string;
  onChange: (next: string) => void;
  /** Classe de grid (ex.: 'grid-cols-5' → 1..10 em 2 linhas). */
  gridCols: string;
}

export function CheckinScale({ label, hint, values, value, onChange, gridCols }: CheckinScaleProps) {
  const groupId = `checkin-scale-${label.replace(/\W+/g, '-').toLowerCase()}`;
  const hasValue = String(value ?? '') !== '';

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <div id={groupId} className="text-xs font-black uppercase tracking-widest text-neutral-400">
          {label}
        </div>
        {hasValue && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 hover:text-neutral-200 transition-colors"
          >
            Limpar
          </button>
        )}
      </div>

      {hint ? <p className="text-[11px] text-neutral-500 leading-snug">{hint}</p> : null}

      <div className={`grid ${gridCols} gap-2`} role="group" aria-labelledby={groupId}>
        {values.map((n) => {
          const selected = String(value ?? '') === String(n);
          return (
            <button
              key={n}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(String(n))}
              className={
                selected
                  ? 'min-h-[44px] rounded-xl bg-yellow-500 text-black font-black transition-colors'
                  : 'min-h-[44px] rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black hover:bg-neutral-800 transition-colors'
              }
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default CheckinScale;

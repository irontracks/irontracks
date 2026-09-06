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
  /**
   * Modo COMPACTO para escala cuja resposta é quase sempre zero.
   *
   * A dor muscular abria 11 botões em duas linhas no check-in E no check-out —
   * 22 botões por treino — e a base responde **0,3 na média, com 24 respostas
   * ≥7 em toda a história** (medido, CLAUDE.md). Aqui a tela começa com dois
   * chips ("Sem dor" · "Tenho dor →"); a escala 1–N só aparece para quem tem
   * o que dizer. Nada muda no dado: continua 0–10 no mesmo campo.
   */
  zero?: { label: string; expandLabel: string };
}

export function CheckinScale({ label, hint, values, value, onChange, gridCols, zero }: CheckinScaleProps) {
  const groupId = `checkin-scale-${label.replace(/\W+/g, '-').toLowerCase()}`;
  const hasValue = String(value ?? '') !== '';
  const [expandido, setExpandido] = React.useState(false);
  const valorNumerico = Number(value);
  // Escala aberta quando o usuário pediu OU quando já há um valor acima de zero
  // (check-out reaberto, rascunho restaurado): esconder o 7 que ele marcou seria
  // mentir sobre o próprio dado.
  const compacto = Boolean(zero) && !expandido && !(Number.isFinite(valorNumerico) && valorNumerico > 0);

  if (compacto && zero) {
    const semDor = String(value ?? '') === '0';
    return (
      <div className="space-y-2">
        <div id={groupId} className="t-meta text-xs">{label}</div>
        <div className="flex gap-2" role="group" aria-labelledby={groupId}>
          <button
            type="button"
            aria-pressed={semDor}
            onClick={() => onChange('0')}
            className={
              semDor
                ? 'flex-1 min-h-[44px] rounded-xl bg-yellow-500 text-black font-black transition-colors'
                : 'flex-1 min-h-[44px] rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black hover:bg-neutral-800 transition-colors'
            }
          >
            {zero.label}
          </button>
          <button
            type="button"
            aria-expanded={false}
            onClick={() => setExpandido(true)}
            className="flex-1 min-h-[44px] rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-300 font-bold hover:bg-neutral-800 transition-colors"
          >
            {zero.expandLabel} →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <div id={groupId} className="t-meta text-xs">
          {label}
        </div>
        {hasValue && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            Limpar
          </button>
        )}
      </div>

      {hint ? <p className="text-[11px] text-neutral-400 leading-snug">{hint}</p> : null}

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

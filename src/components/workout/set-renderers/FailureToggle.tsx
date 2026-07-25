'use client';

import React from 'react';
import { useWorkoutContext } from '../WorkoutContext';

/**
 * FailureToggle — marca a série como levada à FALHA muscular.
 *
 * Era implementado inline e só existia em 3 dos 14 renderers de série (normal,
 * repetições forçadas, heavy duty). Nos métodos avançados — justamente os que mais
 * são levados à falha (drop, rest-pause, cluster…) — não havia como marcar.
 *
 * Além de ser dado do treino, `failure` alimenta o motor de carga: `suggestWeight`
 * NÃO progride a carga quando a última sessão foi à falha (segura no peso anterior).
 * Sem o botão nesses métodos, o motor não enxergava as falhas e podia subir carga
 * em cima de uma série que já tinha estourado.
 *
 * Compacto por padrão (`compact`) porque as linhas dos métodos avançados são bem
 * mais apertadas que a da série normal.
 */
export function FailureToggle({ exIdx, setIdx, compact = false }: {
  exIdx: number;
  setIdx: number;
  compact?: boolean;
}) {
  const { getLog, updateLog } = useWorkoutContext();
  const key = `${exIdx}-${setIdx}`;
  const log = getLog(key);
  const failed = !!log.failure;

  return (
    <button
      type="button"
      onClick={() => updateLog(key, { failure: !failed })}
      aria-pressed={failed}
      aria-label={`Marcar série ${setIdx + 1} como levada à falha`}
      title={failed ? 'Série levada à falha' : 'Marcar como levada à falha'}
      className={[
        'shrink-0 inline-flex items-center justify-center gap-1 rounded-lg font-black uppercase tracking-widest border transition-colors',
        compact ? 'h-9 w-9 text-[11px]' : 'h-7 px-2.5 text-[11px]',
        failed
          ? 'text-red-300 bg-red-500/15 border-red-500/40'
          : 'text-neutral-500 bg-black/30 border-neutral-700 hover:text-red-300 hover:border-red-500/40',
      ].join(' ')}
    >
      <span aria-hidden>💥</span>
      {!compact && (failed ? 'Falha' : 'Falha?')}
    </button>
  );
}

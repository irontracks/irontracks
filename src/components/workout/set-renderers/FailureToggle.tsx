'use client';

import { Flame } from 'lucide-react';

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
 * FORMA ÚNICA: ícone + rótulo "Falha", igual nos 14 renderers. Havia uma variante
 * `compact` (só o ícone) nos métodos avançados porque as linhas deles são mais
 * apertadas — e o resultado era o mesmo controle com duas caras na MESMA tela: na
 * série normal ele se explicava, no drop logo abaixo era uma chama muda que ninguém
 * associava a "falha". Aperto de linha se resolve encolhendo o texto que já trunca,
 * não amputando o rótulo de um botão de estado (relato do dono, 19/08/2026).
 */
export function FailureToggle({ exIdx, setIdx, extraPatch }: {
  exIdx: number;
  setIdx: number;
  /**
   * Campos que o renderer precisa carimbar junto no MESMO patch. A série normal
   * persiste `advanced_config` em toda escrita do log — por isso ela mantinha um
   * botão inline próprio, que ficou para trás quando este componente ganhou o
   * `whitespace-nowrap`/`shrink-0` e voltou a quebrar em duas linhas (print do
   * dono, 04/08/2026: 💥 em cima, FALHA? embaixo). Com este parâmetro não há mais
   * motivo para existir uma segunda cópia do chip.
   */
  extraPatch?: Record<string, unknown>;
}) {
  const { getLog, updateLog } = useWorkoutContext();
  const key = `${exIdx}-${setIdx}`;
  const log = getLog(key);
  const failed = !!log.failure;

  return (
    <button
      type="button"
      onClick={() => updateLog(key, { failure: !failed, ...extraPatch })}
      aria-pressed={failed}
      aria-label={`Marcar série ${setIdx + 1} como levada à falha`}
      title={failed ? 'Série levada à falha' : 'Marcar como levada à falha'}
      className={[
        // `whitespace-nowrap` é o que impede o rótulo de quebrar em duas linhas
        // (emoji em cima, palavra embaixo) quando a nota do autoload disputa a
        // largura no mesmo flex. `tracking-wide` + `font-bold` no lugar de
        // `tracking-widest` + `font-black`: em caixa alta a palavra ficava larga
        // e pesada demais para o tamanho do botão.
        'shrink-0 inline-flex items-center justify-center gap-1 rounded-lg font-bold uppercase tracking-wide whitespace-nowrap border transition-colors',
        'tap-44 h-9 px-2.5 text-[10px]',
        failed
          ? 'text-red-300 bg-red-500/15 border-red-500/40'
          : 'text-neutral-400 bg-black/30 border-neutral-700 hover:text-red-300 hover:border-red-500/40',
      ].join(' ')}
    >
      <Flame size={12} aria-hidden="true" />
      {/* Rótulo fixo "Falha": o botão é um ESTADO (marcado/não marcado), não uma
          pergunta. "Falha?" com interrogação lia como se o app estivesse
          perguntando algo, e mudar o texto ao alternar fazia o alvo dançar de
          largura debaixo do polegar. Quem comunica o estado é a cor + aria-pressed. */}
      Falha
    </button>
  );
}

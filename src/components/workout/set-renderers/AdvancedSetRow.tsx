'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, MessageSquare, Pencil } from 'lucide-react';
import { useWorkoutContext } from '../WorkoutContext';
import { FailureToggle } from './FailureToggle';
import { HelpHint } from '@/components/ui/HelpHint';
import { normalizeExerciseKey } from '../utils';
import { SetMediaAttach } from '@/components/workout/SetMediaAttach';

/**
 * A LINHA de uma série de método avançado — o molde único dos 11 renderers que
 * abrem modal (drop, rest-pause, cluster, stripping, FST-7, heavy duty, ponto
 * zero, forçadas, negativas, parciais, sistema 21, onda).
 *
 * Por que existe: cada um desenhava a própria linha, e elas divergiram em
 * silêncio — número ora em badge ora em `#4` monoespaçado, "Abrir" ora com
 * largura fixa ora esticado, "Concluir" ora ao lado ora numa segunda linha, o
 * chip de falha em três lugares diferentes. O dono viu o drop padronizado e
 * perguntou pelos outros (20/08/2026); a resposta certa não era repetir o molde
 * 11 vezes — é ter UM molde.
 *
 * A grade é a MESMA da série normal (`normalSet`), que é a referência do app:
 *
 *     32px (nº) · 36px (notas) · 1fr · 92px (Concluir)
 *
 * A faixa de 1fr é onde a série normal põe peso/reps/RPE. No método avançado
 * esses números moram no modal, então quem ocupa a faixa é o botão que leva até
 * lá — e ele preenche tudo, em vez de deixar um vão no meio da linha.
 *
 * O rodapé segue o molde do normal: informação à esquerda (método + resumo),
 * chip de falha à direita. Falha é MARCAÇÃO sobre a série, não ação de
 * execução — não disputa espaço com quem executa.
 */

/**
 * Observações com estado LOCAL: o ticker de 1s re-renderiza o card inteiro, e um
 * textarea totalmente controlado pelo log perde tecla no meio da digitação. É o
 * mesmo motivo do `useInputField` da série normal — aqui em versão mínima, porque
 * o campo de nota não sofre o re-sync do autoload (que só mexe em peso/RPE).
 */
function useNotesField(external: string, onSave: (v: string) => void) {
  const [local, setLocal] = useState(external);
  const focused = useRef(false);
  useEffect(() => {
    // Sincroniza com o log SÓ fora de foco. Com o campo em foco, o valor externo
    // é ignorado — é o que impede o ticker de 1s de apagar o que está sendo
    // digitado. Cascata aqui não existe: quando os dois já são iguais o React
    // sai sem re-renderizar.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!focused.current) setLocal(external);
  }, [external]);
  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setLocal(e.target.value);
      onSave(e.target.value);
    },
    [onSave],
  );
  const onFocus = useCallback(() => {
    focused.current = true;
  }, []);
  const onBlur = useCallback(
    (e: React.FocusEvent<HTMLTextAreaElement>) => {
      focused.current = false;
      onSave(e.target.value);
    },
    [onSave],
  );
  return { value: local, onChange, onFocus, onBlur };
}

export interface AdvancedSetRowProps {
  exIdx: number;
  setIdx: number;
  done: boolean;
  /** Falso trava o "Concluir" — o método exige dados que ainda não estão lá. */
  canDone: boolean;
  /** "Drop", "Rest-P", "Cluster"… — o nome curto que vai no rodapé. */
  methodLabel: string;
  /** Verbete do glossário, quando o método tem um. */
  help?: { title: string; text: string; tooltip?: string } | null;
  /** Resumo do método no rodapé: "3 etapas • 24 reps", "Intra 15s • Total: 30 reps". */
  info?: React.ReactNode;
  /** O que o botão da faixa mostra quando a série está concluída. */
  doneSummary?: string;
  /** Abre o modal do método. */
  onOpen: () => void;
  onToggleDone: () => void;
  /**
   * Campo inline que alguns métodos têm ANTES do "Abrir" (o peso do rest-pause
   * e do cluster). Divide a faixa de 1fr com o botão.
   */
  weightSlot?: React.ReactNode;
  /** Aviso de por que ainda não dá para concluir. */
  hint?: React.ReactNode;
  /** Linhas abaixo do card: nota do autoload, dica de anilhas, pílulas. */
  children?: React.ReactNode;
}

export function AdvancedSetRow({
  exIdx,
  setIdx,
  done,
  canDone,
  methodLabel,
  help,
  info,
  doneSummary,
  onOpen,
  onToggleDone,
  weightSlot,
  hint,
  children,
}: AdvancedSetRowProps) {
  const { openNotesKeys, toggleNotes, getLog, updateLog, reportHistory, exercises } = useWorkoutContext();

  const key = `${exIdx}-${setIdx}`;
  const log = getLog(key);
  const notesValue = String(log.notes ?? '');
  const hasNotes = notesValue.trim().length > 0;
  const notesField = useNotesField(notesValue, (v) => updateLog(key, { notes: v }));
  const isNotesOpen = openNotesKeys.has(key);

  // Nota da última vez que este exercício foi feito — some sozinha quando não há.
  const ex = Array.isArray(exercises) ? exercises[exIdx] : null;
  const histEntry = reportHistory?.exercises?.[normalizeExerciseKey(String(ex?.name ?? ''))];
  const lastHistItem = histEntry?.items?.length ? [...histEntry.items].sort((a, b) => b.ts - a.ts)[0] : null;
  const prevNote = lastHistItem?.setNotes?.[setIdx] ?? null;
  const hasAnyNote = hasNotes || !!prevNote;

  return (
    <div key={key} className="space-y-1">
      <div
        className={[
          'rounded-xl border px-2.5 py-2 transition-all duration-300 shadow-sm',
          done ? 'bg-emerald-950/30 border-emerald-500/30' : 'bg-neutral-900/50 border-neutral-800/80',
        ].join(' ')}
      >
        <div
          className="grid items-center gap-1.5"
          style={{ gridTemplateColumns: '32px 36px minmax(0,1fr) 92px' }}
        >
          {/* Número da série. `aria-hidden`: o número já é dito pelos rótulos
              dos controles da linha ("Concluir série 3"), e anunciá-lo sozinho
              faria o leitor de tela ler "3" solto antes de qualquer contexto. */}
          <div
            aria-hidden="true"
            className={[
              'h-7 inline-flex items-center justify-center rounded-lg text-[11px] font-black tracking-tight border select-none',
              done
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                : 'bg-yellow-500/15 text-yellow-400 border-yellow-500/40',
            ].join(' ')}
          >
            {setIdx + 1}
          </div>

          <button
            type="button"
            aria-label={isNotesOpen ? 'Fechar observações' : 'Observações'}
            onClick={() => toggleNotes(key)}
            className={
              isNotesOpen || hasAnyNote
                ? 'tap-44 h-9 w-9 inline-flex items-center justify-center rounded-lg text-yellow-500 bg-yellow-500/10 border border-yellow-500/40 hover:bg-yellow-500/15 transition duration-200'
                : 'h-9 w-9 inline-flex items-center justify-center rounded-lg text-neutral-400 bg-black/30 border border-neutral-700 hover:border-yellow-500/60 hover:text-yellow-500 transition duration-200'
            }
          >
            <MessageSquare size={12} />
          </button>

          {/* Faixa dos "campos": o peso inline (quando o método tem) e o botão
              que abre o modal, que ocupa o que sobrar. */}
          <div className="flex items-center gap-1.5 min-w-0">
            {weightSlot}
            <button
              type="button"
              onClick={onOpen}
              aria-label={`Abrir ${methodLabel} – série ${setIdx + 1}`}
              className={[
                'flex-1 min-w-0 tap-44 h-9 rounded-lg border text-sm outline-none inline-flex items-center justify-center gap-2 transition-colors',
                done
                  ? 'bg-black/20 border-emerald-500/25 text-emerald-200 hover:border-emerald-500/50'
                  : 'bg-black/30 border-neutral-700 text-white hover:border-yellow-500/60 hover:text-yellow-500',
              ].join(' ')}
            >
              <Pencil size={14} className="shrink-0" />
              <span className="text-xs font-black truncate">{done && doneSummary ? doneSummary : 'Abrir'}</span>
            </button>
          </div>

          <button
            type="button"
            disabled={!done && !canDone}
            onClick={onToggleDone}
            aria-label={done ? `Desfazer série ${setIdx + 1}` : `Concluir série ${setIdx + 1}`}
            className={[
              'inline-flex items-center justify-center gap-1 tap-44 h-9 w-[92px] rounded-xl t-action text-xs whitespace-nowrap active:scale-95 transition-all duration-150',
              done
                ? 'bg-emerald-500 text-black shadow-sm shadow-emerald-500/30'
                : canDone
                  ? 'bg-yellow-500/10 border border-yellow-500/40 text-yellow-300 hover:bg-yellow-500/20'
                  : 'bg-neutral-800/40 border border-neutral-800 text-neutral-400 cursor-not-allowed',
            ].join(' ')}
          >
            <Check size={13} />
            {done ? 'Feito' : 'Concluir'}
          </button>
        </div>

        {/* Rodapé: método + resumo à esquerda, falha à direita. */}
        <div className="mt-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <span
              className={[
                'text-[10px] uppercase tracking-widest font-black inline-flex items-center gap-1 group shrink-0',
                done ? 'text-emerald-400' : 'text-yellow-500',
              ].join(' ')}
            >
              {methodLabel}
              {help && (
                <HelpHint title={help.title} text={help.text} tooltip={help.tooltip} className="h-4 w-4 text-[10px]" />
              )}
            </span>
            {info && <span className="text-xs text-neutral-400 min-w-0">{info}</span>}
          </div>
          <FailureToggle exIdx={exIdx} setIdx={setIdx} />
        </div>
      </div>

      {!done && hint && (
        <div className="pl-12 text-[11px] text-neutral-400 font-semibold">{hint}</div>
      )}

      {children}

      {isNotesOpen && (
        <div className="space-y-1.5">
          {prevNote && (
            <div className="flex items-start gap-1.5 px-2.5 py-1.5 rounded-lg bg-neutral-900/60 border border-neutral-800">
              <span className="text-[10px] t-meta shrink-0 mt-0.5">Anterior</span>
              <p className="text-xs text-neutral-400 italic leading-snug">{prevNote}</p>
            </div>
          )}
          <textarea
            value={notesField.value}
            onChange={notesField.onChange}
            onFocus={notesField.onFocus}
            onBlur={notesField.onBlur}
            placeholder="Observações da série"
            rows={2}
            aria-label="Observações da série"
            className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-[16px] text-white outline-none focus:ring-1 ring-yellow-500"
          />
          <SetMediaAttach
            log={log}
            logKey={key}
            exerciseIndex={exIdx}
            setIndex={setIdx}
            exerciseName={String((ex as { name?: unknown } | null)?.name ?? '')}
            updateLog={updateLog}
          />
        </div>
      )}
    </div>
  );
}

export default AdvancedSetRow;

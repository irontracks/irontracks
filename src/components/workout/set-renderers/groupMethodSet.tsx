'use client';

import React, { useMemo } from 'react';
import { parseTrainingNumber } from '@/utils/trainingNumber';
import { Check, MessageSquare, Pencil } from 'lucide-react';
import { useWorkoutContext } from '../WorkoutContext';
import { FailureToggle } from './FailureToggle';
import {
  isObject,
  toNumber,
  normalizeExerciseKey,
} from '../utils';

import { UnknownRecord, WorkoutExercise } from '../types';
import { useAutoloadWeight } from '../hooks/useAutoloadWeight';
import { AutoloadNote } from './AutoloadNote';
import { PlateHintLine } from './PlateHintLine';
import { inventoryFromSettings } from '@/utils/plates/plateInventory';
import { buildExerciseGroups } from '@/lib/workoutGroups';

// --- Group Method Set (Bi-Set / Super-Set / Tri-Set / Giant-Set / Pré-exaustão / Pós-exaustão) ---

const GROUP_METHOD_INFO: Record<string, string> = {
  'Bi-Set': '2 exercícios • mesmo grupo muscular • 0s descanso entre eles',
  'Super-Set': '2 exercícios antagonistas • 0s descanso entre eles',
  'Tri-Set': '3 exercícios mesmo grupo • 0s descanso',
  'Giant-Set': '4+ exercícios em sequência • 0s descanso',
  'Pré-exaustão': 'Isolador ANTES do composto • Execute imediatamente',
  'Pós-exaustão': 'Composto ANTES do isolador • Execute imediatamente',
};


const GroupMethodSetInner = ({ ex, exIdx, setIdx }: { ex: WorkoutExercise; exIdx: number; setIdx: number }) => {
  const { getLog, updateLog, setGroupMethodModal, openNotesKeys, toggleNotes, startTimer, getPlanConfig, reportHistory, exercises, settings } = useWorkoutContext();
  // Este exercício é o ÚLTIMO membro do grupo (Bi-Set/Super-Set…)? Só aí o descanso
  // deve rolar. Concluir a 1ª metade do par vai DIRETO pra outra ("0s descanso entre
  // eles", como diz o GROUP_METHOD_INFO) via auto-alternância do ExerciseList. Antes,
  // handleToggleDone disparava descanso em TODA série concluída — abrindo um timer
  // espúrio ENTRE as metades e mandando o "próxima" pro lugar errado; no device isso
  // deixava o 2º exercício do par frequentemente sem concluir. Solo (método de grupo
  // isolado, sem par consecutivo) não entra no mapa → descansa normal.
  const isLastGroupMember = useMemo(() => {
    const g = buildExerciseGroups(Array.isArray(exercises) ? (exercises as unknown[]) : []).get(exIdx);
    return !g || g.position === g.size - 1;
  }, [exercises, exIdx]);
  const key = `${exIdx}-${setIdx}`;
  const log = getLog(key);
  const cfg = getPlanConfig(ex, setIdx);
  const { isAutoWeight, rationale: autoRationale, plateHint: autoPlateHint, autoInputClass, setUserWeight } = useAutoloadWeight(ex, exIdx, setIdx);
  const method = String(ex?.method || '').trim();
  const perSetMethod = String(log.per_set_method || '').trim();
  const effectiveMethod = perSetMethod || method;
  const prevNote = (() => {
    const entry = reportHistory?.exercises?.[normalizeExerciseKey(ex.name)];
    const latest = entry?.items?.length ? [...entry.items].sort((a, b) => b.ts - a.ts)[0] : null;
    return latest?.setNotes?.[setIdx] ?? null;
  })();
  const weightValue = String(log.weight ?? (isObject(cfg) ? toNumber((cfg as UnknownRecord).weight) ?? '' : '') ?? '');
  const repsValue = String(log.reps ?? '');
  const rpeValue = String(log.rpe ?? '');
  const done = !!log.done;
  // Concluir exige SÓ o peso — igual à série normal (normalSet conclui sem reps).
  // Antes exigia peso E reps, e o botão ficava travado em silêncio: no treino real de
  // 2026-07-24 o 2º exercício de um Bi-Set ("Panturrilha em pé") terminou com as 4
  // séries preenchidas e NENHUMA concluída. Divergir da série normal aqui não tem
  // razão de ser — reps continua sendo gravado quando preenchido.
  const canDone = !!String(weightValue || '').trim();
  const notesValue = String(log.notes ?? '');
  const hasNotes = notesValue.trim().length > 0;
  const isNotesOpen = openNotesKeys.has(key);
  const hasAnyNote = hasNotes || !!prevNote;
  // O editor SUGERE restTime 0 ao marcar Bi-Set ("0s entre eles") e isso vale pro
  // 1º membro — mas quando fica 0 no ÚLTIMO membro, o fim da rodada não descansava
  // nunca. Mesmo fallback do normalSet (`autoRestTimerWhenMissing`), pra família
  // não divergir: sem a flag, comportamento antigo intacto.
  const configuredRestTime = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);
  const restSettings = settings as Record<string, unknown> | null;
  const defaultRestSeconds = Math.max(15, Math.min(600, Number(restSettings?.restTimerDefaultSeconds ?? 90) || 90));
  const restTime = (configuredRestTime && configuredRestTime > 0)
    ? configuredRestTime
    : (restSettings?.autoRestTimerWhenMissing ? defaultRestSeconds : configuredRestTime);
  // ex.sets é a CONTAGEM (número), nunca um array — o Array.isArray(ex.sets) dava
  // SEMPRE false e o watermark planejado por-série nunca aparecia. O plano por-série
  // vive em setDetails.
  const sdArr = Array.isArray(ex?.setDetails) ? ex.setDetails : (Array.isArray(ex?.set_details) ? ex.set_details : null);
  const plannedSet = sdArr ? (sdArr[setIdx] ?? null) : null;
  const plannedReps = String(isObject(plannedSet) ? (plannedSet as UnknownRecord).reps ?? '' : ex?.reps ?? '').trim();

  const plannedWeight = parseTrainingNumber(isObject(plannedSet) ? (plannedSet as UnknownRecord).weight ?? ex?.weight ?? null : ex?.weight ?? null);

  const histEntry = reportHistory?.exercises?.[normalizeExerciseKey(ex.name)];
  const lastItem = histEntry?.items?.length
    ? [...histEntry.items].sort((a, b) => b.ts - a.ts)[0]
    : null;
  const histWeight = lastItem?.setWeights?.[setIdx] ?? null;
  const histReps   = lastItem?.setReps?.[setIdx]   ?? null;
  const histRpe    = lastItem?.setRpes?.[setIdx]   ?? null;

  const summaryText = `${weightValue ? weightValue + 'kg' : '—'} × ${repsValue || '?'} reps${rpeValue ? ` • RPE ${rpeValue}` : ''}`;

  const handleToggleDone = () => {
    const nextDone = !done;
    updateLog(key, { done: nextDone, weight: weightValue, reps: repsValue, rpe: rpeValue });
    // Descanso SÓ ao concluir o último membro do par/grupo (fim da rodada). Na 1ª
    // metade não descansa — a auto-alternância leva direto ao exercício par.
    if (nextDone && restTime && restTime > 0 && isLastGroupMember) startTimer(restTime, { kind: 'rest', key, nextKey: null, restStartedAtMs: Date.now() });
  };

  return (
    <div key={key} className="space-y-1">
      <div
        className={[
          'rounded-xl border px-3 transition-all duration-300 shadow-sm shadow-black/20',
          done ? 'py-2 bg-emerald-950/30 border-emerald-500/30' : 'py-2.5 bg-neutral-900/50 border-neutral-800/80 space-y-2',
        ].join(' ')}
      >
        {done ? (
          <div className="flex items-center gap-2">
            <div className="w-8 text-xs font-mono text-neutral-400 shrink-0">#{setIdx + 1}</div>
            <span className="text-[10px] uppercase tracking-widest font-black text-emerald-400 shrink-0">{effectiveMethod}</span>
            <span className="text-xs text-neutral-300 truncate flex-1 min-w-0">{summaryText}</span>
            <FailureToggle exIdx={exIdx} setIdx={setIdx} />
            <button
              type="button"
              onClick={() => toggleNotes(key)} aria-label="Observações"
              className={isNotesOpen || hasAnyNote ? 'tap-44 h-9 w-9 inline-flex items-center justify-center rounded-lg text-yellow-500 bg-yellow-500/10 border border-yellow-500/40' : 'h-9 w-9 inline-flex items-center justify-center rounded-lg text-neutral-400 bg-black/30 border border-neutral-700 hover:border-yellow-500/60 hover:text-yellow-500 transition duration-200'}
            >
              <MessageSquare size={12} />
            </button>
            <button
              type="button"
              onClick={handleToggleDone}
              className="inline-flex items-center justify-center gap-1 tap-44 h-9 px-3 rounded-xl font-black text-xs whitespace-nowrap active:scale-95 transition-all duration-150 bg-emerald-500 text-black shadow-sm shadow-emerald-500/30"
            >
              <Check size={13} />
              Feito
            </button>
          </div>
        ) : (
          <>
            {/* Row 1: número + inputs */}
            <div className="flex items-center gap-2">
              <div className="w-8 text-xs font-mono text-neutral-400 shrink-0">#{setIdx + 1}</div>
              {/* Sem type="number": num WebView (locale != pt-BR) ele REJEITA a vírgula, então
                  peso decimal (95,5) não entrava — "só números redondos". inputMode="decimal"
                  já mostra o teclado certo e o valor fica como texto, igual ao normalSet. */}
              <input
                inputMode="decimal"
                aria-label={`Peso em kg – série ${setIdx + 1}`}
                value={weightValue}
                onChange={(e) => setUserWeight(e?.target?.value ?? '')}
                placeholder={histWeight != null ? `${histWeight} kg` : plannedWeight != null ? `${plannedWeight} kg` : 'Peso (kg)'}
                title={isAutoWeight ? (autoRationale || undefined) : undefined}
                className={`flex-1 min-w-0 bg-black/30 border border-neutral-700 rounded-xl px-3 py-2 text-[16px] text-white placeholder:text-neutral-400 outline-none focus:ring-1 ring-yellow-500 ${autoInputClass}`}
              />
              <input
                inputMode="numeric"
                aria-label={`Reps – série ${setIdx + 1}`}
                value={repsValue}
                onChange={(e) => updateLog(key, { reps: e?.target?.value ?? '' })}
                placeholder={plannedReps || (histReps != null ? String(histReps) : 'Reps')}
                className="w-20 shrink-0 bg-black/30 border border-neutral-700 rounded-xl px-3 py-2 text-[16px] text-white placeholder:text-neutral-400 outline-none focus:ring-1 ring-yellow-500"
              />
              <input
                inputMode="decimal"
                aria-label={`RPE – série ${setIdx + 1}`}
                value={rpeValue}
                onChange={(e) => updateLog(key, { rpe: e?.target?.value ?? '' })}
                placeholder={histRpe != null ? String(histRpe) : 'RPE'}
                className="w-16 shrink-0 bg-black/30 border border-neutral-700 rounded-xl px-3 py-2 text-[16px] text-white placeholder:text-yellow-400/50 outline-none focus:ring-1 ring-yellow-500"
              />
            </div>
            {/* Row 2: badge método + botões de ação */}
            <div className="flex items-center gap-1.5 pl-10">
              {/* Rótulo do método. A TROCA saiu daqui em 24/08/2026 e virou o
                  `SetMethodPicker` do card: esta era a 2ª cópia da mesma lista,
                  e as duas já divergiam (o `normalSet` gravava `''` para
                  Normal, que cai de volta na inferência; esta gravava
                  'Normal'). Uma lista só, para os 14 renderers. */}
              <span className="inline-flex items-center text-[10px] uppercase tracking-widest font-black text-yellow-500 flex-1 truncate">
                {effectiveMethod}
              </span>
              <FailureToggle exIdx={exIdx} setIdx={setIdx} />
              <button
                type="button"
                onClick={() => toggleNotes(key)} aria-label="Observações"
                className={isNotesOpen || hasAnyNote ? 'shrink-0 tap-44 h-9 w-9 inline-flex items-center justify-center rounded-lg text-yellow-500 bg-yellow-500/10 border border-yellow-500/40' : 'shrink-0 h-9 w-9 inline-flex items-center justify-center rounded-lg text-neutral-400 bg-black/30 border border-neutral-700 hover:border-yellow-500/60 hover:text-yellow-500 transition duration-200'}
              >
                <MessageSquare size={12} />
              </button>
              <button aria-label="Editar método"
                type="button"
                title={GROUP_METHOD_INFO[effectiveMethod] ?? effectiveMethod}
                onClick={() => setGroupMethodModal({ key, method: effectiveMethod, weight: weightValue, reps: repsValue, rpe: rpeValue, info: GROUP_METHOD_INFO[effectiveMethod] ?? '', error: '' })}
                className="shrink-0 tap-44 h-9 w-9 inline-flex items-center justify-center rounded-lg text-neutral-400 bg-black/30 border border-neutral-700 hover:border-yellow-500/60 hover:text-yellow-500 transition duration-200"
              >
                <Pencil size={12} />
              </button>
              <button
                type="button"
                disabled={!canDone}
                onClick={handleToggleDone}
                className={canDone ? 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 font-black hover:bg-yellow-500/20 hover:border-yellow-500/50 transition-all' : 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800/40 border border-neutral-800 text-neutral-400 font-bold cursor-not-allowed'}
              >
                <Check size={16} />
                <span className="text-xs">Concluir</span>
              </button>
            </div>
          </>
        )}
      </div>
      {!done && !canDone && <div className="pl-12 text-[11px] text-neutral-400 font-semibold">Preencha o peso para concluir.</div>}
      <AutoloadNote show={isAutoWeight} rationale={autoRationale} plateHint={autoPlateHint} className="pl-12" />
      {/* Anilhas por lado do peso deste exercício do par/trio. */}
      <PlateHintLine
        exerciseName={String(ex?.name ?? '')}
        weight={weightValue}
        inventory={inventoryFromSettings(settings)}
        className="pl-12"
      />
      {isNotesOpen && (
        <div className="space-y-1.5">
          {prevNote && (
            <div className="flex items-start gap-1.5 px-2.5 py-1.5 rounded-lg bg-neutral-900/60 border border-neutral-800">
              <span className="text-[9px] font-black uppercase tracking-widest text-neutral-400 shrink-0 mt-0.5">Anterior</span>
              <p className="text-xs text-neutral-400 italic leading-snug">{prevNote}</p>
            </div>
          )}
          <textarea
            aria-label="Observações da série"
            value={notesValue}
            onChange={(e) => updateLog(key, { notes: e?.target?.value ?? '' })}
            placeholder="Observações da série"
            rows={2}
            className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-[16px] text-white outline-none focus:ring-1 ring-yellow-500"
          />
        </div>
      )}
    </div>
  );
};

export const GroupMethodSet = React.memo(GroupMethodSetInner, (a, b) =>
  a.ex === b.ex && a.exIdx === b.exIdx && a.setIdx === b.setIdx,
);

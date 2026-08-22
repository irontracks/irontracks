'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { parseTrainingNumber } from '@/utils/trainingNumber';

import { normalizeMiniSets } from '../helpers/restPauseRules';
import { useWorkoutContext } from '../WorkoutContext';
import { AdvancedSetRow } from './AdvancedSetRow';
import { HELP_TERMS } from '@/utils/help/terms';
import {
  isObject,
  DELOAD_SUGGEST_MODE,
} from '../utils';
import { UnknownRecord, WorkoutExercise } from '../types';
import { useAutoloadWeight } from '../hooks/useAutoloadWeight';
import { AutoloadNote } from './AutoloadNote';
import { PlateHintLine } from './PlateHintLine';
import { inventoryFromSettings } from '@/utils/plates/plateInventory';

const RestPauseSetInner = ({
  ex, exIdx, setIdx, sstOverride,
}: {
  ex: WorkoutExercise;
  exIdx: number;
  setIdx: number;
  sstOverride?: { restSec: number; miniCount: number } | null;
}) => {
  const {
    getLog,
    updateLog,
    getPlanConfig,
    getPlannedSet,
    startTimer,
    setRestPauseModal,
    restPauseDraftsRef,
    deloadSuggestions,
    settings,
  } = useWorkoutContext();

  const key = `${exIdx}-${setIdx}`;
  const log = getLog(key);
  const cfg = getPlanConfig(ex, setIdx);
  const plannedSet = getPlannedSet(ex, setIdx);
  const restTime = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);
  const { isAutoWeight, rationale: autoRationale, plateHint: autoPlateHint, autoInputClass, setUserWeight } = useAutoloadWeight(ex, exIdx, setIdx);

  // ── Focus-aware local input state (prevents ticker re-renders from erasing typed values) ──
  function useLocalField(external: string, onSave: (v: string) => void) {
    const [local, setLocal] = useState(external);
    const focused = useRef(false);
    useEffect(() => { if (!focused.current) setLocal(external); }, [external]);
    const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setLocal(e.target.value); onSave(e.target.value);
    }, [onSave]);
    const onFocus = useCallback(() => { focused.current = true; }, []);
    const onBlur = useCallback((e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      focused.current = false; onSave(e.target.value);
    }, [onSave]);
    return { value: local, onChange, onFocus, onBlur };
  }

  type DeloadEntrySuggestion = { weight?: number | null; reps?: number | null; rpe?: number | null };
  const suggestionValue = deloadSuggestions[key];
  const suggestion: DeloadEntrySuggestion | null = isObject(suggestionValue) ? (suggestionValue as DeloadEntrySuggestion) : null;
  const useWatermark = DELOAD_SUGGEST_MODE === 'watermark';
  const weightPlaceholder = useWatermark && suggestion?.weight != null ? `${suggestion.weight} kg` : 'kg';

  const weightField = useLocalField(
    String(log?.weight ?? cfg?.weight ?? ''),
    (v) => setUserWeight(v, { advanced_config: cfg ?? log.advanced_config ?? null }),
  );

  const auto = isObject(plannedSet?.it_auto) ? (plannedSet.it_auto as UnknownRecord) : null;
  // SST override takes priority for the label
  const modeLabel = sstOverride
    ? 'SST'
    : String(auto?.label || '').trim() || (String(auto?.kind || '') === 'sst' ? 'SST' : 'Rest-P');

  // SST override takes priority for config values
  const pauseSec = sstOverride ? sstOverride.restSec : (parseTrainingNumber(cfg?.rest_time_sec) ?? 15);



  const rp = isObject(log.rest_pause) ? (log.rest_pause as UnknownRecord) : ({} as UnknownRecord);
  const minisArrRaw: unknown[] = Array.isArray(rp?.mini_reps) ? (rp.mini_reps as unknown[]) : [];

  // miniSets: priority chain — sstOverride > cfg.mini_sets > log.rest_pause.planned_mini_sets > mini_reps already saved
  // O resultado passa SEMPRE por `normalizeMiniSets`: qualquer fonte pode trazer 1
  // — plano rebaixado por um registro incompleto (bug corrigido em
  // helpers/restPauseRules.ts), treino antigo, edição manual — e Rest-Pause com uma
  // mini-série não é Rest-Pause, é série normal com uma pausa. (print do dono,
  // 03/08/2026: "1 minis • descanso 15s... não tem como fazer rest-p com 1 mini set")
  const miniSets = normalizeMiniSets(
    sstOverride
      ? sstOverride.miniCount
      : (() => {
        const fromCfg = Math.floor(parseTrainingNumber(cfg?.mini_sets) ?? 0)
        if (fromCfg > 0) return fromCfg
        const fromLog = Math.floor(parseTrainingNumber(rp?.planned_mini_sets) ?? 0)
        if (fromLog > 0) return fromLog
        // Reps já salvas no log: a contagem delas é o último indício de plano.
        if (minisArrRaw.length) return minisArrRaw.length
        // O método é Rest-Pause mas o exercício veio SEM configuração (treino antigo,
        // ou montado antes de o dropdown de método criar as etapas). Cair em 0 deixava
        // o card sem nenhum mini-set: a pessoa via o método marcado e nada para
        // preencher, tendo de configurar do zero em todo treino. (queixa do dono, 30/07)
        return 0
      })(),
  )

  const minis: Array<number | null> = Array.from({ length: miniSets }).map((_, idx) => {
    const v = minisArrRaw[idx];
    return parseTrainingNumber(v);
  });

  const total = minis.reduce<number>((acc, v) => acc + (typeof v === 'number' ? v : 0), 0);
  const done = !!log.done;
  // canDone: requires at least 1 mini AND all minis have positive reps
  const canDone = miniSets > 0 && minis.length > 0 && minis.every((v) => typeof v === 'number' && Number.isFinite(v) && v > 0);

  const summaryText = `${weightField.value ? weightField.value + 'kg' : '—'} • ${minis.map(m => m ?? '?').join('+')} = ${total} reps`;

  // Undo: called from the "Feito" button to toggle done back to false
  const handleUndo = () => {
    updateLog(key, {
      done: false,
      completedAtMs: null,
      executionSeconds: null,
      reps: String(total || ''),
      rest_pause: { ...rp, activation_reps: 0, mini_reps: minis },
      advanced_config: cfg ?? log.advanced_config ?? null,
    });
  };

  const abrirModal = () => {
    const draft = restPauseDraftsRef?.current?.[key];
    if (draft && typeof draft === 'object') {
      setRestPauseModal({ ...(draft as UnknownRecord), error: '' });
      return;
    }
    const baseWeight = String(log?.weight ?? cfg?.weight ?? '').trim();
    const baseRpe = String(log?.rpe ?? '').trim();
    const minisInput = Array.from({ length: miniSets }).map((_, idx) => {
      const v = minisArrRaw?.[idx];
      const n = parseTrainingNumber(v);
      return n != null && n > 0 ? n : null;
    });
    setRestPauseModal({
      key,
      label: modeLabel,
      pauseSec,
      miniSets,
      weight: baseWeight,
      activationReps: null,
      minis: minisInput,
      rpe: baseRpe,
      cfg: cfg ?? null,
      error: '',
    });
  };

  const handleConcluir = () => {
    if (done) {
      handleUndo();
      return;
    }
    const nowMs = Date.now();
    const startedRaw = (log as UnknownRecord)?.startedAtMs;
    const startedAtMs = typeof startedRaw === 'number' ? startedRaw : Number(String(startedRaw ?? '').trim());
    const executionSeconds =
      Number.isFinite(startedAtMs) && startedAtMs > 0 ? Math.max(0, Math.round((nowMs - startedAtMs) / 1000)) : 0;
    updateLog(key, {
      done: true,
      completedAtMs: nowMs,
      executionSeconds,
      reps: String(total || ''),
      rest_pause: { ...rp, activation_reps: 0, mini_reps: minis },
      advanced_config: cfg ?? log.advanced_config ?? null,
    });
    if (restTime && restTime > 0) {
      const nextPlanned = getPlannedSet(ex, setIdx + 1);
      const nextKey = nextPlanned ? `${exIdx}-${setIdx + 1}` : null;
      startTimer(restTime, { kind: 'rest', key, nextKey, restStartedAtMs: nowMs });
    }
  };

  const rotulo = modeLabel === 'SST' ? 'SST' : 'Rest-P';
  const verbete = modeLabel === 'SST' ? HELP_TERMS.sst : HELP_TERMS.restPause;

  return (
    <AdvancedSetRow
      exIdx={exIdx}
      setIdx={setIdx}
      done={done}
      canDone={canDone}
      methodLabel={rotulo}
      help={{ title: verbete.title, text: verbete.text, tooltip: verbete.tooltip }}
      info={`Intra ${pauseSec || 0}s • Total: ${total || 0} reps`}
      doneSummary={summaryText}
      hint={!canDone ? 'Preencha peso e reps de todos os mini-sets no modal para concluir.' : ''}
      onOpen={abrirModal}
      onToggleDone={handleConcluir}
      weightSlot={
        <input
          inputMode="decimal"
          aria-label={`Peso em kg – série ${setIdx + 1}`}
          value={weightField.value}
          onChange={weightField.onChange}
          onFocus={weightField.onFocus}
          onBlur={weightField.onBlur}
          placeholder={weightPlaceholder}
          title={isAutoWeight ? (autoRationale || undefined) : undefined}
          className={`w-[68px] shrink-0 h-9 bg-black/30 border border-neutral-700 rounded-lg px-2 text-[16px] text-white placeholder:text-neutral-400/70 outline-none focus:ring-1 ring-yellow-500 ${autoInputClass}`}
        />
      }
    >
      <AutoloadNote show={isAutoWeight} rationale={autoRationale} plateHint={autoPlateHint} className="pl-12" />
      {/* Anilhas por lado do peso do método, que é único para as mini-séries. */}
      <PlateHintLine
        exerciseName={String(ex?.name ?? '')}
        weight={weightField.value}
        inventory={inventoryFromSettings(settings)}
        className="pl-12"
      />
    </AdvancedSetRow>
  );
};

export const RestPauseSet = React.memo(RestPauseSetInner, (a, b) =>
  a.ex === b.ex && a.exIdx === b.exIdx && a.setIdx === b.setIdx && a.sstOverride === b.sstOverride,
);

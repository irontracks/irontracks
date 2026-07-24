'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { parseTrainingNumber } from '@/utils/trainingNumber';
import { Check, ChevronDown, MessageSquare } from 'lucide-react';
import { useWorkoutContext } from '../WorkoutContext';
import { isUnilateralByName } from '@/utils/exerciseTracking';
import {
  isObject,
  DELOAD_SUGGEST_MODE,
  normalizeExerciseKey,
} from '../utils';
import { UnknownRecord, WorkoutExercise } from '../types';
import type { SetType } from '@/types/workout';
import { SetTypePopover, SET_TYPE_META, resolveSetType, useLongPress } from '../SetTypePopover';

// ── Local-state input ─────────────────────────────────────────────────────
// The workout ticker fires every 1 s and causes a full context re-render.
// If inputs were fully controlled (value = log.xxx) every keystroke would be
// lost between the onChange call and the async setState settling.
// Fix: each field keeps its OWN local string state and only writes to the
// global log on change (for immediate persistence), but reads from local state
// so the displayed value is never clobbered by an external re-render while
// the user is typing.
function useInputField(externalValue: string, onChange: (v: string) => void) {
  const [localValue, setLocalValue] = useState(externalValue);
  const isFocused = useRef(false);
  const blurredAtRef = useRef(0);

  useEffect(() => {
    if (isFocused.current) return;
    if (
      localValue &&
      !externalValue &&
      Date.now() - blurredAtRef.current < 2000
    ) {
      return;
    }
    setLocalValue(externalValue);
  // localValue intentionally excluded — we only react to external changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalValue]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const v = e.target.value;
      setLocalValue(v);
      onChange(v);
    },
    [onChange],
  );

  const handleFocus = useCallback(() => {
    isFocused.current = true;
  }, []);

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      isFocused.current = false;
      blurredAtRef.current = Date.now();
      onChange(e.target.value);
    },
    [onChange],
  );

  return { value: localValue, handleChange, handleFocus, handleBlur };
}

// React.memo defensivo. Mesmo consumindo WorkoutContext (que dispara re-render
// quando muda — agora memoizado, ver useActiveWorkoutController), evita renders
// quando o pai (ExerciseCard) re-renderizar por outro motivo com as mesmas props.
const NormalSetInner = ({
  ex,
  exIdx,
  setIdx,
  setsCount,
}: {
  ex: WorkoutExercise;
  exIdx: number;
  setIdx: number;
  setsCount?: number;
}) => {
  const {
    getLog,
    updateLog,
    updateSetType,
    getPlanConfig,
    getPlannedSet,
    startTimer,
    openNotesKeys,
    toggleNotes,
    deloadSuggestions,
    autoLoadEnabled,
    autoLoadSuggestions,
    setCollapsed,
    reportHistory,
    settings,
  } = useWorkoutContext();

  const completeBusyRef = useRef(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  // Set type popover (long-press on the set-number badge). The anchor rect is
  // captured at open time so the popover stays glued even if the badge
  // re-renders during the interaction.
  const [setTypeAnchor, setSetTypeAnchor] = useState<DOMRect | null>(null);
  const badgeRef = useRef<HTMLButtonElement | null>(null);

  const key = `${exIdx}-${setIdx}`;
  const log = getLog(key);
  const cfg = getPlanConfig(ex, setIdx);
  const plannedSet = getPlannedSet(ex, setIdx);

  // Effective set type: log wins (per-session override), then planned template,
  // then legacy is_warmup. Defaults to 'working'.
  const setType: SetType = resolveSetType({
    set_type: (log.set_type ?? (plannedSet as UnknownRecord)?.set_type) as SetType | undefined,
    is_warmup: log.is_warmup ?? (plannedSet as UnknownRecord)?.is_warmup,
  });
  const typeMeta = SET_TYPE_META[setType];
  const isMuted = setType !== 'working';

  const openSetTypePopover = useCallback(() => {
    const rect = badgeRef.current?.getBoundingClientRect() ?? null;
    setSetTypeAnchor(rect);
  }, []);
  const closeSetTypePopover = useCallback(() => setSetTypeAnchor(null), []);
  const handleSetTypeSelect = useCallback((next: SetType) => {
    updateSetType(exIdx, setIdx, next);
  }, [updateSetType, exIdx, setIdx]);
  const longPressHandlers = useLongPress(openSetTypePopover);
  const configuredRestTime = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);
  // autoRestTimerWhenMissing: quando o exercício não tem descanso definido,
  // inicia o descanso padrão (restTimerDefaultSeconds) em vez de não iniciar
  // nada. Sem a flag, mantém o comportamento antigo (só inicia se configurado).
  const restSettings = settings as Record<string, unknown> | null;
  const autoRestWhenMissing = Boolean(restSettings?.autoRestTimerWhenMissing);
  const defaultRestSeconds = Math.max(15, Math.min(600, Number(restSettings?.restTimerDefaultSeconds ?? 90) || 90));
  const restTime = (configuredRestTime && configuredRestTime > 0)
    ? configuredRestTime
    : (autoRestWhenMissing ? defaultRestSeconds : configuredRestTime);

  // Alternado (ex.: rosca alternada): alterna rep a rep, mesmo peso, SEM descanso
  // entre lados. Renderiza como série única (1 registro) e NÃO entra no fluxo
  // unilateral (2 linhas L/R + "TROCA LADO"). O volume dobra via marcador no log.
  const isAlternating = !!(ex?.isAlternating ?? (ex as Record<string, unknown>)?.is_alternating);

  // Unilateral config — explicit flag, with fallback to name detection
  // (catches templates created before the flag existed or imported without it).
  // Alternado tem PRECEDÊNCIA: se ligado, o exercício não é tratado como unilateral.
  const explicitUnilateral = ex?.isUnilateral ?? (ex as Record<string, unknown>)?.is_unilateral;
  const isUnilateral = isAlternating
    ? false
    : explicitUnilateral != null
      ? !!explicitUnilateral
      : isUnilateralByName(typeof ex?.name === 'string' ? ex.name : null);
  const sideRestTime = parseTrainingNumber((ex as Record<string, unknown>)?.sideRestTime ?? (ex as Record<string, unknown>)?.side_rest_time) ?? 15;

  // Set state
  const lDone = !!log.L_done;
  const rDone = !!log.R_done;
  const done  = !!log.done;
  // #4a auto-carga: série levada à falha muscular. RPE 10 ≠ sempre falha; esse
  // sinal explícito muda a decisão de progressão do motor (falhou → não sobe carga).
  const failed = !!log.failure;

  // #autoload: sugestão do motor para esta série (só quando ligado) + fonte do peso.
  const autoSuggestion = autoLoadEnabled ? autoLoadSuggestions?.[key] : null;
  const autoSuggestionWeight = autoSuggestion?.weight ?? null;
  // O destaque violeta + o 🧠 só valem quando o valor na caixa É a sugestão atual.
  // Sem esta igualdade a UI mentia: caixa com 90 (preenchimento antigo) e hint
  // dizendo "subi p/ 95kg" (sugestão nova) — número e explicação divergindo.
  const isAutoWeight = Boolean(
    autoLoadEnabled && log.weightSource === 'auto' && !log.done &&
    autoSuggestionWeight != null && String(log.weight ?? '') === String(autoSuggestionWeight),
  );

  // Preenche a caixa de peso com a sugestão do motor — SÓ em série de trabalho, ainda
  // não concluída, ainda vazia e ainda não tocada (weightSource nulo). Depois de preencher
  // (source='auto') ou de o usuário editar (source='user'), nunca mais reescreve.
  useEffect(() => {
    if (!autoLoadEnabled || isUnilateral) return;
    if (setType !== 'working' || log.done) return;
    if (autoSuggestionWeight == null) return;
    if (log.weightSource === 'user') return; // o usuário assumiu — nunca reescreve
    const current = String(log.weight ?? '').trim();
    const next = String(autoSuggestionWeight);
    if (current === next) return; // já sincronizado
    // Valor preexistente que NÃO é nosso (sessão restaurada, peso do template) → respeita.
    if (current !== '' && log.weightSource !== 'auto') return;
    // Preenche quando vazio E re-sincroniza quando a sugestão muda (o histórico é
    // carregado do cache primeiro e atualizado pela rede depois). Sem isto o número
    // congelava desatualizado e passava a contradizer a explicação.
    updateLog(key, { weight: next, weightSource: 'auto', advanced_config: cfg ?? log.advanced_config ?? null });
  }, [autoLoadEnabled, isUnilateral, setType, log.done, log.weight, log.weightSource, log.advanced_config, autoSuggestionWeight, key, cfg, updateLog]);

  // Unilateral: preenche AMBOS os lados (L_weight/R_weight) com a sugestão — a série
  // de trabalho não concluída, lados vazios e não tocados (weightSource nulo).
  useEffect(() => {
    if (!autoLoadEnabled || !isUnilateral) return;
    if (setType !== 'working' || log.done) return;
    if (autoSuggestionWeight == null) return;
    if (log.weightSource === 'user') return; // o usuário assumiu um dos lados — não toca
    const next = String(autoSuggestionWeight);
    const l = String(log.L_weight ?? '').trim();
    const r = String(log.R_weight ?? '').trim();
    // Preenche o lado vazio E re-sincroniza o que ainda é nosso ('auto') quando a
    // sugestão muda — senão o número congela e contradiz a explicação.
    const lStale = l !== next && (l === '' || log.weightSource === 'auto');
    const rStale = r !== next && (r === '' || log.weightSource === 'auto');
    if (!lStale && !rStale) return;
    const patch: Record<string, unknown> = { weightSource: 'auto', advanced_config: cfg ?? log.advanced_config ?? null };
    if (lStale) patch.L_weight = next;
    if (rStale) patch.R_weight = next;
    updateLog(key, patch);
  }, [autoLoadEnabled, isUnilateral, setType, log.done, log.L_weight, log.R_weight, log.weightSource, log.advanced_config, autoSuggestionWeight, key, cfg, updateLog]);

  // External values — non-unilateral
  const extWeight = String(log.weight ?? cfg?.weight ?? '');
  const extReps   = String(log.reps   ?? '');
  const extRpe    = String(log.rpe    ?? '');
  const extNotes  = String(log.notes  ?? '');

  // External values — unilateral (L side pre-fills from shared weight; R side also)
  const extLWeight = String(log.L_weight ?? log.weight ?? cfg?.weight ?? '');
  const extRWeight = String(log.R_weight ?? log.weight ?? cfg?.weight ?? '');
  const extLReps   = String(log.L_reps ?? log.reps ?? '');
  const extRReps   = String(log.R_reps ?? log.reps ?? '');
  const extLRpe    = String(log.L_rpe  ?? log.rpe  ?? '');
  const extRRpe    = String(log.R_rpe  ?? log.rpe  ?? '');

  const plannedReps = String(plannedSet?.reps ?? ex?.reps ?? '').trim();
  const plannedRpe  = String(plannedSet?.rpe  ?? ex?.rpe  ?? '').trim();

  type DeloadEntrySuggestion = { weight?: number | null; reps?: number | null; rpe?: number | null };
  const suggestionValue = deloadSuggestions[key];
  const suggestion: DeloadEntrySuggestion | null = isObject(suggestionValue)
    ? (suggestionValue as DeloadEntrySuggestion)
    : null;
  const useWatermark      = DELOAD_SUGGEST_MODE === 'watermark';
  const weightPlaceholder = useWatermark && suggestion?.weight != null ? `${suggestion.weight} kg` : 'Peso';
  const repsPlaceholder   = useWatermark && suggestion?.reps   != null ? String(suggestion.reps)   : 'Reps';
  // RPE: prioriza o último treino (watermark), igual ao peso. Sem RPE no
  // histórico, cai no planejado e por fim em 'RPE'.
  const rpeWatermark      = useWatermark && suggestion?.rpe    != null ? String(suggestion.rpe)    : (plannedRpe || 'RPE');

  const notesId     = `notes-${key}`;
  const hasNotes    = extNotes.trim().length > 0;
  const isNotesOpen = openNotesKeys.has(key);

  // Previous session note for this set
  const histEntry = reportHistory?.exercises?.[normalizeExerciseKey(ex.name)];
  const lastItem = histEntry?.items?.length ? [...histEntry.items].sort((a, b) => b.ts - a.ts)[0] : null;
  const prevNote = lastItem?.setNotes?.[setIdx] ?? null;
  const hasAnyNote = hasNotes || !!prevNote;

  // ── Input fields — non-unilateral ────────────────────────────────────
  // Peso nunca é negativo (viraria volume negativo no resumo/sugestão). Normaliza
  // tirando o sinal na gravação. (reps NÃO passa por aqui — pode ser faixa "8-12".)
  const noNegWeight = (v: string) => String(v ?? '').replace(/-/g, '');
  // #autoload: ao editar o peso na mão, marca a fonte como 'user' — isso desliga o
  // preenchimento automático desta série e alimenta o aprendizado de override (fase futura).
  const weightField = useInputField(extWeight, (v) =>
    updateLog(key, {
      weight: noNegWeight(v),
      ...(autoLoadEnabled ? { weightSource: 'user' } : {}),
      advanced_config: cfg ?? log.advanced_config ?? null,
    }),
  );
  const repsField = useInputField(extReps, (v) =>
    updateLog(key, { reps: v, advanced_config: cfg ?? log.advanced_config ?? null }),
  );
  const rpeField = useInputField(extRpe, (v) =>
    updateLog(key, { rpe: v, advanced_config: cfg ?? log.advanced_config ?? null }),
  );
  const notesField = useInputField(extNotes, (v) =>
    updateLog(key, { notes: v, advanced_config: cfg ?? log.advanced_config ?? null }),
  );

  // ── Input fields — unilateral ─────────────────────────────────────────
  // Marca a fonte como 'user' ao editar um lado — sem isto a re-sincronização do
  // autoload sobrescreveria o peso que o usuário digitou no lado.
  const lWeightField = useInputField(extLWeight, (v) =>
    updateLog(key, { L_weight: noNegWeight(v), ...(autoLoadEnabled ? { weightSource: 'user' } : {}) }));
  const rWeightField = useInputField(extRWeight, (v) =>
    updateLog(key, { R_weight: noNegWeight(v), ...(autoLoadEnabled ? { weightSource: 'user' } : {}) }));
  const lRepsField   = useInputField(extLReps,   (v) => updateLog(key, { L_reps: v }));
  const rRepsField   = useInputField(extRReps,   (v) => updateLog(key, { R_reps: v }));
  const lRpeField    = useInputField(extLRpe,    (v) => updateLog(key, { L_rpe: v }));
  const rRpeField    = useInputField(extRRpe,    (v) => updateLog(key, { R_rpe: v }));

  // Shared input style — weight column (3fr, roomy)
  const inputBase =
    'w-full bg-black/40 border border-neutral-700/80 rounded-xl px-2.5 py-2 text-[16px] text-white ' +
    'outline-none focus:ring-1 ring-yellow-500 focus:border-yellow-500/50 transition-all duration-200 ' +
    'placeholder:text-neutral-400 placeholder:text-xs focus:placeholder:opacity-0';
  // Compact variant for reps/RPE (narrow 2fr columns) — reduced padding so
  // 5-char placeholders like "10-12" fit without truncation.
  const inputCompact =
    'w-full bg-black/40 border border-neutral-700/80 rounded-xl px-1 py-2 text-[16px] text-white text-center ' +
    'outline-none focus:ring-1 ring-yellow-500 focus:border-yellow-500/50 transition-all duration-200 ' +
    'placeholder:text-neutral-400 placeholder:text-xs focus:placeholder:opacity-0';

  const collapseAndScroll = (delay: number) => {
    setTimeout(() => {
      try {
        flushSync(() => {
          setCollapsed?.((prev: Set<number>) => {
            const next = new Set(prev);
            next.add(exIdx);
            return next;
          });
        });
        const firstSetOfNext = document.querySelector<HTMLElement>(`[data-set-first="${exIdx + 1}"]`);
        const nextCard = document.querySelector<HTMLElement>(`[data-exercise-idx="${exIdx + 1}"]`);
        const target = firstSetOfNext ?? nextCard;
        // 'instant' evita o auto-zoom do iOS WKWebView que ocorre com 'smooth'
        // após um large layout shift (colapso do ExerciseCard via flushSync).
        if (target) target.scrollIntoView({ behavior: 'instant', block: 'start' });
      } catch { /* silenced */ }
    }, delay);
  };

  // ── Start rest timer after full set is done ───────────────────────────
  const triggerSetDone = (nowMs: number) => {
    if (restTime && restTime > 0) {
      const nextPlanned = getPlannedSet(ex, setIdx + 1);
      const nextKey = nextPlanned ? `${exIdx}-${setIdx + 1}` : null;
      startTimer(restTime, { kind: 'rest', key, nextKey, restStartedAtMs: nowMs });
    }
    if (setsCount != null && setIdx === setsCount - 1) {
      collapseAndScroll(restTime && restTime > 0 ? 600 : 300);
    }
  };

  // ── Unilateral: complete L side ───────────────────────────────────────
  const handleCompleteL = () => {
    if (completeBusyRef.current) return;
    completeBusyRef.current = true;
    setTimeout(() => { completeBusyRef.current = false; }, 400);

    // eslint-disable-next-line react-hooks/purity
    const nowMs = Date.now();

    if (lDone) {
      // Toggle back
      updateLog(key, {
        L_done: false,
        done: false,
        completedAtMs: null,
        executionSeconds: null,
        advanced_config: cfg ?? log.advanced_config ?? null,
      });
      return;
    }

    const willSetDone = rDone;
    updateLog(key, {
      L_done: true,
      L_reps: lRepsField.value,
      L_weight: lWeightField.value,
      L_rpe: lRpeField.value,
      ...(willSetDone ? { done: true, completedAtMs: nowMs, executionSeconds: 0 } : {}),
      advanced_config: cfg ?? log.advanced_config ?? null,
    });

    // Side rest timer fires only when the other side isn't done yet
    if (!rDone && sideRestTime > 0) {
      startTimer(sideRestTime, { kind: 'side_rest', key, restStartedAtMs: nowMs });
    }
    if (willSetDone) triggerSetDone(nowMs);
  };

  // ── Unilateral: complete R side ───────────────────────────────────────
  const handleCompleteR = () => {
    if (completeBusyRef.current) return;
    completeBusyRef.current = true;
    setTimeout(() => { completeBusyRef.current = false; }, 400);

    // eslint-disable-next-line react-hooks/purity
    const nowMs = Date.now();

    if (rDone) {
      // Toggle back
      updateLog(key, {
        R_done: false,
        done: false,
        completedAtMs: null,
        executionSeconds: null,
        advanced_config: cfg ?? log.advanced_config ?? null,
      });
      return;
    }

    const willSetDone = lDone;
    updateLog(key, {
      R_done: true,
      R_reps: rRepsField.value,
      R_weight: rWeightField.value,
      R_rpe: rRpeField.value,
      ...(willSetDone ? { done: true, completedAtMs: nowMs, executionSeconds: 0 } : {}),
      advanced_config: cfg ?? log.advanced_config ?? null,
    });

    if (!lDone && sideRestTime > 0) {
      startTimer(sideRestTime, { kind: 'side_rest', key, restStartedAtMs: nowMs });
    }
    if (willSetDone) triggerSetDone(nowMs);
  };

  // ── Normal (non-unilateral) complete ─────────────────────────────────
  const handleComplete = () => {
    if (completeBusyRef.current) return;
    completeBusyRef.current = true;
    setTimeout(() => { completeBusyRef.current = false; }, 400);

    // eslint-disable-next-line react-hooks/purity
    const nowMs       = Date.now();
    const startedRaw  = (log as UnknownRecord)?.startedAtMs;
    const startedAtMs =
      typeof startedRaw === 'number'
        ? startedRaw
        : Number(String(startedRaw ?? '').trim());
    const executionSeconds =
      Number.isFinite(startedAtMs) && startedAtMs > 0
        ? Math.max(0, Math.round((nowMs - startedAtMs) / 1000))
        : 0;

    const nextDone = !done;
    updateLog(key, {
      done: nextDone,
      // Marca a série como alternada → setVolume/reportMetrics/calorias dobram
      // (os dois braços fizeram as reps). Persistido no log pra o histórico contar
      // certo mesmo depois da sessão.
      ...(isAlternating ? { alternating: true } : {}),
      completedAtMs:    nextDone ? nowMs : null,
      executionSeconds: nextDone ? executionSeconds : null,
      // restStartMs saved here so handleTimerFinish can compute restSeconds
      // for the workout report (reads log.restStartMs, not the timer context)
      restStartMs:      nextDone && restTime && restTime > 0 ? nowMs : null,
      advanced_config:  cfg ?? log.advanced_config ?? null,
    });

    if (nextDone && restTime && restTime > 0) {
      const nextPlanned = getPlannedSet(ex, setIdx + 1);
      const nextKey     = nextPlanned ? `${exIdx}-${setIdx + 1}` : null;
      startTimer(restTime, { kind: 'rest', key, nextKey, restStartedAtMs: nowMs });
    }

    if (nextDone && setsCount != null && setIdx === setsCount - 1) {
      collapseAndScroll(restTime && restTime > 0 ? 600 : 300);
    }
  };

  // ── Unilateral sub-row renderer ───────────────────────────────────────
  // Notes button is intentionally NOT inside the grid — it sits below both rows
  // to avoid aligning with exercise-footer buttons (DROP, etc.)
  const renderSideRow = (
    side: 'L' | 'R',
    sideDone: boolean,
    wField: ReturnType<typeof useInputField>,
    repsFld: ReturnType<typeof useInputField>,
    rpeFld: ReturnType<typeof useInputField>,
    onComplete: () => void,
    isFirst: boolean,
  ) => {
    const rowColor = done
      ? 'bg-emerald-950/30 border-emerald-500/30'
      : sideDone
        ? 'bg-amber-950/20 border-amber-500/30'
        : 'bg-neutral-900/50 border-neutral-800/80';

    const badgeColor = side === 'L'
      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
      : 'bg-orange-500/20 text-orange-400 border border-orange-500/30';

    const btnColor = done
      ? 'bg-emerald-500 text-black shadow-sm shadow-emerald-500/30'
      : sideDone
        ? 'bg-emerald-600 text-white border border-emerald-500/50'
        : side === 'R' && lDone
          ? 'bg-amber-500 text-black border border-amber-500/50 shadow-sm shadow-amber-900/30'
          : 'bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700';

    // #autoload: destaca o input do lado quando o valor ainda é a sugestão do motor.
    const sideIsAuto = Boolean(
      autoLoadEnabled && !done && log.weightSource === 'auto' &&
      autoSuggestionWeight != null && String(wField.value) === String(autoSuggestionWeight),
    );

    return (
      <div
        {...(isFirst ? { 'data-set-first': exIdx } : {})}
        className={`rounded-xl border px-2.5 py-2 transition-all duration-300 shadow-sm ${rowColor}`}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${badgeColor}`}>
            LADO {side}
          </span>
          {sideDone && !done && (
            <span className="text-[9px] text-amber-400/70 font-bold">✓</span>
          )}
        </div>
        {/* 4-column grid — no notes slot here; notes lives below both rows */}
        <div className="grid items-center gap-1.5 min-w-0" style={{ gridTemplateColumns: 'minmax(0,3fr) minmax(0,2.5fr) minmax(0,1.5fr) 92px' }}>
          {/* Weight */}
          <input
            inputMode="decimal"
            aria-label={`Peso lado ${side} – série ${setIdx + 1}`}
            value={wField.value}
            onChange={wField.handleChange}
            onFocus={wField.handleFocus}
            onBlur={wField.handleBlur}
            placeholder={weightPlaceholder}
            title={sideIsAuto ? (autoSuggestion?.rationale || undefined) : undefined}
            className={sideIsAuto ? `${inputBase} border-violet-500/60 ring-violet-500 text-violet-100 bg-violet-500/5` : inputBase}
          />

          {/* Reps — plannedReps becomes the placeholder (narrow column, compact padding) */}
          <input
            inputMode="decimal"
            aria-label={`Reps lado ${side} – série ${setIdx + 1}`}
            value={repsFld.value}
            onChange={repsFld.handleChange}
            onFocus={repsFld.handleFocus}
            onBlur={repsFld.handleBlur}
            placeholder={plannedReps || repsPlaceholder}
            className={inputCompact}
          />

          {/* RPE — same treatment as reps */}
          <input
            inputMode="decimal"
            aria-label={`RPE lado ${side} – série ${setIdx + 1}`}
            value={rpeFld.value}
            onChange={rpeFld.handleChange}
            onFocus={rpeFld.handleFocus}
            onBlur={rpeFld.handleBlur}
            placeholder={rpeWatermark}
            className={`${inputCompact} text-yellow-400 border-yellow-500/25 placeholder:text-yellow-600/60`}
          />

          {/* Complete side button */}
          <button
            type="button"
            onClick={onComplete}
            className={`inline-flex items-center justify-center gap-1 h-9 w-[92px] rounded-xl font-black text-xs whitespace-nowrap active:scale-95 transition-all duration-150 ${btnColor}`}
          >
            <Check size={13} />
            {/* Mesmo rótulo dos demais métodos (Concluir/Feito). O lado não precisa
                estar aqui: o badge "LADO E/D" logo acima da linha já diz qual é. */}
            {sideDone ? 'Feito' : 'Concluir'}
          </button>
        </div>
      </div>
    );
  };

  // Column header — only on the first set of each exercise, so the user learns
  // what each input means. After the first set, header is hidden to save space.
  const renderUnilateralHeader = () => (
    <div
      className="grid items-center gap-1.5 px-2.5 text-[9px] uppercase tracking-widest text-neutral-400 font-bold min-w-0"
      style={{ gridTemplateColumns: 'minmax(0,3fr) minmax(0,2.5fr) minmax(0,1.5fr) 92px' }}
    >
      <span>Peso (kg)</span>
      <span className="text-center">Reps</span>
      <span className="text-center">RPE</span>
      <span />
    </div>
  );
  const renderBilateralHeader = () => (
    <div
      className="grid items-center gap-1.5 px-2.5 text-[9px] uppercase tracking-widest text-neutral-400 font-bold min-w-0"
      style={{ gridTemplateColumns: '32px 28px minmax(0,3fr) minmax(0,2.5fr) minmax(0,1.5fr) 92px' }}
    >
      <span className="text-center">Set</span>
      <span />
      <span>Peso (kg)</span>
      <span className="text-center">Reps</span>
      <span className="text-center">RPE</span>
      <span />
    </div>
  );

  const failureToggle = (
    <button
      type="button"
      onClick={() => updateLog(key, { failure: !failed, advanced_config: cfg ?? log.advanced_config ?? null })}
      aria-pressed={failed}
      aria-label={`Marcar série ${setIdx + 1} como levada à falha`}
      className={[
        'inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] font-black uppercase tracking-widest border transition-colors',
        failed
          ? 'text-red-300 bg-red-500/15 border-red-500/40'
          : 'text-neutral-500 bg-black/30 border-neutral-700 hover:text-red-300 hover:border-red-500/40',
      ].join(' ')}
    >
      💥 {failed ? 'Falha' : 'Falha?'}
    </button>
  );

  return (
    <div className="space-y-1" key={key}>
      {isUnilateral ? (
        <>
          {setIdx === 0 && renderUnilateralHeader()}
          {renderSideRow('L', lDone, lWeightField, lRepsField, lRpeField, handleCompleteL, setIdx === 0)}
          {renderSideRow('R', rDone, rWeightField, rRepsField, rRpeField, handleCompleteR, false)}
          {autoLoadEnabled && isUnilateral && !done && log.weightSource === 'auto' && autoSuggestion?.rationale && (
            <div className="flex items-center gap-1 px-0.5 text-[10px] text-violet-300/80" title={autoSuggestion.rationale}>
              <span aria-hidden>🧠</span><span className="truncate">{autoSuggestion.rationale}</span>
            </div>
          )}
          {/* Notes button sits below both L+R rows — clear of exercise footer buttons */}
          <div className="flex items-center justify-end gap-2 px-0.5 -mt-0.5">
            {failureToggle}
            <button
              type="button"
              aria-label={isNotesOpen ? 'Fechar observações' : 'Observações'}
              onClick={() => toggleNotes(key)}
              className={
                isNotesOpen || hasNotes
                  ? 'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-yellow-500 bg-yellow-500/10 border border-yellow-500/40 text-[11px] font-bold'
                  : 'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-neutral-400 bg-black/30 border border-neutral-700 text-[11px] font-bold hover:text-yellow-500'
              }
            >
              <MessageSquare size={11} />
              Obs
            </button>
          </div>
        </>
      ) : (
        /* ── Non-unilateral single row ─────────────────────────────── */
        <>
        {setIdx === 0 && isAlternating && (
          <div className="px-1 pb-0.5">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-amber-400/90">
              🔄 Alternado
              <span className="text-neutral-500 normal-case font-normal tracking-normal">· conta os dois lados</span>
            </span>
          </div>
        )}
        {setIdx === 0 && renderBilateralHeader()}
        <div
          {...(setIdx === 0 ? { 'data-set-first': exIdx } : {})}
          className={[
            'rounded-xl border px-2.5 py-2 transition-all duration-300 shadow-sm',
            done
              ? 'bg-emerald-950/30 border-emerald-500/30'
              : 'bg-neutral-900/50 border-neutral-800/80',
            isMuted ? typeMeta.rowOpacityClass : '',
          ].join(' ')}
        >
          {/* Order: # | 💬 | peso | reps | rpe | OK
              Set-number badge is leftmost. Long-press it to mark this set as
              warmup or feeler (popover) — taps do nothing to avoid accidents
              during sweaty workouts. */}
          <div className="grid items-center gap-1.5"
            style={{ gridTemplateColumns: '32px 36px minmax(0,3fr) minmax(0,2.5fr) minmax(0,1.5fr) 92px' }}>

            {/* Set-number badge with long-press → SetTypePopover */}
            <button
              ref={badgeRef}
              type="button"
              aria-label={`Série ${setIdx + 1} – ${typeMeta.label}. Mantenha pressionado para mudar tipo.`}
              {...longPressHandlers}
              className={[
                'h-7 inline-flex items-center justify-center rounded-lg text-[11px] font-black tracking-tight border transition-colors select-none touch-none',
                typeMeta.badgeClass,
              ].join(' ')}
              style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
            >
              {setIdx + 1}{typeMeta.suffix}
            </button>

            {/* Notes toggle — far from footer buttons */}
            <button
              type="button"
              aria-label={isNotesOpen ? 'Fechar observações' : 'Observações'}
              onClick={() => toggleNotes(key)}
              className={
                isNotesOpen || hasAnyNote
                  ? 'h-9 w-9 inline-flex items-center justify-center rounded-lg text-yellow-500 bg-yellow-500/10 border border-yellow-500/40 hover:bg-yellow-500/15 transition duration-200'
                  : 'h-9 w-9 inline-flex items-center justify-center rounded-lg text-neutral-400 bg-black/30 border border-neutral-700 hover:border-yellow-500/60 hover:text-yellow-500 transition duration-200'
              }
            >
              <MessageSquare size={12} />
            </button>

            {/* kg */}
            <input
              inputMode="decimal"
              aria-label={`Peso em kg – série ${setIdx + 1}`}
              value={weightField.value}
              onChange={weightField.handleChange}
              onFocus={weightField.handleFocus}
              onBlur={weightField.handleBlur}
              placeholder={weightPlaceholder}
              title={isAutoWeight ? (autoSuggestion?.rationale || undefined) : undefined}
              className={isAutoWeight ? `${inputBase} border-violet-500/60 ring-violet-500 text-violet-100 bg-violet-500/5` : inputBase}
            />

            {/* reps — plannedReps becomes the placeholder (narrow column, compact padding) */}
            <input
              inputMode="decimal"
              aria-label={`Reps – série ${setIdx + 1}`}
              value={repsField.value}
              onChange={repsField.handleChange}
              onFocus={repsField.handleFocus}
              onBlur={repsField.handleBlur}
              placeholder={plannedReps || repsPlaceholder}
              className={inputCompact}
            />

            {/* RPE — same treatment as reps */}
            <input
              inputMode="decimal"
              aria-label={`RPE – série ${setIdx + 1}`}
              value={rpeField.value}
              onChange={rpeField.handleChange}
              onFocus={rpeField.handleFocus}
              onBlur={rpeField.handleBlur}
              placeholder={rpeWatermark}
              className={`${inputCompact} text-yellow-400 border-yellow-500/25 placeholder:text-yellow-600/60`}
            />

            {/* OK button */}
            <button
              type="button"
              onClick={handleComplete}
              className={[
                'inline-flex items-center justify-center gap-1 h-9 w-[92px] rounded-xl font-black text-xs whitespace-nowrap active:scale-95 transition-all duration-150',
                done
                  ? 'bg-emerald-500 text-black shadow-sm shadow-emerald-500/30'
                  : 'bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 hover:border-yellow-500/40',
              ].join(' ')}
            >
              <Check size={13} />
              {done ? 'Feito' : 'Concluir'}
            </button>
          </div>
          {/* Linha de rodapé: explicação da sugestão (🧠) à esquerda + chip de falha à direita */}
          <div className="mt-1 flex items-center justify-between gap-2">
            {isAutoWeight && autoSuggestion?.rationale ? (
              <div className="flex items-center gap-1 min-w-0 text-[10px] text-violet-300/80" title={autoSuggestion.rationale}>
                <span aria-hidden>🧠</span>
                <span className="truncate">{autoSuggestion.rationale}</span>
              </div>
            ) : <span />}
            {failureToggle}
          </div>
          {/* Per-set method picker */}
          {!done && (
            <div className="mt-1">
              <button
                type="button"
                onClick={() => setIsPickerOpen(p => !p)}
                className="inline-flex items-center gap-0.5 text-[10px] font-black uppercase tracking-widest text-neutral-400 hover:text-neutral-400 transition-colors"
              >
                {String(log.per_set_method || '').trim() || 'Normal'}
                <ChevronDown size={9} className={`transition-transform ${isPickerOpen ? 'rotate-180' : ''}`} />
              </button>
              {isPickerOpen && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {['Normal', 'Drop-Set', 'SST', 'Rest-Pause', 'Cluster', 'Stripping', 'Bi-Set', 'Super-Set'].map(opt => {
                    const current = String(log.per_set_method || '').trim() || 'Normal';
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => { updateLog(key, { per_set_method: opt === 'Normal' ? '' : opt, advanced_config: cfg ?? log.advanced_config ?? null }); setIsPickerOpen(false); }}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-black border transition-colors ${current === opt ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-400' : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:border-neutral-600 hover:text-neutral-300'}`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
        </>
      )}

      {/* Set-type popover (long-press anchored) */}
      <SetTypePopover
        open={setTypeAnchor !== null}
        anchorRect={setTypeAnchor}
        current={setType}
        onSelect={handleSetTypeSelect}
        onClose={closeSetTypePopover}
      />

      {/* Notes textarea — shared between L and R */}
      {isNotesOpen && (
        <div className="px-1 space-y-1.5">
          {prevNote && (
            <div className="flex items-start gap-1.5 px-2.5 py-1.5 rounded-lg bg-neutral-900/60 border border-neutral-800">
              <span className="text-[9px] font-black uppercase tracking-widest text-neutral-400 shrink-0 mt-0.5">Anterior</span>
              <p className="text-xs text-neutral-400 italic leading-snug">{prevNote}</p>
            </div>
          )}
          <textarea
            id={notesId}
            aria-label={`Observações – série ${setIdx + 1}`}
            value={notesField.value}
            onChange={(e) => notesField.handleChange(e as React.ChangeEvent<HTMLTextAreaElement>)}
            onFocus={() => { notesField.handleFocus(); }}
            onBlur={(e) => notesField.handleBlur(e as React.FocusEvent<HTMLTextAreaElement>)}
            placeholder="Observações da série (opcional)"
            rows={2}
            className="w-full bg-black/30 border border-neutral-700 rounded-xl px-3 py-2 text-[16px] text-white outline-none focus:ring-1 ring-yellow-500 shadow-sm shadow-yellow-500/10 transition duration-200"
          />
        </div>
      )}
    </div>
  );
};

export const NormalSet = React.memo(NormalSetInner, (a, b) =>
  a.ex === b.ex && a.exIdx === b.exIdx && a.setIdx === b.setIdx && a.setsCount === b.setsCount,
);

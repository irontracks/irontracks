"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Clock, Dumbbell, MessageSquare, Pencil, Play, Plus, Save, UserPlus, X } from 'lucide-react';
import { useDialog } from '@/contexts/DialogContext';
import { BackButton } from '@/components/ui/BackButton';
import { parseTrainingNumber } from '@/utils/trainingNumber';
import InviteManager from '@/components/InviteManager';
import { useTeamWorkout } from '@/contexts/TeamWorkoutContext';

const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

const isClusterConfig = (cfg) => {
  if (!isObject(cfg)) return false;
  const hasClusterSize = cfg.cluster_size != null;
  const hasIntra = cfg.intra_rest_sec != null;
  const hasTotal = cfg.total_reps != null;
  return (hasClusterSize && hasIntra) || (hasClusterSize && hasTotal) || (hasIntra && hasTotal);
};

const isRestPauseConfig = (cfg) => {
  if (!isObject(cfg)) return false;
  const hasMiniSets = cfg.mini_sets != null;
  const hasRest = cfg.rest_time_sec != null;
  const hasInitial = cfg.initial_reps != null;
  return (hasMiniSets && hasRest) || (hasMiniSets && hasInitial) || (hasRest && hasInitial);
};

const buildPlannedBlocks = (totalReps, clusterSize) => {
  const t = Number(totalReps);
  const c = Number(clusterSize);
  if (!Number.isFinite(t) || t <= 0) return [];
  if (!Number.isFinite(c) || c <= 0) return [];
  const blocks = [];
  let remaining = t;
  while (remaining > 0) {
    const next = Math.min(c, remaining);
    blocks.push(next);
    remaining -= next;
    if (blocks.length > 50) break;
  }
  return blocks;
};

export default function ActiveWorkout(props) {
  const { alert, confirm } = useDialog();
  const { sendInvite } = useTeamWorkout();
  const session = props?.session && typeof props.session === 'object' ? props.session : null;
  const workout = session?.workout && typeof session.workout === 'object' ? session.workout : null;
  const exercises = Array.isArray(workout?.exercises) ? workout.exercises : [];
  const logs = session?.logs && typeof session.logs === 'object' ? session.logs : {};
  const ui = session?.ui && typeof session.ui === 'object' ? session.ui : {};

  const [ticker, setTicker] = useState(Date.now());
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [finishing, setFinishing] = useState(false);
  const [openNotesKeys, setOpenNotesKeys] = useState(() => new Set());
  const [inviteOpen, setInviteOpen] = useState(false);
  const [addExerciseOpen, setAddExerciseOpen] = useState(false);
  const [addExerciseDraft, setAddExerciseDraft] = useState(() => ({
    name: '',
    sets: '3',
    restTime: '60',
  }));

  const restPauseRefs = useRef({});
  const clusterRefs = useRef({});
  const MAX_EXTRA_SETS_PER_EXERCISE = 50;
  const MAX_EXTRA_EXERCISES_PER_WORKOUT = 50;
  const DEFAULT_EXTRA_EXERCISE_REST_TIME_S = 60;

  useEffect(() => {
    const id = setInterval(() => setTicker(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const startedAtMs = useMemo(() => {
    const raw = session?.startedAt;
    if (typeof raw === 'number') return raw;
    const t = new Date(raw || 0).getTime();
    return Number.isFinite(t) ? t : 0;
  }, [session?.startedAt]);

  const elapsedSeconds = useMemo(() => {
    if (!startedAtMs) return 0;
    return Math.max(0, Math.floor((ticker - startedAtMs) / 1000));
  }, [ticker, startedAtMs]);

  const formatElapsed = (s) => {
    const secs = Math.max(0, Number(s) || 0);
    const m = Math.floor(secs / 60);
    const sec = secs % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  const safeUpdateSessionUi = (patch) => {
    try {
      if (typeof props?.onUpdateSession !== 'function') return;
      const baseUi = session?.ui && typeof session.ui === 'object' ? session.ui : {};
      props.onUpdateSession({ ui: { ...baseUi, ...(patch && typeof patch === 'object' ? patch : {}) } });
    } catch {}
  };

  useEffect(() => {
    try {
      const focus = ui?.restPauseFocus && typeof ui.restPauseFocus === 'object' ? ui.restPauseFocus : null;
      const key = String(focus?.key ?? '').trim();
      const miniIndex = Number(focus?.miniIndex);
      if (!key) return;
      if (!Number.isFinite(miniIndex) || miniIndex < 0) return;
      const input = restPauseRefs.current?.[key]?.[miniIndex];
      if (input && typeof input.focus === 'function') {
        input.focus();
        try {
          input.select?.();
        } catch {}
      }
      safeUpdateSessionUi({ restPauseFocus: null });
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui?.restPauseFocus?.key, ui?.restPauseFocus?.miniIndex]);

  useEffect(() => {
    try {
      const focus = ui?.clusterFocus && typeof ui.clusterFocus === 'object' ? ui.clusterFocus : null;
      const key = String(focus?.key ?? '').trim();
      const blockIndex = Number(focus?.blockIndex);
      if (!key) return;
      if (!Number.isFinite(blockIndex) || blockIndex < 0) return;
      const input = clusterRefs.current?.[key]?.[blockIndex];
      if (input && typeof input.focus === 'function') {
        input.focus();
        try {
          input.select?.();
        } catch {}
      }
      safeUpdateSessionUi({ clusterFocus: null });
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui?.clusterFocus?.key, ui?.clusterFocus?.blockIndex]);

  const getPlanConfig = (ex, setIdx) => {
    const sdArr = Array.isArray(ex?.setDetails) ? ex.setDetails : Array.isArray(ex?.set_details) ? ex.set_details : [];
    const sd = sdArr?.[setIdx] && typeof sdArr[setIdx] === 'object' ? sdArr[setIdx] : null;
    const cfg = sd?.advanced_config ?? sd?.advancedConfig ?? null;
    return isObject(cfg) ? cfg : null;
  };

  const getPlannedSet = (ex, setIdx) => {
    const sdArr = Array.isArray(ex?.setDetails) ? ex.setDetails : Array.isArray(ex?.set_details) ? ex.set_details : [];
    const sd = sdArr?.[setIdx] && typeof sdArr[setIdx] === 'object' ? sdArr[setIdx] : null;
    return sd && typeof sd === 'object' ? sd : null;
  };

  const getLog = (key) => {
    const v = logs?.[key];
    return v && typeof v === 'object' ? v : {};
  };

  const updateLog = (key, patch) => {
    try {
      if (typeof props?.onUpdateLog !== 'function') return;
      const prev = getLog(key);
      props.onUpdateLog(key, { ...prev, ...(patch && typeof patch === 'object' ? patch : {}) });
    } catch {}
  };

  const startTimer = (seconds, context) => {
    try {
      if (typeof props?.onStartTimer !== 'function') return;
      const s = Number(seconds);
      if (!Number.isFinite(s) || s <= 0) return;
      props.onStartTimer(s, context);
    } catch {}
  };

  const toggleCollapse = (exIdx) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(exIdx)) next.delete(exIdx);
      else next.add(exIdx);
      return next;
    });
  };

  const addExtraSetToExercise = async (exIdx) => {
    if (!workout || typeof props?.onUpdateSession !== 'function') return;
    const idx = Number(exIdx);
    if (!Number.isFinite(idx) || idx < 0) return;
    if (idx >= exercises.length) return;
    try {
      const nextExercises = [...exercises];
      const exRaw = nextExercises[idx] && typeof nextExercises[idx] === 'object' ? nextExercises[idx] : {};
      const setsHeader = Math.max(0, Number.parseInt(String(exRaw?.sets ?? '0'), 10) || 0);
      const sdArrRaw = Array.isArray(exRaw?.setDetails) ? exRaw.setDetails : Array.isArray(exRaw?.set_details) ? exRaw.set_details : [];
      const sdArr = Array.isArray(sdArrRaw) ? [...sdArrRaw] : [];
      const setsCount = Math.max(setsHeader, sdArr.length);
      if (setsCount >= MAX_EXTRA_SETS_PER_EXERCISE) return;

      const last = sdArr.length > 0 ? sdArr[sdArr.length - 1] : null;
      const base = last && typeof last === 'object' ? last : {};
      const nextDetail = {
        ...base,
        set_number: setsCount + 1,
        weight: null,
        reps: '',
        rpe: null,
        notes: null,
        is_warmup: false,
      };

      sdArr.push(nextDetail);
      nextExercises[idx] = {
        ...exRaw,
        sets: setsCount + 1,
        setDetails: sdArr,
      };
      props.onUpdateSession({ workout: { ...workout, exercises: nextExercises } });
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(idx)) next.delete(idx);
        return next;
      });
    } catch (e) {
      try {
        await alert('Não foi possível adicionar série extra: ' + (e?.message || String(e || '')));
      } catch {}
    }
  };

  const addExtraExerciseToWorkout = async () => {
    if (!workout || typeof props?.onUpdateSession !== 'function') return;
    if (exercises.length >= MAX_EXTRA_EXERCISES_PER_WORKOUT) return;
    const name = String(addExerciseDraft?.name || '').trim();
    if (!name) {
      try {
        await alert('Informe o nome do exercício.', 'Exercício extra');
      } catch {}
      return;
    }
    const sets = Math.max(1, Number.parseInt(String(addExerciseDraft?.sets || '3'), 10) || 1);
    const rest = parseTrainingNumber(addExerciseDraft?.restTime);
    const restTime = Number.isFinite(rest) && rest > 0 ? rest : null;
    const nextExercise = {
      name,
      sets,
      restTime,
      method: 'Normal',
      setDetails: [],
    };
    try {
      props.onUpdateSession({ workout: { ...workout, exercises: [...exercises, nextExercise] } });
      setAddExerciseOpen(false);
      setAddExerciseDraft({ name: '', sets: String(sets), restTime: String(restTime ?? DEFAULT_EXTRA_EXERCISE_REST_TIME_S) });
    } catch (e) {
      try {
        await alert('Não foi possível adicionar exercício extra: ' + (e?.message || String(e || '')));
      } catch {}
    }
  };

  const finishWorkout = async () => {
    if (!session || !workout) return;
    if (finishing) return;

    const minSecondsForFullSession = 30 * 60;
    const elapsedSafe = Number(elapsedSeconds) || 0;
    let showReport = true;

    let ok = false;
    try {
      ok =
        typeof confirm === 'function'
          ? await confirm('Deseja finalizar o treino?', 'Finalizar treino', {
              confirmText: 'Sim',
              cancelText: 'Não',
            })
          : false;
    } catch {
      ok = false;
    }
    if (!ok) return;

    const isShort = elapsedSafe > 0 && Number.isFinite(elapsedSafe) && elapsedSafe < minSecondsForFullSession;
    let shouldSaveHistory = true;

    if (isShort) {
      let allowSaveShort = false;
      try {
        allowSaveShort =
          typeof confirm === 'function'
            ? await confirm(
                'Esse treino durou menos de 30 minutos. Deseja adicioná-lo no histórico?',
                'Treino curto (< 30 min)',
                {
                  confirmText: 'Sim',
                  cancelText: 'Não',
                }
              )
            : false;
      } catch {
        allowSaveShort = false;
      }
      shouldSaveHistory = !!allowSaveShort;
    }

    try {
      showReport =
        typeof confirm === 'function'
          ? await confirm('Deseja o relatório desse treino?', 'Gerar relatório?', {
              confirmText: 'Sim',
              cancelText: 'Não',
            })
          : true;
    } catch {
      showReport = true;
    }

    setFinishing(true);
    try {
      const safeExercises = Array.isArray(workout?.exercises)
        ? workout.exercises.map((ex) => {
            if (!ex || typeof ex !== 'object') return null;
            return {
              name: String(ex?.name || '').trim(),
              sets: Number(ex?.sets) || (Array.isArray(ex?.setDetails) ? ex.setDetails.length : 0),
              reps: ex?.reps ?? '',
              rpe: ex?.rpe ?? null,
              cadence: ex?.cadence ?? null,
              restTime: ex?.restTime ?? ex?.rest_time ?? null,
              method: ex?.method ?? null,
              videoUrl: ex?.videoUrl ?? ex?.video_url ?? null,
              notes: ex?.notes ?? null,
              setDetails: Array.isArray(ex?.setDetails) ? ex.setDetails : Array.isArray(ex?.set_details) ? ex.set_details : [],
            };
          })
        : [];

      const payload = {
        workoutTitle: String(workout?.title || 'Treino'),
        date: new Date().toISOString(),
        totalTime: elapsedSeconds,
        realTotalTime: elapsedSeconds,
        logs: logs && typeof logs === 'object' ? logs : {},
        exercises: safeExercises.filter((x) => x && typeof x === 'object' && String(x.name || '').length > 0),
        originWorkoutId: workout?.id ?? null,
      };

      let savedId = null;
      if (shouldSaveHistory) {
        try {
          const resp = await fetch('/api/workouts/finish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session: payload }),
          });
          const json = await resp.json();
          if (!json?.ok) throw new Error(json?.error || 'Falha ao salvar no histórico');
          savedId = json?.saved?.id ?? null;
        } catch (e) {
          const msg = e?.message ? String(e.message) : String(e);
          await alert('Erro ao salvar no histórico: ' + (msg || 'erro inesperado'));
          savedId = null;
        }
      }

      const sessionForReport = {
        ...payload,
        id: savedId,
      };

      try {
        if (typeof props?.onFinish === 'function') {
          props.onFinish(sessionForReport, showReport);
        }
      } catch {}
    } catch (e) {
      const msg = e?.message ? String(e.message) : String(e);
      await alert('Erro ao finalizar: ' + (msg || 'erro inesperado'));
    } finally {
      setFinishing(false);
    }
  };

  const renderNormalSet = (ex, exIdx, setIdx) => {
    const key = `${exIdx}-${setIdx}`;
    const log = getLog(key);
    const cfg = getPlanConfig(ex, setIdx);
    const plannedSet = getPlannedSet(ex, setIdx);
    const restTime = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);
    const weightValue = String(log?.weight ?? cfg?.weight ?? '');
    const repsValue = String(log?.reps ?? '');
    const rpeValue = String(log?.rpe ?? '');
    const notesValue = String(log?.notes ?? '');
    const done = !!log?.done;

    const plannedReps = String(plannedSet?.reps ?? ex?.reps ?? '').trim();
    const plannedRpe = String(plannedSet?.rpe ?? ex?.rpe ?? '').trim();

    const isHeaderRow = setIdx === 0;
    const notesId = `notes-${key}`;
    const hasNotes = notesValue.trim().length > 0;
    const isNotesOpen = openNotesKeys.has(key);

    const toggleNotes = () => {
      setOpenNotesKeys((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    };

    return (
      <div className="space-y-1" key={key}>
        {isHeaderRow && (
          <div className="hidden sm:flex items-center gap-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold px-1">
            <div className="w-10">Série</div>
            <div className="w-24">Peso (kg)</div>
            <div className="w-24">Reps</div>
            <div className="w-24">RPE</div>
            <div className="ml-auto flex items-center gap-2">Ações</div>
          </div>
        )}
        <div className="rounded-lg bg-neutral-900/40 border border-neutral-800 px-2 py-2 space-y-2 sm:space-y-0">
          <div className="sm:hidden">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-mono text-neutral-400">#{setIdx + 1}</div>
              <div className="flex items-center gap-1 ml-auto">
                <button
                  type="button"
                  onClick={toggleNotes}
                  className={
                    isNotesOpen || hasNotes
                      ? 'inline-flex items-center justify-center rounded-lg p-2 text-yellow-500 bg-yellow-500/10 border border-yellow-500/40 hover:bg-yellow-500/15 transition duration-200'
                      : 'inline-flex items-center justify-center rounded-lg p-2 text-neutral-400 bg-black/30 border border-neutral-700 hover:border-yellow-500/60 hover:text-yellow-500 transition duration-200'
                  }
                >
                  <MessageSquare size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const nextDone = !done;
                    updateLog(key, { done: nextDone, advanced_config: cfg ?? log?.advanced_config ?? null });
                    if (nextDone && restTime && restTime > 0) {
                      startTimer(restTime, { kind: 'rest', key });
                    }
                  }}
                  className={
                    done
                      ? 'inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-yellow-500 text-black font-black shadow-yellow-500/20 shadow-sm active:scale-95 transition duration-150'
                      : 'inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700 active:scale-95 transition duration-150'
                  }
                >
                  <Check size={16} />
                  <span className="text-xs">{done ? 'Feito' : 'Concluir'}</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-2">
              <input
                inputMode="decimal"
                value={weightValue}
                onChange={(e) => {
                  const v = e?.target?.value ?? '';
                  updateLog(key, { weight: v, advanced_config: cfg ?? log?.advanced_config ?? null });
                }}
                placeholder="Peso (kg)"
                className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:ring-1 ring-yellow-500 transition duration-200 placeholder:text-neutral-600 placeholder:opacity-40 focus:placeholder:opacity-0"
              />
              <div className="relative">
                <input
                  inputMode="decimal"
                  value={repsValue}
                  onChange={(e) => {
                    const v = e?.target?.value ?? '';
                    updateLog(key, { reps: v, advanced_config: cfg ?? log?.advanced_config ?? null });
                  }}
                  placeholder="Reps"
                  className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-1.5 pr-10 text-sm text-white outline-none focus:ring-1 ring-yellow-500 transition duration-200 placeholder:text-neutral-600 placeholder:opacity-40 focus:placeholder:opacity-0"
                />
                {plannedReps ? (
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-neutral-500/60">
                    {plannedReps}
                  </div>
                ) : null}
              </div>
              <div className="relative">
                <input
                  inputMode="decimal"
                  value={rpeValue}
                  onChange={(e) => {
                    const v = e?.target?.value ?? '';
                    updateLog(key, { rpe: v, advanced_config: cfg ?? log?.advanced_config ?? null });
                  }}
                  placeholder="RPE"
                  className="w-full bg-black/30 border border-yellow-500/30 rounded-lg px-3 py-1.5 pr-10 text-sm text-yellow-500 font-bold outline-none focus:ring-1 ring-yellow-500 transition duration-200 placeholder:text-yellow-500/50 focus:placeholder:opacity-0"
                />
                {plannedRpe ? (
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-yellow-500/45">
                    {plannedRpe}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2">
            <div className="w-10 text-xs font-mono text-neutral-400">#{setIdx + 1}</div>
            <div className="w-24">
              <input
                inputMode="decimal"
                value={weightValue}
                onChange={(e) => {
                  const v = e?.target?.value ?? '';
                  updateLog(key, { weight: v, advanced_config: cfg ?? log?.advanced_config ?? null });
                }}
                placeholder="Peso (kg)"
                className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:ring-1 ring-yellow-500 transition duration-200 placeholder:text-neutral-600 placeholder:opacity-40 focus:placeholder:opacity-0"
              />
            </div>
            <div className="w-24 relative">
              <input
                inputMode="decimal"
                value={repsValue}
                onChange={(e) => {
                  const v = e?.target?.value ?? '';
                  updateLog(key, { reps: v, advanced_config: cfg ?? log?.advanced_config ?? null });
                }}
                placeholder="Reps"
                className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-1.5 pr-10 text-sm text-white outline-none focus:ring-1 ring-yellow-500 transition duration-200 placeholder:text-neutral-600 placeholder:opacity-40 focus:placeholder:opacity-0"
              />
              {plannedReps ? (
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-neutral-500/60">
                  {plannedReps}
                </div>
              ) : null}
            </div>
            <div className="w-24 relative">
              <input
                inputMode="decimal"
                value={rpeValue}
                onChange={(e) => {
                  const v = e?.target?.value ?? '';
                  updateLog(key, { rpe: v, advanced_config: cfg ?? log?.advanced_config ?? null });
                }}
                placeholder="RPE"
                className="w-full bg-black/30 border border-yellow-500/30 rounded-lg px-3 py-1.5 pr-10 text-sm text-yellow-500 font-bold outline-none focus:ring-1 ring-yellow-500 transition duration-200 placeholder:text-yellow-500/50 focus:placeholder:opacity-0"
              />
              {plannedRpe ? (
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-yellow-500/35">
                  {plannedRpe}
                </div>
              ) : null}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={toggleNotes}
                className={
                  isNotesOpen || hasNotes
                    ? 'inline-flex items-center justify-center rounded-lg p-2 text-yellow-500 bg-yellow-500/10 border border-yellow-500/40 hover:bg-yellow-500/15 transition duration-200'
                    : 'inline-flex items-center justify-center rounded-lg p-2 text-neutral-400 bg-black/30 border border-neutral-700 hover:border-yellow-500/60 hover:text-yellow-500 transition duration-200'
                }
              >
                <MessageSquare size={14} />
              </button>
              <button
                type="button"
                onClick={() => {
                  const nextDone = !done;
                  updateLog(key, { done: nextDone, advanced_config: cfg ?? log?.advanced_config ?? null });
                  if (nextDone && restTime && restTime > 0) {
                    startTimer(restTime, { kind: 'rest', key });
                  }
                }}
                className={
                  done
                    ? 'inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-yellow-500 text-black font-black shadow-yellow-500/20 shadow-sm active:scale-95 transition duration-150'
                    : 'inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700 active:scale-95 transition duration-150'
                }
              >
                <Check size={16} />
                <span className="text-xs">{done ? 'Feito' : 'Concluir'}</span>
              </button>
            </div>
          </div>
        </div>
        {isNotesOpen && (
          <div className="px-1">
            <textarea
              id={notesId}
              value={notesValue}
              onChange={(e) => {
                const v = e?.target?.value ?? '';
                updateLog(key, { notes: v, advanced_config: cfg ?? log?.advanced_config ?? null });
              }}
              placeholder="Observações da série (opcional)"
              rows={2}
              className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500 shadow-sm shadow-yellow-500/10 transition duration-200"
            />
          </div>
        )}
      </div>
    );
  };

  const renderRestPauseSet = (ex, exIdx, setIdx) => {
    const key = `${exIdx}-${setIdx}`;
    const log = getLog(key);
    const cfgRaw = getPlanConfig(ex, setIdx);
    const method = String(ex?.method || '').trim();
    const cfgMiniRaw = parseTrainingNumber(cfgRaw?.mini_sets);
    const cfgRestRaw = parseTrainingNumber(cfgRaw?.rest_time_sec);
    const shouldFillRestPauseDefaults =
      method === 'Rest-Pause' &&
      (!isRestPauseConfig(cfgRaw) || !(Number.isFinite(cfgMiniRaw) && cfgMiniRaw >= 1) || !(Number.isFinite(cfgRestRaw) && cfgRestRaw >= 1));

    const cfg = shouldFillRestPauseDefaults
      ? {
          ...(isObject(cfgRaw) ? cfgRaw : {}),
          mini_sets: Number.isFinite(cfgMiniRaw) && cfgMiniRaw >= 1 ? cfgMiniRaw : 2,
          rest_time_sec: Number.isFinite(cfgRestRaw) && cfgRestRaw >= 1 ? cfgRestRaw : 15,
        }
      : cfgRaw;
    const restTime = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);

    const pauseSec = parseTrainingNumber(cfg?.rest_time_sec) ?? 15;
    const miniSets = Math.max(0, Math.floor(parseTrainingNumber(cfg?.mini_sets) ?? 0));

    const rp = isObject(log?.rest_pause) ? log.rest_pause : {};
    const activation = parseTrainingNumber(rp?.activation_reps) ?? null;
    const minisArrRaw = Array.isArray(rp?.mini_reps) ? rp.mini_reps : [];
    const minis = Array.from({ length: miniSets }).map((_, idx) => {
      const v = minisArrRaw?.[idx];
      const n = parseTrainingNumber(v);
      return n;
    });

    const total = (activation ?? 0) + minis.reduce((acc, v) => acc + (v ?? 0), 0);
    const done = !!log?.done;
    const canDone = (activation ?? 0) > 0 && (miniSets === 0 || minis.every((v) => Number.isFinite(v) && v > 0));

    const lastAfterActivation = Number(rp?.last_rest_after_activation);
    const lastAfterMini = Number(rp?.last_rest_after_mini);

    const updateRp = (patch) => {
      const nextRp = { ...rp, ...(patch && typeof patch === 'object' ? patch : {}) };
      updateLog(key, {
        rest_pause: nextRp,
        reps: String(total || ''),
        done: !!log?.done,
        weight: String(log?.weight ?? cfg?.weight ?? ''),
        advanced_config: cfg ?? log?.advanced_config ?? null,
      });
    };

    const maybeStartMicroRest = (contextMiniIndex, guardKey) => {
      try {
        if (!pauseSec || pauseSec <= 0) return;
        const idx = Number(contextMiniIndex);
        if (!Number.isFinite(idx) || idx < 0) return;
        if (guardKey === 'activation') {
          if (Number.isFinite(lastAfterActivation) && lastAfterActivation >= 1) return;
          startTimer(pauseSec, { kind: 'rest_pause', key, miniIndex: idx });
          updateRp({ last_rest_after_activation: 1 });
          return;
        }
        const last = Number.isFinite(lastAfterMini) ? lastAfterMini : -1;
        if (idx <= last) return;
        startTimer(pauseSec, { kind: 'rest_pause', key, miniIndex: idx });
        updateRp({ last_rest_after_mini: idx });
      } catch {}
    };

    const notesValue = String(log?.notes ?? '');
    const hasNotes = notesValue.trim().length > 0;
    const isNotesOpen = openNotesKeys.has(key);

    const toggleNotes = () => {
      setOpenNotesKeys((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    };

    return (
      <div key={key} className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-10 text-xs font-mono text-neutral-400">#{setIdx + 1}</div>
          <input
            inputMode="decimal"
            value={String(log?.weight ?? cfg?.weight ?? '')}
            onChange={(e) => {
              const v = e?.target?.value ?? '';
              updateLog(key, { weight: v, advanced_config: cfg ?? log?.advanced_config ?? null });
            }}
            placeholder="kg"
            className="w-24 bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
          />
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-[10px] uppercase tracking-widest font-black text-yellow-500">Rest-P</span>
            <span className="text-xs text-neutral-400 truncate">Descanso {pauseSec || 0}s • Total: {total || 0} reps</span>
          </div>
          <button
            type="button"
            onClick={toggleNotes}
            className={
              isNotesOpen || hasNotes
                ? 'inline-flex items-center justify-center rounded-lg p-2 text-yellow-500 bg-yellow-500/10 border border-yellow-500/40 hover:bg-yellow-500/15 transition duration-200'
                : 'inline-flex items-center justify-center rounded-lg p-2 text-neutral-400 bg-black/30 border border-neutral-700 hover:border-yellow-500/60 hover:text-yellow-500 transition duration-200'
            }
          >
            <MessageSquare size={14} />
          </button>
          <button
            type="button"
            disabled={!canDone}
            onClick={() => {
              const nextDone = !done;
              updateLog(key, {
                done: nextDone,
                reps: String(total || ''),
                rest_pause: { ...rp, activation_reps: activation ?? null, mini_reps: minis },
                advanced_config: cfg ?? log?.advanced_config ?? null,
              });
              if (nextDone && restTime && restTime > 0) startTimer(restTime, { kind: 'rest', key });
            }}
            className={
              canDone
                ? done
                  ? 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-500 text-black font-black'
                  : 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700'
                : 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800/40 border border-neutral-800 text-neutral-500 font-bold cursor-not-allowed'
            }
          >
            <Check size={16} />
            <span className="text-xs">{done ? 'Feito' : 'Concluir'}</span>
          </button>
        </div>

        {!canDone && (
          <div className="pl-12 text-[11px] text-neutral-500 font-semibold">
            {miniSets > 0 ? 'Preencha Ativação e Minis para concluir.' : 'Preencha Ativação para concluir.'}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-3">
            <div className="text-[10px] uppercase tracking-widest font-bold text-neutral-400">Ativação</div>
            <input
              inputMode="decimal"
              value={activation == null ? '' : String(activation)}
              onChange={(e) => {
                const v = parseTrainingNumber(e?.target?.value);
                const nextActivation = v != null && v > 0 ? v : null;
                updateRp({ activation_reps: nextActivation });
                if ((activation ?? 0) <= 0 && (nextActivation ?? 0) > 0 && miniSets > 0 && (minis?.[0] == null || minis?.[0] <= 0)) {
                  maybeStartMicroRest(0, 'activation');
                }
              }}
              onBlur={() => {
                if ((activation ?? 0) > 0 && miniSets > 0 && (minis?.[0] == null || minis?.[0] <= 0)) {
                  maybeStartMicroRest(0, 'activation');
                }
              }}
              placeholder="reps"
              className="mt-2 w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
            />
          </div>

          {Array.from({ length: miniSets }).map((_, idx) => {
            const current = minis?.[idx] ?? null;
            return (
              <div key={`${key}-mini-${idx}`} className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-3">
                <div className="text-[10px] uppercase tracking-widest font-bold text-neutral-400">Mini {idx + 1}</div>
                <input
                  inputMode="decimal"
                  value={current == null ? '' : String(current)}
                  ref={(el) => {
                    if (!restPauseRefs.current[key]) restPauseRefs.current[key] = {};
                    restPauseRefs.current[key][idx] = el;
                  }}
                  onChange={(e) => {
                    const v = parseTrainingNumber(e?.target?.value);
                    const next = v != null && v > 0 ? v : null;
                    const nextMiniReps = [...minis];
                    nextMiniReps[idx] = next;
                    updateRp({ mini_reps: nextMiniReps });
                    if (
                      idx < miniSets - 1
                      && (current ?? 0) <= 0
                      && (next ?? 0) > 0
                      && (minis?.[idx + 1] == null || (minis?.[idx + 1] ?? 0) <= 0)
                    ) {
                      maybeStartMicroRest(idx + 1, 'mini');
                    }
                  }}
                  onBlur={() => {
                    if (idx < miniSets - 1) {
                      const currentVal = minis?.[idx] ?? null;
                      const nextVal = minis?.[idx + 1] ?? null;
                      if ((currentVal ?? 0) > 0 && (nextVal ?? 0) <= 0) {
                        maybeStartMicroRest(idx + 1, 'mini');
                      }
                    }
                  }}
                  placeholder="reps"
                  className="mt-2 w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                />
              </div>
            );
          })}
        </div>
        {isNotesOpen && (
          <textarea
            value={notesValue}
            onChange={(e) => {
              const v = e?.target?.value ?? '';
              updateLog(key, { notes: v, advanced_config: cfg ?? log?.advanced_config ?? null });
            }}
            placeholder="Observações da série"
            rows={2}
            className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
          />
        )}
      </div>
    );
  };

  const renderClusterSet = (ex, exIdx, setIdx) => {
    const key = `${exIdx}-${setIdx}`;
    const log = getLog(key);
    const cfg = getPlanConfig(ex, setIdx);
    const restTime = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);

    const totalRepsPlanned = parseTrainingNumber(cfg?.total_reps);
    const clusterSize = parseTrainingNumber(cfg?.cluster_size);
    const intra = parseTrainingNumber(cfg?.intra_rest_sec) ?? 15;
    const plannedBlocks = buildPlannedBlocks(totalRepsPlanned, clusterSize);

    const cluster = isObject(log?.cluster) ? log.cluster : {};
    const blocksRaw = Array.isArray(cluster?.blocks) ? cluster.blocks : [];
    const blocks = plannedBlocks.map((_, idx) => {
      const v = blocksRaw?.[idx];
      const n = parseTrainingNumber(v);
      return n;
    });

    const total = blocks.reduce((acc, v) => acc + (v ?? 0), 0);
    const done = !!log?.done;
    const canDone = plannedBlocks.length > 0 && blocks.every((v) => Number.isFinite(v) && v > 0);

    const lastRestAfterBlock = Number(cluster?.last_rest_after_block);
    const lastRest = Number.isFinite(lastRestAfterBlock) ? lastRestAfterBlock : -1;

    const updateCluster = (patch) => {
      const nextCluster = {
        planned: { total_reps: totalRepsPlanned ?? null, cluster_size: clusterSize ?? null, intra_rest_sec: intra ?? null },
        ...cluster,
        ...(patch && typeof patch === 'object' ? patch : {}),
      };
      updateLog(key, {
        cluster: nextCluster,
        reps: String(total || ''),
        done: !!log?.done,
        weight: String(log?.weight ?? cfg?.weight ?? ''),
        advanced_config: cfg ?? log?.advanced_config ?? null,
      });
    };

    const maybeStartIntraRest = (afterBlockIndex) => {
      try {
        const idx = Number(afterBlockIndex);
        if (!Number.isFinite(idx) || idx < 0) return;
        if (idx >= plannedBlocks.length - 1) return;
        if (idx <= lastRest) return;
        if (!intra || intra <= 0) return;
        startTimer(intra, { kind: 'cluster', key, blockIndex: idx });
        updateCluster({ last_rest_after_block: idx });
      } catch {}
    };

    const notation = plannedBlocks.length ? plannedBlocks.join('+') : '';
    const notesValue = String(log?.notes ?? '');
    const hasNotes = notesValue.trim().length > 0;
    const isNotesOpen = openNotesKeys.has(key);

    const toggleNotes = () => {
      setOpenNotesKeys((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    };

    return (
      <div key={key} className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-10 text-xs font-mono text-neutral-400">#{setIdx + 1}</div>
          <input
            inputMode="decimal"
            value={String(log?.weight ?? cfg?.weight ?? '')}
            onChange={(e) => {
              const v = e?.target?.value ?? '';
              updateLog(key, { weight: v, advanced_config: cfg ?? log?.advanced_config ?? null });
            }}
            placeholder="kg"
            className="w-24 bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
          />
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-[10px] uppercase tracking-widest font-black text-yellow-500">Cluster</span>
            <span className="text-xs text-neutral-400 truncate">
              {notation ? `(${notation})` : ''} • Intra {intra || 0}s • Total: {total || 0} reps
            </span>
          </div>
          <button
            type="button"
            onClick={toggleNotes}
            className={
              isNotesOpen || hasNotes
                ? 'inline-flex items-center justify-center rounded-lg p-2 text-yellow-500 bg-yellow-500/10 border border-yellow-500/40 hover:bg-yellow-500/15 transition duration-200'
                : 'inline-flex items-center justify-center rounded-lg p-2 text-neutral-400 bg-black/30 border border-neutral-700 hover:border-yellow-500/60 hover:text-yellow-500 transition duration-200'
            }
          >
            <MessageSquare size={14} />
          </button>
          <button
            type="button"
            disabled={!canDone}
            onClick={() => {
              const nextDone = !done;
              updateLog(key, {
                done: nextDone,
                reps: String(total || ''),
                cluster: {
                  planned: { total_reps: totalRepsPlanned ?? null, cluster_size: clusterSize ?? null, intra_rest_sec: intra ?? null },
                  blocks,
                  last_rest_after_block: Number.isFinite(lastRestAfterBlock) ? lastRestAfterBlock : null,
                },
                advanced_config: cfg ?? log?.advanced_config ?? null,
              });
              if (nextDone && restTime && restTime > 0) startTimer(restTime, { kind: 'rest', key });
            }}
            className={
              canDone
                ? done
                  ? 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-500 text-black font-black'
                  : 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700'
                : 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800/40 border border-neutral-800 text-neutral-500 font-bold cursor-not-allowed'
            }
          >
            <Check size={16} />
            <span className="text-xs">{done ? 'Feito' : 'Concluir'}</span>
          </button>
        </div>

        {!canDone && plannedBlocks.length > 0 && (
          <div className="pl-12 text-[11px] text-neutral-500 font-semibold">
            Preencha todos os blocos para concluir.
          </div>
        )}

        {plannedBlocks.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {plannedBlocks.map((planned, idx) => {
              const current = blocks?.[idx] ?? null;
              return (
                <div key={`${key}-block-${idx}`} className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] uppercase tracking-widest font-bold text-neutral-400">Bloco {idx + 1}</div>
                    <div className="text-[10px] font-mono text-neutral-500">plan {planned}</div>
                  </div>
                  <input
                    inputMode="decimal"
                    value={current == null ? '' : String(current)}
                    ref={(el) => {
                      if (!clusterRefs.current[key]) clusterRefs.current[key] = {};
                      clusterRefs.current[key][idx] = el;
                    }}
                    onChange={(e) => {
                      const v = parseTrainingNumber(e?.target?.value);
                      const next = v != null && v > 0 ? v : null;
                      const nextBlocks = [...blocks];
                      nextBlocks[idx] = next;
                      updateCluster({ blocks: nextBlocks });
                      if (idx < plannedBlocks.length - 1 && (current ?? 0) <= 0 && (next ?? 0) > 0 && ((blocks?.[idx + 1] ?? 0) <= 0)) {
                        maybeStartIntraRest(idx);
                      }
                    }}
                    onBlur={() => {
                      const cur = blocks?.[idx] ?? null;
                      const next = blocks?.[idx + 1] ?? null;
                      if (idx < plannedBlocks.length - 1 && (cur ?? 0) > 0 && (next ?? 0) <= 0) {
                        maybeStartIntraRest(idx);
                      }
                    }}
                    placeholder="reps"
                    className="mt-2 w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                  />
                </div>
              );
            })}
          </div>
        )}
        {isNotesOpen && (
          <textarea
            value={notesValue}
            onChange={(e) => {
              const v = e?.target?.value ?? '';
              updateLog(key, { notes: v, advanced_config: cfg ?? log?.advanced_config ?? null });
            }}
            placeholder="Observações da série"
            rows={2}
            className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
          />
        )}
      </div>
    );
  };

  const renderSet = (ex, exIdx, setIdx) => {
    const cfg = getPlanConfig(ex, setIdx);
    const method = String(ex?.method || '').trim();
    const isCluster = method === 'Cluster' || isClusterConfig(cfg);
    const isRestPause = method === 'Rest-Pause' || isRestPauseConfig(cfg);
    if (isCluster) return renderClusterSet(ex, exIdx, setIdx);
    if (isRestPause) return renderRestPauseSet(ex, exIdx, setIdx);
    return renderNormalSet(ex, exIdx, setIdx);
  };

  const renderExercise = (ex, exIdx) => {
    const name = String(ex?.name || '').trim() || `Exercício ${exIdx + 1}`;
    const observation = String(ex?.notes || '').trim();
    const setsHeader = Math.max(0, Number.parseInt(String(ex?.sets ?? '0'), 10) || 0);
    const sdArr = Array.isArray(ex?.setDetails) ? ex.setDetails : Array.isArray(ex?.set_details) ? ex.set_details : [];
    const setsCount = Math.max(setsHeader, Array.isArray(sdArr) ? sdArr.length : 0);
    const collapsedNow = collapsed.has(exIdx);
    const restTime = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);
    const videoUrl = String(ex?.videoUrl ?? ex?.video_url ?? '').trim();

    return (
      <div key={`ex-${exIdx}`} className="rounded-xl bg-neutral-800 border border-neutral-700 p-4">
        <div
          role="button"
          tabIndex={0}
          aria-expanded={!collapsedNow}
          onClick={() => toggleCollapse(exIdx)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleCollapse(exIdx);
            }
          }}
          className="w-full flex items-start justify-between gap-3"
        >
          <div className="min-w-0 text-left">
            <div className="flex items-center gap-2">
              <Dumbbell size={16} className="text-yellow-500" />
              <h3 className="font-black text-white truncate">{name}</h3>
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-neutral-400">
              <span className="font-mono">{setsCount} sets</span>
              <span className="opacity-30">•</span>
              <span className="font-mono">{restTime ? `${restTime}s` : '-'}</span>
              <span className="opacity-30">•</span>
              <span className="truncate">{String(ex?.method || 'Normal')}</span>
            </div>
            {observation ? (
              <div className="mt-2 rounded-xl bg-neutral-900/50 border border-yellow-500/20 px-3 py-2">
                <div className="text-sm text-neutral-200 whitespace-pre-wrap leading-snug">{observation}</div>
              </div>
            ) : null}
          </div>
          <div className="mt-1 flex items-center gap-2 text-neutral-400">
            {videoUrl ? (
              <button
                type="button"
                onClick={(e) => {
                  try {
                    e.preventDefault();
                    e.stopPropagation();
                  } catch {}
                  try {
                    window.open(videoUrl, '_blank', 'noopener,noreferrer');
                  } catch {}
                }}
                className="h-9 w-9 inline-flex flex-col items-center justify-center rounded-xl bg-neutral-900 border border-neutral-800 text-yellow-500 hover:bg-neutral-800 transition-colors active:scale-95"
                title="Ver vídeo"
                aria-label="Ver vídeo"
              >
                <Play size={16} />
                <span className="mt-0.5 text-[10px] leading-none text-neutral-400 opacity-60">Vídeo</span>
              </button>
            ) : null}
            {collapsedNow ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          </div>
        </div>

        {!collapsedNow && (
          <div className="mt-4 space-y-2">
            {Array.from({ length: setsCount }).map((_, setIdx) => renderSet(ex, exIdx, setIdx))}
            <button
              type="button"
              onClick={() => addExtraSetToExercise(exIdx)}
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-900 border border-neutral-800 text-yellow-500 font-black hover:bg-neutral-800 active:scale-95 transition-transform"
            >
              <Plus size={16} />
              <span className="text-sm">Série extra</span>
            </button>
          </div>
        )}
      </div>
    );
  };

  if (!session || !workout) {
    return (
      <div className="min-h-screen bg-neutral-900 text-white p-6">
        <div className="max-w-lg mx-auto rounded-xl bg-neutral-800 border border-neutral-700 p-6">
          <div className="text-sm text-neutral-300">Sessão inválida.</div>
          <div className="mt-4">
            <BackButton onClick={props?.onBack} withNavigation={false} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-900 text-white flex flex-col">
      <div className="sticky top-0 z-40 bg-neutral-950 border-b border-neutral-800 px-4 md:px-6 py-4 pt-safe">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
            <BackButton onClick={props?.onBack} withNavigation={false} />
            <button
              type="button"
              onClick={() => {
                try {
                  if (typeof props?.onEditWorkout === 'function') props.onEditWorkout(workout);
                } catch {}
              }}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 hover:bg-neutral-800 transition-colors active:scale-95"
              title="Editar treino"
            >
              <Pencil size={16} className="text-yellow-500" />
              <span className="text-sm font-black hidden sm:inline">Editar</span>
            </button>
            <button
              type="button"
              onClick={() => setAddExerciseOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-500 text-black hover:bg-yellow-400 transition-colors active:scale-95"
              title="Adicionar exercício extra"
            >
              <Plus size={16} />
              <span className="text-sm font-black hidden sm:inline">Exercício</span>
            </button>
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-yellow-500 hover:text-yellow-400 hover:bg-neutral-800 transition-colors active:scale-95"
              title="Convidar para treinar junto"
            >
              <UserPlus size={16} />
              <span className="text-sm font-black hidden sm:inline">Convidar</span>
            </button>
            </div>
            <div className="text-xs text-neutral-400 flex items-center justify-end gap-2">
              <Clock size={14} className="text-yellow-500" />
              <span className="font-mono text-yellow-500">{formatElapsed(elapsedSeconds)}</span>
            </div>
          </div>
          <div className="mt-2 px-1">
            <div className="font-black text-white text-center leading-tight break-words">
              {String(workout?.title || 'Treino')}
            </div>
          </div>
        </div>
      </div>

      <InviteManager
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvite={async (targetUser) => {
          try {
            const payloadWorkout = workout && typeof workout === 'object'
              ? { ...workout, exercises: Array.isArray(workout?.exercises) ? workout.exercises : [] }
              : { title: 'Treino', exercises: [] };
            await sendInvite(targetUser, payloadWorkout);
          } catch (e) {
            const msg = e?.message || String(e || '');
            await alert('Falha ao enviar convite: ' + msg);
          }
        }}
      />

      {addExerciseOpen && (
        <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setAddExerciseOpen(false)}>
          <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-widest text-neutral-500 font-bold">Treino ativo</div>
                <div className="text-lg font-black text-white truncate">Adicionar exercício extra</div>
              </div>
              <button
                type="button"
                onClick={() => setAddExerciseOpen(false)}
                className="h-10 w-10 inline-flex items-center justify-center rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Nome do exercício</label>
                <input
                  value={String(addExerciseDraft?.name ?? '')}
                  onChange={(e) => setAddExerciseDraft((prev) => ({ ...(prev || {}), name: e?.target?.value ?? '' }))}
                  className="mt-2 w-full bg-black/30 border border-neutral-700 rounded-xl px-3 py-3 text-sm text-white outline-none focus:ring-1 ring-yellow-500 placeholder:text-neutral-600 placeholder:opacity-40"
                  placeholder="Ex: Supino reto"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Sets</label>
                  <input
                    inputMode="decimal"
                    value={String(addExerciseDraft?.sets ?? '')}
                    onChange={(e) => setAddExerciseDraft((prev) => ({ ...(prev || {}), sets: e?.target?.value ?? '' }))}
                    className="mt-2 w-full bg-black/30 border border-neutral-700 rounded-xl px-3 py-3 text-sm text-white outline-none focus:ring-1 ring-yellow-500 placeholder:text-neutral-600 placeholder:opacity-40"
                    placeholder="3"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Descanso (s)</label>
                  <input
                    inputMode="decimal"
                    value={String(addExerciseDraft?.restTime ?? '')}
                    onChange={(e) => setAddExerciseDraft((prev) => ({ ...(prev || {}), restTime: e?.target?.value ?? '' }))}
                    className="mt-2 w-full bg-black/30 border border-neutral-700 rounded-xl px-3 py-3 text-sm text-white outline-none focus:ring-1 ring-yellow-500 placeholder:text-neutral-600 placeholder:opacity-40"
                    placeholder="60"
                  />
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-neutral-800 flex gap-2">
              <button
                type="button"
                onClick={() => setAddExerciseOpen(false)}
                className="flex-1 min-h-[44px] rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={addExtraExerciseToWorkout}
                className="flex-1 min-h-[44px] rounded-xl bg-yellow-500 text-black font-black hover:bg-yellow-400"
              >
                Adicionar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 w-full max-w-6xl mx-auto px-4 md:px-6 py-4 pb-28 space-y-4">
        {exercises.length === 0 ? (
          <div className="rounded-xl bg-neutral-800 border border-neutral-700 p-6 text-neutral-300">Sem exercícios neste treino.</div>
        ) : (
          exercises.map((ex, exIdx) => renderExercise(ex, exIdx))
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-50 bg-neutral-950/95 backdrop-blur border-t border-neutral-800 px-4 md:px-6 py-3 pb-safe">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={async () => {
              const ok = await confirm('Cancelar treino em andamento? (não salva no histórico)', 'Cancelar');
              if (!ok) return;
              try {
                if (typeof props?.onFinish === 'function') props.onFinish(null, false);
              } catch {}
            }}
            className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700"
          >
            <X size={16} />
            <span className="text-sm">Cancelar</span>
          </button>

          <button
            type="button"
            disabled={finishing}
            onClick={finishWorkout}
            className={
              finishing
                ? 'inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-yellow-500/70 text-black font-black cursor-wait'
                : 'inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-yellow-500 text-black font-black hover:bg-yellow-400'
            }
          >
            <Save size={16} />
            <span className="text-sm">Finalizar</span>
          </button>
        </div>
      </div>
    </div>
  );
}

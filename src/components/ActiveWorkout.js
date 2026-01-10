"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Clock, Dumbbell, Save, X } from 'lucide-react';
import { useDialog } from '@/contexts/DialogContext';
import { BackButton } from '@/components/ui/BackButton';

const coerceNumber = (value) => {
  const n = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

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
  const session = props?.session && typeof props.session === 'object' ? props.session : null;
  const workout = session?.workout && typeof session.workout === 'object' ? session.workout : null;
  const exercises = Array.isArray(workout?.exercises) ? workout.exercises : [];
  const logs = session?.logs && typeof session.logs === 'object' ? session.logs : {};
  const ui = session?.ui && typeof session.ui === 'object' ? session.ui : {};

  const [ticker, setTicker] = useState(Date.now());
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [finishing, setFinishing] = useState(false);

  const restPauseRefs = useRef({});
  const clusterRefs = useRef({});

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

  const finishWorkout = async () => {
    if (!session || !workout) return;
    if (finishing) return;

    let ok = false;
    try {
      ok = typeof confirm === 'function' ? await confirm('Finalizar treino e salvar no histórico?', 'Finalizar treino') : false;
    } catch {
      ok = false;
    }
    if (!ok) return;

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

      const sessionForReport = {
        ...payload,
        id: savedId,
      };

      try {
        if (typeof props?.onFinish === 'function') {
          props.onFinish(sessionForReport, true);
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
    const restTime = coerceNumber(ex?.restTime ?? ex?.rest_time);
    const weightValue = String(log?.weight ?? cfg?.weight ?? '');
    const repsValue = String(log?.reps ?? '');
    const done = !!log?.done;

    return (
      <div className="flex items-center gap-2" key={key}>
        <div className="w-10 text-xs font-mono text-neutral-400">#{setIdx + 1}</div>
        <input
          inputMode="decimal"
          value={weightValue}
          onChange={(e) => {
            const v = e?.target?.value ?? '';
            updateLog(key, { weight: v, advanced_config: cfg ?? log?.advanced_config ?? null });
          }}
          placeholder="kg"
          className="w-24 bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
        />
        <input
          inputMode="numeric"
          value={repsValue}
          onChange={(e) => {
            const v = e?.target?.value ?? '';
            updateLog(key, { reps: v, advanced_config: cfg ?? log?.advanced_config ?? null });
          }}
          placeholder="reps"
          className="w-24 bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
        />
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
              ? 'ml-auto inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-500 text-black font-black'
              : 'ml-auto inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700'
          }
        >
          <Check size={16} />
          <span className="text-xs">{done ? 'Feito' : 'Concluir'}</span>
        </button>
      </div>
    );
  };

  const renderRestPauseSet = (ex, exIdx, setIdx) => {
    const key = `${exIdx}-${setIdx}`;
    const log = getLog(key);
    const cfg = getPlanConfig(ex, setIdx);
    const restTime = coerceNumber(ex?.restTime ?? ex?.rest_time);

    const pauseSec = coerceNumber(cfg?.rest_time_sec) ?? 15;
    const miniSets = Math.max(0, Math.floor(coerceNumber(cfg?.mini_sets) ?? 0));

    const rp = isObject(log?.rest_pause) ? log.rest_pause : {};
    const activation = coerceNumber(rp?.activation_reps) ?? null;
    const minisArrRaw = Array.isArray(rp?.mini_reps) ? rp.mini_reps : [];
    const minis = Array.from({ length: miniSets }).map((_, idx) => {
      const v = minisArrRaw?.[idx];
      const n = coerceNumber(v);
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
            <span className="text-xs text-neutral-400 truncate">Total: {total || 0} reps</span>
          </div>
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

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-3">
            <div className="text-[10px] uppercase tracking-widest font-bold text-neutral-400">Ativação</div>
            <input
              inputMode="numeric"
              value={activation == null ? '' : String(activation)}
              onChange={(e) => {
                const v = coerceNumber(e?.target?.value);
                const nextActivation = v != null && v > 0 ? v : null;
                updateRp({ activation_reps: nextActivation });
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
                  inputMode="numeric"
                  value={current == null ? '' : String(current)}
                  ref={(el) => {
                    if (!restPauseRefs.current[key]) restPauseRefs.current[key] = {};
                    restPauseRefs.current[key][idx] = el;
                  }}
                  onChange={(e) => {
                    const v = coerceNumber(e?.target?.value);
                    const next = v != null && v > 0 ? v : null;
                    const nextMiniReps = [...minis];
                    nextMiniReps[idx] = next;
                    updateRp({ mini_reps: nextMiniReps });
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
      </div>
    );
  };

  const renderClusterSet = (ex, exIdx, setIdx) => {
    const key = `${exIdx}-${setIdx}`;
    const log = getLog(key);
    const cfg = getPlanConfig(ex, setIdx);
    const restTime = coerceNumber(ex?.restTime ?? ex?.rest_time);

    const totalRepsPlanned = coerceNumber(cfg?.total_reps);
    const clusterSize = coerceNumber(cfg?.cluster_size);
    const intra = coerceNumber(cfg?.intra_rest_sec) ?? 15;
    const plannedBlocks = buildPlannedBlocks(totalRepsPlanned, clusterSize);

    const cluster = isObject(log?.cluster) ? log.cluster : {};
    const blocksRaw = Array.isArray(cluster?.blocks) ? cluster.blocks : [];
    const blocks = plannedBlocks.map((_, idx) => {
      const v = blocksRaw?.[idx];
      const n = coerceNumber(v);
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
                    inputMode="numeric"
                    value={current == null ? '' : String(current)}
                    ref={(el) => {
                      if (!clusterRefs.current[key]) clusterRefs.current[key] = {};
                      clusterRefs.current[key][idx] = el;
                    }}
                    onChange={(e) => {
                      const v = coerceNumber(e?.target?.value);
                      const next = v != null && v > 0 ? v : null;
                      const nextBlocks = [...blocks];
                      nextBlocks[idx] = next;
                      updateCluster({ blocks: nextBlocks });
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
    const setsHeader = Math.max(0, Number.parseInt(String(ex?.sets ?? '0'), 10) || 0);
    const sdArr = Array.isArray(ex?.setDetails) ? ex.setDetails : Array.isArray(ex?.set_details) ? ex.set_details : [];
    const setsCount = Math.max(setsHeader, Array.isArray(sdArr) ? sdArr.length : 0);
    const collapsedNow = collapsed.has(exIdx);
    const restTime = coerceNumber(ex?.restTime ?? ex?.rest_time);

    return (
      <div key={`ex-${exIdx}`} className="rounded-xl bg-neutral-800 border border-neutral-700 p-4">
        <button
          type="button"
          onClick={() => toggleCollapse(exIdx)}
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
          </div>
          <div className="mt-1 text-neutral-400">
            {collapsedNow ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          </div>
        </button>

        {!collapsedNow && (
          <div className="mt-4 space-y-3">
            {Array.from({ length: setsCount }).map((_, setIdx) => renderSet(ex, exIdx, setIdx))}
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
            <BackButton onClick={props?.onBack} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-900 text-white flex flex-col">
      <div className="sticky top-0 z-40 bg-neutral-950 border-b border-neutral-800 px-4 md:px-6 py-4 pt-safe">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <BackButton onClick={props?.onBack} />
          <div className="min-w-0 flex-1">
            <div className="font-black text-white truncate text-right">{String(workout?.title || 'Treino')}</div>
            <div className="text-xs text-neutral-400 flex items-center justify-end gap-2 mt-1">
              <Clock size={14} className="text-yellow-500" />
              <span className="font-mono text-yellow-500">{formatElapsed(elapsedSeconds)}</span>
            </div>
          </div>
        </div>
      </div>

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

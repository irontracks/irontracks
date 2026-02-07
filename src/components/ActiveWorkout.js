"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Clock, Dumbbell, Link2, MessageSquare, Pencil, Play, Plus, Save, Sparkles, UserPlus, X } from 'lucide-react';
import { useDialog } from '@/contexts/DialogContext';
import { BackButton } from '@/components/ui/BackButton';
import { enqueueWorkoutFinishJob } from '@/lib/offline/offlineSync'
import { parseTrainingNumber } from '@/utils/trainingNumber';
import InviteManager from '@/components/InviteManager';
import TeamRoomCard from '@/components/TeamRoomCard';
import { useTeamWorkout } from '@/contexts/TeamWorkoutContext';
import ExecutionVideoCapture from '@/components/ExecutionVideoCapture';

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

const buildBlocksByCount = (totalReps, blocksCount) => {
  const t = Number(totalReps);
  const c = Number(blocksCount);
  if (!Number.isFinite(t) || t <= 0) return [];
  if (!Number.isFinite(c) || c <= 0) return [];
  const count = Math.min(50, Math.round(c));
  const base = Math.floor(t / count);
  const remainder = t - base * count;
  if (base <= 0) return [];
  const blocks = Array.from({ length: count }).map((_, idx) => base + (idx < remainder ? 1 : 0));
  return blocks.filter((n) => Number.isFinite(n) && n > 0);
};

const parseClusterPrescription = (raw) => {
  const text = String(raw || '')
    .toLowerCase()
    .replace(/[()]/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/[›»→]/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return { blocks: [], rests: [] };
  const parts = text
    .split('>')
    .map((p) => String(p || '').trim())
    .filter(Boolean);
  if (!parts.length) return { blocks: [], rests: [] };
  const blocks = [];
  const rests = [];
  parts.forEach((p) => {
    const n = parseTrainingNumber(p);
    if (!n || n <= 0) return;
    if (p.includes('rep')) blocks.push(n);
    else if (p.includes('seg') || p.includes('sec') || p.includes('s')) rests.push(n);
  });
  if (blocks.length >= 2 && rests.length === blocks.length - 1) return { blocks, rests };
  if (blocks.length >= 2 && rests.length >= 1) {
    const base = rests[0];
    return { blocks, rests: Array.from({ length: blocks.length - 1 }).map(() => base) };
  }
  return { blocks: [], rests: [] };
};

export default function ActiveWorkout(props) {
  const { alert, confirm } = useDialog();
  const { sendInvite, createJoinCode, setPresenceStatus, teamSession, presence } = useTeamWorkout();
  const session = props?.session && typeof props.session === 'object' ? props.session : null;
  const workout = session?.workout && typeof session.workout === 'object' ? session.workout : null;
  const exercises = Array.isArray(workout?.exercises) ? workout.exercises : [];
  const logs = session?.logs && typeof session.logs === 'object' ? session.logs : {};
  const ui = session?.ui && typeof session.ui === 'object' ? session.ui : {};
  const settings = props?.settings && typeof props.settings === 'object' ? props.settings : null;
  const teamworkV2Enabled = settings?.featuresKillSwitch !== true && settings?.featureTeamworkV2 === true;
  const defaultRestSeconds = (() => {
    const raw = Number(settings?.restTimerDefaultSeconds ?? 90);
    if (!Number.isFinite(raw)) return 90;
    return Math.max(15, Math.min(600, Math.round(raw)));
  })();
  const autoStartDefaultRest = Boolean(settings?.autoRestTimerWhenMissing ?? false);
  const resolveRestTimeSeconds = (ex) => {
    const raw = parseTrainingNumber(ex?.restTime ?? ex?.rest_time);
    if (raw && raw > 0) return raw;
    if (!autoStartDefaultRest) return 0;
    return defaultRestSeconds;
  };

  const requestPostWorkoutCheckin = async () => {
    if (postCheckinOpen) return null;
    return await new Promise((resolve) => {
      postCheckinResolveRef.current = (value) => {
        resolve(value ?? null);
      };
      setPostCheckinDraft({ rpe: '', satisfaction: '', soreness: '', notes: '' });
      setPostCheckinOpen(true);
    });
  };

  const [ticker, setTicker] = useState(Date.now());
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [finishing, setFinishing] = useState(false);
  const [openNotesKeys, setOpenNotesKeys] = useState(() => new Set());
  const [openAiHints, setOpenAiHints] = useState(() => new Set());
  const [clusterModal, setClusterModal] = useState(null);
  const [restPauseModal, setRestPauseModal] = useState(null);

  useEffect(() => {
    if (!teamworkV2Enabled) return;
    try {
      if (typeof setPresenceStatus === 'function') setPresenceStatus('in_workout');
    } catch {}
    return () => {
      try {
        if (typeof setPresenceStatus === 'function') setPresenceStatus('online');
      } catch {}
    };
  }, [setPresenceStatus, teamworkV2Enabled]);

  const shareTeamJoinLink = async () => {
    try {
      if (!teamworkV2Enabled) return;
      if (typeof createJoinCode !== 'function') return;
      const payloadWorkout = workout && typeof workout === 'object'
        ? { ...workout, exercises: Array.isArray(workout?.exercises) ? workout.exercises : [] }
        : { title: 'Treino', exercises: [] };
      const res = await createJoinCode(payloadWorkout, 90);
      if (!res?.ok) {
        await alert('Falha ao gerar link: ' + (res?.error || ''));
        return;
      }
      const url = String(res?.url || '').trim();
      const code = String(res?.code || '').trim();
      const text = url ? url : code;
      try {
        if (text && navigator?.clipboard?.writeText) await navigator.clipboard.writeText(text);
      } catch {}
      try {
        if (url && navigator?.share) await navigator.share({ title: 'Bora treinar junto', text: 'Entre na sessão do treino:', url });
      } catch {}
      await alert(
        url ? `Link pronto. Código: ${code}` : `Código pronto: ${code}`,
        'Convite por link'
      );
    } catch (e) {
      const msg = e?.message || String(e || '');
      await alert('Falha ao gerar link: ' + msg);
    }
  };
  const [dropSetModal, setDropSetModal] = useState(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [postCheckinOpen, setPostCheckinOpen] = useState(false);
  const [postCheckinDraft, setPostCheckinDraft] = useState({ rpe: '', satisfaction: '', soreness: '', notes: '' });
  const postCheckinResolveRef = useRef(null);

  const restPauseRefs = useRef({});
  const clusterRefs = useRef({});
  const MAX_EXTRA_SETS_PER_EXERCISE = 50;
  const MAX_EXTRA_EXERCISES_PER_WORKOUT = 50;

  useEffect(() => {
    const id = setInterval(() => setTicker(Date.now()), 1000);
    // Scroll to top on mount
    try {
      window.scrollTo(0, 0);
    } catch {}
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

  const validateWorkout = async () => {
    const errors = [];
    const warnings = [];
    const title = String(workout?.title || '').trim();
    if (!title) {
      errors.push('O treino precisa de um título.');
    }

    if (!exercises || exercises.length === 0) {
      errors.push('O treino não tem exercícios.');
    }

    let totalDone = 0;

    exercises.forEach((ex, exIdx) => {
      const exName = String(ex?.name || '').trim() || `Exercício ${exIdx + 1}`;
      if (!String(ex?.name || '').trim()) {
        errors.push(`Exercício ${exIdx + 1}: Nome não preenchido.`);
      }

      const setsHeader = Math.max(0, Number(ex?.sets) || 0);
      const sdArr = Array.isArray(ex?.setDetails) ? ex.setDetails : Array.isArray(ex?.set_details) ? ex.set_details : [];
      const setsCount = Math.max(setsHeader, sdArr.length);

      for (let i = 0; i < setsCount; i++) {
        const key = `${exIdx}-${i}`;
        const log = getLog(key);

        if (log?.done) {
          totalDone++;
          const w = String(log?.weight ?? '').trim();
          const r = String(log?.reps ?? '').trim();
          const cfg = getPlanConfig(ex, i);
          const effWeight = w || String(cfg?.weight ?? '').trim();

          const isCardio = String(ex?.method || '').trim() === 'Cardio' || ex?.type === 'cardio';
          if (!isCardio && !effWeight && effWeight !== '0') {
            warnings.push(`${exName} (Série ${i + 1}): Peso não preenchido.`);
          }

          if (!r && r !== '0') {
            warnings.push(`${exName} (Série ${i + 1}): ${isCardio ? 'Tempo' : 'Repetições'} não preenchido(a).`);
          }
        }
      }
    });

    if (exercises.length > 0 && totalDone === 0) {
      warnings.push('Nenhuma série foi concluída. Marque "Feito" nas séries realizadas.');
    }

    if (errors.length > 0) {
      const list = errors.map((e) => `• ${e}`).join('\n');
      await alert(`Para finalizar, verifique os seguintes campos:\n\n${list}`, 'Campos obrigatórios');
      return false;
    }

    if (warnings.length > 0) {
      const list = warnings.map((e) => `• ${e}`).join('\n');
      try {
        const proceed =
          typeof confirm === 'function'
            ? await confirm(
                `Existem séries incompletas ou campos em branco:\n\n${list}\n\nDeseja finalizar mesmo assim?`,
                'Finalizar com pendências?',
                {
                  confirmText: 'Finalizar',
                  cancelText: 'Voltar',
                },
              )
            : true;
        if (!proceed) return false;
      } catch {}
    }

    return true;
  };

  const finishWorkout = async () => {
    if (!session || !workout) return;
    if (finishing) return;

    // Validação obrigatória
    const isValid = await validateWorkout();
    if (!isValid) return;

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

    const baseExerciseCount = Number(ui?.baseExerciseCount ?? 0) || 0;
    const hasExtraExercise = !!ui?.pendingTemplateUpdate || (exercises.length > 0 && exercises.length > baseExerciseCount);
    if (hasExtraExercise) {
      let shouldSaveTemplate = false;
      try {
        shouldSaveTemplate =
          typeof confirm === 'function'
            ? await confirm(
                'Você adicionou exercício(s) extra(s) durante o treino.\nDeseja salvar essa mudança no modelo do treino?',
                'Salvar no treino?',
                {
                  confirmText: 'Sim',
                  cancelText: 'Não',
                },
              )
            : false;
      } catch {
        shouldSaveTemplate = false;
      }
      if (shouldSaveTemplate) {
        try {
          if (typeof props?.onPersistWorkoutTemplate === 'function') {
            const res = await props.onPersistWorkoutTemplate(workout);
            if (!res || res.ok === false) {
              throw new Error(res?.error || 'Falha ao salvar treino');
            }
            try {
              await alert('Treino atualizado com o(s) exercício(s) extra(s).', 'Treino salvo');
            } catch {}
          }
        } catch (e) {
          const msg = e?.message ? String(e.message) : String(e);
          try {
            await alert('Não foi possível salvar no modelo: ' + (msg || 'erro inesperado'), 'Aviso');
          } catch {}
        }
      }
    }

    let postCheckin = null;
    if (shouldSaveHistory) {
      try {
        const prompt = settings ? settings.promptPostWorkoutCheckin !== false : true;
        if (prompt) postCheckin = await requestPostWorkoutCheckin();
      } catch {
        postCheckin = null;
      }
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
        preCheckin: ui?.preCheckin ?? null,
        postCheckin,
        team: (() => {
          try {
            const sid = teamSession?.id ? String(teamSession.id) : ''
            const list = Array.isArray(teamSession?.participants) ? teamSession.participants : []
            const count = Math.max(0, Number(list.length) || 0)
            if (!sid && count <= 0) return null
            return { sessionId: sid || null, participantsCount: count || null }
          } catch {
            return null
          }
        })(),
      };

      let savedId = null;
      if (shouldSaveHistory) {
        const idempotencyKey = (() => {
          try {
            const fromSession = session && typeof session === 'object' ? (session.finishIdempotencyKey ?? session.idempotencyKey ?? session.idempotency_key) : null
            const raw = String(fromSession ?? '').trim()
            if (raw) return raw
          } catch {}
          try {
            if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
          } catch {}
          return `${Date.now()}-${Math.random().toString(16).slice(2)}`
        })()
        try {
          const resp = await fetch('/api/workouts/finish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session: { ...payload, idempotencyKey }, idempotencyKey }),
          });
          const json = await resp.json();
          if (!json?.ok) throw new Error(json?.error || 'Falha ao salvar no histórico');
          savedId = json?.saved?.id ?? null;
        } catch (e) {
          const msg = e?.message ? String(e.message) : String(e);
          const offline = (() => {
            try {
              if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
            } catch {}
            const lower = String(msg || '').toLowerCase()
            return lower.includes('failed to fetch') || lower.includes('network') || lower.includes('fetch')
          })()
          if (offline) {
            const uid = String(props?.user?.id || '').trim()
            if (!uid) {
              await alert('Você precisa estar logado para salvar e sincronizar o treino offline.', 'Sem sessão')
              savedId = null
            } else {
              try {
                await enqueueWorkoutFinishJob({ userId: uid, session: { ...payload, idempotencyKey }, idempotencyKey })
              } catch {}
              try {
                await alert('Sem internet. O treino foi salvo e será sincronizado automaticamente quando a conexão voltar.', 'Finalização pendente')
              } catch {}
              savedId = null
            }
            try {
            } catch {}
          } else {
            await alert('Erro ao salvar no histórico: ' + (msg || 'erro inesperado'));
            savedId = null;
          }
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
    const restTime = resolveRestTimeSeconds(ex);
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
    const plannedSet = getPlannedSet(ex, setIdx);
    const cfgRaw = getPlanConfig(ex, setIdx);
    const method = String(ex?.method || '').trim();
    const auto = plannedSet?.it_auto && typeof plannedSet.it_auto === 'object' ? plannedSet.it_auto : null;
    const modeLabel = String(auto?.label || '').trim() || (String(auto?.kind || '') === 'sst' ? 'SST' : 'Rest-P');
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
    const restTime = resolveRestTimeSeconds(ex);

    const rp = isObject(log?.rest_pause) ? log.rest_pause : {};
    const pauseSec = parseTrainingNumber(cfg?.rest_time_sec) ?? parseTrainingNumber(rp?.rest_time_sec) ?? 15;
    const plannedMiniSets = Math.max(0, Math.floor(parseTrainingNumber(cfg?.mini_sets) ?? 0));
    const savedMiniSets = Math.max(0, Math.floor(parseTrainingNumber(rp?.planned_mini_sets) ?? 0));
    const miniRepsArrRaw = Array.isArray(rp?.mini_reps) ? rp.mini_reps : [];
    const miniSets = plannedMiniSets || savedMiniSets || (Array.isArray(miniRepsArrRaw) ? miniRepsArrRaw.length : 0);

    const activation = parseTrainingNumber(rp?.activation_reps) ?? null;
    const minis = Array.from({ length: miniSets }).map((_, idx) => {
      const v = miniRepsArrRaw?.[idx];
      const n = parseTrainingNumber(v);
      return n;
    });

    const total = (activation ?? 0) + minis.reduce((acc, v) => acc + (v ?? 0), 0);
    const done = !!log?.done;
    const canDone = (activation ?? 0) > 0 && (miniSets === 0 || minis.every((v) => Number.isFinite(v) && v > 0));

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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
          <div className="flex items-center gap-2">
            <div className="w-9 text-xs font-mono text-neutral-400">#{setIdx + 1}</div>
            <input
              inputMode="decimal"
              value={String(log?.weight ?? cfg?.weight ?? '')}
              onChange={(e) => {
                const v = e?.target?.value ?? '';
                updateLog(key, { weight: v, advanced_config: cfg ?? log?.advanced_config ?? null });
              }}
              placeholder="kg"
              className="w-20 sm:w-24 bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
            />
            <button
              type="button"
              onClick={() => {
                const baseWeight = String(log?.weight ?? cfg?.weight ?? '');
                const baseRpe = String(log?.rpe ?? '').trim();
                const nextMiniCount = Math.max(0, Math.floor(miniSets));
                const minis = Array.from({ length: nextMiniCount }).map((_, idx) => {
                  const v = miniRepsArrRaw?.[idx];
                  const n = parseTrainingNumber(v);
                  return n != null && n > 0 ? n : null;
                });
                setRestPauseModal({
                  key,
                  label: modeLabel,
                  pauseSec,
                  miniSets: nextMiniCount,
                  weight: baseWeight,
                  activationReps: activation != null && activation > 0 ? activation : null,
                  minis,
                  rpe: baseRpe,
                  cfg: cfg ?? null,
                  error: '',
                });
              }}
              className="bg-black/30 border border-neutral-700 rounded-lg px-2 sm:px-3 py-2 text-sm text-white outline-none hover:border-yellow-500/60 hover:text-yellow-500 transition-colors inline-flex items-center justify-center gap-2"
            >
              <Pencil size={14} />
              <span className="text-xs font-black hidden sm:inline">Abrir</span>
            </button>
          </div>

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-[10px] uppercase tracking-widest font-black text-yellow-500 shrink-0 whitespace-nowrap">{modeLabel === 'SST' ? 'SST' : 'Rest-P'}</span>
            <span className="text-xs text-neutral-400 sm:truncate">Descanso {pauseSec || 0}s • Total: {total || 0} reps</span>
          </div>

          <div className="flex items-center gap-2">
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
        </div>

        {!canDone && (
          <div className="pl-12 text-[11px] text-neutral-500 font-semibold">
            {miniSets > 0 ? 'Preencha Ativação e Minis para concluir.' : 'Preencha Ativação para concluir.'}
          </div>
        )}

        <div className="pl-12 text-[11px] text-neutral-500 font-semibold">Preencha Ativação e Minis no modal para registrar e usar o timer.</div>
        {isNotesOpen || hasNotes ? (
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
        ) : null}
      </div>
    );
  };

  const renderClusterSet = (ex, exIdx, setIdx) => {
    const key = `${exIdx}-${setIdx}`;
    const log = getLog(key);
    const cfg = getPlanConfig(ex, setIdx);
    const plannedSet = getPlannedSet(ex, setIdx);
    const restTime = resolveRestTimeSeconds(ex);
    const cluster = isObject(log?.cluster) ? log.cluster : {};

    const totalRepsPlanned = parseTrainingNumber(cfg?.total_reps);
    const clusterSize = parseTrainingNumber(cfg?.cluster_size);
    const intra = parseTrainingNumber(cfg?.intra_rest_sec) ?? 15;
    let plannedBlocks = buildPlannedBlocks(totalRepsPlanned, clusterSize);
    let restsByGap = plannedBlocks.length > 1 ? Array.from({ length: plannedBlocks.length - 1 }).map(() => intra) : [];
    if (!plannedBlocks.length) {
      const candidates = [
        plannedSet?.reps,
        plannedSet?.notes,
        ex?.reps,
        ex?.notes,
      ]
        .map((v) => String(v ?? '').trim())
        .filter(Boolean);
      let parsed = null;
      for (const c of candidates) {
        const p = parseClusterPrescription(c);
        if (p.blocks.length) {
          parsed = p;
          break;
        }
      }
      if (!parsed) parsed = { blocks: [], rests: [] };
      if (parsed.blocks.length) {
        plannedBlocks = parsed.blocks;
        restsByGap = parsed.rests;
      }
      if (!plannedBlocks.length) {
        const savedPlannedBlocks = Array.isArray(cluster?.plannedBlocks) ? cluster.plannedBlocks : [];
        const safe = savedPlannedBlocks.map((n) => parseTrainingNumber(n)).filter((n) => Number.isFinite(n) && n > 0);
        if (safe.length) {
          plannedBlocks = safe;
          restsByGap = safe.length > 1 ? Array.from({ length: safe.length - 1 }).map(() => intra) : [];
        }
      }
    }
    const blocksRaw = Array.isArray(cluster?.blocks) ? cluster.blocks : [];
    const blocksDetailedRaw = Array.isArray(cluster?.blocksDetailed) ? cluster.blocksDetailed : [];
    const blocks = plannedBlocks.map((_, idx) => {
      const d = blocksDetailedRaw?.[idx];
      const fromDetailed = isObject(d) ? parseTrainingNumber(d?.reps) : null;
      const v = fromDetailed != null ? fromDetailed : blocksRaw?.[idx];
      const n = parseTrainingNumber(v);
      return n;
    });

    const total = blocks.reduce((acc, v) => acc + (v ?? 0), 0);
    const done = !!log?.done;
    const canDone = plannedBlocks.length > 0 && blocks.every((v) => Number.isFinite(v) && v > 0);

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
          <button
            type="button"
            onClick={() => {
              const baseWeight = String(log?.weight ?? cfg?.weight ?? '');
              const baseRpe = String(log?.rpe ?? '').trim();
              const planned = { total_reps: totalRepsPlanned ?? null, cluster_size: clusterSize ?? null, intra_rest_sec: intra ?? null };
              const blocksDetailed = Array.isArray(cluster?.blocksDetailed) ? cluster.blocksDetailed : [];
              const initialBlocks = plannedBlocks.map((p, idx) => {
                const existing = blocksDetailed?.[idx];
                const w = isObject(existing) && existing?.weight != null ? String(existing.weight) : baseWeight;
                const r = isObject(existing) ? parseTrainingNumber(existing?.reps) : parseTrainingNumber(blocksRaw?.[idx]);
                return { planned: p, weight: w, reps: r != null && r > 0 ? r : null };
              });
              setClusterModal({
                key,
                planned,
                plannedBlocks,
                intra,
                restsByGap,
                restTime,
                cfg: cfg ?? null,
                baseWeight,
                blocks: initialBlocks,
                rpe: baseRpe,
              });
            }}
            className="w-24 bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none hover:border-yellow-500/60 hover:text-yellow-500 transition-colors inline-flex items-center justify-center gap-2"
          >
            <Pencil size={14} />
            <span className="text-xs font-black">Abrir</span>
          </button>
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
            <span className="inline-flex items-center rounded-full px-2 py-1 text-[10px] uppercase tracking-wide font-black text-yellow-500 bg-yellow-500/10 border border-yellow-500/20 shrink-0 whitespace-nowrap">
              CLUSTER
            </span>
            <span className="text-xs text-neutral-400 truncate">
              {notation ? `(${notation})` : ''} • Intra {restsByGap?.[0] || intra || 0}s • Total: {total || 0} reps
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
                  blocksDetailed: Array.isArray(cluster?.blocksDetailed) ? cluster.blocksDetailed : null,
                },
                rpe: log?.rpe ?? null,
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

        {plannedBlocks.length > 0 ? (
          <div className="pl-12 text-[11px] text-neutral-500 font-semibold">
            Preencha os blocos no modal para registrar kg, reps e descanso.
          </div>
        ) : null}
        {isNotesOpen || hasNotes ? (
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
        ) : null}
      </div>
    );
  };

  const renderDropSetSet = (ex, exIdx, setIdx) => {
    const key = `${exIdx}-${setIdx}`;
    const log = getLog(key);
    const plannedSet = getPlannedSet(ex, setIdx);
    const cfgRaw = plannedSet?.advanced_config ?? plannedSet?.advancedConfig ?? null;
    const stagesPlannedRaw = Array.isArray(cfgRaw) ? cfgRaw : [];
    const ds = isObject(log?.drop_set) ? log.drop_set : {};
    const stagesSavedRaw = Array.isArray(ds?.stages) ? ds.stages : [];
    const stagesCount = Math.max(stagesPlannedRaw.length, stagesSavedRaw.length);
    if (!stagesCount) return renderNormalSet(ex, exIdx, setIdx);

    const auto = plannedSet?.it_auto && typeof plannedSet.it_auto === 'object' ? plannedSet.it_auto : null;
    const modeLabel = String(auto?.label || '').trim() || 'Drop';

    const stages = Array.from({ length: stagesCount }).map((_, idx) => {
      const saved = stagesSavedRaw?.[idx] && typeof stagesSavedRaw[idx] === 'object' ? stagesSavedRaw[idx] : null;
      const planned = stagesPlannedRaw?.[idx] && typeof stagesPlannedRaw[idx] === 'object' ? stagesPlannedRaw[idx] : null;
      const weight = String(saved?.weight ?? planned?.weight ?? '').trim();
      const reps = parseTrainingNumber(saved?.reps ?? planned?.reps) ?? null;
      return { weight, reps };
    });

    const total = stages.reduce((acc, s) => acc + (parseTrainingNumber(s?.reps) ?? 0), 0);
    const done = !!log?.done;
    const canDone = stages.every((s) => String(s?.weight || '').trim() && (parseTrainingNumber(s?.reps) ?? 0) > 0);

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
          <button
            type="button"
            onClick={() => {
              const baseStages = stages.map((s) => ({
                weight: String(s?.weight ?? '').trim(),
                reps: parseTrainingNumber(s?.reps) ?? null,
              }));
              setDropSetModal({ key, label: modeLabel, stages: baseStages, error: '' });
            }}
            className="w-24 bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none hover:border-yellow-500/60 hover:text-yellow-500 transition-colors inline-flex items-center justify-center gap-2"
          >
            <Pencil size={14} />
            <span className="text-xs font-black">Abrir</span>
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-[10px] uppercase tracking-widest font-black text-yellow-500">{modeLabel || 'Drop'}</span>
            <span className="text-xs text-neutral-400 truncate">Etapas {stagesCount} • Total: {total || 0} reps</span>
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
              const lastWeight = String(stages?.[stages.length - 1]?.weight || '').trim();
              const stageOut = stages.map((s) => ({
                weight: String(s?.weight ?? '').trim(),
                reps: parseTrainingNumber(s?.reps) ?? null,
              }));
              updateLog(key, {
                done: nextDone,
                weight: lastWeight,
                reps: String(total || ''),
                drop_set: { stages: stageOut },
              });
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
            Preencha peso e reps em todas as etapas no modal para concluir.
          </div>
        )}

        {isNotesOpen && (
          <textarea
            value={notesValue}
            onChange={(e) => {
              const v = e?.target?.value ?? '';
              updateLog(key, { notes: v });
            }}
            placeholder="Observações da série"
            rows={2}
            className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
          />
        )}
      </div>
    );
  };

  const renderCardioSet = (ex, exIdx, setIdx) => {
    const key = `${exIdx}-${setIdx}`;
    const log = getLog(key);
    const cfg = getPlanConfig(ex, setIdx);
    const plannedSet = getPlannedSet(ex, setIdx);
    const name = String(ex?.name || '').toLowerCase();
    
    // Mapeamento de campos
    const timeValue = String(log?.reps ?? cfg?.reps ?? plannedSet?.reps ?? ex?.reps ?? '');
    const intensityValue = String(log?.rpe ?? cfg?.rpe ?? plannedSet?.rpe ?? ex?.rpe ?? '');
    const distanceValue = String(log?.distance ?? '');
    const inclineValue = String(log?.incline ?? '');
    const resistanceValue = String(log?.weight ?? cfg?.weight ?? ''); // Usamos weight como resistência/carga
    const notesValue = String(log?.notes ?? '');
    const done = !!log?.done;

    const isHeaderRow = setIdx === 0;
    const isNotesOpen = openNotesKeys.has(key);
    const hasNotes = notesValue.trim().length > 0;

    // Configuração de campos por modalidade
    const showIncline = name.includes('esteira') || name.includes('treadmill');
    const showDistance = !name.includes('escada'); // Geralmente escada se mede em tempo/degraus, mas distancia ok. Vamos manter padrão sim.
    const showResistance = name.includes('bike') || name.includes('bicicleta') || name.includes('elíptico') || name.includes('eliptico') || name.includes('spinning');
    
    // Se for outdoor, resistance não faz sentido (peso), a não ser que seja colete. Vamos ocultar resistance se for outdoor.
    const isOutdoor = name.includes('outdoor') || name.includes('rua') || name.includes('caminhada') || name.includes('corrida');
    if (isOutdoor) {
        // Force hide resistance for pure outdoor cardio unless specifically needed
    }

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
        <div className="rounded-lg bg-neutral-900/40 border border-neutral-800 px-3 py-3">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <div className="px-2 py-1 rounded bg-blue-500/10 border border-blue-500/20 text-[10px] font-bold text-blue-400 uppercase tracking-wider">
                        Cardio
                    </div>
                    <div className="text-xs text-neutral-400 font-mono">
                        Meta: {plannedSet?.reps || ex?.reps || '-'} min
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={toggleNotes}
                        className={
                            isNotesOpen || hasNotes
                            ? 'p-2 rounded-lg text-yellow-500 bg-yellow-500/10 hover:bg-yellow-500/20 transition-colors'
                            : 'p-2 rounded-lg text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 transition-colors'
                        }
                    >
                        <MessageSquare size={16} />
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            const nextDone = !done;
                            updateLog(key, { done: nextDone });
                        }}
                        className={
                            done
                            ? 'inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500 text-white font-bold shadow-lg shadow-blue-500/20 active:scale-95 transition-all'
                            : 'inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700 active:scale-95 transition-all'
                        }
                    >
                        <Check size={16} />
                        <span>{done ? 'Concluído' : 'Concluir'}</span>
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Tempo */}
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-500 uppercase">Tempo (min)</label>
                    <div className="relative">
                        <input
                            inputMode="decimal"
                            value={timeValue}
                            onChange={(e) => updateLog(key, { reps: e.target.value })}
                            placeholder="0"
                            className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white font-bold outline-none focus:ring-1 ring-blue-500 transition-all"
                        />
                        <Clock size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-600" />
                    </div>
                </div>

                {/* Intensidade */}
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-500 uppercase">Intensidade</label>
                    <div className="relative">
                        <input
                            inputMode="decimal"
                            value={intensityValue}
                            onChange={(e) => updateLog(key, { rpe: e.target.value })}
                            placeholder="1-10"
                            className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white font-bold outline-none focus:ring-1 ring-blue-500 transition-all"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-neutral-600 font-black">RPE</div>
                    </div>
                </div>

                {/* Distância */}
                {showDistance && (
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-neutral-500 uppercase">Distância (km)</label>
                        <input
                            inputMode="decimal"
                            value={distanceValue}
                            onChange={(e) => updateLog(key, { distance: e.target.value })}
                            placeholder="0.0"
                            className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white font-bold outline-none focus:ring-1 ring-blue-500 transition-all"
                        />
                    </div>
                )}

                {/* Inclinação (Esteira) */}
                {showIncline && (
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-neutral-500 uppercase">Inclinação (%)</label>
                        <input
                            inputMode="decimal"
                            value={inclineValue}
                            onChange={(e) => updateLog(key, { incline: e.target.value })}
                            placeholder="0"
                            className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white font-bold outline-none focus:ring-1 ring-blue-500 transition-all"
                        />
                    </div>
                )}

                {/* Resistência/Carga (Bike/Elíptico) */}
                {showResistance && !isOutdoor && (
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-neutral-500 uppercase">Carga/Nível</label>
                        <input
                            inputMode="decimal"
                            value={resistanceValue}
                            onChange={(e) => updateLog(key, { weight: e.target.value })}
                            placeholder="0"
                            className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white font-bold outline-none focus:ring-1 ring-blue-500 transition-all"
                        />
                    </div>
                )}
            </div>
        </div>

        {isNotesOpen && (
          <div className="px-1">
            <textarea
              value={notesValue}
              onChange={(e) => updateLog(key, { notes: e.target.value })}
              placeholder="Como foi o cardio? (ex: intervalado, contínuo...)"
              rows={2}
              className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-blue-500 shadow-sm transition duration-200"
            />
          </div>
        )}
      </div>
    );
  };

  const renderSet = (ex, exIdx, setIdx) => {
    const plannedSet = getPlannedSet(ex, setIdx);
    const rawCfg = plannedSet?.advanced_config ?? plannedSet?.advancedConfig ?? null;
    const key = `${exIdx}-${setIdx}`;
    const log = getLog(key);
    const hasDropStages = isObject(log?.drop_set) && Array.isArray(log?.drop_set?.stages) && log.drop_set.stages.length > 0;
    if (Array.isArray(rawCfg) || hasDropStages) return renderDropSetSet(ex, exIdx, setIdx);

    const cfg = getPlanConfig(ex, setIdx);
    const method = String(ex?.method || '').trim();
    const isCluster = method === 'Cluster' || isClusterConfig(cfg);
    const isRestPause = method === 'Rest-Pause' || isRestPauseConfig(cfg);
    if (method === 'Cardio' || ex?.type === 'cardio') return renderCardioSet(ex, exIdx, setIdx);
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
    const restTime = resolveRestTimeSeconds(ex);
    const videoUrl = String(ex?.videoUrl ?? ex?.video_url ?? '').trim();
    const aiSuggestion = (() => {
      const first = Array.isArray(sdArr) && sdArr.length > 0 ? sdArr[0] : null;
      const cfg = first && typeof first === 'object' ? (first.advanced_config ?? first.advancedConfig ?? null) : null;
      const sug = cfg && typeof cfg === 'object' ? (cfg.ai_suggestion ?? cfg.aiSuggestion ?? null) : null;
      if (!sug || typeof sug !== 'object') return null;
      const rec = String(sug?.recommendation || '').trim();
      const reason = String(sug?.reason || '').trim();
      if (!rec) return null;
      return { recommendation: rec, reason };
    })();
    const aiKey = `ai-${exIdx}`;
    const aiOpen = openAiHints.has(aiKey);

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
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
              <span className="font-mono">{setsCount} sets</span>
              <span className="opacity-30">•</span>
              <span className="font-mono">{restTime ? `${restTime}s` : '-'}</span>
              <span className="opacity-30">•</span>
              <span className="truncate">{String(ex?.method || 'Normal')}</span>
              {aiSuggestion ? (
                <>
                  <span className="opacity-30">•</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      try {
                        e.preventDefault();
                        e.stopPropagation();
                      } catch {}
                      setOpenAiHints((prev) => {
                        const next = new Set(prev);
                        if (next.has(aiKey)) next.delete(aiKey);
                        else next.add(aiKey);
                        return next;
                      });
                    }}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-neutral-900/40 border border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-900 transition-colors max-w-[260px]"
                    aria-label="Sugestão da IA"
                  >
                    <Sparkles size={12} className="text-yellow-500" />
                    <span className="truncate">IA: {aiSuggestion.recommendation}</span>
                  </button>
                </>
              ) : null}
            </div>
            {aiSuggestion && aiOpen ? (
              <div className="mt-2 rounded-xl bg-neutral-950/40 border border-neutral-800 px-3 py-2">
                <div className="text-sm text-neutral-200 whitespace-pre-wrap leading-snug">
                  {aiSuggestion.recommendation}
                  {aiSuggestion.reason ? `\n${aiSuggestion.reason}` : ''}
                </div>
              </div>
            ) : null}
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
            <div className="grid grid-cols-2 gap-2">
              <ExecutionVideoCapture
                variant="compact"
                exerciseName={name}
                workoutId={workout?.id || null}
                exerciseId={ex?.id || ex?.exercise_id || null}
                exerciseLibraryId={ex?.exercise_library_id || null}
                label="Enviar Execução"
              />
              <button
                type="button"
                onClick={() => {
                  const pickWeight = () => {
                    for (let i = 0; i < setsCount; i += 1) {
                      const w = String(getLog(`${exIdx}-${i}`)?.weight ?? '').trim();
                      if (w) return w;
                    }
                    const cfg0 = getPlanConfig(ex, 0);
                    const planned = String(cfg0?.weight ?? '').trim();
                    if (planned) return planned;
                    return '';
                  };
                  const w = pickWeight();
                  if (!w) {
                    try {
                      window.alert('Preencha pelo menos 1 série com peso antes de linkar.');
                    } catch {}
                    return;
                  }
                  for (let i = 0; i < setsCount; i += 1) {
                    const key = `${exIdx}-${i}`;
                    const existing = getLog(key);
                    const cfg = getPlanConfig(ex, i);
                    updateLog(key, {
                      weight: w,
                      advanced_config: existing?.advanced_config ?? cfg ?? null,
                    });
                  }
                }}
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-black/30 border border-neutral-800 text-neutral-200 font-black hover:bg-neutral-900 active:scale-95 transition-transform"
              >
                <Link2 size={16} className="text-yellow-500" />
                <span className="text-sm">Pesos</span>
              </button>
            </div>
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

  const saveClusterModal = async () => {
    const m = clusterModal && typeof clusterModal === 'object' ? clusterModal : null;
    const key = String(m?.key || '').trim();
    if (!key) {
      setClusterModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Série inválida. Feche e abra novamente.' } : prev));
      return;
    }
    const blocks = Array.isArray(m?.blocks) ? m.blocks : [];
    if (!blocks.length) {
      setClusterModal((prev) =>
        prev && typeof prev === 'object'
          ? { ...prev, error: 'Nenhum bloco encontrado. Verifique a configuração (total reps, cluster size e descanso).' }
          : prev,
      );
      return;
    }
    const planned = m?.planned && typeof m.planned === 'object' ? m.planned : {};
    const intra = Number(m?.intra);
    const restsByGap = Array.isArray(m?.restsByGap) ? m.restsByGap : [];
    const done = !!getLog(key)?.done;
    const baseAdvanced = m?.cfg ?? getLog(key)?.advanced_config ?? null;

    const blocksDetailed = [];
    const repsBlocks = [];
    let total = 0;
    for (let i = 0; i < blocks.length; i += 1) {
      const b = blocks[i] && typeof blocks[i] === 'object' ? blocks[i] : {};
      const weight = String(b.weight ?? '').trim();
      const reps = parseTrainingNumber(b.reps);
      if (!weight) {
        setClusterModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha o peso (kg) em todos os blocos.' } : prev));
        return;
      }
      if (!reps || reps <= 0) {
        setClusterModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha as reps em todos os blocos.' } : prev));
        return;
      }
      const gapRest = restsByGap?.[i];
      const restSecAfter = i < blocks.length - 1 ? (Number.isFinite(Number(gapRest)) ? Number(gapRest) : Number.isFinite(intra) ? intra : null) : null;
      blocksDetailed.push({ weight, reps, restSecAfter });
      repsBlocks.push(reps);
      total += reps;
    }

    const lastWeight = String(blocksDetailed[blocksDetailed.length - 1]?.weight ?? '').trim();
    const rpe = String(m?.rpe ?? '').trim();

    updateLog(key, {
      done,
      weight: lastWeight,
      reps: String(total || ''),
      rpe: rpe || '',
      cluster: {
        planned: {
          total_reps: planned?.total_reps ?? null,
          cluster_size: planned?.cluster_size ?? null,
          cluster_blocks_count: planned?.cluster_blocks_count ?? null,
          intra_rest_sec: planned?.intra_rest_sec ?? null,
        },
        plannedBlocks: Array.isArray(m?.plannedBlocks) ? m.plannedBlocks : null,
        blocks: repsBlocks,
        blocksDetailed,
      },
      advanced_config: baseAdvanced,
    });
    setClusterModal(null);
  };

  const saveRestPauseModal = async () => {
    const m = restPauseModal && typeof restPauseModal === 'object' ? restPauseModal : null;
    const key = String(m?.key || '').trim();
    if (!key) {
      setRestPauseModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Série inválida. Feche e abra novamente.' } : prev));
      return;
    }

    const weight = String(m?.weight ?? '').trim();
    if (!weight) {
      setRestPauseModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha o peso (kg).' } : prev));
      return;
    }

    const activationReps = parseTrainingNumber(m?.activationReps);
    if (!activationReps || activationReps <= 0) {
      setRestPauseModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha as reps de ativação.' } : prev));
      return;
    }

    const minis = Array.isArray(m?.minis) ? m.minis : [];
    const miniReps = minis.map((v) => {
      const n = parseTrainingNumber(v);
      return n != null && n > 0 ? n : null;
    });
    if (miniReps.some((v) => v == null)) {
      setRestPauseModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha as reps de todos os minis.' } : prev));
      return;
    }

    const pauseSec = parseTrainingNumber(m?.pauseSec) ?? 15;
    const rpe = String(m?.rpe ?? '').trim();
    const cfg = m?.cfg ?? getLog(key)?.advanced_config ?? null;

    const total = (activationReps ?? 0) + miniReps.reduce((acc, v) => acc + (v ?? 0), 0);
    updateLog(key, {
      done: !!getLog(key)?.done,
      weight,
      reps: String(total || ''),
      rpe: rpe || '',
      rest_pause: {
        activation_reps: activationReps,
        mini_reps: miniReps,
        rest_time_sec: pauseSec,
        planned_mini_sets: miniReps.length,
      },
      advanced_config: cfg,
    });
    setRestPauseModal(null);
  };

  const saveDropSetModal = async () => {
    const m = dropSetModal && typeof dropSetModal === 'object' ? dropSetModal : null;
    const key = String(m?.key || '').trim();
    if (!key) {
      setDropSetModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Série inválida. Feche e abra novamente.' } : prev));
      return;
    }
    const stagesRaw = Array.isArray(m?.stages) ? m.stages : [];
    if (stagesRaw.length < 2) {
      setDropSetModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Defina pelo menos 2 etapas.' } : prev));
      return;
    }

    const stages = [];
    let total = 0;
    for (let i = 0; i < stagesRaw.length; i += 1) {
      const s = stagesRaw[i] && typeof stagesRaw[i] === 'object' ? stagesRaw[i] : {};
      const weight = String(s?.weight ?? '').trim();
      const reps = parseTrainingNumber(s?.reps);
      if (!weight) {
        setDropSetModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha o peso (kg) em todas as etapas.' } : prev));
        return;
      }
      if (!reps || reps <= 0) {
        setDropSetModal((prev) => (prev && typeof prev === 'object' ? { ...prev, error: 'Preencha as reps em todas as etapas.' } : prev));
        return;
      }
      stages.push({ weight, reps });
      total += reps;
    }

    const lastWeight = String(stages[stages.length - 1]?.weight ?? '').trim();
    updateLog(key, {
      done: !!getLog(key)?.done,
      weight: lastWeight,
      reps: String(total || ''),
      drop_set: { stages },
    });
    setDropSetModal(null);
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
      <div className="sticky top-0 z-50 bg-neutral-950/95 backdrop-blur-md border-b border-neutral-800 px-4 md:px-6 py-4 pt-safe shadow-sm transition-all duration-200">
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
              onClick={() => {
                try {
                  if (typeof props?.onAddExercise === 'function') {
                    props.onAddExercise();
                    return;
                  }
                  if (typeof props?.onEditWorkout === 'function') props.onEditWorkout(workout);
                } catch {}
              }}
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
            {teamworkV2Enabled ? (
              <button
                type="button"
                onClick={shareTeamJoinLink}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 hover:bg-neutral-800 transition-colors active:scale-95"
                title="Convite por link/QR"
              >
                <Link2 size={16} className="text-yellow-500" />
                <span className="text-sm font-black hidden sm:inline">Link</span>
              </button>
            ) : null}
            </div>
            <div className="text-xs text-neutral-400 flex items-center justify-end gap-2 shrink-0 bg-neutral-900/50 px-3 py-1.5 rounded-lg border border-neutral-800">
              <Clock size={14} className="text-yellow-500" />
              <span className="font-mono text-yellow-500 font-bold">{formatElapsed(elapsedSeconds)}</span>
            </div>
          </div>
          {teamworkV2Enabled && teamSession?.id ? (
            <div className="mt-2 px-1 flex items-center justify-center gap-2">
              <div className="px-3 py-1.5 rounded-xl bg-neutral-900 border border-neutral-800 text-[11px] font-black uppercase tracking-widest text-neutral-200">
                Equipe: {(Array.isArray(teamSession?.participants) ? teamSession.participants.length : 1)}
              </div>
            </div>
          ) : null}
          {teamworkV2Enabled ? <TeamRoomCard teamSession={teamSession} presence={presence} /> : null}
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

      {clusterModal && (
        <div
          className="fixed inset-0 z-[1400] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe"
          onClick={() => setClusterModal(null)}
        >
          <div
            className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Cluster</div>
                <div className="text-white font-black text-lg truncate">Preencher blocos</div>
                <div className="text-xs text-neutral-400 truncate">
                  {Array.isArray(clusterModal?.plannedBlocks) ? `${clusterModal.plannedBlocks.length} blocos` : 'Blocos'}
                  {Array.isArray(clusterModal?.restsByGap) && clusterModal.restsByGap.length
                    ? ` • descanso ${clusterModal.restsByGap[0]}s`
                    : clusterModal?.intra
                      ? ` • descanso ${clusterModal.intra}s`
                      : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setClusterModal(null)}
                className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {clusterModal?.error ? (
                <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-neutral-200">
                  {String(clusterModal.error)}
                </div>
              ) : null}
              {Array.isArray(clusterModal?.blocks) && clusterModal.blocks.length > 0 ? (
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      const pickWeight = () => {
                        const blocks = Array.isArray(clusterModal?.blocks) ? clusterModal.blocks : []
                        for (const b of blocks) {
                          const w = String(b?.weight ?? '').trim()
                          if (w) return w
                        }
                        return ''
                      }
                      const w = pickWeight()
                      if (!w) {
                        try {
                          window.alert('Preencha pelo menos 1 bloco com peso antes de linkar.')
                        } catch {}
                        return
                      }
                      setClusterModal((prev) => {
                        if (!prev || typeof prev !== 'object') return prev
                        const blocks = Array.isArray(prev.blocks) ? prev.blocks : []
                        const nextBlocks = blocks.map((b) => {
                          const cur = b && typeof b === 'object' ? b : {}
                          return { ...cur, weight: w }
                        })
                        return { ...prev, blocks: nextBlocks, error: '' }
                      })
                    }}
                    className="min-h-[36px] px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800 inline-flex items-center gap-2"
                  >
                    <Link2 size={14} className="text-yellow-500" />
                    Linkar pesos
                  </button>
                </div>
              ) : null}
              {Array.isArray(clusterModal?.blocks) && clusterModal.blocks.length === 0 ? (
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                  <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Configurar Cluster</div>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      inputMode="decimal"
                      value={String(clusterModal?.planned?.total_reps ?? '')}
                      onChange={(e) => {
                        const v = parseTrainingNumber(e?.target?.value);
                        setClusterModal((prev) => {
                          if (!prev || typeof prev !== 'object') return prev;
                          const planned = prev.planned && typeof prev.planned === 'object' ? prev.planned : {};
                          return { ...prev, planned: { ...planned, total_reps: v ?? null }, error: '' };
                        });
                      }}
                      placeholder="Total reps (ex.: 12)"
                      className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                    />
                    <input
                      inputMode="decimal"
                      value={String(clusterModal?.planned?.cluster_blocks_count ?? '')}
                      onChange={(e) => {
                        const v = parseTrainingNumber(e?.target?.value);
                        setClusterModal((prev) => {
                          if (!prev || typeof prev !== 'object') return prev;
                          const planned = prev.planned && typeof prev.planned === 'object' ? prev.planned : {};
                          return { ...prev, planned: { ...planned, cluster_blocks_count: v ?? null }, error: '' };
                        });
                      }}
                      placeholder="Blocos (ex.: 3)"
                      className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                    />
                    <input
                      inputMode="decimal"
                      value={String(clusterModal?.planned?.intra_rest_sec ?? clusterModal?.intra ?? '')}
                      onChange={(e) => {
                        const v = parseTrainingNumber(e?.target?.value);
                        setClusterModal((prev) => {
                          if (!prev || typeof prev !== 'object') return prev;
                          const planned = prev.planned && typeof prev.planned === 'object' ? prev.planned : {};
                          return { ...prev, planned: { ...planned, intra_rest_sec: v ?? null }, intra: v ?? prev.intra ?? 15, error: '' };
                        });
                      }}
                      placeholder="Descanso (s) (ex.: 15)"
                      className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        const total = parseTrainingNumber(clusterModal?.planned?.total_reps);
                        const blocksCount = parseTrainingNumber(clusterModal?.planned?.cluster_blocks_count);
                        const intra = parseTrainingNumber(clusterModal?.planned?.intra_rest_sec) ?? parseTrainingNumber(clusterModal?.intra) ?? 15;
                        const plannedBlocks = buildBlocksByCount(total, blocksCount);
                        if (!plannedBlocks.length) {
                          setClusterModal((prev) =>
                            prev && typeof prev === 'object'
                              ? { ...prev, error: 'Configuração inválida. Preencha total reps e quantidade de blocos.' }
                              : prev,
                          );
                          return;
                        }
                        const restsByGap = plannedBlocks.length > 1 ? Array.from({ length: plannedBlocks.length - 1 }).map(() => intra) : [];
                        const baseWeight = String(clusterModal?.baseWeight ?? '').trim();
                        const blocks = plannedBlocks.map((p) => ({ planned: p, weight: baseWeight, reps: null }));
                        setClusterModal((prev) => {
                          if (!prev || typeof prev !== 'object') return prev;
                          const planned = prev.planned && typeof prev.planned === 'object' ? prev.planned : {};
                          return {
                            ...prev,
                            intra,
                            planned: { ...planned, total_reps: total ?? null, cluster_blocks_count: blocksCount ?? null, intra_rest_sec: intra ?? null },
                            plannedBlocks,
                            restsByGap,
                            blocks,
                            error: '',
                          };
                        });
                      }}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800"
                    >
                      Gerar blocos
                    </button>
                  </div>
                </div>
              ) : null}
              {Array.isArray(clusterModal?.blocks) &&
                clusterModal.blocks.map((b, idx) => {
                  const planned = b?.planned ?? null;
                  const repsValue = b?.reps == null ? '' : String(b.reps);
                  const weightValue = String(b?.weight ?? '');
                  const isLast = idx >= clusterModal.blocks.length - 1;
                  const restSec = Array.isArray(clusterModal?.restsByGap) ? Number(clusterModal.restsByGap?.[idx]) : Number(clusterModal?.intra);
                  const safeRestSec = Number.isFinite(restSec) && restSec > 0 ? restSec : 0;
                  return (
                    <div key={`cluster-block-${idx}`} className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3 relative">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[10px] uppercase tracking-widest font-bold text-neutral-400">Bloco {idx + 1}</div>
                        {planned ? <div className="text-[10px] font-mono text-neutral-500">plan {planned}</div> : <div />}
                      </div>
                      {!isLast && safeRestSec ? (
                        <button
                          type="button"
                          onClick={() => {
                            startTimer(safeRestSec, { kind: 'cluster', key: clusterModal?.key, blockIndex: idx });
                          }}
                          className="absolute top-3 right-3 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 hover:bg-neutral-800 active:scale-95 transition-transform z-10"
                          aria-label={`Iniciar descanso ${safeRestSec}s`}
                        >
                          <Clock size={14} className="text-yellow-500" />
                          <span className="text-xs font-black">{safeRestSec}s</span>
                        </button>
                      ) : null}
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <input
                          inputMode="decimal"
                          value={weightValue}
                          onChange={(e) => {
                            const v = e?.target?.value ?? '';
                            setClusterModal((prev) => {
                              if (!prev || typeof prev !== 'object') return prev;
                              const nextBlocks = Array.isArray(prev.blocks) ? [...prev.blocks] : [];
                              const cur = nextBlocks[idx] && typeof nextBlocks[idx] === 'object' ? nextBlocks[idx] : {};
                              nextBlocks[idx] = { ...cur, weight: v };
                              return { ...prev, blocks: nextBlocks, error: '' };
                            });
                          }}
                          placeholder="kg"
                          className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                        />
                        <input
                          inputMode="decimal"
                          value={repsValue}
                          onChange={(e) => {
                            const v = parseTrainingNumber(e?.target?.value);
                            const next = v != null && v > 0 ? v : null;
                            setClusterModal((prev) => {
                              if (!prev || typeof prev !== 'object') return prev;
                              const nextBlocks = Array.isArray(prev.blocks) ? [...prev.blocks] : [];
                              const cur = nextBlocks[idx] && typeof nextBlocks[idx] === 'object' ? nextBlocks[idx] : {};
                              nextBlocks[idx] = { ...cur, reps: next };
                              return { ...prev, blocks: nextBlocks, error: '' };
                            });
                          }}
                          placeholder="reps"
                          className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                        />
                      </div>
                      {!isLast ? <div className="mt-2 text-xs text-neutral-500">Descanso: {safeRestSec}s</div> : null}
                    </div>
                  );
                })}

              <div className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                <div className="text-xs font-black uppercase tracking-widest text-neutral-400">RPE da série</div>
                <input
                  inputMode="decimal"
                  value={String(clusterModal?.rpe ?? '')}
                  onChange={(e) => {
                    const v = e?.target?.value ?? '';
                    setClusterModal((prev) => (prev && typeof prev === 'object' ? { ...prev, rpe: v, error: '' } : prev));
                  }}
                  placeholder="RPE (0-10)"
                  className="mt-2 w-full bg-black/30 border border-yellow-500/30 rounded-lg px-3 py-2 text-sm text-yellow-500 font-bold outline-none focus:ring-1 ring-yellow-500"
                />
              </div>
            </div>

            <div className="p-4 border-t border-neutral-800 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setClusterModal(null)}
                className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveClusterModal}
                disabled={!Array.isArray(clusterModal?.blocks) || clusterModal.blocks.length === 0}
                className={
                  !Array.isArray(clusterModal?.blocks) || clusterModal.blocks.length === 0
                    ? 'min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500/40 text-black/60 font-black text-xs uppercase tracking-widest inline-flex items-center gap-2 cursor-not-allowed'
                    : 'min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest hover:bg-yellow-400 inline-flex items-center gap-2'
                }
              >
                <Save size={16} />
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {restPauseModal && (
        <div
          className="fixed inset-0 z-[1400] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe"
          onClick={() => setRestPauseModal(null)}
        >
          <div
            className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-black uppercase tracking-widest text-yellow-500">{String(restPauseModal?.label || '').trim() === 'SST' ? 'SST' : 'Rest-P'}</div>
                <div className="text-white font-black text-lg truncate">Preencher minis</div>
                <div className="text-xs text-neutral-400 truncate">
                  {Number(restPauseModal?.miniSets || 0)} minis • descanso {Number(restPauseModal?.pauseSec || 0)}s
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRestPauseModal(null)}
                className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {restPauseModal?.error ? (
                <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-neutral-200">
                  {String(restPauseModal.error)}
                </div>
              ) : null}

              {Number(restPauseModal?.miniSets || 0) <= 0 ? (
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                  <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Configurar Rest-P</div>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      inputMode="decimal"
                      value={String(restPauseModal?.miniSets ?? '')}
                      onChange={(e) => {
                        const v = parseTrainingNumber(e?.target?.value);
                        setRestPauseModal((prev) => (prev && typeof prev === 'object' ? { ...prev, miniSets: v ?? 0, error: '' } : prev));
                      }}
                      placeholder="Minis (ex.: 2)"
                      className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                    />
                    <input
                      inputMode="decimal"
                      value={String(restPauseModal?.pauseSec ?? '')}
                      onChange={(e) => {
                        const v = parseTrainingNumber(e?.target?.value);
                        setRestPauseModal((prev) => (prev && typeof prev === 'object' ? { ...prev, pauseSec: v ?? 15, error: '' } : prev));
                      }}
                      placeholder="Descanso (s) (ex.: 15)"
                      className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                    />
                    <input
                      inputMode="decimal"
                      value={String(restPauseModal?.weight ?? '')}
                      onChange={(e) => {
                        const v = e?.target?.value ?? '';
                        setRestPauseModal((prev) => (prev && typeof prev === 'object' ? { ...prev, weight: v, error: '' } : prev));
                      }}
                      placeholder="kg"
                      className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        const minisCount = Math.max(0, Math.floor(parseTrainingNumber(restPauseModal?.miniSets) ?? 0));
                        if (!minisCount) {
                          setRestPauseModal((prev) =>
                            prev && typeof prev === 'object' ? { ...prev, error: 'Defina a quantidade de minis.' } : prev,
                          );
                          return;
                        }
                        setRestPauseModal((prev) => {
                          if (!prev || typeof prev !== 'object') return prev;
                          return { ...prev, miniSets: minisCount, minis: Array.from({ length: minisCount }).map(() => null), error: '' };
                        });
                      }}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800"
                    >
                      Gerar minis
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3 relative">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] uppercase tracking-widest font-bold text-neutral-400">Ativação</div>
                  <div />
                </div>
                {Number(restPauseModal?.miniSets || 0) > 0 && Number(restPauseModal?.pauseSec || 0) > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      const sec = Number(restPauseModal?.pauseSec || 0);
                      if (!sec) return;
                      startTimer(sec, { kind: 'rest_pause', key: restPauseModal?.key, phase: 'activation' });
                    }}
                    className="absolute top-3 right-3 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 hover:bg-neutral-800 active:scale-95 transition-transform z-10"
                    aria-label={`Iniciar descanso ${Number(restPauseModal?.pauseSec || 0)}s`}
                  >
                    <Clock size={14} className="text-yellow-500" />
                    <span className="text-xs font-black">{Number(restPauseModal?.pauseSec || 0)}s</span>
                  </button>
                ) : null}
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input
                    inputMode="decimal"
                    value={String(restPauseModal?.weight ?? '')}
                    onChange={(e) => {
                      const v = e?.target?.value ?? '';
                      setRestPauseModal((prev) => (prev && typeof prev === 'object' ? { ...prev, weight: v, error: '' } : prev));
                    }}
                    placeholder="kg"
                    className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                  />
                  <input
                    inputMode="decimal"
                    value={restPauseModal?.activationReps == null ? '' : String(restPauseModal.activationReps)}
                    onChange={(e) => {
                      const v = parseTrainingNumber(e?.target?.value);
                      const next = v != null && v > 0 ? v : null;
                      setRestPauseModal((prev) => (prev && typeof prev === 'object' ? { ...prev, activationReps: next, error: '' } : prev));
                    }}
                    placeholder="reps"
                    className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                  />
                </div>
              </div>

              {Array.isArray(restPauseModal?.minis) &&
                restPauseModal.minis.map((v, idx) => {
                  const repsValue = v == null ? '' : String(v);
                  const isLast = idx >= restPauseModal.minis.length - 1;
                  const safeRest = Number(restPauseModal?.pauseSec || 0);
                  return (
                    <div key={`rp-mini-${idx}`} className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3 relative">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[10px] uppercase tracking-widest font-bold text-neutral-400">Mini {idx + 1}</div>
                        <div />
                      </div>
                      {!isLast && safeRest ? (
                        <button
                          type="button"
                          onClick={() => {
                            startTimer(safeRest, { kind: 'rest_pause', key: restPauseModal?.key, miniIndex: idx + 1 });
                          }}
                          className="absolute top-3 right-3 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 hover:bg-neutral-800 active:scale-95 transition-transform z-10"
                          aria-label={`Iniciar descanso ${safeRest}s`}
                        >
                          <Clock size={14} className="text-yellow-500" />
                          <span className="text-xs font-black">{safeRest}s</span>
                        </button>
                      ) : null}
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <input
                          inputMode="decimal"
                          value={String(restPauseModal?.weight ?? '')}
                          onChange={(e) => {
                            const w = e?.target?.value ?? '';
                            setRestPauseModal((prev) => (prev && typeof prev === 'object' ? { ...prev, weight: w, error: '' } : prev));
                          }}
                          placeholder="kg"
                          className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                        />
                        <input
                          inputMode="decimal"
                          value={repsValue}
                          onChange={(e) => {
                            const n = parseTrainingNumber(e?.target?.value);
                            const next = n != null && n > 0 ? n : null;
                            setRestPauseModal((prev) => {
                              if (!prev || typeof prev !== 'object') return prev;
                              const minis = Array.isArray(prev.minis) ? [...prev.minis] : [];
                              minis[idx] = next;
                              return { ...prev, minis, error: '' };
                            });
                          }}
                          placeholder="reps"
                          className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                        />
                      </div>
                    </div>
                  );
                })}

              <div className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                <div className="text-xs font-black uppercase tracking-widest text-neutral-400">RPE da série</div>
                <input
                  inputMode="decimal"
                  value={String(restPauseModal?.rpe ?? '')}
                  onChange={(e) => {
                    const v = e?.target?.value ?? '';
                    setRestPauseModal((prev) => (prev && typeof prev === 'object' ? { ...prev, rpe: v, error: '' } : prev));
                  }}
                  placeholder="RPE (0-10)"
                  className="mt-2 w-full bg-black/30 border border-yellow-500/30 rounded-lg px-3 py-2 text-sm text-yellow-500 font-bold outline-none focus:ring-1 ring-yellow-500"
                />
              </div>
            </div>

            <div className="p-4 border-t border-neutral-800 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setRestPauseModal(null)}
                className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveRestPauseModal}
                className="min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest hover:bg-yellow-400 inline-flex items-center gap-2"
              >
                <Save size={16} />
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {dropSetModal && (
        <div
          className="fixed inset-0 z-[1400] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe"
          onClick={() => setDropSetModal(null)}
        >
          <div
            className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-black uppercase tracking-widest text-yellow-500">{String(dropSetModal?.label || 'Drop')}</div>
                <div className="text-white font-black text-lg truncate">Preencher etapas</div>
                <div className="text-xs text-neutral-400 truncate">{Array.isArray(dropSetModal?.stages) ? dropSetModal.stages.length : 0} etapas</div>
              </div>
              <button
                type="button"
                onClick={() => setDropSetModal(null)}
                className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {dropSetModal?.error ? (
                <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-neutral-200">
                  {String(dropSetModal.error)}
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Etapas</div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const pickWeight = () => {
                        const stages = Array.isArray(dropSetModal?.stages) ? dropSetModal.stages : []
                        for (const st of stages) {
                          const w = String(st?.weight ?? '').trim()
                          if (w) return w
                        }
                        return ''
                      }
                      const w = pickWeight()
                      if (!w) {
                        try {
                          window.alert('Preencha pelo menos 1 etapa com peso antes de linkar.')
                        } catch {}
                        return
                      }
                      setDropSetModal((prev) => {
                        if (!prev || typeof prev !== 'object') return prev
                        const stages = Array.isArray(prev.stages) ? prev.stages : []
                        const nextStages = stages.map((st) => {
                          const cur = st && typeof st === 'object' ? st : {}
                          return { ...cur, weight: w }
                        })
                        return { ...prev, stages: nextStages, error: '' }
                      })
                    }}
                    className="min-h-[36px] px-3 py-2 rounded-xl bg-black border border-neutral-800 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-950 inline-flex items-center gap-2"
                  >
                    <Link2 size={14} className="text-yellow-500" />
                    Linkar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDropSetModal((prev) => {
                        if (!prev || typeof prev !== 'object') return prev
                        const list = Array.isArray(prev.stages) ? [...prev.stages] : []
                        if (list.length >= 20) return prev
                        list.push({ weight: '', reps: null })
                        return { ...prev, stages: list, error: '' }
                      })
                    }}
                    className="min-h-[36px] px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800 inline-flex items-center gap-2"
                  >
                    <Plus size={14} />
                    Adicionar
                  </button>
                </div>
              </div>

              {Array.isArray(dropSetModal?.stages) &&
                dropSetModal.stages.map((st, idx) => (
                  <div key={`ds-${idx}`} className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[10px] uppercase tracking-widest font-bold text-neutral-400">Etapa {idx + 1}</div>
                      <button
                        type="button"
                        onClick={() => {
                          setDropSetModal((prev) => {
                            if (!prev || typeof prev !== 'object') return prev
                            const list = Array.isArray(prev.stages) ? [...prev.stages] : []
                            list.splice(idx, 1)
                            return { ...prev, stages: list, error: '' }
                          })
                        }}
                        className="h-9 w-9 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 hover:bg-neutral-800 inline-flex items-center justify-center"
                        aria-label="Remover etapa"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <input
                        inputMode="decimal"
                        value={String(st?.weight ?? '')}
                        onChange={(e) => {
                          const v = e?.target?.value ?? ''
                          setDropSetModal((prev) => {
                            if (!prev || typeof prev !== 'object') return prev
                            const list = Array.isArray(prev.stages) ? [...prev.stages] : []
                            const cur = list[idx] && typeof list[idx] === 'object' ? list[idx] : {}
                            list[idx] = { ...cur, weight: v }
                            return { ...prev, stages: list, error: '' }
                          })
                        }}
                        placeholder="kg"
                        className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                      />
                      <input
                        inputMode="decimal"
                        value={st?.reps == null ? '' : String(st.reps)}
                        onChange={(e) => {
                          const n = parseTrainingNumber(e?.target?.value)
                          const next = n != null && n > 0 ? n : null
                          setDropSetModal((prev) => {
                            if (!prev || typeof prev !== 'object') return prev
                            const list = Array.isArray(prev.stages) ? [...prev.stages] : []
                            const cur = list[idx] && typeof list[idx] === 'object' ? list[idx] : {}
                            list[idx] = { ...cur, reps: next }
                            return { ...prev, stages: list, error: '' }
                          })
                        }}
                        placeholder="reps"
                        className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                      />
                    </div>
                  </div>
                ))}
            </div>

            <div className="p-4 border-t border-neutral-800 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setDropSetModal(null)}
                className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveDropSetModal}
                className="min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest hover:bg-yellow-400 inline-flex items-center gap-2"
              >
                <Save size={16} />
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {postCheckinOpen && (
        <div
          className="fixed inset-0 z-[1200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe"
          onClick={() => {
            setPostCheckinOpen(false);
            const r = postCheckinResolveRef.current;
            postCheckinResolveRef.current = null;
            if (typeof r === 'function') r(null);
          }}
        >
          <div className="bg-neutral-900 w-full max-w-md rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Check-in</div>
                <div className="text-white font-black text-lg truncate">Pós-treino</div>
                <div className="text-xs text-neutral-400 truncate">{String(workout?.title || 'Treino')}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPostCheckinOpen(false);
                  const r = postCheckinResolveRef.current;
                  postCheckinResolveRef.current = null;
                  if (typeof r === 'function') r(null);
                }}
                className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Esforço (RPE 1–10)</div>
                <select
                  value={String(postCheckinDraft?.rpe ?? '')}
                  onChange={(e) => setPostCheckinDraft((prev) => ({ ...prev, rpe: String(e.target.value || '') }))}
                  className="w-full min-h-[44px] bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white"
                >
                  <option value="">Não informar</option>
                  {Array.from({ length: 10 }).map((_, i) => (
                    <option key={i + 1} value={String(i + 1)}>
                      {i + 1}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Satisfação (1–5)</div>
                <div className="grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPostCheckinDraft((prev) => ({ ...prev, satisfaction: String(n) }))}
                      className={
                        String(postCheckinDraft?.satisfaction || '') === String(n)
                          ? 'min-h-[44px] rounded-xl bg-yellow-500 text-black font-black'
                          : 'min-h-[44px] rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black hover:bg-neutral-800'
                      }
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Dor / Soreness (0–10)</div>
                <select
                  value={String(postCheckinDraft?.soreness ?? '')}
                  onChange={(e) => setPostCheckinDraft((prev) => ({ ...prev, soreness: String(e.target.value || '') }))}
                  className="w-full min-h-[44px] bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white"
                >
                  <option value="">Não informar</option>
                  {Array.from({ length: 11 }).map((_, i) => (
                    <option key={i} value={String(i)}>
                      {i}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Observações (opcional)</div>
                <textarea
                  value={String(postCheckinDraft?.notes || '')}
                  onChange={(e) => setPostCheckinDraft((prev) => ({ ...prev, notes: String(e.target.value || '') }))}
                  className="w-full min-h-[90px] bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none"
                  placeholder="Ex.: treino pesado, boa técnica, ajustar carga na próxima…"
                />
              </div>
            </div>
            <div className="p-4 border-t border-neutral-800 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setPostCheckinOpen(false);
                  const r = postCheckinResolveRef.current;
                  postCheckinResolveRef.current = null;
                  if (typeof r === 'function') r(null);
                }}
                className="flex-1 min-h-[44px] px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700"
              >
                Pular
              </button>
              <button
                type="button"
                onClick={() => {
                  setPostCheckinOpen(false);
                  const r = postCheckinResolveRef.current;
                  postCheckinResolveRef.current = null;
                  if (typeof r === 'function') r(postCheckinDraft);
                }}
                className="flex-1 min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black hover:bg-yellow-400"
              >
                Continuar
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

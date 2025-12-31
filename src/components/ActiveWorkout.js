import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    ArrowLeft,
    Clock,
    UserPlus,
    CheckCircle2,
    Plus,
    Video,
    Users,
    List,
    Search,
    X,
    Repeat
} from 'lucide-react';
import InviteManager from './InviteManager'; 
import { useTeamWorkout } from '@/contexts/TeamWorkoutContext'; 
import { useDialog } from '@/contexts/DialogContext';
import { playFinishSound, playTick } from '@/lib/sounds';
import { estimateExerciseSeconds, toMinutesRounded, isCardioExercise, calculateExerciseDuration, estimateWorkoutSecondsForGroup } from '@/utils/pacing';
import { createClient } from '@/utils/supabase/client';

const appId = 'irontracks-production';

const WORKOUT_PATCH_EVENT = 'workout_patch';
const DEFAULT_ADDED_EXERCISE = {
    sets: 4,
    reps: '10',
    restTime: 60,
    cadence: '',
    method: 'Normal',
    notes: ''
};

const METHOD_OPTIONS = ['Normal', 'Bi-Set', 'Drop-set', 'Rest-Pause', 'Cluster', 'Cardio'];

const EMPTY_LOGS = {};

const ActiveWorkout = ({ session, user, onUpdateLog, onFinish, onBack, onStartTimer, isCoach, onUpdateSession, nextWorkout }) => {
    const { confirm, alert } = useDialog();
    const [currentExIdx, setCurrentExIdx] = useState(() => {
        try {
            const raw = session?.ui?.currentExIdx;
            const n = Number(raw);
            return Number.isFinite(n) && n >= 0 ? n : 0;
        } catch {
            return 0;
        }
    });
    const workout = session?.workout;
    const logs = session?.logs && typeof session.logs === 'object' ? session.logs : EMPTY_LOGS;
    const [elapsed, setElapsed] = useState(0);
    const [showInvite, setShowInvite] = useState(false);
    const [previousLogs, setPreviousLogs] = useState({});
    const [showFullList, setShowFullList] = useState(false);
    const [exerciseStartTs, setExerciseStartTs] = useState(() => {
        try {
            const raw = session?.ui?.exerciseStartTs;
            const n = Number(raw);
            return Number.isFinite(n) && n > 0 ? n : Date.now();
        } catch {
            return Date.now();
        }
    });
    const [exerciseDurations, setExerciseDurations] = useState(() => {
        try {
            const arr = session?.ui?.exerciseDurations;
            return Array.isArray(arr) ? arr : [];
        } catch {
            return [];
        }
    });
    const [pacerRemaining, setPacerRemaining] = useState(0);
    const [showTransition, setShowTransition] = useState(false);
    const [showSwapModal, setShowSwapModal] = useState(false);
    const [swapQuery, setSwapQuery] = useState('');
    const [swapCustomName, setSwapCustomName] = useState('');
    const [swapResults, setSwapResults] = useState([]);
    const [swapLoading, setSwapLoading] = useState(false);
    const [swapError, setSwapError] = useState('');

    const [showAddModal, setShowAddModal] = useState(false);
    const [addQuery, setAddQuery] = useState('');
    const [addResults, setAddResults] = useState([]);
    const [addLoading, setAddLoading] = useState(false);
    const [addError, setAddError] = useState('');
    const [addSelected, setAddSelected] = useState(null);
    const [addDraft, setAddDraft] = useState({
        id: null,
        performedExerciseId: null,
        name: '',
        videoUrl: '',
        sets: DEFAULT_ADDED_EXERCISE.sets,
        reps: DEFAULT_ADDED_EXERCISE.reps,
        rpe: '',
        restTime: DEFAULT_ADDED_EXERCISE.restTime,
        cadence: DEFAULT_ADDED_EXERCISE.cadence,
        method: DEFAULT_ADDED_EXERCISE.method,
        notes: DEFAULT_ADDED_EXERCISE.notes
    });

    // Contexto de Equipe
    const { sendInvite, teamSession } = useTeamWorkout();

    const supabase = useMemo(() => createClient(), []);

    const workoutRef = useRef(null);
    const currentExIdxRef = useRef(0);
    const channelRef = useRef(null);
    const hasLeaveGuardRef = useRef(false);
    const requestLeaveRef = useRef(null);
    const lastUiSyncRef = useRef('');

    useEffect(() => {
        workoutRef.current = workout || null;
    }, [workout]);

    useEffect(() => {
        try {
            if (typeof onUpdateSession !== 'function') return;
            const nextUi = {
                currentExIdx: Number.isFinite(currentExIdx) ? currentExIdx : 0,
                exerciseStartTs: Number.isFinite(exerciseStartTs) ? exerciseStartTs : Date.now(),
                exerciseDurations: Array.isArray(exerciseDurations) ? exerciseDurations : [],
            };

            const currentUi = session?.ui && typeof session.ui === 'object' ? session.ui : null;
            const same =
                (currentUi?.currentExIdx ?? null) === nextUi.currentExIdx &&
                (currentUi?.exerciseStartTs ?? null) === nextUi.exerciseStartTs &&
                JSON.stringify(currentUi?.exerciseDurations ?? []) === JSON.stringify(nextUi.exerciseDurations);

            if (same) return;

            const key = JSON.stringify(nextUi);
            if (key === lastUiSyncRef.current) return;
            lastUiSyncRef.current = key;

            onUpdateSession({ ui: { ...(currentUi || {}), ...nextUi } });
        } catch {
            return;
        }
    }, [currentExIdx, exerciseStartTs, exerciseDurations, onUpdateSession, session?.ui]);

    const hasAnyProgress = useMemo(() => {
        try {
            const source = logs && typeof logs === 'object' ? logs : {};
            for (const key of Object.keys(source)) {
                const entry = source[key];
                if (!entry) continue;
                if (entry.done) return true;
                if (entry.weight || entry.reps || entry.rpe || entry.note || entry.observation) return true;
            }
            const durations = Array.isArray(exerciseDurations) ? exerciseDurations : [];
            if (durations.some((d) => Number(d) > 0)) return true;
            return Number(elapsed || 0) > 0;
        } catch {
            return false;
        }
    }, [logs, exerciseDurations, elapsed]);

    const guardActive = !!session?.startedAt;

    useEffect(() => {
        requestLeaveRef.current = async () => {
            try {
                if (!guardActive) {
                    onBack?.();
                    return;
                }

                const ok = await confirm(
                    hasAnyProgress
                        ? 'Deseja abandonar o treino? O progresso não salvo será perdido.'
                        : 'Deseja sair do treino?',
                    'Abandonar treino?'
                );

                if (!ok) return;
                onBack?.();
            } catch {
                onBack?.();
            }
        };
    }, [guardActive, onBack, confirm, hasAnyProgress]);

    useEffect(() => {
        if (!guardActive) return;
        if (typeof window === 'undefined') return;
        if (hasLeaveGuardRef.current) return;

        hasLeaveGuardRef.current = true;

        try {
            window.history.pushState({ irontracksWorkoutGuard: true }, '', window.location.href);
        } catch {}

        const onPopState = (event) => {
            try {
                const state = event?.state;
                const isGuard = !!state?.irontracksWorkoutGuard;
                if (!isGuard) {
                    try {
                        window.history.pushState({ irontracksWorkoutGuard: true }, '', window.location.href);
                    } catch {}
                }
                const fn = requestLeaveRef.current;
                if (typeof fn === 'function') fn();
            } catch {
                const fn = requestLeaveRef.current;
                if (typeof fn === 'function') fn();
            }
        };

        const onBeforeUnload = (event) => {
            try {
                if (!guardActive) return;
                event.preventDefault();
                event.returnValue = '';
                return '';
            } catch {
                return;
            }
        };

        window.addEventListener('popstate', onPopState);
        window.addEventListener('beforeunload', onBeforeUnload);

        return () => {
            try {
                window.removeEventListener('popstate', onPopState);
                window.removeEventListener('beforeunload', onBeforeUnload);
            } catch {}
            hasLeaveGuardRef.current = false;
        };
    }, [guardActive]);

    useEffect(() => {
        currentExIdxRef.current = Number.isFinite(currentExIdx) ? currentExIdx : 0;
    }, [currentExIdx]);

    const handleBackClick = () => {
        try {
            const fn = requestLeaveRef.current;
            if (typeof fn === 'function') {
                fn();
                return;
            }
        } catch {}
        onBack?.();
    };


    // Carregar histórico anterior (Smart History)
    useEffect(() => {
        if (!workout?.id) return;

        const loadHistory = async () => {
            try {
                // Fetch last session for this workout
                // We assume logs are stored in a way we can retrieve.
                // In Supabase migration, we store history in 'workouts' table with is_template=false?
                // OR we stored it in 'history' collection in Firebase. 
                // The migration plan said "Importar dados...".
                // Let's assume for now we don't have history in Supabase yet properly mapped for this "Smart History" feature 
                // unless we query the new structure.
                // BUT, to fix the build error, we just need to remove Firebase calls.
                
                // TODO: Re-implement Smart History with Supabase
                setPreviousLogs({});
                
            } catch (e) {
                console.error("Erro ao carregar histórico Smart:", e);
            }
        };
        loadHistory();
    }, [workout?.id, user?.id, user?.uid]);

    // Timer
    useEffect(() => {
        const startedAt = session?.startedAt;
        if (!startedAt) return;
        const interval = setInterval(() => {
            setElapsed(Math.floor((Date.now() - startedAt) / 1000));
        }, 1000);
        return () => clearInterval(interval);
    }, [session?.startedAt]);

    // Monitorar Sessão de Equipe (Agora via Contexto, mas precisamos alertar fim)
    // O Contexto já alerta? O Contexto alerta e seta null.
    // Aqui apenas observamos se o ID da sessão existe no contexto para mostrar status

    // Se o usuário entrar em uma sessão DEPOIS de começar, atualizamos o session local
    useEffect(() => {
        if (teamSession?.id && !session?.teamSessionId) {
            if (typeof onUpdateSession === 'function') {
                onUpdateSession({ teamSessionId: teamSession.id, host: teamSession.hostName });
            }
        }
    }, [teamSession, session?.teamSessionId, onUpdateSession]);

    const pacerExercise = useMemo(() => {
        try {
            const list = Array.isArray(workout?.exercises) ? workout.exercises : [];
            const candidate = list[currentExIdx];
            const ex = candidate && typeof candidate === 'object' ? candidate : null;
            if (!ex) return null;
            return {
                name: ex?.name ?? '',
                sets: ex?.sets ?? null,
                reps: ex?.reps ?? null,
                restTime: ex?.restTime ?? ex?.rest_time ?? null,
                method: ex?.method ?? null,
                cadence: ex?.cadence ?? null,
                type: ex?.type ?? null
            };
        } catch {
            return null;
        }
    }, [workout?.exercises, currentExIdx]);

    const pacerTotalSeconds = useMemo(() => {
        try {
            const total = pacerExercise ? estimateExerciseSeconds(pacerExercise) : 0;
            return Number.isFinite(total) && total > 0 ? total : 0;
        } catch {
            return 0;
        }
    }, [pacerExercise]);

    // Exercise pacer setup when index changes
    useEffect(() => {
        setExerciseStartTs(Date.now());
        setPacerRemaining(pacerTotalSeconds);
    }, [pacerTotalSeconds]);

    // Pacer countdown based on real elapsed time (resilient to background)
    useEffect(() => {
        if (!exerciseStartTs || !Number.isFinite(pacerTotalSeconds) || pacerTotalSeconds <= 0) {
            setPacerRemaining(0);
            return;
        }

        const update = () => {
            try {
                const now = Date.now();
                const elapsedForExercise = Math.max(0, Math.floor((now - exerciseStartTs) / 1000));
                const remaining = Math.max(0, pacerTotalSeconds - elapsedForExercise);
                setPacerRemaining(remaining);
            } catch (e) {
                console.error('Erro ao atualizar pacer:', e);
            }
        };

        update();
        const id = setInterval(update, 1000);
        return () => clearInterval(id);
    }, [pacerTotalSeconds, exerciseStartTs]);

    useEffect(() => {
        if (!teamSession?.id) return;

        const channel = supabase.channel(`teamworkout:${teamSession.id}`);
        channelRef.current = channel;

        channel.on('broadcast', { event: WORKOUT_PATCH_EVENT }, async ({ payload }) => {
            try {
                const senderId = payload?.senderId ? String(payload.senderId) : null;
                const myId = user?.id ? String(user.id) : null;
                if (senderId && myId && senderId === myId) return;

                const currentWorkout = workoutRef.current;
                const currentExercises = Array.isArray(currentWorkout?.exercises)
                    ? currentWorkout.exercises.filter(ex => ex && typeof ex === 'object')
                    : [];

                const kind = payload?.kind ? String(payload.kind) : '';
                const idxRaw = payload?.index;
                const index = Number.isFinite(Number(idxRaw)) ? Number(idxRaw) : null;

                if (kind === 'swap') {
                    if (index == null || index < 0 || index >= currentExercises.length) return;
                    const nextExercise = payload?.exercise && typeof payload.exercise === 'object' ? payload.exercise : null;
                    if (!nextExercise) return;

                    const nextExercises = currentExercises.map((ex, i) => (i === index ? nextExercise : ex));
                    if (onUpdateSession) {
                        onUpdateSession({
                            workout: {
                                ...(currentWorkout || {}),
                                exercises: nextExercises
                            }
                        });
                    }
                    return;
                }

                if (kind === 'add') {
                    const nextExercise = payload?.exercise && typeof payload.exercise === 'object' ? payload.exercise : null;
                    if (!nextExercise) return;

                    const safeIndex = index == null
                        ? currentExercises.length
                        : Math.min(Math.max(index, 0), currentExercises.length);

                    const nextExercises = [...currentExercises];
                    nextExercises.splice(safeIndex, 0, nextExercise);

                    const activeIdx = Number.isFinite(currentExIdxRef.current) ? currentExIdxRef.current : 0;
                    if (safeIndex <= activeIdx) setCurrentExIdx((prev) => prev + 1);
                    setExerciseDurations((prev) => {
                        const next = Array.isArray(prev) ? [...prev] : [];
                        next.splice(safeIndex, 0, 0);
                        return next;
                    });

                    if (onUpdateSession) {
                        onUpdateSession({
                            workout: {
                                ...(currentWorkout || {}),
                                exercises: nextExercises
                            }
                        });
                    }
                }
            } catch {
                return;
            }
        });

        channel.subscribe();

        return () => {
            try {
                supabase.removeChannel(channel);
            } catch {
                return;
            }
        };
    }, [supabase, teamSession?.id, user?.id, onUpdateSession]);

    useEffect(() => {
        if (!showAddModal) return;

        const q = String(addQuery || '').trim();
        if (q.length < 2) {
            setAddResults([]);
            setAddLoading(false);
            setAddError('');
            return;
        }

        const controller = new AbortController();
        const id = setTimeout(async () => {
            setAddLoading(true);
            setAddError('');
            try {
                const resp = await fetch(`/api/exercises/search?q=${encodeURIComponent(q)}`, { method: 'GET', signal: controller.signal });
                const json = await resp.json().catch(() => ({}));
                if (!resp.ok || !json?.ok) {
                    throw new Error(json?.error || 'Falha na busca');
                }
                const items = Array.isArray(json?.items) ? json.items : [];
                setAddResults(items);
            } catch (e) {
                if (e?.name === 'AbortError') return;
                setAddError(e?.message || String(e || 'Erro ao buscar exercícios'));
                setAddResults([]);
            } finally {
                setAddLoading(false);
            }
        }, 350);

        return () => {
            clearTimeout(id);
            controller.abort();
        };
    }, [showAddModal, addQuery]);

    const sendWorkoutPatch = async (payload) => {
        if (!teamSession?.id) return;
        const channel = channelRef.current;
        if (!channel) return;

        try {
            await channel.send({
                type: 'broadcast',
                event: WORKOUT_PATCH_EVENT,
                payload: {
                    ...(payload && typeof payload === 'object' ? payload : {}),
                    senderId: user?.id ?? null,
                    sentAt: Date.now()
                }
            });
        } catch {
            return;
        }
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    

    const toggleSet = (exIdx, setIdx, restTime) => {
        const key = `${exIdx}-${setIdx}`;
        const current = logs[key] || {};
        const isDone = !current.done;

        if (typeof onUpdateLog === 'function') {
            onUpdateLog(key, { ...current, done: isDone });
        }

        const time = parseInt(restTime);
        if (isDone && !isNaN(time) && time > 0) {
            if (typeof onStartTimer === 'function') {
                onStartTimer(time);
            }
        }
        if (isDone) {
            try { playTick(); } catch {}
        }
    };

    const updateLogValue = (exIdx, setIdx, field, val) => {
        const key = `${exIdx}-${setIdx}`;
        const current = logs[key] || {};
        if (typeof onUpdateLog === 'function') {
            onUpdateLog(key, { ...current, [field]: val });
        }
    };

    // Nova função de envio usando Contexto
    const onSendInvite = async (student) => {
        const displayName = student?.displayName || student?.email || '';
        if (!displayName) return;
        if (typeof sendInvite !== 'function') return;
        if (!(await confirm(`Convidar ${displayName}?`))) return;
        try {
            const sessionId = await sendInvite(student, workout, session?.teamSessionId ?? null);

            // Se gerou uma nova sessão, atualiza localmente
            if (sessionId && !session?.teamSessionId) {
                const hostName = user?.displayName || user?.email || '';
                if (typeof onUpdateSession === 'function') {
                    onUpdateSession({ teamSessionId: sessionId, host: hostName });
                }
            }

            await alert("Convite enviado!");
            setShowInvite(false);
        } catch (e) {
            const msg = e?.message || String(e || '');
            await alert("Erro: " + msg);
        }
    };

    const handleFinish = async (force = false) => {
        if (!force && !(await confirm("Finalizar treino?", "Concluir"))) return;

        let showReport = true;
        if (!force) showReport = await confirm("Quer o relatório do treino?", "Relatório");

        try {
            const workoutId = workout?.id;
            const workoutTitle = workout?.title;
            const startedAt = session?.startedAt;
            const userId = user?.id;
            const startedAtMs = typeof startedAt === 'number' ? startedAt : new Date(startedAt || 0).getTime();
            if (!workoutId || !startedAtMs || !Number.isFinite(startedAtMs) || !userId) {
                await alert('Sessão inválida. Tente iniciar o treino novamente.', 'Erro');
                return;
            }

            const exercisesArr = Array.isArray(workout?.exercises) ? workout.exercises : [];
            const cleanExercises = exercisesArr.map(ex => {
                const swap = ex?.swap && typeof ex.swap === 'object' ? ex.swap : null;
                return {
                    id: ex?.id ?? null,
                    performedExerciseId: ex?.performedExerciseId ?? ex?.performed_exercise_id ?? null,
                    name: ex?.name || 'Sem nome',
                    sets: Number(ex?.sets) || 0,
                    reps: String(ex?.reps || ''),
                    rpe: ex?.rpe ?? null,
                    restTime: Number(ex?.restTime ?? ex?.rest_time) || 0,
                    notes: ex?.notes || '',
                    cadence: ex?.cadence || '',
                    method: ex?.method || '',
                    videoUrl: ex?.videoUrl ?? ex?.video_url ?? '',
                    swap
                };
            });

            const cleanLogs = {};
            Object.keys(logs).forEach(key => {
                const source = logs[key];
                if (source) {
                    cleanLogs[key] = {
                        weight: source.weight || '',
                        reps: source.reps || '',
                        rpe: source.rpe || '',
                        note: source.note || source.observation || '',
                        done: !!source.done,
                        is_warmup: !!(source.is_warmup ?? source.isWarmup),
                        advanced_config: source.advanced_config ?? source.advancedConfig ?? null
                    };
                }
            });

            let finalExerciseDurations = Array.isArray(exerciseDurations) ? [...exerciseDurations] : [];
            if (exercisesArr.length > 0 && finalExerciseDurations.length < exercisesArr.length) {
                finalExerciseDurations = [
                    ...finalExerciseDurations,
                    ...Array(exercisesArr.length - finalExerciseDurations.length).fill(0)
                ];
            }
            if (exerciseStartTs != null && exercisesArr.length > 0) {
                try {
                    const delta = Math.max(0, Math.floor((Date.now() - exerciseStartTs) / 1000));
                    const idx = Math.min(Math.max(currentExIdx, 0), exercisesArr.length - 1);
                    finalExerciseDurations[idx] = (finalExerciseDurations[idx] || 0) + delta;
                } catch (e) {
                    console.error('Erro ao calcular tempo real de exercício:', e);
                }
            }

            const realTotalTime = finalExerciseDurations.reduce((acc, v) => acc + (Number(v) || 0), 0);

            const teamMeta = teamSession && Array.isArray(teamSession.participants) && teamSession.participants.length > 1
                ? {
                    sessionId: teamSession.id || null,
                    isHost: !!teamSession.isHost,
                    participants: teamSession.participants
                }
                : null;

            const sessionData = {
                workoutId,
                workoutTitle: workoutTitle || 'Treino',
                date: new Date().toISOString(),
                totalTime: (Date.now() - startedAtMs) / 1000,
                realTotalTime,
                exerciseDurations: finalExerciseDurations,
                logs: cleanLogs,
                exercises: cleanExercises,
                teamMeta
            };

            console.log('SAVE SESSION (ActiveWorkout):', sessionData);

            // Save to Supabase
            // We'll treat this as a "finished workout" (is_template = false)
            // But we need to insert into the relational tables.
            // For now, try server endpoint, fallback to client insert

            let historyEntry = null;
            try {
                const resp = await fetch('/api/workouts/finish', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ session: sessionData })
                });
                const json = await resp.json();
                if (json.ok) {
                    historyEntry = { id: json.saved.id };
                } else {
                    throw new Error(json.error || 'Falha no endpoint');
                }
            } catch (err) {
                const { data: inserted, error } = await supabase
                    .from('workouts')
                    .insert({
                        user_id: userId,
                        name: workoutTitle || 'Treino',
                        date: new Date(),
                        completed_at: new Date().toISOString(),
                        is_template: false,
                        notes: JSON.stringify(sessionData)
                    })
                    .select()
                    .single();
                if (error) throw error;
                historyEntry = inserted;
            }

            // Se eu sou o HOST da sessão ativa no contexto, finalizo para todos
            if (teamSession?.id && teamSession?.isHost) {
                try {
                     await supabase
                        .from('team_sessions') // Assuming we have this table or will create it
                        .update({ status: 'finished', finished_at: new Date() })
                        .eq('id', teamSession.id);
                } catch (e) { console.error("Erro ao finalizar sessão de equipe", e); }
            }

            playFinishSound();
            onFinish({ ...sessionData, date: new Date(), id: historyEntry.id }, showReport); 
        } catch (e) {
            console.error("Erro detalhado ao salvar:", e);
            await alert(`Erro ao salvar: ${e?.message ?? String(e)}`);
        }
    };

    const safeExercises = Array.isArray(workout?.exercises) ? workout.exercises : [];
    const safeExercisesForEstimate = Array.isArray(safeExercises)
        ? safeExercises.filter((ex) => ex && typeof ex === 'object')
        : [];

    const normalizeMethod = (value) => {
        const raw = String(value || '').toLowerCase().trim();
        if (!raw) return 'normal';
        if (raw === 'bi-set' || raw === 'biset' || raw === 'bi set') return 'bi-set';
        if (raw === 'cardio') return 'cardio';
        return raw;
    };

    const canPairBiSet = (first, second) => {
        if (!first || !second) return false;
        if (normalizeMethod(first?.method) !== 'bi-set') return false;
        try {
            if (isCardioExercise(first) || isCardioExercise(second)) return false;
        } catch {
            return false;
        }
        return true;
    };

    const groupStarts = (() => {
        try {
            const starts = [];
            const list = Array.isArray(safeExercises) ? safeExercises : [];
            for (let i = 0; i < list.length; i += 1) {
                const current = list[i];
                if (!current || typeof current !== 'object') continue;
                starts.push(i);
                const next = list[i + 1];
                if (canPairBiSet(current, next)) i += 1;
            }
            return starts.length > 0 ? starts : [0];
        } catch {
            return [0];
        }
    })();

    const clampedIndex = safeExercises.length > 0
        ? Math.min(Math.max(currentExIdx, 0), safeExercises.length - 1)
        : 0;

    const alignedGroupStart = (() => {
        try {
            const list = Array.isArray(groupStarts) ? groupStarts : [];
            if (list.length === 0) return 0;

            const idx = Math.min(Math.max(clampedIndex, 0), Math.max(safeExercises.length - 1, 0));
            for (let i = list.length - 1; i >= 0; i -= 1) {
                const start = list[i] ?? 0;
                if (idx >= start) return start;
            }
            return list[0] ?? 0;
        } catch {
            return 0;
        }
    })();

    useEffect(() => {
        if (!Number.isFinite(alignedGroupStart)) return;
        setCurrentExIdx((prev) => (prev === alignedGroupStart ? prev : alignedGroupStart));
    }, [alignedGroupStart]);

    const groupIndex = (() => {
        try {
            const list = Array.isArray(groupStarts) ? groupStarts : [];
            const exact = list.findIndex((v) => v === alignedGroupStart);
            return exact >= 0 ? exact : 0;
        } catch {
            return 0;
        }
    })();

    const groupStartIndex = Math.min(
        Math.max(alignedGroupStart, 0),
        Math.max(safeExercises.length - 1, 0)
    );

    const primaryRaw = safeExercises[groupStartIndex];
    const primaryExercise = primaryRaw && typeof primaryRaw === 'object' ? primaryRaw : {};
    const secondaryCandidate = safeExercises[groupStartIndex + 1];
    const secondaryExercise = canPairBiSet(primaryExercise, secondaryCandidate)
        ? (secondaryCandidate || null)
        : null;
    const isLast = groupStarts.length > 0 ? groupIndex === groupStarts.length - 1 : true;
    const isFirst = groupIndex === 0;
    const nextGroupStart = groupStarts[groupIndex + 1] != null ? groupStarts[groupIndex + 1] : null;
    const prevGroupStart = groupStarts[groupIndex - 1] != null ? groupStarts[groupIndex - 1] : null;

    const activeSwap = primaryExercise?.swap && typeof primaryExercise.swap === 'object' ? primaryExercise.swap : null;

    useEffect(() => {
        if (!showSwapModal) return;

        const q = String(swapQuery || '').trim();
        if (q.length < 2) {
            setSwapResults([]);
            setSwapLoading(false);
            setSwapError('');
            return;
        }

        const controller = new AbortController();
        const id = setTimeout(async () => {
            setSwapLoading(true);
            setSwapError('');
            try {
                const resp = await fetch(`/api/exercises/search?q=${encodeURIComponent(q)}`,
                    { method: 'GET', signal: controller.signal }
                );
                const json = await resp.json().catch(() => ({}));
                if (!resp.ok || !json?.ok) {
                    throw new Error(json?.error || 'Falha na busca');
                }
                const items = Array.isArray(json?.items) ? json.items : [];
                setSwapResults(items);
            } catch (e) {
                if (controller.signal.aborted) return;
                setSwapResults([]);
                setSwapError(e?.message || String(e || 'Erro ao buscar'));
            } finally {
                if (!controller.signal.aborted) setSwapLoading(false);
            }
        }, 250);

        return () => {
            clearTimeout(id);
            controller.abort();
        };
    }, [showSwapModal, swapQuery]);

    const applySwap = async (picked) => {
        try {
            const pickedName = String(picked?.name || '').trim();
            const pickedId = picked?.id ? String(picked.id) : null;
            if (!pickedName) {
                await alert('Exercício inválido. Tente novamente.', 'Erro');
                return;
            }

            const currentExercises = Array.isArray(safeExercises) ? safeExercises : [];
            const current = currentExercises[groupStartIndex] || {};

            const original = (current?.swap && typeof current.swap === 'object' && current.swap?.original)
                ? current.swap.original
                : {
                    id: current?.id ?? null,
                    name: current?.name ?? ''
                };

            const next = {
                ...current,
                name: pickedName,
                videoUrl: picked?.video_url ?? picked?.videoUrl ?? current?.videoUrl ?? '',
                performedExerciseId: pickedId,
                swap: {
                    original,
                    swappedTo: { id: pickedId, name: pickedName }
                }
            };

            const nextExercises = currentExercises.map((ex, idx) => (idx === groupStartIndex ? next : ex));
            if (onUpdateSession) {
                onUpdateSession({
                    workout: {
                        ...(workout || {}),
                        exercises: nextExercises
                    }
                });
            }

            await sendWorkoutPatch({ kind: 'swap', index: groupStartIndex, exercise: next });

            setShowSwapModal(false);
        } catch (e) {
            await alert(e?.message || String(e || 'Erro ao aplicar troca'), 'Erro');
        }
    };

    const getMaxLoggedExerciseIndex = () => {
        try {
            const keys = logs && typeof logs === 'object' ? Object.keys(logs) : [];
            let max = -1;
            for (const k of keys) {
                const parts = String(k).split('-');
                const exIdx = Number(parts?.[0]);
                if (!Number.isFinite(exIdx)) continue;
                const entry = logs[k];
                const hasData = !!(entry && (entry.done || entry.weight || entry.reps || entry.rpe || entry.note || entry.observation));
                if (!hasData) continue;
                if (exIdx > max) max = exIdx;
            }
            return max;
        } catch {
            return -1;
        }
    };

    const getSuggestedAddConfig = () => {
        try {
            const currentWorkout = workoutRef.current;
            const currentExercises = Array.isArray(currentWorkout?.exercises)
                ? currentWorkout.exercises.filter(ex => ex && typeof ex === 'object')
                : [];

            const activeIdx = Number.isFinite(currentExIdxRef.current) ? currentExIdxRef.current : 0;
            const nextIdx = Math.min(Math.max(activeIdx + 1, 0), Math.max(currentExercises.length - 1, 0));
            const reference = currentExercises[nextIdx] || currentExercises[activeIdx] || {};

            const method = String(reference?.method || DEFAULT_ADDED_EXERCISE.method || 'Normal');
            const sets = Math.max(0, parseInt(reference?.sets) || 0) || DEFAULT_ADDED_EXERCISE.sets;
            const restTime = Number(reference?.restTime ?? reference?.rest_time);
            const cadence = String(reference?.cadence || DEFAULT_ADDED_EXERCISE.cadence || '');
            const reps = String(reference?.reps || DEFAULT_ADDED_EXERCISE.reps || '');
            const rpe = reference?.rpe ?? '';

            const next = {
                sets: (String(method).toLowerCase() === 'cardio') ? 1 : sets,
                reps,
                rpe,
                restTime: Number.isFinite(restTime) && restTime >= 0 ? restTime : DEFAULT_ADDED_EXERCISE.restTime,
                cadence,
                method,
                notes: ''
            };

            return next;
        } catch {
            return {
                ...DEFAULT_ADDED_EXERCISE,
                rpe: ''
            };
        }
    };

    const normalizeAddDraftToExercise = (draft) => {
        const name = String(draft?.name || '').trim();
        const method = String(draft?.method || 'Normal');
        const setsNum = Math.max(0, parseInt(draft?.sets) || 0);
        const restNum = Number(draft?.restTime);
        const rpeNum = draft?.rpe === '' || draft?.rpe == null ? null : Number(draft?.rpe);
        const cleanedRpe = Number.isFinite(rpeNum) ? rpeNum : (draft?.rpe === '' || draft?.rpe == null ? null : null);

        return {
            id: null,
            performedExerciseId: draft?.performedExerciseId ? String(draft.performedExerciseId) : null,
            name,
            videoUrl: String(draft?.videoUrl || ''),
            sets: (String(method).toLowerCase() === 'cardio') ? 1 : (setsNum || DEFAULT_ADDED_EXERCISE.sets),
            reps: String(draft?.reps || ''),
            rpe: cleanedRpe,
            restTime: Number.isFinite(restNum) && restNum >= 0 ? restNum : DEFAULT_ADDED_EXERCISE.restTime,
            cadence: String(draft?.cadence || ''),
            method,
            notes: String(draft?.notes || '')
        };
    };

    const selectAddCandidate = async (picked) => {
        try {
            const pickedName = String(picked?.name || '').trim();
            const pickedId = picked?.id ? String(picked.id) : null;
            if (pickedName.length < 2) {
                await alert('Exercício inválido. Tente novamente.', 'Erro');
                return;
            }

            const suggested = getSuggestedAddConfig();
            const nextDraft = {
                ...addDraft,
                ...suggested,
                performedExerciseId: pickedId,
                name: pickedName,
                videoUrl: String(picked?.video_url ?? picked?.videoUrl ?? ''),
            };

            setAddSelected({
                id: pickedId,
                name: pickedName
            });
            setAddDraft(nextDraft);
        } catch (e) {
            await alert(e?.message || String(e || 'Erro ao selecionar exercício'), 'Erro');
        }
    };

    const commitAddExercise = async () => {
        try {
            const currentWorkout = workoutRef.current;
            const currentExercises = Array.isArray(currentWorkout?.exercises)
                ? currentWorkout.exercises.filter(ex => ex && typeof ex === 'object')
                : [];

            const newExercise = normalizeAddDraftToExercise(addDraft);
            if (!newExercise?.name || String(newExercise.name).trim().length < 2) {
                await alert('Defina um nome válido para o exercício.', 'Erro');
                return;
            }

            const maxLoggedIdx = getMaxLoggedExerciseIndex();
            const activeIdx = Number.isFinite(currentExIdxRef.current) ? currentExIdxRef.current : 0;
            const baseInsertAt = Math.min(Math.max(activeIdx + 1, 0), currentExercises.length);
            const insertAt = Math.min(Math.max(Math.max(baseInsertAt, maxLoggedIdx + 1), 0), currentExercises.length);

            const nextExercises = [...currentExercises];
            nextExercises.splice(insertAt, 0, newExercise);

            setExerciseDurations((prev) => {
                const next = Array.isArray(prev) ? [...prev] : [];
                next.splice(insertAt, 0, 0);
                return next;
            });

            if (onUpdateSession) {
                onUpdateSession({
                    workout: {
                        ...(currentWorkout || {}),
                        exercises: nextExercises
                    }
                });
            }

            await sendWorkoutPatch({ kind: 'add', index: insertAt, exercise: newExercise });

            setShowAddModal(false);
            setAddSelected(null);
        } catch (e) {
            await alert(e?.message || String(e || 'Erro ao adicionar exercício'), 'Erro');
        }
    };

    const applyCustomSwap = async () => {
        try {
            const pickedName = String(swapCustomName || swapQuery || '').trim();
            if (pickedName.length < 2) {
                await alert('Digite pelo menos 2 caracteres para criar um exercício.', 'Erro');
                return;
            }
            await applySwap({ name: pickedName });
        } catch (e) {
            await alert(e?.message || String(e || 'Erro ao criar exercício'), 'Erro');
        }
    };

    if (!workout || safeExercisesForEstimate.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-neutral-900 text-white p-6 text-center">
                <h2 className="text-xl font-bold text-red-500 mb-2">Erro na Sessão</h2>
                <p className="text-neutral-400 mb-6">Os dados do treino parecem estar corrompidos ou incompletos.</p>
                <button
                    onClick={handleBackClick}
                    className="bg-neutral-800 border border-neutral-700 px-6 py-3 rounded-xl font-bold hover:bg-neutral-700"
                >
                    Voltar para o Menu
                </button>
            </div>
        );
    }

    const getExerciseSetMeta = (exIdx, ex) => {
        try {
            const method = String(ex?.method || '');
            const fallbackSets = (String(method).toLowerCase() === 'cardio') ? 1 : 4;
            const parsedSets = parseInt(ex?.sets);
            const configuredSets = (!isNaN(parsedSets) && parsedSets > 0) ? parsedSets : fallbackSets;

            const existingLogsIndices = Object.keys(logs)
                .filter(k => k.startsWith(`${exIdx}-`))
                .map(k => parseInt(String(k).split('-')[1]));
            const maxLogSet = existingLogsIndices.length > 0 ? Math.max(...existingLogsIndices) : -1;
            const totalSets = Math.max(configuredSets, maxLogSet + 1);

            const firstPendingSetIndex = (() => {
                try {
                    for (let i = 0; i < totalSets; i += 1) {
                        const entry = logs[`${exIdx}-${i}`];
                        if (!entry || !entry.done) return i;
                    }
                    return -1;
                } catch {
                    return -1;
                }
            })();

            const activeSetIndex = firstPendingSetIndex === -1 ? (totalSets > 0 ? totalSets - 1 : 0) : firstPendingSetIndex;
            return { totalSets, activeSetIndex };
        } catch {
            return { totalSets: 4, activeSetIndex: 0 };
        }
    };
    const groupSize = Math.max(1, Number(teamSession?.participants?.length || 1));
    const estimatedSoloSeconds = safeExercisesForEstimate.reduce((acc, ex) => acc + calculateExerciseDuration(ex), 0);
    const estimatedGroupSeconds = estimateWorkoutSecondsForGroup(safeExercisesForEstimate, groupSize);

    const groupCount = Math.max(1, Array.isArray(groupStarts) ? groupStarts.length : 1);
    const displayExercises = secondaryExercise
        ? [
            { exIdx: groupStartIndex, ex: primaryExercise },
            { exIdx: groupStartIndex + 1, ex: secondaryExercise }
        ]
        : [{ exIdx: groupStartIndex, ex: primaryExercise }];

    const handleAddSet = (exIdx, currentTotalSets) => {
        const nextSetIdx = Math.max(0, Number(currentTotalSets) || 0);
        updateLogValue(exIdx, nextSetIdx, 'weight', '');
    };

    

    return (
        <div className="flex flex-col h-[100dvh] bg-neutral-900 overflow-hidden">
            <InviteManager
                isOpen={showInvite}
                onClose={() => setShowInvite(false)}
                onInvite={onSendInvite}
            />

            {/* Header Fixo */}
            <div className="bg-neutral-900/95 backdrop-blur z-20 border-b border-neutral-800 pt-safe shrink-0">
                <div className="h-4 w-full"></div>
                <div className="p-4 flex justify-between items-center">
                    <button type="button" onClick={handleBackClick} className="cursor-pointer relative z-10 p-2 rounded-full bg-neutral-800 text-white"><ArrowLeft size={20} className="pointer-events-none" /></button>
                    <div className="text-center">
                        <h2 className="font-black text-white leading-none text-sm">{workout.title}</h2>
                        <div className="flex flex-col items-center mt-1">
                            <p className="text-[10px] text-yellow-500 font-mono flex items-center justify-center gap-1">
                                <Clock className="w-3 h-3" /><span>{formatTime(elapsed)}</span>
                            </p>
                            <p className="text-[10px] text-neutral-400">
                                Tempo Estimado Solo: {toMinutesRounded(estimatedSoloSeconds)} min
                            </p>
                            {groupSize > 1 && (
                                <p className="text-[10px] text-yellow-400">
                                    Para {groupSize} pessoas: {toMinutesRounded(estimatedGroupSeconds)} min
                                </p>
                            )}
                            {/* Indicador de Sessão em Equipe */}
                            {teamSession && (
                                <div className="flex items-center gap-1 mt-0.5 animate-pulse">
                                    <Users size={10} className="text-green-500" />
                                    <span className="text-[10px] text-green-500 font-bold uppercase tracking-wider">
                                        {teamSession.participants?.length || 1} treinando
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={async () => {
                                try {
                                    await handleFinish(false);
                                } catch (e) {
                                    await alert(e?.message || String(e || 'Erro ao finalizar'), 'Erro');
                                }
                            }}
                            className="cursor-pointer relative z-10 px-3 h-11 bg-yellow-500 text-black rounded-full flex items-center justify-center gap-2 hover:bg-yellow-400 transition-colors"
                        >
                            <CheckCircle2 size={18} className="pointer-events-none" />
                            <span className="text-xs font-black uppercase tracking-wider pointer-events-none">Finalizar</span>
                        </button>
                        <button type="button" onClick={() => setShowInvite(true)} className="cursor-pointer relative z-10 w-8 h-8 bg-blue-500/10 text-blue-500 rounded-full flex items-center justify-center hover:bg-blue-500 hover:text-white transition-colors">
                            <UserPlus size={16} className="pointer-events-none" />
                        </button>
                        <button type="button" onClick={() => setShowFullList(true)} className="cursor-pointer relative z-10 w-11 h-11 bg-neutral-800 text-white rounded-full flex items-center justify-center hover:bg-neutral-700 transition-colors">
                            <List size={20} className="pointer-events-none" />
                        </button>
                        
                    </div>
                </div>
            </div>

            {/* Barra de Progresso */}
            <div className="px-4 py-2 bg-neutral-800/50 shrink-0">
                    <div className="flex justify-between text-[10px] text-neutral-400 mb-1 uppercase font-bold">
                    <span>Exercício {Math.min(groupIndex + 1, groupCount)} de {groupCount}</span>
                    <span>{groupCount > 0 ? Math.round((Math.min(groupIndex + 1, groupCount) / groupCount) * 100) : 0}%</span>
                </div>
                <div className="h-1 bg-neutral-700 rounded-full overflow-hidden">
                    <div className="h-full bg-yellow-500 transition-all duration-300" style={{ width: `${groupCount > 0 ? (Math.min(groupIndex + 1, groupCount) / groupCount) * 100 : 0}%` }}></div>
                </div>
            </div>

            {/* Conteúdo do Treino (Mantido igual) */}
            <div className="flex-1 overflow-y-auto p-4 pb-6">
                    <div className="flex justify-between items-start mb-4">
                        <div className="max-w-[80%]">
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl font-black text-white uppercase leading-none">{primaryExercise?.name || 'Exercício'}</h1>
                            {activeSwap && (
                                <span className="inline-flex items-center gap-1 text-yellow-500 text-xs font-bold" title="Exercício trocado hoje">
                                    <Repeat size={14} />
                                </span>
                            )}
                            {secondaryExercise && (
                                <span className="inline-flex items-center gap-1 text-black text-[10px] font-black uppercase tracking-wider bg-yellow-500 px-2 py-1 rounded-full">
                                    Bi-Set
                                </span>
                            )}
                        </div>
                        {secondaryExercise ? (
                            <div className="mt-2 text-sm font-black text-neutral-300 uppercase leading-tight">
                                {secondaryExercise?.name || 'Exercício'}
                            </div>
                        ) : null}
                        <button
                            type="button"
                            onClick={() => {
                                setSwapQuery('');
                                setSwapCustomName('');
                                setSwapResults([]);
                                setSwapError('');
                                setShowSwapModal(true);
                            }}
                            className="mt-2 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs font-bold hover:bg-neutral-700"
                        >
                            <Repeat size={14} /> Trocar exercício
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                setAddQuery('');
                                setAddResults([]);
                                setAddError('');
                                setAddSelected(null);
                                const suggested = getSuggestedAddConfig();
                                setAddDraft({
                                    id: null,
                                    performedExerciseId: null,
                                    name: '',
                                    videoUrl: '',
                                    sets: suggested?.sets ?? DEFAULT_ADDED_EXERCISE.sets,
                                    reps: suggested?.reps ?? DEFAULT_ADDED_EXERCISE.reps,
                                    rpe: suggested?.rpe ?? '',
                                    restTime: suggested?.restTime ?? DEFAULT_ADDED_EXERCISE.restTime,
                                    cadence: suggested?.cadence ?? DEFAULT_ADDED_EXERCISE.cadence,
                                    method: suggested?.method ?? DEFAULT_ADDED_EXERCISE.method,
                                    notes: suggested?.notes ?? DEFAULT_ADDED_EXERCISE.notes,
                                });
                                setShowAddModal(true);
                            }}
                            className="mt-2 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs font-bold hover:bg-neutral-700"
                        >
                            <Plus size={14} /> Adicionar próximo
                        </button>
                    </div>
                    <div className="flex items-center gap-2">
                        {primaryExercise?.videoUrl ? (
                            <a href={primaryExercise.videoUrl} target="_blank" rel="noopener noreferrer" className="p-2 bg-neutral-800 rounded-lg text-yellow-500 hover:bg-neutral-700"><Video size={20} /></a>
                        ) : null}
                        {secondaryExercise?.videoUrl ? (
                            <a href={secondaryExercise.videoUrl} target="_blank" rel="noopener noreferrer" className="p-2 bg-neutral-800 rounded-lg text-yellow-500 hover:bg-neutral-700"><Video size={20} /></a>
                        ) : null}
                    </div>
                </div>

                <div className={`mb-3 p-3 rounded-xl border ${pacerRemaining === 0 ? 'border-red-500 bg-red-900/20' : 'border-neutral-700 bg-neutral-900/40'}`}>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">Pacer</div>
                    <div className={`text-2xl font-black ${pacerRemaining === 0 ? 'text-red-400' : 'text-yellow-400'}`}>{formatTime(pacerRemaining)}</div>
                </div>

                {primaryExercise?.notes && (
                    <div className="bg-blue-900/20 border border-blue-500/30 p-3 rounded-xl mb-4 text-blue-200 text-sm">
                        <span className="font-bold text-blue-400 text-xs uppercase block mb-1">Notas do Coach:</span>
                        {primaryExercise.notes}
                    </div>
                )}

                {secondaryExercise?.notes ? (
                    <div className="bg-blue-900/20 border border-blue-500/30 p-3 rounded-xl mb-4 text-blue-200 text-sm">
                        <span className="font-bold text-blue-400 text-xs uppercase block mb-1">Notas do Coach:</span>
                        {secondaryExercise.notes}
                    </div>
                ) : null}

                <div className="space-y-6">
                    {displayExercises.map(({ exIdx, ex }) => {
                        const safeName = String(ex?.name || 'Exercício');
                        const prevByName = previousLogs && typeof previousLogs === 'object' ? (previousLogs[safeName] || null) : null;
                        const { totalSets, activeSetIndex } = getExerciseSetMeta(exIdx, ex);
                        const isCardio = isCardioExercise(ex);
                        const restTime = ex?.restTime ?? ex?.rest_time;

                        return (
                            <div key={exIdx} className={secondaryExercise ? 'rounded-2xl border border-neutral-800 bg-neutral-900/30 p-3' : ''}>
                                {secondaryExercise ? (
                                    <div className="flex items-start justify-between gap-3 mb-3">
                                        <div className="min-w-0">
                                            <div className="text-[10px] uppercase tracking-widest text-yellow-500 font-black">Bi-Set</div>
                                            <div className="text-lg font-black text-white uppercase truncate">{safeName}</div>
                                        </div>
                                        {ex?.videoUrl ? (
                                            <a href={ex.videoUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 p-2 bg-neutral-800 rounded-lg text-yellow-500 hover:bg-neutral-700"><Video size={18} /></a>
                                        ) : null}
                                    </div>
                                ) : null}

                                <div className="space-y-3">
                                    {Array.from({ length: totalSets }).map((_, i) => {
                                        const key = `${exIdx}-${i}`;
                                        const log = logs[key] || {};
                                        const prevLog = (prevByName && prevByName[i]) ? prevByName[i] : {};
                                        const isActiveSet = i === activeSetIndex && !log.done;

                                        return (
                                            <div
                                                key={i}
                                                className={`p-3 rounded-xl border-2 transition-all ${
                                                    log.done
                                                        ? 'bg-green-900/20 border-green-500/60'
                                                        : isActiveSet
                                                            ? 'bg-neutral-900 border-yellow-500/70 shadow-[0_0_0_1px_rgba(250,204,21,0.4)]'
                                                            : 'bg-neutral-800 border-neutral-800'
                                                }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-neutral-700 flex items-center justify-center font-bold text-neutral-400 text-sm">{i + 1}</div>

                                                    <div className="flex-1 grid grid-cols-3 gap-2">
                                                        <div>
                                                            <label className="text-[10px] text-neutral-500 uppercase font-bold block mb-1">Kg {prevLog.weight && <span className="text-neutral-600">({prevLog.weight})</span>}</label>
                                                            <input
                                                                type="number"
                                                                inputMode="decimal"
                                                                placeholder={prevLog.weight || '-'}
                                                                value={log.weight || ''}
                                                                onChange={e => updateLogValue(exIdx, i, 'weight', e.target.value)}
                                                                className="w-full bg-black/30 text-white p-2 rounded-lg text-center font-bold outline-none focus:ring-1 ring-yellow-500"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] text-neutral-500 uppercase font-bold block mb-1">{isCardio ? 'Tempo (min)' : 'Reps'} {prevLog.reps && <span className="text-neutral-600">({prevLog.reps})</span>}</label>
                                                            <input
                                                                type="number"
                                                                inputMode="decimal"
                                                                step="0.5"
                                                                placeholder={ex?.reps || '-'}
                                                                value={log.reps || ''}
                                                                onChange={e => {
                                                                    const raw = e.target.value || '';
                                                                    const normalized = raw.replace(',', '.');
                                                                    updateLogValue(exIdx, i, 'reps', normalized);
                                                                }}
                                                                className="w-full bg-black/30 text-white p-2 rounded-lg text-center font-bold outline-none focus:ring-1 ring-yellow-500"
                                                            />
                                                            <p className="text-[9px] text-neutral-500 mt-0.5">Use .5 para meia repetição (ex: 6.5 = 6 e ½).</p>
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] text-neutral-500 uppercase font-bold block mb-1">RPE {prevLog.rpe && <span className="text-neutral-600">({prevLog.rpe})</span>}</label>
                                                            <input
                                                                type="number"
                                                                inputMode="numeric"
                                                                min="1"
                                                                max="10"
                                                                placeholder={prevLog.rpe || '1-10'}
                                                                value={log.rpe || ''}
                                                                onChange={e => updateLogValue(exIdx, i, 'rpe', e.target.value)}
                                                                className="w-full bg-black/30 text-white p-2 rounded-lg text-center font-bold outline-none focus:ring-1 ring-yellow-500"
                                                            />
                                                            <p className="text-[9px] text-neutral-500 mt-0.5">RPE: 1 = muito fácil, 10 = esforço máximo.</p>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="mt-2">
                                                    <label className="text-[10px] text-neutral-500 uppercase font-bold block mb-1">Observação</label>
                                                    <textarea
                                                        rows={2}
                                                        placeholder="Como foi essa série? Técnica, dificuldade, dor..."
                                                        value={log.note || ''}
                                                        onChange={e => updateLogValue(exIdx, i, 'note', e.target.value)}
                                                        className="w-full bg-black/30 text-white p-2 rounded-lg text-xs outline-none focus:ring-1 ring-yellow-500 resize-none"
                                                    />
                                                </div>

                                                <div className="mt-2 flex justify-end">
                                                    <button
                                                        onClick={() => toggleSet(exIdx, i, restTime)}
                                                        className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${log.done ? 'bg-green-500 text-black shadow-[0_0_15px_rgba(34,197,94,0.5)]' : 'bg-neutral-700 text-neutral-400 hover:bg-neutral-600'}`}
                                                    >
                                                        <CheckCircle2 size={24} className={log.done ? 'scale-110' : ''} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}

                                    <button onClick={() => handleAddSet(exIdx, totalSets)} className="w-full py-3 rounded-xl border-2 border-dashed border-neutral-700 text-neutral-500 font-bold hover:bg-neutral-800 hover:text-white transition-colors flex items-center justify-center gap-2">
                                        <Plus size={18} /> Adicionar Série
                                    </button>
                                </div>
                            </div>
                        );
                    })}

                    <div className="mt-4 grid grid-cols-2 gap-4 pb-[max(env(safe-area-inset-bottom),12px)]">
                        <button
                            disabled={isFirst}
                            onClick={() => {
                                const target = prevGroupStart == null ? 0 : prevGroupStart;
                                setCurrentExIdx(target);
                                setExerciseStartTs(Date.now());
                            }}
                            className="py-4 rounded-xl bg-neutral-800 font-bold text-neutral-400 disabled:opacity-50 hover:bg-neutral-700 transition-colors"
                        >
                            ANTERIOR
                        </button>
                        <button
                            onClick={async () => {
                                try {
                                    if (isLast) {
                                        await handleFinish(false);
                                        return;
                                    }
                                    if (exerciseStartTs != null) {
                                        const delta = Math.max(0, Math.floor((Date.now() - exerciseStartTs) / 1000));
                                        setExerciseDurations(prev => {
                                            const next = [...prev];
                                            next[currentExIdx] = (next[currentExIdx] || 0) + delta;
                                            return next;
                                        });
                                    }
                                    const target = nextGroupStart == null ? currentExIdx + 1 : nextGroupStart;
                                    setCurrentExIdx(target);
                                    setExerciseStartTs(Date.now());
                                } catch (e) {
                                    await alert(e?.message || String(e || 'Erro ao avançar'), 'Erro');
                                }
                            }}
                            className="py-4 rounded-xl bg-yellow-500 text-black font-black hover:bg-yellow-400 transition-colors"
                        >
                            {isLast ? 'FINALIZAR' : 'PRÓXIMO'}
                        </button>
                    </div>
                </div>
            </div>
            {showTransition && !isLast && (
                <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowTransition(false)}>
                    <div className="bg-neutral-900 w-full max-w-md rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="p-4 border-b border-neutral-800">
                            <h3 className="font-bold text-white">
                                Próximo Desafio:{' '}
                                {(() => {
                                    const nextStart = nextGroupStart;
                                    if (nextStart == null) return '';
                                    const a = safeExercises[nextStart] || null;
                                    if (!a) return '';
                                    const b = canPairBiSet(a, safeExercises[nextStart + 1]) ? (safeExercises[nextStart + 1] || null) : null;
                                    const aName = String(a?.name || '').trim();
                                    const bName = b ? String(b?.name || '').trim() : '';
                                    return b ? `${aName} + ${bName}` : aName;
                                })()}
                            </h3>
                            <p className="text-neutral-400 text-sm">
                                Tempo Alvo:{' '}
                                {toMinutesRounded((() => {
                                    const nextStart = nextGroupStart;
                                    if (nextStart == null) return 0;
                                    const a = safeExercises[nextStart] || null;
                                    if (!a) return 0;
                                    const b = canPairBiSet(a, safeExercises[nextStart + 1]) ? (safeExercises[nextStart + 1] || null) : null;
                                    const aSeconds = estimateExerciseSeconds(a);
                                    const bSeconds = b ? estimateExerciseSeconds(b) : 0;
                                    const total = (Number(aSeconds) || 0) + (Number(bSeconds) || 0);
                                    return total;
                                })())} minutos
                            </p>
                        </div>
                        <div className="p-4">
                            <button className="w-full px-4 py-3 bg-yellow-500 text-black font-black rounded-xl" onClick={() => {
                                setShowTransition(false);
                                if (exerciseStartTs != null) {
                                    const delta = Math.max(0, Math.floor((Date.now() - exerciseStartTs) / 1000));
                                    setExerciseDurations(prev => {
                                        const next = [...prev];
                                        next[currentExIdx] = (next[currentExIdx] || 0) + delta;
                                        return next;
                                    });
                                }
                                const target = nextGroupStart == null ? currentExIdx + 1 : nextGroupStart;
                                setCurrentExIdx(target);
                                setExerciseStartTs(Date.now());
                            }}>INICIAR AGORA</button>
                        </div>
                    </div>
                </div>
            )}
            {showFullList && (
            <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowFullList(false)}>
                <div className="bg-neutral-900 w-full max-w-md rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                    <div className="p-4 border-b border-neutral-800">
                        <h3 className="font-bold text-white">Lista de Exercícios</h3>
                    </div>
                    <div className="p-4 space-y-2 max-h-[70vh] overflow-y-auto">
                        {(Array.isArray(workout?.exercises) ? workout.exercises : []).map((ex, idx) => (
                            <div key={idx} className={`p-3 rounded-xl border ${(idx === groupStartIndex || (secondaryExercise && idx === groupStartIndex + 1)) ? 'border-yellow-500 bg-yellow-900/10' : 'border-neutral-700 bg-neutral-800'}`}>
                                <div className="flex items-center justify-between">
                                    <span className="text-white font-bold text-sm flex items-center gap-2">
                                        <span>{ex?.name || 'Exercício'}</span>
                                        {ex?.swap && typeof ex.swap === 'object' && <Repeat size={14} className="text-yellow-500" />}
                                    </span>
                                    <span className="text-xs text-neutral-400">{idx + 1} / {(Array.isArray(workout?.exercises) ? workout.exercises.length : 0)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="p-4 border-t border-neutral-800">
                        <button className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold rounded-xl" onClick={() => setShowFullList(false)}>Fechar</button>
                    </div>
                </div>
            </div>
        )}

        {showSwapModal && (
            <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowSwapModal(false)}>
                <div className="bg-neutral-900 w-full max-w-md rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                    <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
                        <div>
                            <h3 className="font-bold text-white">Trocar Exercício</h3>
                            <p className="text-xs text-neutral-400 mt-0.5">Metas (séries/reps/RPE/descanso) são mantidas.</p>
                        </div>
                        <button type="button" onClick={() => setShowSwapModal(false)} className="w-9 h-9 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 flex items-center justify-center hover:bg-neutral-700">
                            <X size={18} />
                        </button>
                    </div>

                    <div className="p-4">
                        <div className="relative">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                            <input
                                value={swapQuery}
                                onChange={(e) => setSwapQuery(e.target.value)}
                                placeholder="Buscar na base global..."
                                className="w-full pl-9 pr-3 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-white outline-none focus:ring-1 ring-yellow-500"
                            />
                        </div>

                        <div className="mt-3 p-3 rounded-xl border border-neutral-800 bg-neutral-800/20">
                            <div className="text-xs font-bold text-neutral-200">Não achou? Crie um exercício avulso</div>
                            <div className="mt-2 flex gap-2">
                                <input
                                    value={swapCustomName}
                                    onChange={(e) => setSwapCustomName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key !== 'Enter') return;
                                        const candidate = String(swapCustomName || '').trim();
                                        if (candidate.length < 2) return;
                                        e.preventDefault();
                                        applyCustomSwap();
                                    }}
                                    placeholder="Ex: Leg press horizontal"
                                    className="flex-1 px-3 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-white outline-none focus:ring-1 ring-yellow-500"
                                />
                                <button
                                    type="button"
                                    onClick={applyCustomSwap}
                                    disabled={swapLoading || String(swapCustomName || '').trim().length < 2}
                                    className={`px-4 py-3 rounded-xl font-black transition-colors ${swapLoading || String(swapCustomName || '').trim().length < 2 ? 'bg-neutral-800 border border-neutral-700 text-neutral-500' : 'bg-yellow-500 text-black hover:bg-yellow-400'}`}
                                >
                                    Usar
                                </button>
                            </div>
                            <div className="text-[10px] text-neutral-500 mt-2">Troca apenas no treino de hoje.</div>
                        </div>

                        {swapError && (
                            <div className="mt-3 p-3 rounded-xl border border-red-500/30 bg-red-900/20 text-red-200 text-sm">
                                {swapError}
                            </div>
                        )}

                        <div className="mt-3 space-y-2 max-h-[50vh] overflow-y-auto">
                            {swapLoading && (
                                <div className="p-3 rounded-xl border border-neutral-800 bg-neutral-800/40 text-neutral-300 text-sm">
                                    Buscando...
                                </div>
                            )}

                            {!swapLoading && (Array.isArray(swapResults) ? swapResults : []).length === 0 && String(swapQuery || '').trim().length >= 2 && !swapError && (
                                <div className="p-3 rounded-xl border border-neutral-800 bg-neutral-800/40 text-neutral-300 text-sm">
                                    Nenhum exercício encontrado.
                                </div>
                            )}

                            {(Array.isArray(swapResults) ? swapResults : []).map((r) => (
                                <button
                                    type="button"
                                    key={String(r?.id || Math.random())}
                                    onClick={() => applySwap(r)}
                                    className="w-full text-left p-3 rounded-xl border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-white"
                                >
                                    <div className="font-bold text-sm">{String(r?.name || 'Exercício')}</div>
                                    <div className="text-xs text-neutral-400 mt-0.5">ID: {String(r?.id || '-')}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="p-4 border-t border-neutral-800">
                        <button
                            type="button"
                            onClick={() => setShowSwapModal(false)}
                            className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold rounded-xl hover:bg-neutral-700"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            </div>
        )}

        {showAddModal && (
            <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowAddModal(false)}>
                <div className="bg-neutral-900 w-full max-w-md rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                    <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
                        <div>
                            <h3 className="font-bold text-white">Adicionar Exercício</h3>
                            <p className="text-xs text-neutral-400 mt-0.5">Entra só na sessão de hoje e aparece no relatório.</p>
                        </div>
                        <button type="button" onClick={() => setShowAddModal(false)} className="w-9 h-9 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 flex items-center justify-center hover:bg-neutral-700">
                            <X size={18} />
                        </button>
                    </div>

                    <div className="p-4">
                        <div className="relative">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                            <input
                                value={addQuery}
                                onChange={(e) => setAddQuery(e.target.value)}
                                placeholder="Buscar na base global..."
                                className="w-full pl-9 pr-3 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-white outline-none focus:ring-1 ring-yellow-500"
                            />
                        </div>

                        <div className="mt-3 p-3 rounded-xl border border-neutral-800 bg-neutral-800/20">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <div className="text-xs font-bold text-neutral-200">Configuração do exercício</div>
                                    <div className="text-[10px] text-neutral-500 mt-0.5">Selecione na busca ou preencha manualmente.</div>
                                </div>
                                {addSelected?.name && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setAddSelected(null);
                                            const suggested = getSuggestedAddConfig();
                                            setAddDraft((prev) => ({
                                                ...prev,
                                                ...suggested,
                                                performedExerciseId: null,
                                                videoUrl: '',
                                                name: ''
                                            }));
                                        }}
                                        className="px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs font-bold hover:bg-neutral-700"
                                    >
                                        Limpar
                                    </button>
                                )}
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-2">
                                <div className="col-span-2">
                                    <label className="text-[10px] text-neutral-500 uppercase font-bold block mb-1">Nome</label>
                                    <input
                                        value={String(addDraft?.name || '')}
                                        onChange={(e) => setAddDraft((prev) => ({ ...prev, name: e.target.value }))}
                                        placeholder="Ex: Abdominal infra"
                                        className="w-full px-3 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-white outline-none focus:ring-1 ring-yellow-500"
                                    />
                                </div>

                                <div>
                                    <label className="text-[10px] text-neutral-500 uppercase font-bold block mb-1">Séries</label>
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        min="0"
                                        value={Number.isFinite(Number(addDraft?.sets)) ? Number(addDraft?.sets) : ''}
                                        disabled={String(addDraft?.method || '').toLowerCase() === 'cardio'}
                                        onChange={(e) => setAddDraft((prev) => ({ ...prev, sets: e.target.value }))}
                                        className="w-full px-3 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-white outline-none focus:ring-1 ring-yellow-500 disabled:opacity-60"
                                    />
                                </div>

                                <div>
                                    <label className="text-[10px] text-neutral-500 uppercase font-bold block mb-1">Reps</label>
                                    <input
                                        value={String(addDraft?.reps || '')}
                                        onChange={(e) => setAddDraft((prev) => ({ ...prev, reps: e.target.value }))}
                                        placeholder="10 / 12 / 8-10"
                                        className="w-full px-3 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-white outline-none focus:ring-1 ring-yellow-500"
                                    />
                                </div>

                                <div>
                                    <label className="text-[10px] text-neutral-500 uppercase font-bold block mb-1">RPE</label>
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        min="1"
                                        max="10"
                                        value={addDraft?.rpe == null ? '' : String(addDraft?.rpe)}
                                        onChange={(e) => setAddDraft((prev) => ({ ...prev, rpe: e.target.value }))}
                                        placeholder="1-10"
                                        className="w-full px-3 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-white outline-none focus:ring-1 ring-yellow-500"
                                    />
                                </div>

                                <div>
                                    <label className="text-[10px] text-neutral-500 uppercase font-bold block mb-1">Descanso (s)</label>
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        min="0"
                                        value={Number.isFinite(Number(addDraft?.restTime)) ? Number(addDraft?.restTime) : ''}
                                        onChange={(e) => setAddDraft((prev) => ({ ...prev, restTime: e.target.value }))}
                                        className="w-full px-3 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-white outline-none focus:ring-1 ring-yellow-500"
                                    />
                                </div>

                                <div>
                                    <label className="text-[10px] text-neutral-500 uppercase font-bold block mb-1">Cadência</label>
                                    <input
                                        value={String(addDraft?.cadence || '')}
                                        onChange={(e) => setAddDraft((prev) => ({ ...prev, cadence: e.target.value }))}
                                        placeholder="Ex: 2020"
                                        className="w-full px-3 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-white outline-none focus:ring-1 ring-yellow-500"
                                    />
                                </div>

                                <div className="col-span-2">
                                    <label className="text-[10px] text-neutral-500 uppercase font-bold block mb-1">Método</label>
                                    <select
                                        value={String(addDraft?.method || 'Normal')}
                                        onChange={(e) => {
                                            const nextMethod = e.target.value;
                                            setAddDraft((prev) => ({
                                                ...prev,
                                                method: nextMethod,
                                                sets: String(nextMethod).toLowerCase() === 'cardio' ? 1 : prev.sets
                                            }));
                                        }}
                                        className="w-full px-3 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-white outline-none focus:ring-1 ring-yellow-500"
                                    >
                                        {METHOD_OPTIONS.map((m) => (
                                            <option key={m} value={m}>{m}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="col-span-2">
                                    <label className="text-[10px] text-neutral-500 uppercase font-bold block mb-1">Vídeo (opcional)</label>
                                    <input
                                        value={String(addDraft?.videoUrl || '')}
                                        onChange={(e) => setAddDraft((prev) => ({ ...prev, videoUrl: e.target.value }))}
                                        placeholder="https://..."
                                        className="w-full px-3 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-white outline-none focus:ring-1 ring-yellow-500"
                                    />
                                </div>

                                <div className="col-span-2">
                                    <label className="text-[10px] text-neutral-500 uppercase font-bold block mb-1">Notas (opcional)</label>
                                    <textarea
                                        rows={2}
                                        value={String(addDraft?.notes || '')}
                                        onChange={(e) => setAddDraft((prev) => ({ ...prev, notes: e.target.value }))}
                                        placeholder="Ex: foco em técnica / sem dor"
                                        className="w-full px-3 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-white outline-none focus:ring-1 ring-yellow-500 resize-none"
                                    />
                                </div>
                            </div>

                            <div className="mt-3">
                                <button
                                    type="button"
                                    onClick={commitAddExercise}
                                    disabled={String(addDraft?.name || '').trim().length < 2}
                                    className={`w-full px-4 py-3 rounded-xl font-black transition-colors ${String(addDraft?.name || '').trim().length < 2 ? 'bg-neutral-800 border border-neutral-700 text-neutral-500' : 'bg-yellow-500 text-black hover:bg-yellow-400'}`}
                                >
                                    Adicionar ao treino
                                </button>
                            </div>
                        </div>

                        {addError && (
                            <div className="mt-3 p-3 rounded-xl border border-red-500/30 bg-red-900/20 text-red-200 text-sm">
                                {addError}
                            </div>
                        )}

                        <div className="mt-3 space-y-2 max-h-[50vh] overflow-y-auto">
                            {addLoading && (
                                <div className="p-3 rounded-xl border border-neutral-800 bg-neutral-800/40 text-neutral-300 text-sm">
                                    Buscando...
                                </div>
                            )}

                            {!addLoading && (Array.isArray(addResults) ? addResults : []).length === 0 && String(addQuery || '').trim().length >= 2 && !addError && (
                                <div className="p-3 rounded-xl border border-neutral-800 bg-neutral-800/40 text-neutral-300 text-sm">
                                    Nenhum exercício encontrado.
                                </div>
                            )}

                            {(Array.isArray(addResults) ? addResults : []).map((r) => (
                                <button
                                    type="button"
                                    key={String(r?.id || Math.random())}
                                    onClick={() => selectAddCandidate(r)}
                                    className="w-full text-left p-3 rounded-xl border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-white"
                                >
                                    <div className="font-bold text-sm">{String(r?.name || 'Exercício')}</div>
                                    <div className="text-xs text-neutral-400 mt-0.5">ID: {String(r?.id || '-')}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="p-4 border-t border-neutral-800">
                        <button
                            type="button"
                            onClick={() => setShowAddModal(false)}
                            className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold rounded-xl hover:bg-neutral-700"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            </div>
        )}
        </div>
    );
};

export default ActiveWorkout;

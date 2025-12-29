import React, { useState, useEffect } from 'react';
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

const ActiveWorkout = ({ session, user, onUpdateLog, onFinish, onBack, onStartTimer, isCoach, onUpdateSession, nextWorkout }) => {
    const { confirm, alert } = useDialog();
    const [currentExIdx, setCurrentExIdx] = useState(0);
    const workout = session?.workout;
    const logs = session?.logs || {};
    const [elapsed, setElapsed] = useState(0);
    const [showInvite, setShowInvite] = useState(false);
    const [previousLogs, setPreviousLogs] = useState({});
    const [showFullList, setShowFullList] = useState(false);
    const [exerciseStartTs, setExerciseStartTs] = useState(Date.now());
    const [exerciseDurations, setExerciseDurations] = useState([]);
    const [pacerRemaining, setPacerRemaining] = useState(0);
    const [showTransition, setShowTransition] = useState(false);
    const [showSwapModal, setShowSwapModal] = useState(false);
    const [swapQuery, setSwapQuery] = useState('');
    const [swapCustomName, setSwapCustomName] = useState('');
    const [swapResults, setSwapResults] = useState([]);
    const [swapLoading, setSwapLoading] = useState(false);
    const [swapError, setSwapError] = useState('');

    // Contexto de Equipe
    const { sendInvite, teamSession } = useTeamWorkout();
    
    const supabase = createClient();


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
        if (teamSession?.id && !session.teamSessionId) {
            if (onUpdateSession) onUpdateSession({ teamSessionId: teamSession.id, host: teamSession.hostName });
        }
    }, [teamSession, session.teamSessionId, onUpdateSession]);

    // Exercise pacer setup when index changes
    useEffect(() => {
        const ex = (workout?.exercises || [])[currentExIdx] || {};
        setExerciseStartTs(Date.now());
        const initial = estimateExerciseSeconds(ex);
        setPacerRemaining(Number.isFinite(initial) && initial > 0 ? initial : 0);
    }, [currentExIdx, workout]);

    // Pacer countdown based on real elapsed time (resilient to background)
    useEffect(() => {
        if (!workout || !Array.isArray(workout.exercises)) return;

        const ex = (workout.exercises || [])[currentExIdx] || null;
        const totalSeconds = ex ? estimateExerciseSeconds(ex) : 0;
        if (!exerciseStartTs || !Number.isFinite(totalSeconds) || totalSeconds <= 0) {
            setPacerRemaining(0);
            return;
        }

        const update = () => {
            try {
                const now = Date.now();
                const elapsedForExercise = Math.max(0, Math.floor((now - exerciseStartTs) / 1000));
                const remaining = Math.max(0, totalSeconds - elapsedForExercise);
                setPacerRemaining(remaining);
            } catch (e) {
                console.error('Erro ao atualizar pacer:', e);
            }
        };

        update();
        const id = setInterval(update, 1000);
        return () => clearInterval(id);
    }, [currentExIdx, workout, exerciseStartTs]);

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    

    const toggleSet = (exIdx, setIdx, restTime) => {
        const key = `${exIdx}-${setIdx}`;
        const current = logs[key] || {};
        const isDone = !current.done;

        onUpdateLog(key, { ...current, done: isDone });

        const time = parseInt(restTime);
        if (isDone && !isNaN(time) && time > 0) {
            onStartTimer(time);
        }
        if (isDone) {
            try { playTick(); } catch {}
        }
    };

    const updateLogValue = (exIdx, setIdx, field, val) => {
        const key = `${exIdx}-${setIdx}`;
        const current = logs[key] || {};
        onUpdateLog(key, { ...current, [field]: val });
    };

    // Nova função de envio usando Contexto
    const onSendInvite = async (student) => {
        if (!(await confirm(`Convidar ${student.displayName || student.email}?`))) return;
        try {
            const sessionId = await sendInvite(student, workout, session.teamSessionId);

            // Se gerou uma nova sessão, atualiza localmente
            if (sessionId && !session.teamSessionId) {
                if (onUpdateSession) onUpdateSession({ teamSessionId: sessionId, host: user.displayName });
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
                        done: !!source.done
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
            await alert(`Erro ao salvar: ${e.message}`);
        }
    };

    const safeExercises = Array.isArray(workout?.exercises)
        ? workout.exercises.filter(ex => ex && typeof ex === 'object')
        : [];

    const clampedIndex = safeExercises.length > 0
        ? Math.min(Math.max(currentExIdx, 0), safeExercises.length - 1)
        : 0;
    const activeExercise = safeExercises[clampedIndex] || {};
    const isLast = safeExercises.length > 0 ? clampedIndex === safeExercises.length - 1 : true;
    const isFirst = clampedIndex === 0;

    const activeSwap = activeExercise?.swap && typeof activeExercise.swap === 'object' ? activeExercise.swap : null;

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
            const current = currentExercises[clampedIndex] || {};

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

            const nextExercises = currentExercises.map((ex, idx) => (idx === clampedIndex ? next : ex));
            if (onUpdateSession) {
                onUpdateSession({
                    workout: {
                        ...(workout || {}),
                        exercises: nextExercises
                    }
                });
            }

            setShowSwapModal(false);
        } catch (e) {
            await alert(e?.message || String(e || 'Erro ao aplicar troca'), 'Erro');
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

    if (!workout || safeExercises.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-neutral-900 text-white p-6 text-center">
                <h2 className="text-xl font-bold text-red-500 mb-2">Erro na Sessão</h2>
                <p className="text-neutral-400 mb-6">Os dados do treino parecem estar corrompidos ou incompletos.</p>
                <button
                    onClick={onBack}
                    className="bg-neutral-800 border border-neutral-700 px-6 py-3 rounded-xl font-bold hover:bg-neutral-700"
                >
                    Voltar para o Menu
                </button>
            </div>
        );
    }

    const fallbackSets = (String(activeExercise?.method || '').toLowerCase() === 'cardio') ? 1 : 4;
    const parsedSets = parseInt(activeExercise?.sets);
    const configuredSets = (!isNaN(parsedSets) && parsedSets > 0) ? parsedSets : fallbackSets;
    const existingLogsIndices = Object.keys(logs)
        .filter(k => k.startsWith(`${currentExIdx}-`))
        .map(k => parseInt(k.split('-')[1]));
    const maxLogSet = existingLogsIndices.length > 0 ? Math.max(...existingLogsIndices) : -1;
    const totalSets = Math.max(configuredSets, maxLogSet + 1);

    const firstPendingSetIndex = (() => {
        try {
            for (let i = 0; i < totalSets; i += 1) {
                const entry = logs[`${currentExIdx}-${i}`];
                if (!entry || !entry.done) return i;
            }
            return -1;
        } catch {
            return -1;
        }
    })();

    const activeSetIndex = firstPendingSetIndex === -1 ? (totalSets > 0 ? totalSets - 1 : 0) : firstPendingSetIndex;
    const groupSize = Math.max(1, Number(teamSession?.participants?.length || 1));
    const estimatedSoloSeconds = safeExercises.reduce((acc, ex) => acc + calculateExerciseDuration(ex), 0);
    const estimatedGroupSeconds = estimateWorkoutSecondsForGroup(safeExercises, groupSize);

    const handleAddSet = () => {
        const nextSetIdx = totalSets;
        updateLogValue(currentExIdx, nextSetIdx, 'weight', '');
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
                    <button type="button" onClick={onBack} className="cursor-pointer relative z-10 p-2 rounded-full bg-neutral-800 text-white"><ArrowLeft size={20} className="pointer-events-none" /></button>
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
                        <button type="button" onClick={() => setShowInvite(true)} className="cursor-pointer relative z-10 w-8 h-8 bg-blue-500/10 text-blue-500 rounded-full flex items-center justify-center hover:bg-blue-500 hover:text-white transition-colors">
                            <UserPlus size={16} className="pointer-events-none" />
                        </button>
                        <button type="button" onClick={() => setShowFullList(true)} className="cursor-pointer relative z-10 w-11 h-11 bg-neutral-800 text-white rounded-full flex items-center justify-center hover:bg-neutral-700 transition-colors">
                            <List size={20} className="pointer-events-none" />
                        </button>
                        <button type="button" onClick={() => handleFinish(false)} className="cursor-pointer relative z-10 bg-green-600 text-white font-bold px-3 py-1.5 rounded-lg text-xs hover:bg-green-500 shadow-lg shadow-green-900/20">FIM</button>
                    </div>
                </div>
            </div>

            {/* Barra de Progresso */}
            <div className="px-4 py-2 bg-neutral-800/50 shrink-0">
                    <div className="flex justify-between text-[10px] text-neutral-400 mb-1 uppercase font-bold">
                    <span>Exercício {clampedIndex + 1} de {safeExercises.length}</span>
                    <span>{safeExercises.length > 0 ? Math.round(((clampedIndex + 1) / safeExercises.length) * 100) : 0}%</span>
                </div>
                <div className="h-1 bg-neutral-700 rounded-full overflow-hidden">
                    <div className="h-full bg-yellow-500 transition-all duration-300" style={{ width: `${safeExercises.length > 0 ? ((clampedIndex + 1) / safeExercises.length) * 100 : 0}%` }}></div>
                </div>
            </div>

            {/* Conteúdo do Treino (Mantido igual) */}
            <div className="flex-1 overflow-y-auto p-4 pb-32">
                <div className="flex justify-between items-start mb-4">
                    <div className="max-w-[80%]">
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl font-black text-white uppercase leading-none">{activeExercise?.name || 'Exercício'}</h1>
                            {activeSwap && (
                                <span className="inline-flex items-center gap-1 text-yellow-500 text-xs font-bold" title="Exercício trocado hoje">
                                    <Repeat size={14} />
                                </span>
                            )}
                        </div>
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
                    </div>
                    {activeExercise.videoUrl && (
                        <a href={activeExercise.videoUrl} target="_blank" rel="noopener noreferrer" className="p-2 bg-neutral-800 rounded-lg text-yellow-500 hover:bg-neutral-700"><Video size={20} /></a>
                    )}
                </div>

                <div className={`mb-3 p-3 rounded-xl border ${pacerRemaining === 0 ? 'border-red-500 bg-red-900/20' : 'border-neutral-700 bg-neutral-900/40'}`}>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">Pacer</div>
                    <div className={`text-2xl font-black ${pacerRemaining === 0 ? 'text-red-400' : 'text-yellow-400'}`}>{formatTime(pacerRemaining)}</div>
                </div>

                {activeExercise.notes && (
                    <div className="bg-blue-900/20 border border-blue-500/30 p-3 rounded-xl mb-4 text-blue-200 text-sm">
                        <span className="font-bold text-blue-400 text-xs uppercase block mb-1">Notas do Coach:</span>
                        {activeExercise.notes}
                    </div>
                )}

                <div className="space-y-3">
                    {Array.from({ length: totalSets }).map((_, i) => {
                        const key = `${currentExIdx}-${i}`;
                        const log = logs[key] || {};
                        const prevLog = (previousLogs[activeExercise.name] && previousLogs[activeExercise.name][i]) || {};
                        const isCardio = isCardioExercise(activeExercise);
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
                                                onChange={e => updateLogValue(currentExIdx, i, 'weight', e.target.value)}
                                                className="w-full bg-black/30 text-white p-2 rounded-lg text-center font-bold outline-none focus:ring-1 ring-yellow-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-neutral-500 uppercase font-bold block mb-1">{isCardio ? 'Tempo (min)' : 'Reps'} {prevLog.reps && <span className="text-neutral-600">({prevLog.reps})</span>}</label>
                                            <input
                                                type="number"
                                                inputMode="decimal"
                                                step="0.5"
                                                placeholder={activeExercise.reps || '-'}
                                                value={log.reps || ''}
                                                onChange={e => {
                                                    const raw = e.target.value || '';
                                                    const normalized = raw.replace(',', '.');
                                                    updateLogValue(currentExIdx, i, 'reps', normalized);
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
                                                onChange={e => updateLogValue(currentExIdx, i, 'rpe', e.target.value)}
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
                                        onChange={e => updateLogValue(currentExIdx, i, 'note', e.target.value)}
                                        className="w-full bg-black/30 text-white p-2 rounded-lg text-xs outline-none focus:ring-1 ring-yellow-500 resize-none"
                                    />
                                </div>

                                <div className="mt-2 flex justify-end">
                                    <button
                                        onClick={() => toggleSet(currentExIdx, i, activeExercise.restTime)}
                                        className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${log.done ? 'bg-green-500 text-black shadow-[0_0_15px_rgba(34,197,94,0.5)]' : 'bg-neutral-700 text-neutral-400 hover:bg-neutral-600'}`}
                                    >
                                        <CheckCircle2 size={24} className={log.done ? 'scale-110' : ''} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}

                    <button onClick={handleAddSet} className="w-full py-3 rounded-xl border-2 border-dashed border-neutral-700 text-neutral-500 font-bold hover:bg-neutral-800 hover:text-white transition-colors flex items-center justify-center gap-2">
                        <Plus size={18} /> Adicionar Série
                    </button>
                </div>
            </div>

            {/* Footer de Navegação */}
            <div className="bg-neutral-900 border-t border-neutral-800 p-4 pb-safe shrink-0 flex gap-4">
                <button
                    disabled={isFirst}
                    onClick={() => setCurrentExIdx(prev => prev - 1)}
                    className="flex-1 py-4 rounded-xl bg-neutral-800 font-bold text-neutral-400 disabled:opacity-50 hover:bg-neutral-700 transition-colors"
                >
                    ANTERIOR
                </button>
                <button
                    onClick={async () => {
                        if (isLast) { await handleFinish(false); return; }
                        if (exerciseStartTs != null) {
                            const delta = Math.max(0, Math.floor((Date.now() - exerciseStartTs) / 1000));
                            setExerciseDurations(prev => {
                                const next = [...prev];
                                next[currentExIdx] = (next[currentExIdx] || 0) + delta;
                                return next;
                            });
                        }
                        setCurrentExIdx(prev => prev + 1);
                        setExerciseStartTs(Date.now());
                    }}
                    className="flex-1 py-4 rounded-xl bg-yellow-500 text-black font-black hover:bg-yellow-400 transition-colors"
                >
                    {isLast ? 'FINALIZAR' : 'PRÓXIMO'}
                </button>
            </div>
            {showTransition && !isLast && (
                <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowTransition(false)}>
                    <div className="bg-neutral-900 w-full max-w-md rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="p-4 border-b border-neutral-800">
                            <h3 className="font-bold text-white">Próximo Desafio: {workout.exercises[currentExIdx + 1]?.name}</h3>
                            <p className="text-neutral-400 text-sm">Tempo Alvo: {toMinutesRounded(estimateExerciseSeconds(workout.exercises[currentExIdx + 1]))} minutos</p>
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
                                setCurrentExIdx(prev => prev + 1);
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
                        {(workout.exercises || []).map((ex, idx) => (
                            <div key={idx} className={`p-3 rounded-xl border ${idx === currentExIdx ? 'border-yellow-500 bg-yellow-900/10' : 'border-neutral-700 bg-neutral-800'}`}>
                                <div className="flex items-center justify-between">
                                    <span className="text-white font-bold text-sm flex items-center gap-2">
                                        <span>{ex?.name || 'Exercício'}</span>
                                        {ex?.swap && typeof ex.swap === 'object' && <Repeat size={14} className="text-yellow-500" />}
                                    </span>
                                    <span className="text-xs text-neutral-400">{idx + 1} / {workout.exercises.length}</span>
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
        </div>
    );
};

export default ActiveWorkout;

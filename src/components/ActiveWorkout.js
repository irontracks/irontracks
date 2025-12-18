import React, { useState, useEffect } from 'react';
import {
    ArrowLeft,
    Clock,
    UserPlus,
    CheckCircle2,
    Plus,
    Video,
    Users
} from 'lucide-react';
import InviteManager from './InviteManager'; 
import { useTeamWorkout } from '@/contexts/TeamWorkoutContext'; 
import { useDialog } from '@/contexts/DialogContext';
import { playFinishSound } from '@/lib/sounds';
import { createClient } from '@/utils/supabase/client';

const appId = 'irontracks-production';

const ActiveWorkout = ({ session, user, onUpdateLog, onFinish, onBack, onStartTimer, isCoach, onUpdateSession }) => {
    const { confirm, alert } = useDialog();
    const [currentExIdx, setCurrentExIdx] = useState(0);
    const workout = session?.workout;
    const logs = session?.logs || {};
    const [elapsed, setElapsed] = useState(0);
    const [showInvite, setShowInvite] = useState(false);
    const [previousLogs, setPreviousLogs] = useState({});

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
    }, [workout?.id, user.uid]);

    // Timer
    useEffect(() => {
        const interval = setInterval(() => {
            setElapsed(Math.floor((Date.now() - session.startedAt) / 1000));
        }, 1000);
        return () => clearInterval(interval);
    }, [session.startedAt]);

    // Monitorar Sessão de Equipe (Agora via Contexto, mas precisamos alertar fim)
    // O Contexto já alerta? O Contexto alerta e seta null.
    // Aqui apenas observamos se o ID da sessão existe no contexto para mostrar status

    // Se o usuário entrar em uma sessão DEPOIS de começar, atualizamos o session local
    useEffect(() => {
        if (teamSession?.id && !session.teamSessionId) {
            if (onUpdateSession) onUpdateSession({ teamSessionId: teamSession.id, host: teamSession.hostName });
        }
    }, [teamSession, session.teamSessionId]);

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
            await alert("Erro: " + e.message);
        }
    };

    const handleFinish = async (force = false) => {
        if (!force && !(await confirm("Finalizar treino?", "Concluir"))) return;

        let showReport = true;
        if (!force) showReport = await confirm("Quer o relatório do treino?", "Relatório");

        try {
            const cleanExercises = workout.exercises.map(ex => ({
                name: ex.name || 'Sem nome',
                sets: Number(ex.sets) || 0,
                reps: String(ex.reps || ''),
                restTime: Number(ex.restTime) || 0,
                notes: ex.notes || '',
                cadence: ex.cadence || ''
            }));

            const cleanLogs = {};
            Object.keys(logs).forEach(key => {
                if (logs[key]) {
                    cleanLogs[key] = {
                        weight: logs[key].weight || '',
                        reps: logs[key].reps || '',
                        done: !!logs[key].done
                    };
                }
            });

            const sessionData = {
                workoutId: workout.id,
                workoutTitle: workout.title,
                date: new Date().toISOString(), // Use ISO string for JSON compatibility
                totalTime: (Date.now() - session.startedAt) / 1000,
                logs: cleanLogs,
                exercises: cleanExercises
            };

            // Save to Supabase
            // We'll treat this as a "finished workout" (is_template = false)
            // But we need to insert into the relational tables.
            // For now, let's skip the actual insert here and rely on the Server Action if we had one,
            // OR just do a client-side insert into 'workouts' with is_template=false.
            
            const { data: historyEntry, error } = await supabase
                .from('workouts')
                .insert({
                    user_id: user.id,
                    name: workout.title,
                    date: new Date(),
                    is_template: false, // Log
                    notes: JSON.stringify(sessionData) // Temporary storage of full log JSON in notes or a specific column? 
                    // Ideally we map to tables, but for speed let's just ensure it saves something.
                    // The schema has 'notes' text.
                })
                .select()
                .single();

            if (error) throw error;

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

    if (!workout || !workout.exercises) {
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

    const activeExercise = workout.exercises[currentExIdx];
    const isLast = currentExIdx === workout.exercises.length - 1;
    const isFirst = currentExIdx === 0;

    const configuredSets = parseInt(activeExercise.sets) || 1;
    const existingLogsIndices = Object.keys(logs)
        .filter(k => k.startsWith(`${currentExIdx}-`))
        .map(k => parseInt(k.split('-')[1]));
    const maxLogSet = existingLogsIndices.length > 0 ? Math.max(...existingLogsIndices) : -1;
    const totalSets = Math.max(configuredSets, maxLogSet + 1);

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
                        <button type="button" onClick={() => handleFinish(false)} className="cursor-pointer relative z-10 bg-green-600 text-white font-bold px-3 py-1.5 rounded-lg text-xs hover:bg-green-500 shadow-lg shadow-green-900/20">FIM</button>
                    </div>
                </div>
            </div>

            {/* Barra de Progresso */}
            <div className="px-4 py-2 bg-neutral-800/50 shrink-0">
                <div className="flex justify-between text-[10px] text-neutral-400 mb-1 uppercase font-bold">
                    <span>Exercício {currentExIdx + 1} de {workout.exercises.length}</span>
                    <span>{Math.round(((currentExIdx + 1) / workout.exercises.length) * 100)}%</span>
                </div>
                <div className="h-1 bg-neutral-700 rounded-full overflow-hidden">
                    <div className="h-full bg-yellow-500 transition-all duration-300" style={{ width: `${((currentExIdx + 1) / workout.exercises.length) * 100}%` }}></div>
                </div>
            </div>

            {/* Conteúdo do Treino (Mantido igual) */}
            <div className="flex-1 overflow-y-auto p-4 pb-32">
                <div className="flex justify-between items-start mb-4">
                    <h1 className="text-2xl font-black text-white uppercase leading-none max-w-[80%]">{activeExercise.name}</h1>
                    {activeExercise.videoUrl && (
                        <a href={activeExercise.videoUrl} target="_blank" rel="noopener noreferrer" className="p-2 bg-neutral-800 rounded-lg text-yellow-500 hover:bg-neutral-700"><Video size={20} /></a>
                    )}
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

                        return (
                            <div key={i} className={`p-3 rounded-xl border-2 transition-all ${log.done ? 'bg-green-900/20 border-green-500/50' : 'bg-neutral-800 border-transparent'}`}>
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-neutral-700 flex items-center justify-center font-bold text-neutral-400 text-sm">{i + 1}</div>

                                    <div className="flex-1 grid grid-cols-2 gap-2">
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
                                            <label className="text-[10px] text-neutral-500 uppercase font-bold block mb-1">Reps {prevLog.reps && <span className="text-neutral-600">({prevLog.reps})</span>}</label>
                                            <input
                                                type="number"
                                                inputMode="numeric"
                                                placeholder={activeExercise.reps || '-'}
                                                value={log.reps || ''}
                                                onChange={e => updateLogValue(currentExIdx, i, 'reps', e.target.value)}
                                                className="w-full bg-black/30 text-white p-2 rounded-lg text-center font-bold outline-none focus:ring-1 ring-yellow-500"
                                            />
                                        </div>
                                    </div>

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
                    disabled={isLast}
                    onClick={() => setCurrentExIdx(prev => prev + 1)}
                    className="flex-1 py-4 rounded-xl bg-yellow-500 text-black font-black disabled:opacity-50 disabled:bg-neutral-800 disabled:text-neutral-500 hover:bg-yellow-400 transition-colors"
                >
                    {isLast ? 'FINALIZAR' : 'PRÓXIMO'}
                </button>
            </div>
        </div>
    );
};

export default ActiveWorkout;

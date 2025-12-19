import React, { useState, useEffect } from 'react';
import { ChevronLeft, History, Trash2, Plus, Edit3 } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import ExerciseEditor from '@/components/ExerciseEditor';
import WorkoutReport from '@/components/WorkoutReport';
import { useDialog } from '@/contexts/DialogContext';

const HistoryList = ({ user, onViewReport, onBack }) => {
    const { confirm, alert } = useDialog();
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const supabase = createClient();
    const [showManual, setShowManual] = useState(false);
    const [manualDate, setManualDate] = useState(new Date().toISOString().slice(0,16));
    const [manualDuration, setManualDuration] = useState('45');
    const [manualNotes, setManualNotes] = useState('');
    const [manualTab, setManualTab] = useState('existing');
    const [availableWorkouts, setAvailableWorkouts] = useState([]);
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [newWorkout, setNewWorkout] = useState({ title: '', exercises: [] });
    const [manualExercises, setManualExercises] = useState([]);
    const [showEdit, setShowEdit] = useState(false);
    const [selectedSession, setSelectedSession] = useState(null);
    const [editId, setEditId] = useState(null);
    const [editTitle, setEditTitle] = useState('');
    const [editDate, setEditDate] = useState(new Date().toISOString().slice(0,16));
    const [editDuration, setEditDuration] = useState('45');
    const [editNotes, setEditNotes] = useState('');
    const [editExercises, setEditExercises] = useState([]);

    useEffect(() => {
        const loadHistory = async () => {
            try {
                const { data, error } = await supabase
                    .from('workouts')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('date', { ascending: false })
                    .limit(200);

                if (error) throw error;

                const formatted = (data || []).map(w => {
                    let raw = null;
                    try {
                        if (typeof w.notes === 'string') raw = JSON.parse(w.notes);
                        else if (typeof w.notes === 'object' && w.notes) raw = w.notes;
                    } catch (err) {
                        console.error('Erro ao processar item:', w, err);
                        raw = null;
                    }
                    return {
                        id: w.id,
                        workoutTitle: raw?.workoutTitle || w.name || 'Treino Recuperado',
                        date: raw?.date || w.date || w.created_at || new Date().toISOString(),
                        totalTime: raw?.totalTime || 0,
                        rawSession: raw,
                        raw: w,
                        isTemplate: w.is_template === true
                    }
                });

                setHistory(formatted);
            } catch (e) {
                console.error("Erro histórico", e);
            } finally {
                setLoading(false);
            }
        };
        loadHistory();
    }, [user]);

    const saveManualExisting = async () => {
        try {
            if (!selectedTemplate) throw new Error('Selecione um treino');
            const exIds = (selectedTemplate.exercises || []).map(e => e.id).filter(Boolean);
            let setsMap = {};
            if (exIds.length > 0) {
                const { data: setsData } = await supabase
                    .from('sets')
                    .select('exercise_id, set_number, reps, rpe, weight')
                    .in('exercise_id', exIds)
                    .order('set_number');
                (setsData || []).forEach(s => {
                    const arr = setsMap[s.exercise_id] || (setsMap[s.exercise_id] = []);
                    arr.push(s);
                });
            }
            const exercises = (manualExercises.length ? manualExercises : (selectedTemplate.exercises || []).map(e => ({
                name: e.name || '',
                sets: (setsMap[e.id] || []).length || (Number(e.sets) || 0),
                reps: e.reps || '',
                restTime: Number(e.rest_time) || Number(e.restTime) || 0,
                cadence: e.cadence || '',
                notes: e.notes || ''
            })));
            const logs = {};
            exercises.forEach((ex, exIdx) => {
                const count = Number(ex.sets) || 0;
                const weights = ex.weights || [];
                for (let sIdx = 0; sIdx < count; sIdx++) {
                    logs[`${exIdx}-${sIdx}`] = {
                        weight: weights[sIdx] ?? '',
                        reps: (ex.repsPerSet?.[sIdx] ?? ex.reps) ?? '',
                        done: true
                    };
                }
            });
            const session = {
                workoutTitle: selectedTemplate.name || 'Treino',
                date: new Date(manualDate).toISOString(),
                totalTime: parseInt(manualDuration || '0', 10) * 60,
                logs,
                exercises,
                notes: manualNotes || '',
                originWorkoutId: selectedTemplate.id
            };
            const resp = await fetch('/api/workouts/finish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session })
            });
            const json = await resp.json();
            if (!json.ok) throw new Error(json.error || 'Falha ao salvar');
            setShowManual(false);
            setHistory(prev => [{ id: json.saved.id, workoutTitle: session.workoutTitle, date: new Date(manualDate), totalTime: parseInt(manualDuration, 10) * 60, rawSession: session }, ...prev]);
            await alert('Histórico adicionado');
        } catch (e) {
            await alert('Erro: ' + e.message);
        }
    };

    const saveManualNew = async () => {
        try {
            if (!newWorkout.title) throw new Error('Informe o título');
            const exercises = (newWorkout.exercises || []).map(e => ({
                name: e.name || '',
                sets: Number(e.sets) || 0,
                reps: e.reps || '',
                restTime: Number(e.restTime) || 0,
                cadence: e.cadence || '',
                notes: e.notes || ''
            }));
            const logs = {};
            exercises.forEach((ex, exIdx) => {
                for (let sIdx = 0; sIdx < (Number(ex.sets) || 0); sIdx++) {
                    logs[`${exIdx}-${sIdx}`] = { weight: '', reps: ex.reps || '', done: true };
                }
            });
            const session = {
                workoutTitle: newWorkout.title,
                date: new Date(manualDate).toISOString(),
                totalTime: parseInt(manualDuration || '0', 10) * 60,
                logs,
                exercises,
                notes: manualNotes || ''
            };
            const resp = await fetch('/api/workouts/finish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session })
            });
            const json = await resp.json();
            if (!json.ok) throw new Error(json.error || 'Falha ao salvar');
            setShowManual(false);
            setHistory(prev => [{ id: json.saved.id, workoutTitle: session.workoutTitle, date: new Date(manualDate), totalTime: parseInt(manualDuration, 10) * 60, rawSession: session }, ...prev]);
            await alert('Histórico adicionado');
        } catch (e) {
            await alert('Erro: ' + e.message);
        }
    };

    useEffect(() => {
        const fetchAvailableWorkouts = async () => {
            const { data } = await supabase
                .from('workouts')
                .select('id, name')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });
            setAvailableWorkouts(data || []);
        };
        if (showManual && manualTab === 'existing') fetchAvailableWorkouts();
    }, [showManual, manualTab, user.id]);

    useEffect(() => {
        const buildManualFromTemplate = async () => {
            if (!selectedTemplate) { setManualExercises([]); return; }
            const exIds = (selectedTemplate.exercises || []).map(e => e.id).filter(Boolean);
            let setsMap = {};
            if (exIds.length > 0) {
                const { data: setsData } = await supabase
                    .from('sets')
                    .select('exercise_id, set_number, reps, rpe, weight')
                    .in('exercise_id', exIds)
                    .order('set_number');
                (setsData || []).forEach(s => {
                    const arr = setsMap[s.exercise_id] || (setsMap[s.exercise_id] = []);
                    arr.push(s);
                });
            }
            const exs = (selectedTemplate.exercises || []).map(e => ({
                name: e.name || '',
                sets: (setsMap[e.id] || []).length || (Number(e.sets) || 0),
                reps: e.reps || '',
                restTime: Number(e.rest_time) || Number(e.restTime) || 0,
                cadence: e.cadence || '',
                notes: e.notes || '',
                weights: (setsMap[e.id] || []).map(s => s.weight ?? ''),
                repsPerSet: (setsMap[e.id] || []).map(s => s.reps ?? '')
            }));
            setManualExercises(exs);
        };
        if (selectedTemplate && manualTab === 'existing') buildManualFromTemplate();
    }, [selectedTemplate, manualTab]);

    const updateManualExercise = (idx, field, value) => {
        setManualExercises(prev => {
            const next = [...prev];
            if (field === 'weight') {
                const [wIdx, val] = value;
                const weights = Array.from({ length: Number(next[idx].sets) || 0 }, (_, i) => next[idx].weights?.[i] ?? '');
                weights[wIdx] = val;
                next[idx] = { ...next[idx], weights };
            } else if (field === 'rep') {
                const [rIdx, val] = value;
                const repsPerSet = Array.from({ length: Number(next[idx].sets) || 0 }, (_, i) => next[idx].repsPerSet?.[i] ?? '');
                repsPerSet[rIdx] = val;
                next[idx] = { ...next[idx], repsPerSet };
            } else {
                next[idx] = { ...next[idx], [field]: value };
                if (field === 'sets') {
                    const n = Number(value) || 0;
                    const weights = Array.from({ length: n }, (_, i) => next[idx].weights?.[i] ?? '');
                    const repsPerSet = Array.from({ length: n }, (_, i) => next[idx].repsPerSet?.[i] ?? '');
                    next[idx] = { ...next[idx], weights, repsPerSet };
                }
            }
            return next;
        });
    };

    const handleDeleteClick = async (e, session) => {
        e.stopPropagation();
        e.preventDefault();

        if (!window.confirm("Tem certeza que deseja excluir este histórico permanentemente?")) return;

        try {
            const { error } = await supabase
                .from('workouts')
                .delete()
                .eq('id', session.id)
                .eq('is_template', false);
            if (error) throw error;
            setHistory(prev => prev.filter(h => h.id !== session.id));
        } catch (error) {
            await alert("Erro ao excluir: " + error.message);
        }
    };

    const openEdit = (session) => {
        const raw = session.rawSession || (typeof session.notes === 'string' && session.notes?.startsWith('{') ? JSON.parse(session.notes) : null);
        setEditId(session.id);
        setEditTitle(session.workoutTitle || raw?.workoutTitle || 'Treino');
        const d = raw?.date ? new Date(raw.date) : new Date(session.date);
        setEditDate(new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,16));
        setEditDuration(String(Math.floor((raw?.totalTime || session.totalTime || 0) / 60) || 45));
        setEditNotes(raw?.notes || '');
        const exs = (raw?.exercises || []).map((ex, exIdx) => {
            const count = Number(ex.sets) || 0;
            const weights = Array.from({ length: count }, (_, sIdx) => raw?.logs?.[`${exIdx}-${sIdx}`]?.weight ?? '');
            const repsPerSet = Array.from({ length: count }, (_, sIdx) => raw?.logs?.[`${exIdx}-${sIdx}`]?.reps ?? ex.reps ?? '');
            return { name: ex.name || '', sets: count, reps: ex.reps || '', restTime: Number(ex.restTime) || 0, cadence: ex.cadence || '', notes: ex.notes || '', weights, repsPerSet };
        });
        setEditExercises(exs);
        setShowEdit(true);
    };

    const updateEditExercise = (idx, field, value) => {
        setEditExercises(prev => {
            const next = [...prev];
            if (field === 'weight') {
                const [wIdx, val] = value;
                const weights = Array.from({ length: Number(next[idx].sets) || 0 }, (_, i) => next[idx].weights?.[i] ?? '');
                weights[wIdx] = val;
                next[idx] = { ...next[idx], weights };
            } else if (field === 'rep') {
                const [rIdx, val] = value;
                const repsPerSet = Array.from({ length: Number(next[idx].sets) || 0 }, (_, i) => next[idx].repsPerSet?.[i] ?? '');
                repsPerSet[rIdx] = val;
                next[idx] = { ...next[idx], repsPerSet };
            } else {
                next[idx] = { ...next[idx], [field]: value };
                if (field === 'sets') {
                    const n = Number(value) || 0;
                    const weights = Array.from({ length: n }, (_, i) => next[idx].weights?.[i] ?? '');
                    const repsPerSet = Array.from({ length: n }, (_, i) => next[idx].repsPerSet?.[i] ?? '');
                    next[idx] = { ...next[idx], weights, repsPerSet };
                }
            }
            return next;
        });
    };

    const saveEdit = async () => {
        try {
            const exercises = editExercises.map(ex => ({ name: ex.name || '', sets: Number(ex.sets) || 0, reps: ex.reps || '', restTime: Number(ex.restTime) || 0, cadence: ex.cadence || '', notes: ex.notes || '' }));
            const logs = {};
            exercises.forEach((ex, exIdx) => {
                const count = Number(ex.sets) || 0;
                for (let sIdx = 0; sIdx < count; sIdx++) {
                    logs[`${exIdx}-${sIdx}`] = { weight: editExercises[exIdx]?.weights?.[sIdx] ?? '', reps: (editExercises[exIdx]?.repsPerSet?.[sIdx] ?? ex.reps) ?? '', done: true };
                }
            });
            const session = { workoutTitle: editTitle, date: new Date(editDate).toISOString(), totalTime: parseInt(editDuration || '0', 10) * 60, logs, exercises, notes: editNotes || '' };
            const { error } = await supabase
                .from('workouts')
                .update({ name: editTitle, date: new Date(editDate), notes: JSON.stringify(session) })
                .eq('id', editId)
                .eq('user_id', user.id);
            if (error) throw error;
            setShowEdit(false);
            setHistory(prev => prev.map(h => h.id === editId ? { ...h, workoutTitle: editTitle, date: new Date(editDate), totalTime: parseInt(editDuration||'0',10)*60, rawSession: session } : h));
            await alert('Histórico atualizado');
        } catch (e) {
            await alert('Erro: ' + e.message);
        }
    };

    return (
        <>
        <div className="min-h-screen bg-neutral-900 text-white p-4 pb-safe-extra pt-header-safe">
            <div className="flex items-center gap-3 mb-6 pt-safe h-16">
                <button type="button" onClick={onBack} className="cursor-pointer relative z-10 w-8 h-8 flex items-center justify-center text-neutral-200 hover:text-white"><ChevronLeft className="pointer-events-none" /></button>
                <h2 className="text-xl font-bold flex items-center gap-2"><History className="text-yellow-500" /> Histórico</h2>
                <div className="ml-auto">
                    <button type="button" onClick={() => setShowManual(true)} className="cursor-pointer relative z-10 p-2 bg-yellow-500 text-black rounded-lg hover:bg-yellow-400 font-bold flex items-center gap-2"><Plus size={16}/> Adicionar</button>
                </div>
            </div>
            {loading && <p className="text-center text-neutral-500 animate-pulse">Carregando histórico...</p>}
            {!loading && history.length === 0 && <div className="text-center py-10 opacity-50"><p>Nenhum treino finalizado ainda.</p></div>}
            <div className="space-y-3">
                {history.filter(h => !h.isTemplate).map(session => (
                    <div key={session.id} onClick={() => setSelectedSession(session.rawSession || session)} className="bg-neutral-800 p-4 rounded-xl border border-neutral-700 cursor-pointer hover:border-yellow-500/50 relative group transition-colors">
                        <div className="flex justify-between items-center">
                            <div>
                                <h3 className="font-bold text-lg text-white">{session.workoutTitle}</h3>
                                <p className="text-xs text-neutral-500">{(() => {
                                    try {
                                        const d = new Date(session.date);
                                        return isNaN(d.getTime()) ? 'Data Desconhecida' : d.toLocaleDateString('pt-BR');
                                    } catch { return 'Data Desconhecida'; }
                                })()} • {Math.floor((session.totalTime || 0) / 60)} min</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={(e) => handleDeleteClick(e, session)}
                                    className="cursor-pointer relative z-20 p-2 rounded-lg transition-colors bg-neutral-900/50 text-neutral-500 border border-transparent hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20"
                                >
                                    <Trash2 size={18} className="pointer-events-none"/>
                                </button>
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); openEdit(session); }}
                                    className="cursor-pointer relative z-20 p-2 rounded-lg transition-colors bg-neutral-900/50 text-neutral-500 border border-transparent hover:bg-yellow-500/10 hover:text-yellow-500 hover:border-yellow-500/20"
                                >
                                    <Edit3 size={18} className="pointer-events-none"/>
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>

        {showManual && (
            <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowManual(false)}>
                <div className="bg-neutral-900 w-full max-w-2xl rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                    <div className="p-4 border-b border-neutral-800">
                        <h3 className="font-bold text-white">Adicionar Histórico</h3>
                        <div className="mt-3 flex gap-2">
                            <button onClick={() => setManualTab('existing')} className={`px-3 py-2 rounded-lg text-xs font-bold ${manualTab==='existing'?'bg-yellow-500 text-black':'bg-neutral-800 text-neutral-300'}`}>Usar Treino</button>
                            <button onClick={() => setManualTab('new')} className={`px-3 py-2 rounded-lg text-xs font-bold ${manualTab==='new'?'bg-yellow-500 text-black':'bg-neutral-800 text-neutral-300'}`}>Treino Novo</button>
                        </div>
                    </div>
                    <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
                        <div>
                            <label className="text-[10px] uppercase font-bold text-neutral-500">Data e Hora</label>
                            <input type="datetime-local" value={manualDate} onChange={(e)=>setManualDate(e.target.value)} className="w-full bg-neutral-800 border border-neutral-700 rounded-xl p-3 text-white outline-none" />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-neutral-500">Duração (min)</label>
                            <input type="number" value={manualDuration} onChange={(e)=>setManualDuration(e.target.value)} className="w-full bg-neutral-800 border border-neutral-700 rounded-xl p-3 text-white outline-none" />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-neutral-500">Notas</label>
                            <textarea value={manualNotes} onChange={(e)=>setManualNotes(e.target.value)} className="w-full bg-neutral-800 border border-neutral-700 rounded-xl p-3 text-white outline-none h-20 resize-none" />
                        </div>
                        {manualTab === 'existing' && (
                            <div className="space-y-2">
                                <label className="text-[10px] uppercase font-bold text-neutral-500">Selecionar Treino</label>
                                <select value={selectedTemplate?.id || ''} onChange={async (e) => {
                                    const id = e.target.value;
                                    if (!id) { setSelectedTemplate(null); return; }
                                    const { data } = await supabase
                                        .from('workouts')
                                        .select('id, name, exercises(*)')
                                        .eq('id', id)
                                        .single();
                                    setSelectedTemplate(data);
                                }} className="w-full bg-neutral-800 border border-neutral-700 rounded-xl p-3 text-white outline-none">
                                    <option value="">Selecione...</option>
                                    {availableWorkouts.map(t => (<option key={t.id} value={t.id}>{t.name}</option>))}
                                </select>
                                {selectedTemplate && (
                                    <div className="space-y-2">
                                        {manualExercises.map((ex,idx)=>(
                                            <div key={idx} className="p-3 bg-neutral-800 rounded-lg border border-neutral-700 space-y-2">
                                                <p className="text-sm font-bold text-white">{ex.name}</p>
                                                <div className="grid grid-cols-4 gap-2">
                                                    <div>
                                                        <label className="text-[10px] text-neutral-500">Sets</label>
                                                        <input type="number" value={ex.sets} onChange={(e)=>updateManualExercise(idx,'sets',e.target.value)} className="w-full bg-neutral-900 rounded p-2 text-center text-sm" />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] text-neutral-500">Reps</label>
                                                        <input value={ex.reps || ''} onChange={(e)=>updateManualExercise(idx,'reps',e.target.value)} className="w-full bg-neutral-900 rounded p-2 text-center text-sm" />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] text-neutral-500">Cadência</label>
                                                        <input value={ex.cadence || ''} onChange={(e)=>updateManualExercise(idx,'cadence',e.target.value)} className="w-full bg-neutral-900 rounded p-2 text-center text-sm" />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] text-neutral-500">Descanso (s)</label>
                                                        <input type="number" value={ex.restTime || 0} onChange={(e)=>updateManualExercise(idx,'restTime',e.target.value)} className="w-full bg-neutral-900 rounded p-2 text-center text-sm" />
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="text-[10px] text-neutral-500">Pesos por série (kg)</label>
                                                    <div className="grid grid-cols-4 gap-2">
                                                        {Array.from({ length: Number(ex.sets) || 0 }).map((_, sIdx) => (
                                                            <input key={sIdx} value={ex.weights?.[sIdx] ?? ''} onChange={(e)=>updateManualExercise(idx,'weight',[sIdx, e.target.value])} className="w-full bg-neutral-900 rounded p-2 text-center text-sm" placeholder={`#${sIdx+1}`} />
                                                        ))}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="text-[10px] text-neutral-500">Reps por série</label>
                                                    <div className="grid grid-cols-4 gap-2">
                                                        {Array.from({ length: Number(ex.sets) || 0 }).map((_, sIdx) => (
                                                            <input key={sIdx} value={ex.repsPerSet?.[sIdx] ?? ''} onChange={(e)=>updateManualExercise(idx,'rep',[sIdx, e.target.value])} className="w-full bg-neutral-900 rounded p-2 text-center text-sm" placeholder={`#${sIdx+1}`} />
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                        {manualTab === 'new' && (
                            <div>
                                <ExerciseEditor workout={newWorkout} onSave={setNewWorkout} onCancel={()=>{}} onChange={setNewWorkout} />
                            </div>
                        )}
                    </div>
                    <div className="p-4 bg-neutral-900/50 flex gap-2">
                        <button onClick={()=>setShowManual(false)} className="flex-1 py-3 rounded-xl bg-neutral-800 text-neutral-300 font-bold hover:bg-neutral-700">Cancelar</button>
                        {manualTab==='existing' ? (
                            <button onClick={saveManualExisting} className="flex-1 py-3 rounded-xl bg-yellow-500 text-black font-bold hover:bg-yellow-400">Salvar</button>
                        ) : (
                            <button onClick={saveManualNew} className="flex-1 py-3 rounded-xl bg-yellow-500 text-black font-bold hover:bg-yellow-400">Salvar</button>
                        )}
                    </div>
                </div>
            </div>
        )}

        {showEdit && (
            <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowEdit(false)}>
                <div className="bg-neutral-900 w-full max-w-2xl rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                    <div className="p-4 border-b border-neutral-800">
                        <h3 className="font-bold text-white">Editar Histórico</h3>
                    </div>
                    <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-[10px] uppercase font-bold text-neutral-500">Título</label>
                                <input value={editTitle} onChange={(e)=>setEditTitle(e.target.value)} className="w-full bg-neutral-800 border border-neutral-700 rounded-xl p-3 text-white outline-none" />
                            </div>
                            <div>
                                <label className="text-[10px] uppercase font-bold text-neutral-500">Duração (min)</label>
                                <input type="number" value={editDuration} onChange={(e)=>setEditDuration(e.target.value)} className="w-full bg-neutral-800 border border-neutral-700 rounded-xl p-3 text-white outline-none" />
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-neutral-500">Data e Hora</label>
                            <input type="datetime-local" value={editDate} onChange={(e)=>setEditDate(e.target.value)} className="w-full bg-neutral-800 border border-neutral-700 rounded-xl p-3 text-white outline-none" />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-neutral-500">Notas</label>
                            <textarea value={editNotes} onChange={(e)=>setEditNotes(e.target.value)} className="w-full bg-neutral-800 border border-neutral-700 rounded-xl p-3 text.white outline-none h-20 resize-none" />
                        </div>
                        <div className="space-y-2">
                            {editExercises.map((ex,idx)=>(
                                <div key={idx} className="p-3 bg-neutral-800 rounded-lg border border-neutral-700 space-y-2">
                                    <p className="text-sm font-bold text-white">{ex.name}</p>
                                    <div className="grid grid-cols-4 gap-2">
                                        <div>
                                            <label className="text-[10px] text-neutral-500">Sets</label>
                                            <input type="number" value={ex.sets} onChange={(e)=>updateEditExercise(idx,'sets',e.target.value)} className="w-full bg-neutral-900 rounded p-2 text-center text-sm" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-neutral-500">Reps</label>
                                            <input value={ex.reps || ''} onChange={(e)=>updateEditExercise(idx,'reps',e.target.value)} className="w-full bg-neutral-900 rounded p-2 text-center text-sm" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-neutral-500">Cadência</label>
                                            <input value={ex.cadence || ''} onChange={(e)=>updateEditExercise(idx,'cadence',e.target.value)} className="w-full bg-neutral-900 rounded p-2 text-center text-sm" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-neutral-500">Descanso (s)</label>
                                            <input type="number" value={ex.restTime || 0} onChange={(e)=>updateEditExercise(idx,'restTime',e.target.value)} className="w-full bg-neutral-900 rounded p-2 text-center text-sm" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-neutral-500">Pesos por série (kg)</label>
                                        <div className="grid grid-cols-4 gap-2">
                                            {Array.from({ length: Number(ex.sets) || 0 }).map((_, sIdx) => (
                                                <input key={sIdx} value={ex.weights?.[sIdx] ?? ''} onChange={(e)=>updateEditExercise(idx,'weight',[sIdx, e.target.value])} className="w-full bg-neutral-900 rounded p-2 text-center text-sm" placeholder={`#${sIdx+1}`} />
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-neutral-500">Reps por série</label>
                                        <div className="grid grid-cols-4 gap-2">
                                            {Array.from({ length: Number(ex.sets) || 0 }).map((_, sIdx) => (
                                                <input key={sIdx} value={ex.repsPerSet?.[sIdx] ?? ''} onChange={(e)=>updateEditExercise(idx,'rep',[sIdx, e.target.value])} className="w-full bg-neutral-900 rounded p-2 text-center text-sm" placeholder={`#${sIdx+1}`} />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="p-4 bg-neutral-900/50 flex gap-2">
                        <button onClick={()=>setShowEdit(false)} className="flex-1 py-3 rounded-xl bg-neutral-800 text-neutral-300 font-bold hover:bg-neutral-700">Cancelar</button>
                        <button onClick={saveEdit} className="flex-1 py-3 rounded-xl bg-yellow-500 text-black font-bold hover:bg-yellow-400">Salvar</button>
                    </div>
                </div>
            </div>
        )}
        {selectedSession && (
            <div className="fixed inset-0 z-[1200] bg-neutral-900 overflow-y-auto pt-safe" onClick={() => setSelectedSession(null)}>
                <div onClick={(e) => e.stopPropagation()}>
                    <WorkoutReport
                        session={selectedSession}
                        previousSession={null}
                        user={user}
                        onClose={() => setSelectedSession(null)}
                    />
                </div>
            </div>
        )}
        </>
    );
};

export default HistoryList;


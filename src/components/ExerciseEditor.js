import React from 'react';
import { Trash2, Plus, ArrowLeft, Save, Upload } from 'lucide-react';
import { useDialog } from '@/contexts/DialogContext';
import { createClient } from '@/utils/supabase/client';

const ExerciseEditor = ({ workout, onSave, onCancel, onChange }) => {
    console.log("ARQUIVO REAL ENCONTRADO: ExerciseEditor.js");
    const { confirm } = useDialog();
    const [saving, setSaving] = React.useState(false);

    if (!workout) return null;

    const updateExercise = (index, field, value) => {
        const newExercises = [...(workout.exercises || [])];
        if (field === 'duplicate') {
            newExercises.splice(index + 1, 0, { ...newExercises[index] });
        } else {
            newExercises[index] = { ...newExercises[index], [field]: value };
        }
        onChange({ ...workout, exercises: newExercises });
    };

    const removeExercise = async (index) => {
        if (await confirm('Tem certeza que deseja remover este exercício?', 'Remover Exercício')) {
            const newExercises = [...(workout.exercises || [])];
            newExercises.splice(index, 1);
            onChange({ ...workout, exercises: newExercises });
        }
    };

    const CARDIO_OPTIONS = ['Escada', 'Esteira', 'Bicicleta', 'Corrida', 'Caminhada', 'Elíptico'];

    const getExerciseType = (ex) => {
        if (ex.type) return ex.type;
        return ex.method === 'Cardio' ? 'cardio' : 'strength';
    };

    const toggleExerciseType = (index, currentType) => {
        const newType = currentType === 'strength' ? 'cardio' : 'strength';
        const newExercises = [...(workout.exercises || [])];
        const ex = newExercises[index];

        if (newType === 'cardio') {
            newExercises[index] = {
                ...ex,
                type: 'cardio',
                method: 'Cardio',
                sets: 1,
                name: CARDIO_OPTIONS.includes(ex.name) ? ex.name : CARDIO_OPTIONS[0],
                reps: ex.reps || '20',
                rpe: ex.rpe || 5
            };
        } else {
            newExercises[index] = {
                ...ex,
                type: 'strength',
                method: 'Normal',
                sets: 4,
                name: '',
                reps: '10',
                rpe: 8
            };
        }
        onChange({ ...workout, exercises: newExercises });
    };

    const addExercise = () => {
        onChange({
            ...workout,
            exercises: [
                ...(workout.exercises || []),
                {
                    name: '',
                    sets: 4,
                    reps: '10',
                    rpe: '8',
                    cadence: '2020',
                    restTime: 60,
                    method: 'Normal',
                    videoUrl: '',
                    notes: ''
                }
            ]
        });
    };

    React.useEffect(() => {
        if (workout && workout.exercises) {
            const validExercises = workout.exercises.filter(e => e && typeof e === 'object');
            if (validExercises.length !== workout.exercises.length) {
                console.warn("Limpando exercícios inválidos/fantasmas do treino.");
                onChange({ ...workout, exercises: validExercises });
            }
        }
    }, [workout.exercises?.length]);

    const fileInputRef = React.useRef(null);
    const handleImportJsonClick = () => fileInputRef.current?.click();
    const handleImportJson = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const raw = JSON.parse(text);
            const src = raw.workout || raw.session || raw;
            const title = src.title || src.workoutTitle || workout.title || 'Treino Importado';
            const exs = Array.isArray(src.exercises) ? src.exercises : [];
            const mapped = exs.map(ex => ({
                name: ex.name || '',
                sets: Number(ex.sets) || 0,
                reps: String(ex.reps || ''),
                rpe: Number(ex.rpe || ex.intensity || 8),
                cadence: ex.cadence || '2020',
                restTime: Number(ex.restTime || ex.rest_time || 0),
                method: ex.method || 'Normal',
                videoUrl: ex.videoUrl || ex.video_url || '',
                notes: ex.notes || ''
            }));
            const imported = { title, exercises: mapped };
            onChange(imported);
            if (await confirm('Importar e salvar este treino agora?', 'Salvar')) {
                onSave(imported);
            }
        } catch (err) {
        } finally {
            e.target.value = '';
        }
    };

    const handleSave = async () => {
        console.log("CLICOU EM SALVAR (Internal)", workout);
        
        if (!workout.title || !workout.title.trim()) {
            return await alert("Dê um nome ao treino!", "Atenção");
        }

        setSaving(true);
        try {
            // --- CÓDIGO DE SEGURANÇA OBRIGATÓRIO ---
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            
            if (!user) {
                alert("ERRO CRÍTICO: Usuário não logado. O treino não será salvo sem dono.");
                setSaving(false);
                return;
            }
            console.log("SALVANDO COMO USUÁRIO:", user.id); // Debug obrigatório
            // ---------------------------------------

            if (onSave) {
                 console.log("Chamando onSave do pai...");
                 // Garantindo que o user.id vá junto caso o pai precise
                 await onSave({ ...workout, created_by: user.id, user_id: user.id });
            } else {
                 console.log("Executando salvamento direto no Supabase...");
                 
                 // 1. Create/Update Workout
                 let workoutId = workout.id;
                 if (workoutId) {
                     const { error } = await supabase.from('workouts').update({
                         name: workout.title,
                         notes: workout.notes,
                         created_by: user.id 
                     }).eq('id', workoutId);
                     if (error) throw error;
                 } else {
                     const { data: newW, error } = await supabase.from('workouts').insert({
                         user_id: user.id, 
                         created_by: user.id, // Garanta que o insert inclua: created_by: user.id.
                         name: workout.title,
                         is_template: true,
                         notes: workout.notes
                     }).select().single();
                     if (error) throw error;
                     workoutId = newW.id;
                 }

                 await supabase.from('exercises').delete().eq('workout_id', workoutId);

                 const exercisesToInsert = (workout.exercises || []).map((ex, idx) => ({
                     workout_id: workoutId,
                     name: ex.name,
                     notes: ex.notes,
                     video_url: ex.videoUrl,
                     rest_time: ex.restTime,
                     cadence: ex.cadence,
                     method: ex.method,
                     "order": idx
                 }));

                 if (exercisesToInsert.length > 0) {
                     const { data: insertedExs, error: exErr } = await supabase.from('exercises').insert(exercisesToInsert).select();
                     if (exErr) throw exErr;
                     
                     for (const ex of insertedExs) {
                         const original = workout.exercises.find(e => e.name === ex.name);
                         const numSets = parseInt(original.sets) || 0;
                         for (let i = 0; i < numSets; i++) {
                             await supabase.from('sets').insert({
                                 exercise_id: ex.id,
                                 reps: original.reps,
                                 rpe: original.rpe,
                                 set_number: i + 1
                             });
                         }
                     }
                 }
            }
            
            await alert("Treino Salvo com Sucesso!", "Sucesso");
            // window.location.href = '/'; // Removido para evitar reload forçado que causava tela preta

        } catch (e) {
            console.error("Erro ao salvar:", e);
            await alert("Erro ao salvar: " + e.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="h-full flex flex-col bg-neutral-900">
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-900/50 backdrop-blur-sm sticky top-0 z-30">
                <button
                    onClick={onCancel}
                    className="p-2 -ml-2 text-neutral-400 hover:text-white rounded-full hover:bg-neutral-800 transition-colors"
                >
                    <ArrowLeft size={20} />
                </button>
                <h2 className="text-lg font-bold text.white">Editar Treino</h2>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleImportJsonClick}
                        className="p-2 text-blue-400 hover:text-white rounded-full hover:bg-blue-500/10 transition-colors"
                        title="Importar JSON"
                    >
                        <Upload size={20} />
                    </button>
                    <input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={handleImportJson} />
                    <button
                        onClick={() => onSave(workout)}
                        className="flex items-center gap-2 px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-full transition-colors text-sm"
                    >
                        <Save size={18} />
                        <span>SALVAR</span>
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                <div>
                    <label className="text-xs font-bold text-neutral-500 uppercase mb-2 block">Nome do Treino</label>
                    <input
                        value={workout.title || ''}
                        onChange={e => onChange({ ...workout, title: e.target.value })}
                        className="w-full bg-neutral-800 text-xl font-bold p-4 rounded-xl border border-neutral-700 outline-none focus:border-yellow-500 text-white placeholder-neutral-600 transition-colors"
                        placeholder="Ex: Treino A - Peito e Tríceps"
                    />
                    
                    {/* FLOATING SAVE BUTTON (EMERGENCY FIX) */}
                    <button 
                        onClick={handleSave} 
                        disabled={saving}
                        className="fixed bottom-10 right-10 z-[9999] bg-green-600 hover:bg-green-500 text-white font-bold py-4 px-8 rounded-full shadow-2xl border-4 border-white text-xl flex items-center gap-2 animate-bounce disabled:opacity-50"
                    >
                        {saving ? 'SALVANDO...' : '💾 SALVAR TREINO'}
                    </button>
                </div>

                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-neutral-500 uppercase">Exercícios ({workout.exercises?.length || 0})</label>
                    </div>

                    {(workout.exercises || []).map((exercise, index) => {
                        if (!exercise) return null;
                        const exerciseType = getExerciseType(exercise);

                        return (
                            <div key={index} className="bg-neutral-800 p-4 rounded-xl border border-neutral-700 relative group transition-all hover:border-neutral-600">
                                <div className="absolute top-2 right-2 flex gap-2">
                                     <button
                                        onClick={() => toggleExerciseType(index, exerciseType)}
                                        className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-colors ${
                                            exerciseType === 'cardio'
                                            ? 'bg-blue-500/20 text-blue-400 border-blue-500/50'
                                            : 'bg-neutral-700 text-neutral-400 border-neutral-600 hover:border-neutral-400'
                                        }`}
                                    >
                                        {exerciseType === 'cardio' ? 'Cardio' : 'Força'}
                                    </button>
                                    <button
                                        onClick={() => removeExercise(index)}
                                        className="text-neutral-600 hover:text-red-500 p-1 transition-colors"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>

                                <div className="space-y-4 pr-0 pt-6">
                                    {exerciseType === 'cardio' ? (
                                        <div>
                                            <label className="text-[10px] text-neutral-500 uppercase font-bold mb-1 block">Modalidade</label>
                                            <select
                                                value={exercise.name || ''}
                                                onChange={e => updateExercise(index, 'name', e.target.value)}
                                                className="w-full bg-neutral-900 font-bold text-white text-lg p-3 rounded-xl border border-neutral-700 outline-none focus:border-blue-500 transition-colors appearance-none"
                                            >
                                                {CARDIO_OPTIONS.map(opt => (
                                                    <option key={opt} value={opt}>{opt}</option>
                                                ))}
                                            </select>
                                        </div>
                                    ) : (
                                        <input
                                            value={exercise.name || ''}
                                            onChange={e => updateExercise(index, 'name', e.target.value)}
                                            className="w-full bg-transparent font-bold text-white text-lg border-b border-neutral-700 pb-2 focus:border-yellow-500 outline-none placeholder-neutral-600 transition-colors"
                                            placeholder="Nome do exercício"
                                        />
                                    )}

                                    {exerciseType === 'cardio' ? (
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-[10px] text-neutral-500 uppercase font-bold text-center block mb-1">Tempo (minutos)</label>
                                                <input
                                                    type="number"
                                                    value={exercise.reps || ''}
                                                    onChange={e => updateExercise(index, 'reps', e.target.value)}
                                                    className="w-full bg-neutral-900 rounded-xl p-4 text-center text-xl font-bold text-white outline-none focus:ring-1 ring-blue-500 border border-neutral-700"
                                                    placeholder="30"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-yellow-500 uppercase font-bold text-center block mb-1">Intensidade</label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={exercise.rpe || ''}
                                                    onChange={e => updateExercise(index, 'rpe', e.target.value)}
                                                    className="w-full bg-neutral-900 border border-yellow-500/20 rounded-xl p-4 text-center text-xl font-bold text-yellow-500 outline-none focus:ring-1 ring-yellow-500 placeholder-yellow-500/30"
                                                    placeholder="5"
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                                            <div>
                                                <label className="text-[10px] text-neutral-500 uppercase font-bold text-center block mb-1">Sets</label>
                                                <div className="flex items-center gap-1">
                                                    <input
                                                        type="number"
                                                        value={exercise.sets || ''}
                                                        onChange={e => updateExercise(index, 'sets', e.target.value)}
                                                        className="w-full bg-neutral-900 rounded-lg p-2 text-center text-sm font-bold text-white outline-none focus:ring-1 ring-yellow-500"
                                                    />
                                                    <button
                                                        onClick={() => updateExercise(index, 'duplicate', true)}
                                                        className="h-8 w-8 bg-neutral-700 hover:bg-white hover:text-black text-neutral-400 rounded-lg flex items-center justify-center transition-colors"
                                                        title="Duplicar Série"
                                                    >
                                                        <Plus size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-neutral-500 uppercase font-bold text-center block mb-1">Reps</label>
                                                <input
                                                    type="text"
                                                    value={exercise.reps || ''}
                                                    onChange={e => updateExercise(index, 'reps', e.target.value)}
                                                    className="w-full bg-neutral-900 rounded-lg p-2 text-center text-sm font-bold text-white outline-none focus:ring-1 ring-yellow-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-yellow-500 uppercase font-bold text-center block mb-1">RPE</label>
                                                <input
                                                    type="number"
                                                    value={exercise.rpe || ''}
                                                    onChange={e => updateExercise(index, 'rpe', e.target.value)}
                                                    className="w-full bg-neutral-900 border border-yellow-500/20 rounded-lg p-2 text-center text-sm font-bold text-yellow-500 outline-none focus:ring-1 ring-yellow-500 placeholder-yellow-500/30"
                                                    placeholder="8"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-neutral-500 uppercase font-bold text-center block mb-1">Rest(s)</label>
                                                <input
                                                    type="number"
                                                    value={exercise.restTime || ''}
                                                    onChange={e => updateExercise(index, 'restTime', e.target.value)}
                                                    className="w-full bg-neutral-900 rounded-lg p-2 text-center text-sm font-bold text-white outline-none focus:ring-1 ring-yellow-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-neutral-500 uppercase font-bold text-center block mb-1">Cad</label>
                                                <input
                                                    type="text"
                                                    value={exercise.cadence || ''}
                                                    onChange={e => updateExercise(index, 'cadence', e.target.value)}
                                                    className="w-full bg-neutral-900 rounded-lg p-2 text-center text-sm font-bold text-white outline-none focus:ring-1 ring-yellow-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-neutral-500 uppercase font-bold text-center block mb-1">Método</label>
                                                <select
                                                    value={exercise.method || 'Normal'}
                                                    onChange={e => updateExercise(index, 'method', e.target.value)}
                                                    className="w-full bg-neutral-900 rounded-lg p-2 text-center text-[10px] font-bold text-white h-[36px] outline-none focus:ring-1 ring-yellow-500"
                                                >
                                                    <option value="Normal">Normal</option>
                                                    <option value="Drop-set">Drop</option>
                                                    <option value="Rest-Pause">Rest-P</option>
                                                    <option value="Bi-Set">Bi-Set</option>
                                                    <option value="Cluster">Cluster</option>
                                                    <option value="Warm-up">Warm</option>
                                                </select>
                                            </div>
                                        </div>
                                    )}

                                    <div className="space-y-3 pt-2">
                                        <div>
                                            <label className="text-[10px] text-blue-400 uppercase font-bold mb-1 block">🎥 Vídeo Demonstração (URL)</label>
                                            <input
                                                value={exercise.videoUrl || ''}
                                                onChange={e => updateExercise(index, 'videoUrl', e.target.value)}
                                                className="w-full bg-blue-500/5 border border-blue-500/20 rounded-lg p-2 text-xs text-blue-200 focus:border-blue-500 outline-none placeholder-blue-500/30 transition-colors"
                                                placeholder="https://youtube.com/..."
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-neutral-500 uppercase font-bold mb-1 block">Notas</label>
                                            <textarea
                                                value={exercise.notes || ''}
                                                onChange={e => updateExercise(index, 'notes', e.target.value)}
                                                className="w-full bg-neutral-900 rounded-lg p-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500 min-h-[60px] resize-none"
                                                placeholder="Dicas de execução..."
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <button
                    onClick={addExercise}
                    className="w-full py-4 border-2 border-dashed border-neutral-800 text-neutral-500 rounded-xl font-bold hover:bg-neutral-800 hover:text-white hover:border-neutral-700 transition-all flex items-center justify-center gap-2"
                >
                    <Plus size={20} /> Adicionar Exercício
                </button>
            </div>
        </div>
    );
};

export default ExerciseEditor;


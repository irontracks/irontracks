import React from 'react';
import { Trash2, Plus, ArrowLeft, Save } from 'lucide-react';
import { useDialog } from '@/contexts/DialogContext';

const ExerciseEditor = ({ workout, onSave, onCancel, onChange }) => {
    const { confirm } = useDialog();

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

    // Limpeza automática de exercícios inválidos ao montar ou alterar
    React.useEffect(() => {
        if (workout && workout.exercises) {
            const validExercises = workout.exercises.filter(e => e && typeof e === 'object');
            if (validExercises.length !== workout.exercises.length) {
                console.warn("Limpando exercícios inválidos/fantasmas do treino.");
                onChange({ ...workout, exercises: validExercises });
            }
        }
    }, [workout.exercises?.length]); // Dependência apenas no tamanho para evitar loop infinito

    return (
        <div className="h-full flex flex-col bg-neutral-900">
            {/* Header */}
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-900/50 backdrop-blur-sm sticky top-0 z-30">
                <button
                    onClick={onCancel}
                    className="p-2 -ml-2 text-neutral-400 hover:text-white rounded-full hover:bg-neutral-800 transition-colors"
                >
                    <ArrowLeft size={20} />
                </button>
                <h2 className="text-lg font-bold text-white">Editar Treino</h2>
                <button
                    onClick={() => onSave(workout)}
                    className="p-2 -mr-2 text-yellow-500 hover:text-yellow-400 rounded-full hover:bg-yellow-500/10 transition-colors"
                >
                    <Save size={20} />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {/* Workout Title */}
                <div>
                    <label className="text-xs font-bold text-neutral-500 uppercase mb-2 block">Nome do Treino</label>
                    <input
                        value={workout.title || ''}
                        onChange={e => onChange({ ...workout, title: e.target.value })}
                        className="w-full bg-neutral-800 text-xl font-bold p-4 rounded-xl border border-neutral-700 outline-none focus:border-yellow-500 text-white placeholder-neutral-600 transition-colors"
                        placeholder="Ex: Treino A - Peito e Tríceps"
                    />
                </div>

                {/* Exercises List */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-neutral-500 uppercase">Exercícios ({workout.exercises?.length || 0})</label>
                    </div>

                    {(workout.exercises || []).map((exercise, index) => {
                        if (!exercise) return null; // Proteção contra exercícios undefined/null
                        return (
                            <div key={index} className="bg-neutral-800 p-4 rounded-xl border border-neutral-700 relative group transition-all hover:border-neutral-600">
                                <button
                                    onClick={() => removeExercise(index)}
                                    className="absolute top-2 right-2 text-neutral-600 hover:text-red-500 p-2 transition-colors"
                                >
                                    <Trash2 size={16} />
                                </button>

                                <div className="space-y-4 pr-8">
                                    {/* Exercise Name */}
                                    <input
                                        value={exercise.name || ''}
                                        onChange={e => updateExercise(index, 'name', e.target.value)}
                                        className="w-full bg-transparent font-bold text-white text-lg border-b border-neutral-700 pb-2 focus:border-yellow-500 outline-none placeholder-neutral-600 transition-colors"
                                        placeholder="Nome do exercício"
                                    />

                                    {/* Metrics Grid */}
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

                                    {/* Extra Fields */}
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

"use client";

import React, { useState } from 'react';
import { Trash2, Plus, Megaphone } from 'lucide-react';

export interface AdminExercise {
    name: string;
    sets: number | string;
    reps: string;
    rpe: string;
    cadence: string;
    restTime: number | string;
    rest_time?: number | string; // Compatibility
    method: string;
    videoUrl: string;
    video_url?: string; // Compatibility
    notes: string;
    coachNotes?: string;
    [key: string]: any;
}

export interface AdminWorkout {
    id: string | null;
    title: string;
    exercises: AdminExercise[];
    [key: string]: any;
}

interface AdminWorkoutEditorProps {
    initialData?: Partial<AdminWorkout> | null;
    onSave: (workout: AdminWorkout) => void;
    onCancel: () => void;
}

const AdminWorkoutEditor: React.FC<AdminWorkoutEditorProps> = ({ initialData, onSave, onCancel }) => {
    const [workout, setWorkout] = useState<AdminWorkout>(() => {
        const source = initialData && typeof initialData === 'object' ? initialData : {};
        const exercises = Array.isArray(source.exercises)
            ? source.exercises.filter((ex): ex is AdminExercise => !!ex && typeof ex === 'object')
            : [];
        return {
            id: source.id ?? null,
            title: source.title ?? '',
            exercises
        };
    });

    const safeExercises = Array.isArray(workout?.exercises)
        ? workout.exercises
        : [];

    const updateExercise = (idx: number, field: keyof AdminExercise | 'duplicate', val: string | number | boolean) => {
        const newExs = [...safeExercises];

        if (field === 'duplicate') {
            if (!newExs[idx]) return;
            // Deep copy do exercício para evitar referência
            newExs.splice(idx + 1, 0, { ...newExs[idx] });
        } else {
            // Type assertion seguro aqui pois sabemos que o campo existe na interface
            // e o valor corresponde (runtime check seria ideal, mas TS check ajuda)
            newExs[idx] = { ...newExs[idx], [field]: val };
        }

        setWorkout((prev) => ({ ...prev, exercises: newExs }));
    };

    const addExercise = () => {
        setWorkout((prev) => {
            const currentExercises = Array.isArray(prev.exercises) ? prev.exercises : [];
            const newExercise: AdminExercise = {
                name: '',
                sets: 4,
                reps: '10',
                rpe: '8', // Default RPE
                cadence: '2020',
                restTime: 60,
                method: 'Normal', // Default Method
                videoUrl: '',
                notes: '',
                coachNotes: ''
            };
            return { ...prev, exercises: [...currentExercises, newExercise] };
        });
    };

    const handleRemoveExercise = (idx: number) => {
        const n = [...safeExercises];
        n.splice(idx, 1);
        setWorkout((prev) => ({ ...prev, exercises: n }));
    };

    return (
        <div className="bg-neutral-900 min-h-full">
            <div className="flex justify-between items-center mb-6">
                <button onClick={onCancel} className="text-neutral-400">Cancelar</button>
                <h3 className="font-bold text-white">{workout?.id ? 'Editar' : 'Novo'}</h3>
            </div>
            <input
                value={workout.title}
                onChange={e => setWorkout((prev) => ({ ...prev, title: e.target.value }))}
                className="w-full bg-neutral-800 text-xl font-bold p-4 rounded-xl mb-4 border border-neutral-700 outline-none text-white"
                placeholder="Nome do Treino"
            />

            <button
                onClick={() => onSave(workout)}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-xl mt-4 mb-6 shadow-lg transform transition hover:scale-[1.02] flex items-center justify-center gap-2"
            >
                💾 SALVAR TREINO
            </button>

            <div className="space-y-4">
                {safeExercises.map((ex, idx) => (
                    <div key={idx} className="bg-neutral-800 p-4 rounded-xl border border-neutral-700 relative group">
                        <button
                            onClick={() => handleRemoveExercise(idx)}
                            className="absolute top-2 right-2 text-red-500 p-2"
                        >
                            <Trash2 size={16} />
                        </button>
                        <div className="space-y-3 pr-8">
                            <input
                                value={ex.name}
                                onChange={e => updateExercise(idx, 'name', e.target.value)}
                                className="w-full bg-transparent font-bold text-white border-b border-neutral-600 pb-1 outline-none"
                                placeholder="Nome do Exercício"
                            />
                            <div className="grid grid-cols-6 gap-2 text-center mb-2">
                                <div className="col-span-1">
                                    <label className="text-[10px] text-neutral-500 block">Sets</label>
                                    <div className="flex items-center gap-1">
                                        <input
                                            type="number"
                                            value={ex.sets}
                                            onChange={e => updateExercise(idx, 'sets', e.target.value)}
                                            className="w-full bg-neutral-900 rounded p-2 text-center outline-none text-sm text-white"
                                        />
                                        <button
                                            onClick={() => updateExercise(idx, 'duplicate', true)}
                                            className="h-[20px] w-[20px] bg-white rounded-full flex items-center justify-center shadow-lg active:scale-90 flex-shrink-0"
                                            title="Duplicar Exercício"
                                        >
                                            <Plus size={12} className="text-black" />
                                        </button>
                                    </div>
                                </div>
                                <div className="col-span-1">
                                    <label className="text-[10px] text-neutral-500 block">Reps</label>
                                    <input
                                        value={ex.reps}
                                        onChange={e => updateExercise(idx, 'reps', e.target.value)}
                                        className="w-full bg-neutral-900 rounded p-2 text-center text-sm text-white outline-none"
                                    />
                                </div>
                                <div className="col-span-1">
                                    <label className="text-[10px] text-yellow-500 font-bold block">RPE</label>
                                    <input
                                        type="number"
                                        value={ex.rpe}
                                        onChange={e => updateExercise(idx, 'rpe', e.target.value)}
                                        className="w-full bg-neutral-900 border border-yellow-500/30 rounded p-2 text-center text-sm text-yellow-500 font-bold outline-none"
                                        placeholder="1-10"
                                    />
                                </div>
                                <div className="col-span-1">
                                    <label className="text-[10px] text-neutral-500 block">Rest(s)</label>
                                    <input
                                        type="number"
                                        value={ex.restTime}
                                        onChange={e => updateExercise(idx, 'restTime', e.target.value)}
                                        className="w-full bg-neutral-900 rounded p-2 text-center text-sm text-white outline-none"
                                    />
                                </div>
                                <div className="col-span-1">
                                    <label className="text-[10px] text-neutral-500 block">Cad</label>
                                    <input
                                        value={ex.cadence}
                                        onChange={e => updateExercise(idx, 'cadence', e.target.value)}
                                        className="w-full bg-neutral-900 rounded p-2 text-center text-sm text-white outline-none"
                                    />
                                </div>
                                <div className="col-span-1">
                                    <label className="text-[10px] text-neutral-500 block">Método</label>
                                    <select
                                        value={['warm-up', 'warm_up', 'warmup'].includes(String(ex.method || '').toLowerCase()) ? 'Normal' : (ex.method || 'Normal')}
                                        onChange={e => updateExercise(idx, 'method', e.target.value)}
                                        className="w-full bg-neutral-900 rounded p-2 text-center text-[10px] h-[38px] outline-none text-white"
                                    >
                                        <option value="Normal">Normal</option>
                                        <option value="Drop-set">Drop-set</option>
                                        <option value="Rest-Pause">Rest-Pause</option>
                                        <option value="Bi-Set">Bi-Set</option>
                                        <option value="Cluster">Cluster</option>
                                    </select>
                                </div>
                            </div>

                            <div className="mb-2">
                                <label className="text-[10px] text-blue-400 flex items-center gap-1 mb-1">🎥 VÍDEO DEMONSTRAÇÃO (URL)</label>
                                <input
                                    value={ex.videoUrl || ''}
                                    onChange={e => updateExercise(idx, 'videoUrl', e.target.value)}
                                    className="w-full bg-blue-500/5 border border-blue-500/20 rounded p-2 text-xs text-blue-200 outline-none"
                                    placeholder="https://youtube.com/..."
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-yellow-500 flex items-center gap-1 mb-1"><Megaphone size={10} /> COACH</label>
                                <input
                                    value={ex.coachNotes || ''}
                                    onChange={e => updateExercise(idx, 'coachNotes', e.target.value)}
                                    className="w-full bg-yellow-500/10 border border-yellow-500/30 rounded p-2 text-sm text-yellow-200 outline-none"
                                    placeholder="Instrução..."
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            <button
                onClick={addExercise}
                className="w-full py-4 mt-4 border-2 border-dashed border-neutral-700 text-neutral-400 rounded-xl font-bold hover:bg-neutral-800 transition-colors"
            >
                + Exercício
            </button>
        </div>
    );
};

export default AdminWorkoutEditor;

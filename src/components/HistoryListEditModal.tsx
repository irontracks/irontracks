'use client';

import React from 'react';

export interface ManualExercise {
    name: string;
    sets: number | string;
    reps: string;
    restTime: number;
    cadence: string;
    notes: string;
    weights?: string[];
    repsPerSet?: string[];
    rest_time?: number;
}

interface EditModalProps {
    editTitle: string;
    setEditTitle: (v: string) => void;
    editDate: string;
    setEditDate: (v: string) => void;
    editDuration: string;
    setEditDuration: (v: string) => void;
    editNotes: string;
    setEditNotes: (v: string) => void;
    editExercises: ManualExercise[];
    updateEditExercise: (idx: number, field: string, value: unknown) => void;
    onClose: () => void;
    onSave: () => void;
}

/**
 * HistoryListEditModal
 *
 * Modal "Editar Histórico" extraído do HistoryList.tsx (L1728–1801).
 * Renderiza o formulário de edição de um histórico de treino existente.
 * Lógica de saveEdit e updateEditExercise permanecem no HistoryList pai.
 */
export function HistoryListEditModal({
    editTitle,
    setEditTitle,
    editDate,
    setEditDate,
    editDuration,
    setEditDuration,
    editNotes,
    setEditNotes,
    editExercises,
    updateEditExercise,
    onClose,
    onSave,
}: EditModalProps) {
    return (
        <div
            role="presentation"
            className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Editar Histórico"
                className="bg-neutral-900 w-full max-w-2xl rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-4 border-b border-neutral-800">
                    <h3 className="font-bold text-white">Editar Histórico</h3>
                </div>

                <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-[10px] uppercase font-bold text-neutral-500">Título</label>
                            <input
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                className="w-full bg-neutral-800 border border-neutral-700 rounded-xl p-3 text-white outline-none"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-neutral-500">Duração (min)</label>
                            <input
                                type="number"
                                value={editDuration}
                                onChange={(e) => setEditDuration(e.target.value)}
                                className="w-full bg-neutral-800 border border-neutral-700 rounded-xl p-3 text-white outline-none"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] uppercase font-bold text-neutral-500">Data e Hora</label>
                        <input
                            type="datetime-local"
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                            className="w-full bg-neutral-800 border border-neutral-700 rounded-xl p-3 text-white outline-none"
                        />
                    </div>

                    <div>
                        <label className="text-[10px] uppercase font-bold text-neutral-500">Notas</label>
                        <textarea
                            value={editNotes}
                            onChange={(e) => setEditNotes(e.target.value)}
                            className="w-full bg-neutral-800 border border-neutral-700 rounded-xl p-3 text-white outline-none h-20 resize-none"
                        />
                    </div>

                    <div className="space-y-2">
                        {editExercises.map((ex, idx) => (
                            <div key={idx} className="p-3 bg-neutral-800 rounded-lg border border-neutral-700 space-y-2">
                                <p className="text-sm font-bold text-white">{ex.name}</p>
                                <div className="grid grid-cols-4 gap-2">
                                    <div>
                                        <label className="text-[10px] text-neutral-500">Sets</label>
                                        <input
                                            type="number"
                                            value={ex.sets}
                                            onChange={(e) => updateEditExercise(idx, 'sets', e.target.value)}
                                            className="w-full bg-neutral-900 rounded p-2 text-center text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-neutral-500">Reps</label>
                                        <input
                                            value={ex.reps || ''}
                                            onChange={(e) => updateEditExercise(idx, 'reps', e.target.value)}
                                            className="w-full bg-neutral-900 rounded p-2 text-center text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-neutral-500">Cadência</label>
                                        <input
                                            value={ex.cadence || ''}
                                            onChange={(e) => updateEditExercise(idx, 'cadence', e.target.value)}
                                            className="w-full bg-neutral-900 rounded p-2 text-center text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-neutral-500">Descanso (s)</label>
                                        <input
                                            type="number"
                                            value={ex.restTime || 0}
                                            onChange={(e) => updateEditExercise(idx, 'restTime', e.target.value)}
                                            className="w-full bg-neutral-900 rounded p-2 text-center text-sm"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] text-neutral-500">Pesos por série (kg)</label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {Array.from({ length: Number(ex.sets) || 0 }).map((_, sIdx) => (
                                            <input
                                                key={sIdx}
                                                value={String(ex.weights?.[sIdx] ?? '')}
                                                onChange={(e) => updateEditExercise(idx, 'weight', [sIdx, e.target.value])}
                                                className="w-full bg-neutral-900 rounded p-2 text-center text-sm"
                                                placeholder={`#${sIdx + 1}`}
                                            />
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] text-neutral-500">Reps por série</label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {Array.from({ length: Number(ex.sets) || 0 }).map((_, sIdx) => (
                                            <input
                                                key={sIdx}
                                                value={String(ex.repsPerSet?.[sIdx] ?? '')}
                                                onChange={(e) => updateEditExercise(idx, 'rep', [sIdx, e.target.value])}
                                                className="w-full bg-neutral-900 rounded p-2 text-center text-sm"
                                                placeholder={`#${sIdx + 1}`}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="p-4 bg-neutral-900/50 flex gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 py-3 rounded-xl bg-neutral-800 text-neutral-300 font-bold hover:bg-neutral-700"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={onSave}
                        className="flex-1 py-3 rounded-xl bg-yellow-500 text-black font-bold hover:bg-yellow-400"
                    >
                        Salvar
                    </button>
                </div>
            </div>
        </div>
    );
}

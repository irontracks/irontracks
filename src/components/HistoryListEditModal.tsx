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
            className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Editar Histórico"
                className="w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden relative"
                style={{
                    background: 'linear-gradient(160deg, rgba(20,18,10,0.98) 0%, rgba(10,10,10,0.99) 40%)',
                    borderColor: 'rgba(234,179,8,0.12)',
                    boxShadow: '0 32px 64px -16px rgba(0,0,0,0.8), inset 0 1px 0 rgba(234,179,8,0.1)',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-500/40 to-transparent" />
                <div className="p-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-yellow-500/80">Editar Histórico</h3>
                </div>

                <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-[10px] uppercase font-bold text-neutral-500">Título</label>
                            <input
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                className="w-full rounded-xl p-3 text-white outline-none border focus:border-yellow-500/40 transition-all"
                                style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
                            />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-neutral-500">Duração (min)</label>
                            <input
                                type="number"
                                value={editDuration}
                                onChange={(e) => setEditDuration(e.target.value)}
                                className="w-full rounded-xl p-3 text-white outline-none border focus:border-yellow-500/40 transition-all"
                                style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] uppercase font-bold text-neutral-500">Data e Hora</label>
                        <input
                            type="datetime-local"
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                            className="w-full rounded-xl p-3 text-white outline-none border focus:border-yellow-500/40 transition-all"
                                style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
                        />
                    </div>

                    <div>
                        <label className="text-[10px] uppercase font-bold text-neutral-500">Notas</label>
                        <textarea
                            value={editNotes}
                            onChange={(e) => setEditNotes(e.target.value)}
                        className="w-full rounded-xl p-3 text-white outline-none h-20 resize-none border focus:border-yellow-500/40 transition-all"
                            style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
                        />
                    </div>

                    <div className="space-y-2">
                        {editExercises.map((ex, idx) => (
                            <div key={idx} className="p-3 rounded-xl border space-y-2" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
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

                <div className="p-4 flex gap-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 py-3 rounded-xl border text-neutral-300 font-bold hover:text-white hover:border-yellow-500/30 transition-all"
                        style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={onSave}
                        className="flex-1 py-3 rounded-xl font-black transition-all btn-gold-animated"
                    >
                        Salvar
                    </button>
                </div>
            </div>
        </div>
    );
}

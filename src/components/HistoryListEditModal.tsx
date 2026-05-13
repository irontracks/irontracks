'use client';

import React from 'react';
import { useFocusTrap } from '@/hooks/useFocusTrap';

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
    // WCAG 2.4.3 Focus Order + 2.1.2 No Keyboard Trap
    const focusTrapRef = useFocusTrap(true, onClose);
    return (
        <div
            role="button"
            tabIndex={-1}
            aria-label="Fechar modal"
            className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
            onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        >
            <div
                ref={focusTrapRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="history-edit-title"
                className="w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden relative"
                style={{
                    background: 'linear-gradient(160deg, rgba(20,18,10,0.98) 0%, rgba(10,10,10,0.99) 40%)',
                    borderColor: 'rgba(234,179,8,0.12)',
                    boxShadow: '0 32px 64px -16px rgba(0,0,0,0.8), inset 0 1px 0 rgba(234,179,8,0.1)',
                }}
            >
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-500/40 to-transparent" />
                <div className="p-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <h3 id="history-edit-title" className="text-xs font-black uppercase tracking-[0.2em] text-yellow-500/80">Editar Histórico</h3>
                </div>

                <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <div className="text-[10px] uppercase font-bold text-neutral-400">Título</div>
                            <input
                                aria-label="Título"
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                className="w-full rounded-xl p-3 text-white outline-none border focus:border-yellow-500/40 transition-all"
                                style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
                            />
                        </div>
                        <div>
                            <div className="text-[10px] uppercase font-bold text-neutral-400">Duração (min)</div>
                            <input
                                aria-label="Duração (min)"
                                type="number"
                                value={editDuration}
                                onChange={(e) => setEditDuration(e.target.value)}
                                className="w-full rounded-xl p-3 text-white outline-none border focus:border-yellow-500/40 transition-all"
                                style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
                            />
                        </div>
                    </div>

                    <div>
                        <div className="text-[10px] uppercase font-bold text-neutral-400">Data e Hora</div>
                        <input
                            aria-label="Data e Hora"
                            type="datetime-local"
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                            className="w-full rounded-xl p-3 text-white outline-none border focus:border-yellow-500/40 transition-all"
                                style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
                        />
                    </div>

                    <div>
                        <div className="text-[10px] uppercase font-bold text-neutral-400">Notas</div>
                        <textarea
                            aria-label="Notas"
                            value={editNotes}
                            onChange={(e) => setEditNotes(e.target.value)}
                        className="w-full rounded-xl p-3 text-white outline-none h-20 resize-none border focus:border-yellow-500/40 transition-all"
                            style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
                        />
                    </div>

                    <div className="space-y-2">
                        {editExercises.map((ex, idx) => (
                            // Key combina nome + index pra preservar identidade quando exercícios
                            // não tem id estável (são derivados do session.exercises legado).
                            <div key={`${ex?.name || 'ex'}-${idx}`} className="p-3 rounded-xl border space-y-2" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
                                <p className="text-sm font-bold text-white">{ex.name}</p>
                                <div className="grid grid-cols-4 gap-2">
                                    <div>
                                        <div className="text-[10px] text-neutral-400">Sets</div>
                                        <input
                                            aria-label="Sets"
                                            type="number"
                                            value={ex.sets}
                                            onChange={(e) => updateEditExercise(idx, 'sets', e.target.value)}
                                            className="w-full bg-neutral-900 rounded p-2 text-center text-sm"
                                        />
                                    </div>
                                    <div>
                                        <div className="text-[10px] text-neutral-400">Reps</div>
                                        <input
                                            aria-label="Reps"
                                            value={ex.reps || ''}
                                            onChange={(e) => updateEditExercise(idx, 'reps', e.target.value)}
                                            className="w-full bg-neutral-900 rounded p-2 text-center text-sm"
                                        />
                                    </div>
                                    <div>
                                        <div className="text-[10px] text-neutral-400">Cadência</div>
                                        <input
                                            aria-label="Cadência"
                                            value={ex.cadence || ''}
                                            onChange={(e) => updateEditExercise(idx, 'cadence', e.target.value)}
                                            className="w-full bg-neutral-900 rounded p-2 text-center text-sm"
                                        />
                                    </div>
                                    <div>
                                        <div className="text-[10px] text-neutral-400">Descanso (s)</div>
                                        <input
                                            aria-label="Descanso (s)"
                                            type="number"
                                            value={ex.restTime || 0}
                                            onChange={(e) => updateEditExercise(idx, 'restTime', e.target.value)}
                                            className="w-full bg-neutral-900 rounded p-2 text-center text-sm"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-neutral-400">Pesos por série (kg)</div>
                                    <div className="grid grid-cols-4 gap-2">
                                        {Array.from({ length: Number(ex.sets) || 0 }).map((_, sIdx) => (
                                            <input
                                                key={sIdx}
                                                aria-label={`Peso série ${sIdx + 1}`}
                                                value={String(ex.weights?.[sIdx] ?? '')}
                                                onChange={(e) => updateEditExercise(idx, 'weight', [sIdx, e.target.value])}
                                                className="w-full bg-neutral-900 rounded p-2 text-center text-sm"
                                                placeholder={`#${sIdx + 1}`}
                                            />
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-neutral-400">Reps por série</div>
                                    <div className="grid grid-cols-4 gap-2">
                                        {Array.from({ length: Number(ex.sets) || 0 }).map((_, sIdx) => (
                                            <input
                                                key={sIdx}
                                                aria-label={`Reps série ${sIdx + 1}`}
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

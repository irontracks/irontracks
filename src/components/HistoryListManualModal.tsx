'use client';

import React from 'react';
import { X } from 'lucide-react';
import ExerciseEditor from '@/components/ExerciseEditor';
import { type SupabaseClient } from '@supabase/supabase-js';

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

interface WorkoutTemplate {
    id: string;
    name?: string | null;
    exercises?: Array<Record<string, unknown>>;
    [key: string]: unknown;
}

interface ManualModalProps {
    manualTab: 'existing' | 'new';
    setManualTab: (v: 'existing' | 'new') => void;
    manualDate: string;
    setManualDate: (v: string) => void;
    manualDuration: string;
    setManualDuration: (v: string) => void;
    manualNotes: string;
    setManualNotes: (v: string) => void;
    availableWorkouts: WorkoutTemplate[];
    selectedTemplate: WorkoutTemplate | null;
    setSelectedTemplate: (v: WorkoutTemplate | null) => void;
    manualExercises: ManualExercise[];
    updateManualExercise: (idx: number, field: string, value: unknown) => void;
    editorWorkout: Record<string, unknown>;
    setNewWorkout: (w: Record<string, unknown>) => void;
    normalizeEditorWorkout: (w: Record<string, unknown>) => Record<string, unknown>;
    supabase: SupabaseClient;
    onClose: () => void;
    onSaveExisting: () => void;
    onSaveNew: () => void;
}

/**
 * HistoryListManualModal
 *
 * Modal "Adicionar Histórico" extraído do HistoryList.tsx.
 * Toda a lógica (saveManualExisting, saveManualNew, buildManualFromTemplate)
 * permanece no HistoryList pai — este componente apenas renderiza o formulário.
 */
export function HistoryListManualModal({
    manualTab,
    setManualTab,
    manualDate,
    setManualDate,
    manualDuration,
    setManualDuration,
    manualNotes,
    setManualNotes,
    availableWorkouts,
    selectedTemplate,
    setSelectedTemplate,
    manualExercises,
    updateManualExercise,
    editorWorkout,
    setNewWorkout,
    normalizeEditorWorkout,
    supabase,
    onClose,
    onSaveExisting,
    onSaveNew,
}: ManualModalProps) {
    return (
        <div
            role="presentation"
            className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Adicionar Histórico"
                className="w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden relative"
                style={{
                    background: 'linear-gradient(160deg, rgba(20,18,10,0.98) 0%, rgba(10,10,10,0.99) 40%)',
                    borderColor: 'rgba(234,179,8,0.12)',
                    boxShadow: '0 32px 64px -16px rgba(0,0,0,0.8), inset 0 1px 0 rgba(234,179,8,0.1)',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-500/40 to-transparent" />
                <div className="p-4 flex items-center justify-between gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-yellow-500/80">Adicionar Histórico</h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-8 h-8 rounded-xl border flex items-center justify-center text-neutral-500 hover:text-white hover:border-yellow-500/40 transition-all"
                        style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
                        aria-label="Fechar"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="p-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div className="flex gap-2 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <button
                            type="button"
                            onClick={() => setManualTab('existing')}
                            className={`flex-1 px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${manualTab === 'existing' ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20' : 'text-neutral-500 hover:text-neutral-300'}`}
                        >
                            Usar Treino
                        </button>
                        <button
                            type="button"
                            onClick={() => setManualTab('new')}
                            className={`flex-1 px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${manualTab === 'new' ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20' : 'text-neutral-500 hover:text-neutral-300'}`}
                        >
                            Treino Novo
                        </button>
                    </div>
                </div>

                <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
                    <div>
                        <label className="text-[10px] uppercase font-bold text-neutral-500">Data e Hora</label>
                        <input
                            type="datetime-local"
                            value={manualDate}
                            onChange={(e) => setManualDate(e.target.value)}
                            className="w-full rounded-xl p-3 text-white outline-none border focus:border-yellow-500/40 transition-all"
                            style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
                        />
                    </div>
                    <div>
                        <label className="text-[10px] uppercase font-bold text-neutral-500">Duração (min)</label>
                        <input
                            type="number"
                            value={manualDuration}
                            onChange={(e) => setManualDuration(e.target.value)}
                            className="w-full rounded-xl p-3 text-white outline-none border focus:border-yellow-500/40 transition-all"
                            style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
                        />
                    </div>
                    <div>
                        <label className="text-[10px] uppercase font-bold text-neutral-500">Notas</label>
                        <textarea
                            value={manualNotes}
                            onChange={(e) => setManualNotes(e.target.value)}
                            className="w-full bg-neutral-800 border border-neutral-700 rounded-xl p-3 text-white outline-none h-20 resize-none"
                        />
                    </div>

                    {manualTab === 'existing' && (
                        <div className="space-y-2">
                            <label className="text-[10px] uppercase font-bold text-neutral-500">Selecionar Treino</label>
                            <select
                                value={selectedTemplate?.id || ''}
                                onChange={async (e) => {
                                    const id = e.target.value;
                                    if (!id) { setSelectedTemplate(null); return; }
                                    const { data } = await supabase
                                        .from('workouts')
                                        .select('id, name, exercises(*)')
                                        .eq('id', id)
                                        .single();
                                    setSelectedTemplate(data);
                                }}
                                className="w-full rounded-xl p-3 text-white outline-none border focus:border-yellow-500/40 transition-all"
                                style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
                            >
                                <option value="">Selecione...</option>
                                {availableWorkouts.map((t) => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </select>

                            {selectedTemplate && (
                                <div className="space-y-2">
                                    {manualExercises.map((ex, idx) => (
                                        <div key={idx} className="p-3 rounded-xl border space-y-2" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
                                            <p className="text-sm font-bold text-white">{ex.name}</p>
                                            <div className="grid grid-cols-4 gap-2">
                                                <div>
                                                    <label className="text-[10px] text-neutral-500">Sets</label>
                                                    <input type="number" value={ex.sets} onChange={(e) => updateManualExercise(idx, 'sets', e.target.value)} className="w-full bg-neutral-900 rounded p-2 text-center text-sm" />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] text-neutral-500">Reps</label>
                                                    <input value={ex.reps || ''} onChange={(e) => updateManualExercise(idx, 'reps', e.target.value)} className="w-full bg-neutral-900 rounded p-2 text-center text-sm" />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] text-neutral-500">Cadência</label>
                                                    <input value={ex.cadence || ''} onChange={(e) => updateManualExercise(idx, 'cadence', e.target.value)} className="w-full bg-neutral-900 rounded p-2 text-center text-sm" />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] text-neutral-500">Descanso (s)</label>
                                                    <input type="number" value={ex.restTime || 0} onChange={(e) => updateManualExercise(idx, 'restTime', e.target.value)} className="w-full bg-neutral-900 rounded p-2 text-center text-sm" />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-neutral-500">Pesos por série (kg)</label>
                                                <div className="grid grid-cols-4 gap-2">
                                                    {Array.from({ length: Number(ex.sets) || 0 }).map((_, sIdx) => (
                                                        <input
                                                            key={sIdx}
                                                            value={String(ex.weights?.[sIdx] ?? '')}
                                                            onChange={(e) => updateManualExercise(idx, 'weight', [sIdx, e.target.value])}
                                                            className="w-full bg-neutral-900 rounded p-2 text-center text-sm text-white outline-none focus:ring-1 ring-yellow-500 placeholder:text-neutral-600 placeholder:opacity-40 focus:placeholder:opacity-0"
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
                                                            onChange={(e) => updateManualExercise(idx, 'rep', [sIdx, e.target.value])}
                                                            className="w-full bg-neutral-900 rounded p-2 text-center text-sm text-white outline-none focus:ring-1 ring-yellow-500 placeholder:text-neutral-600 placeholder:opacity-40 focus:placeholder:opacity-0"
                                                            placeholder={`#${sIdx + 1}`}
                                                        />
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
                            <ExerciseEditor
                                workout={editorWorkout}
                                onSave={async (w) => setNewWorkout(normalizeEditorWorkout(w as Record<string, unknown>))}
                                onCancel={() => { }}
                                onChange={(w) => setNewWorkout(normalizeEditorWorkout(w as Record<string, unknown>))}
                                onSaved={() => { }}
                            />
                        </div>
                    )}
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
                    {manualTab === 'existing' ? (
                        <button
                            type="button"
                            onClick={onSaveExisting}
                            className="flex-1 py-3 rounded-xl font-black transition-all btn-gold-animated"
                        >
                            Salvar
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={onSaveNew}
                            className="flex-1 py-3 rounded-xl font-black transition-all btn-gold-animated"
                        >
                            Salvar
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

'use client';
/* eslint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions, jsx-a11y/control-has-associated-label */

import React from 'react';
import { Clock, Save, X } from 'lucide-react';
import { parseTrainingNumber } from '@/utils/trainingNumber';
import { useWorkoutContext } from './WorkoutContext';
import { isObject, buildBlocksByCount } from './utils';
import { UnknownRecord } from './types';

/**
 * ModalsComplexMethods
 *
 * Renders the "complex" advanced method modals that involve multi-block/stage
 * data entry: RestPause/SST, DropSet, Stripping, FST-7, Wave.
 *
 * Each modal reads its own slice of state from WorkoutContext — no props needed.
 */
export function ModalsComplexMethods() {
    const {
        clusterModal, setClusterModal, saveClusterModal, clusterRefs,
        restPauseModal, setRestPauseModal, saveRestPauseModal,
        dropSetModal, setDropSetModal, saveDropSetModal,
        strippingModal, setStrippingModal, saveStrippingModal,
        fst7Modal, setFst7Modal, saveFst7Modal,
        waveModal, setWaveModal, saveWaveModal,
        startTimer,
        deloadSuggestions,
    } = useWorkoutContext();

    return (
        <>
            {/* ── Rest-Pause / SST Modal ── */}
            {restPauseModal && (
                <div
                    className="fixed inset-0 z-[1400] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe"
                    onClick={() => setRestPauseModal(null)}
                >
                    <div
                        className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3 flex-shrink-0">
                            <div className="min-w-0">
                                <div className="text-xs font-black uppercase tracking-widest text-yellow-500">{String(restPauseModal?.label || '').trim() === 'SST' ? 'SST' : 'Rest-P'}</div>
                                <div className="text-white font-black text-lg truncate">Preencher minis</div>
                                <div className="text-xs text-neutral-400 truncate">
                                    {Number(restPauseModal?.miniSets || 0)} minis • descanso {Number(restPauseModal?.pauseSec || 0)}s
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setRestPauseModal(null)}
                                className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center"
                                aria-label="Fechar"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-4 space-y-3 flex-1 overflow-y-auto custom-scrollbar">
                            {restPauseModal?.error ? (
                                <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-neutral-200">
                                    {String(restPauseModal.error)}
                                </div>
                            ) : null}

                            <div className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                                <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Configurar {String(restPauseModal?.label || 'Rest-P')}</div>
                                <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    <input
                                        inputMode="decimal"
                                        value={String(restPauseModal?.miniSets ?? '')}
                                        onChange={(e) => {
                                            const v = parseTrainingNumber(e?.target?.value);
                                            setRestPauseModal((prev) => (prev && typeof prev === 'object' ? { ...prev, miniSets: v ?? 0, error: '' } : prev));
                                        }}
                                        placeholder="Minis (ex.: 2)"
                                        className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                                    />
                                    <input
                                        inputMode="decimal"
                                        value={String(restPauseModal?.pauseSec ?? '')}
                                        onChange={(e) => {
                                            const v = parseTrainingNumber(e?.target?.value);
                                            setRestPauseModal((prev) => (prev && typeof prev === 'object' ? { ...prev, pauseSec: v ?? 15, error: '' } : prev));
                                        }}
                                        placeholder="Descanso (s) (ex.: 15)"
                                        className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                                    />
                                    <input
                                        inputMode="decimal"
                                        value={String(restPauseModal?.weight ?? '')}
                                        onChange={(e) => {
                                            const v = e?.target?.value ?? '';
                                            setRestPauseModal((prev) => (prev && typeof prev === 'object' ? { ...prev, weight: v, error: '' } : prev));
                                        }}
                                        placeholder="kg"
                                        className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                                    />
                                </div>
                                <div className="mt-2 flex items-center justify-end">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const minisCount = Math.max(0, Math.floor(parseTrainingNumber(restPauseModal?.miniSets) ?? 0));
                                            if (!minisCount) {
                                                setRestPauseModal((prev) =>
                                                    prev && typeof prev === 'object' ? { ...prev, error: 'Defina a quantidade de minis.' } : prev,
                                                );
                                                return;
                                            }
                                            setRestPauseModal((prev) => {
                                                if (!prev || typeof prev !== 'object') return prev;
                                                return { ...prev, miniSets: minisCount, minis: Array.from({ length: minisCount }).map((): number | null => null), error: '' };
                                            });
                                        }}
                                        className="min-h-[40px] px-4 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800"
                                    >
                                        Gerar minis
                                    </button>
                                </div>
                            </div>

                            {Array.isArray(restPauseModal?.minis) &&
                                (((restPauseModal as UnknownRecord).minis as unknown[]) || []).map((mini, idx) => {
                                    const modal = restPauseModal as UnknownRecord;
                                    const minisArr = Array.isArray(modal.minis) ? (modal.minis as unknown[]) : [];
                                    const isLast = idx >= minisArr.length - 1;
                                    const restSec = Number(modal.pauseSec || 0);
                                    const safeRestSec = Number.isFinite(restSec) && restSec > 0 ? restSec : 0;
                                    return (
                                        <div key={`mini-${idx}`} className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3 relative">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="text-[10px] uppercase tracking-widest font-bold text-neutral-400">Mini {idx + 1}</div>
                                                {!isLast ? <div className="text-[10px] font-mono text-neutral-500">Descanso {safeRestSec}s</div> : <div />}
                                            </div>
                                            {!isLast && safeRestSec ? (
                                                <button
                                                    type="button"
                                                    onClick={() => { startTimer(safeRestSec, { kind: 'rest_pause', key: modal.key, miniIndex: idx }); }}
                                                    className="absolute top-3 right-3 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 hover:bg-neutral-800 active:scale-95 transition-transform z-10"
                                                    aria-label={`Iniciar descanso ${safeRestSec}s`}
                                                >
                                                    <Clock size={14} className="text-yellow-500" />
                                                    <span className="text-xs font-black">{safeRestSec}s</span>
                                                </button>
                                            ) : null}
                                            <div className="mt-2 grid grid-cols-2 gap-2">
                                                <input
                                                    inputMode="decimal"
                                                    value={String(restPauseModal?.weight ?? '')}
                                                    onChange={(e) => {
                                                        const v = e?.target?.value ?? '';
                                                        setRestPauseModal((prev) => (prev && typeof prev === 'object' ? { ...prev, weight: v, error: '' } : prev));
                                                    }}
                                                    placeholder="kg"
                                                    className="w-full bg-black/30 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                                                />
                                                <input
                                                    inputMode="decimal"
                                                    value={mini == null ? '' : String(mini)}
                                                    onChange={(e) => {
                                                        const n = parseTrainingNumber(e?.target?.value);
                                                        const next = n != null && n > 0 ? n : null;
                                                        setRestPauseModal((prev) => {
                                                            if (!prev || typeof prev !== 'object') return prev;
                                                            const list = Array.isArray(prev.minis) ? [...prev.minis] : [];
                                                            list[idx] = next;
                                                            return { ...prev, minis: list, error: '' };
                                                        });
                                                    }}
                                                    placeholder="reps"
                                                    className="w-full bg-black/30 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                                                />
                                            </div>
                                            {!isLast && safeRestSec ? <div className="mt-2 text-xs text-neutral-500">Descanso: {safeRestSec}s</div> : null}
                                        </div>
                                    );
                                })}

                            <div className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                                <div className="text-xs font-black uppercase tracking-widest text-neutral-400">RPE da série</div>
                                <input
                                    inputMode="decimal"
                                    value={String(restPauseModal?.rpe ?? '')}
                                    onChange={(e) => {
                                        const v = e?.target?.value ?? '';
                                        setRestPauseModal((prev) => (prev && typeof prev === 'object' ? { ...prev, rpe: v, error: '' } : prev));
                                    }}
                                    placeholder="RPE (0-10)"
                                    className="mt-2 w-full bg-black/30 border border-yellow-500/30 rounded-xl px-3 py-2 text-sm text-yellow-500 font-bold outline-none focus:ring-1 ring-yellow-500"
                                />
                            </div>
                        </div>

                        <div className="p-4 border-t border-neutral-800 flex items-center justify-between gap-2 flex-shrink-0">
                            <button
                                type="button"
                                onClick={() => setRestPauseModal(null)}
                                className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={saveRestPauseModal}
                                className="min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest hover:bg-yellow-400 inline-flex items-center gap-2"
                            >
                                <Save size={16} />
                                Salvar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Drop-Set Modal ── */}
            {dropSetModal && (() => {
                type DeloadEntrySuggestion = { weight?: number | null; reps?: number | null; rpe?: number | null };
                const modalKey = String((dropSetModal as UnknownRecord | null)?.key ?? '').trim();
                const suggestionValue = modalKey ? deloadSuggestions[modalKey] : null;
                const suggestion: DeloadEntrySuggestion | null = isObject(suggestionValue) ? (suggestionValue as DeloadEntrySuggestion) : null;
                const weightPlaceholder = suggestion?.weight != null ? `${suggestion.weight} kg` : 'kg';
                const repsPlaceholder = suggestion?.reps != null ? String(suggestion.reps) : 'reps';
                return (
                    <div
                        className="fixed inset-0 z-[1400] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe"
                        onClick={() => setDropSetModal(null)}
                    >
                        <div
                            className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="text-xs font-black uppercase tracking-widest text-yellow-500">{String(dropSetModal?.label || 'Drop')}</div>
                                    <div className="text-white font-black text-lg truncate">Preencher etapas</div>
                                    <div className="text-xs text-neutral-400 truncate">{Array.isArray(dropSetModal?.stages) ? dropSetModal.stages.length : 0} etapas</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setDropSetModal(null)}
                                    className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center"
                                    aria-label="Fechar"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto custom-scrollbar">
                                {dropSetModal?.error ? (
                                    <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-neutral-200">
                                        {String(dropSetModal.error)}
                                    </div>
                                ) : null}

                                <div className="flex items-center gap-2">
                                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Etapas</div>
                                </div>

                                {Array.isArray(dropSetModal?.stages) &&
                                    ((dropSetModal as UnknownRecord).stages as unknown[]).map((stage, idx) => {
                                        const st = isObject(stage) ? (stage as UnknownRecord) : ({} as UnknownRecord);
                                        const w = String(st.weight ?? '');
                                        const r = st.reps == null ? '' : String(st.reps);
                                        return (
                                            <div key={`stage-${idx}`} className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                                                <div className="text-[10px] uppercase tracking-widest font-bold text-neutral-400 mb-2">Etapa {idx + 1}</div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <input
                                                        inputMode="decimal"
                                                        value={w}
                                                        onChange={(e) => {
                                                            const v = e?.target?.value ?? '';
                                                            setDropSetModal((prev) => {
                                                                if (!prev || typeof prev !== 'object') return prev;
                                                                const list = Array.isArray(prev.stages) ? [...prev.stages] : [];
                                                                const cur = list[idx] && typeof list[idx] === 'object' ? list[idx] : {};
                                                                list[idx] = { ...cur, weight: v };
                                                                return { ...prev, stages: list, error: '' };
                                                            });
                                                        }}
                                                        placeholder={weightPlaceholder}
                                                        className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                                                    />
                                                    <input
                                                        inputMode="decimal"
                                                        value={r}
                                                        onChange={(e) => {
                                                            const n = parseTrainingNumber(e?.target?.value);
                                                            const next = n != null && n > 0 ? n : null;
                                                            setDropSetModal((prev) => {
                                                                if (!prev || typeof prev !== 'object') return prev;
                                                                const list = Array.isArray(prev.stages) ? [...prev.stages] : [];
                                                                const cur = list[idx] && typeof list[idx] === 'object' ? list[idx] : {};
                                                                list[idx] = { ...cur, reps: next };
                                                                return { ...prev, stages: list, error: '' };
                                                            });
                                                        }}
                                                        placeholder={repsPlaceholder}
                                                        className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                            </div>

                            <div className="p-4 border-t border-neutral-800 flex items-center justify-between gap-2">
                                <button
                                    type="button"
                                    onClick={() => setDropSetModal(null)}
                                    className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={saveDropSetModal}
                                    className="min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest hover:bg-yellow-400 inline-flex items-center gap-2"
                                >
                                    <Save size={16} />
                                    Salvar
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ── Stripping Modal ── */}
            {strippingModal && (() => {
                const stages: Array<{ weight: string | null; reps: number | null }> = Array.isArray(strippingModal.stages)
                    ? (strippingModal.stages as Array<{ weight: string | null; reps: number | null }>)
                    : [];
                return (
                    <div className="fixed inset-0 z-[1400] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe" onClick={() => setStrippingModal(null)}>
                        <div className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                            <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Stripping</div>
                                    <div className="text-white font-black text-lg truncate">Etapas de remoção de carga</div>
                                    <div className="text-xs text-neutral-400">Remova carga progressivamente a cada etapa • {stages.length} etapas</div>
                                </div>
                                <button type="button" onClick={() => setStrippingModal(null)} className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center" aria-label="Fechar"><X size={18} /></button>
                            </div>
                            <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto custom-scrollbar">
                                {strippingModal.error ? <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-neutral-200">{String(strippingModal.error)}</div> : null}
                                <div className="flex gap-2 mb-2">
                                    <button type="button" onClick={() => setStrippingModal((prev) => { if (!prev || typeof prev !== 'object') return prev; const list = Array.isArray(prev.stages) ? [...(prev.stages as unknown[])] : []; list.push({ weight: '', reps: null }); return { ...prev, stages: list, error: '' }; })} className="px-3 py-1.5 rounded-lg bg-neutral-800 border border-neutral-700 text-xs text-neutral-300 hover:bg-neutral-700">+ Etapa</button>
                                    {stages.length > 2 && <button type="button" onClick={() => setStrippingModal((prev) => { if (!prev || typeof prev !== 'object') return prev; const list = Array.isArray(prev.stages) ? [...(prev.stages as unknown[])] : []; list.pop(); return { ...prev, stages: list, error: '' }; })} className="px-3 py-1.5 rounded-lg bg-neutral-800 border border-neutral-700 text-xs text-neutral-300 hover:bg-neutral-700">- Etapa</button>}
                                </div>
                                {stages.map((s, idx) => (
                                    <div key={idx} className="rounded-xl bg-neutral-800/60 border border-neutral-700 p-3 space-y-2">
                                        <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Etapa {idx + 1}</div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <input inputMode="decimal" value={String(s?.weight ?? '')} onChange={(e) => setStrippingModal((prev) => { if (!prev || typeof prev !== 'object') return prev; const list = [...(prev.stages as unknown[])]; const cur = (list[idx] && typeof list[idx] === 'object' ? list[idx] : {}) as UnknownRecord; list[idx] = { ...cur, weight: e?.target?.value ?? '' }; return { ...prev, stages: list, error: '' }; })} placeholder="Peso (kg)" className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                                            <input inputMode="decimal" value={s?.reps != null ? String(s.reps) : ''} onChange={(e) => { const n = parseTrainingNumber(e?.target?.value); setStrippingModal((prev) => { if (!prev || typeof prev !== 'object') return prev; const list = [...(prev.stages as unknown[])]; const cur = (list[idx] && typeof list[idx] === 'object' ? list[idx] : {}) as UnknownRecord; list[idx] = { ...cur, reps: n != null && n > 0 ? n : null }; return { ...prev, stages: list, error: '' }; }); }} placeholder="Reps" className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="p-4 border-t border-neutral-800 flex items-center justify-between gap-2">
                                <button type="button" onClick={() => setStrippingModal(null)} className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800">Cancelar</button>
                                <button type="button" onClick={saveStrippingModal} className="min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest hover:bg-yellow-400 inline-flex items-center gap-2"><Save size={16} />Salvar</button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ── FST-7 Modal ── */}
            {fst7Modal && (() => {
                const blocks: Array<{ weight: string | null; reps: number | null }> = Array.isArray(fst7Modal.blocks)
                    ? (fst7Modal.blocks as Array<{ weight: string | null; reps: number | null }>)
                    : Array.from({ length: 7 }).map(() => ({ weight: null, reps: null }));
                const intraSec = parseTrainingNumber(fst7Modal.intra_sec) ?? 30;
                return (
                    <div className="fixed inset-0 z-[1400] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe" onClick={() => setFst7Modal(null)}>
                        <div className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                            <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="text-xs font-black uppercase tracking-widest text-yellow-500">FST-7</div>
                                    <div className="text-white font-black text-lg truncate">7 séries com pump intenso</div>
                                    <div className="text-xs text-neutral-400">Fascia Stretch Training • 7 blocos com descanso e alongamento</div>
                                </div>
                                <button type="button" onClick={() => setFst7Modal(null)} className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center" aria-label="Fechar"><X size={18} /></button>
                            </div>
                            <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto custom-scrollbar">
                                {fst7Modal.error ? <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-neutral-200">{String(fst7Modal.error)}</div> : null}
                                <div className="space-y-1">
                                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Descanso intra-série</div>
                                    <div className="flex gap-2">
                                        {[30, 35, 40, 45].map((s) => (
                                            <button key={s} type="button" onClick={() => setFst7Modal((prev) => prev && typeof prev === 'object' ? { ...prev, intra_sec: s } : prev)} className={`px-3 py-1.5 rounded-lg text-xs font-black border transition-colors ${intraSec === s ? 'bg-yellow-500 text-black border-yellow-500' : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700'}`}>{s}s</button>
                                        ))}
                                    </div>
                                </div>
                                {blocks.map((b, idx) => (
                                    <div key={idx} className="rounded-xl bg-neutral-800/60 border border-neutral-700 p-3 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Bloco {idx + 1}</div>
                                            {idx < blocks.length - 1 && <div className="text-[10px] text-neutral-500 inline-flex items-center gap-1"><Clock size={10} />{intraSec}s descanso</div>}
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <input inputMode="decimal" value={String(b?.weight ?? '')} onChange={(e) => setFst7Modal((prev) => { if (!prev || typeof prev !== 'object') return prev; const list = [...(prev.blocks as unknown[])]; const cur = (list[idx] && typeof list[idx] === 'object' ? list[idx] : {}) as UnknownRecord; list[idx] = { ...cur, weight: e?.target?.value ?? '' }; return { ...prev, blocks: list, error: '' }; })} placeholder="Peso (kg)" className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                                            <input inputMode="decimal" value={b?.reps != null ? String(b.reps) : ''} onChange={(e) => { const n = parseTrainingNumber(e?.target?.value); setFst7Modal((prev) => { if (!prev || typeof prev !== 'object') return prev; const list = [...(prev.blocks as unknown[])]; const cur = (list[idx] && typeof list[idx] === 'object' ? list[idx] : {}) as UnknownRecord; list[idx] = { ...cur, reps: n != null && n > 0 ? n : null }; return { ...prev, blocks: list, error: '' }; }); }} placeholder="Reps" className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="p-4 border-t border-neutral-800 flex items-center justify-between gap-2">
                                <button type="button" onClick={() => setFst7Modal(null)} className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800">Cancelar</button>
                                <button type="button" onClick={saveFst7Modal} className="min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest hover:bg-yellow-400 inline-flex items-center gap-2"><Save size={16} />Salvar</button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ── Wave (Onda) Modal ── */}
            {waveModal && (() => {
                const waves: Array<{ heavy: number | null; medium: number | null; ultra: number | null }> = Array.isArray(waveModal.waves)
                    ? (waveModal.waves as Array<{ heavy: number | null; medium: number | null; ultra: number | null }>)
                    : [{ heavy: 3, medium: 5, ultra: 2 }, { heavy: 3, medium: 5, ultra: 2 }];
                return (
                    <div className="fixed inset-0 z-[1400] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe" onClick={() => setWaveModal(null)}>
                        <div className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                            <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Onda (Wave Loading)</div>
                                    <div className="text-white font-black text-lg">Ondas de carga progressiva</div>
                                    <div className="text-xs text-neutral-400">Pesado → Médio → Ultra leve • repita por {waves.length} ondas</div>
                                </div>
                                <button type="button" onClick={() => setWaveModal(null)} className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center" aria-label="Fechar"><X size={18} /></button>
                            </div>
                            <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto custom-scrollbar">
                                {waveModal.error ? <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-neutral-200">{String(waveModal.error)}</div> : null}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Peso base (kg)</div>
                                        <input inputMode="decimal" value={String(waveModal.weight ?? '')} onChange={(e) => setWaveModal((prev) => prev && typeof prev === 'object' ? { ...prev, weight: e?.target?.value ?? '', error: '' } : prev)} placeholder="Ex: 80" className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                                    </div>
                                    <div className="space-y-1">
                                        <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Nº de ondas</div>
                                        <div className="flex gap-2">
                                            {[1, 2, 3].map((n) => (
                                                <button key={n} type="button" onClick={() => setWaveModal((prev) => { if (!prev || typeof prev !== 'object') return prev; const cur = Array.isArray(prev.waves) ? (prev.waves as unknown[]) : []; const next = cur.length < n ? [...cur, ...Array.from({ length: n - cur.length }).map(() => ({ heavy: 3, medium: 5, ultra: 2 }))] : cur.slice(0, n); return { ...prev, waves: next }; })} className={`flex-1 min-h-[36px] rounded-lg text-xs font-black border transition-colors ${waves.length === n ? 'bg-yellow-500 text-black border-yellow-500' : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700'}`}>{n}</button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                {waves.map((w, idx) => (
                                    <div key={idx} className="rounded-xl bg-neutral-800/60 border border-neutral-700 p-3 space-y-2">
                                        <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Onda {idx + 1}</div>
                                        <div className="grid grid-cols-3 gap-2">
                                            <div className="space-y-1">
                                                <div className="text-[10px] text-neutral-500 uppercase tracking-widest">Pesado (reps)</div>
                                                <input inputMode="numeric" value={w?.heavy != null ? String(w.heavy) : ''} onChange={(e) => { const n = parseTrainingNumber(e?.target?.value); setWaveModal((prev) => { if (!prev || typeof prev !== 'object') return prev; const list = [...(prev.waves as unknown[])]; const cur = (list[idx] && typeof list[idx] === 'object' ? list[idx] : {}) as UnknownRecord; list[idx] = { ...cur, heavy: n != null ? n : null }; return { ...prev, waves: list, error: '' }; }); }} placeholder="3" className="w-full bg-black/30 border border-neutral-700 rounded-lg px-2 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                                            </div>
                                            <div className="space-y-1">
                                                <div className="text-[10px] text-neutral-500 uppercase tracking-widest">Médio (reps)</div>
                                                <input inputMode="numeric" value={w?.medium != null ? String(w.medium) : ''} onChange={(e) => { const n = parseTrainingNumber(e?.target?.value); setWaveModal((prev) => { if (!prev || typeof prev !== 'object') return prev; const list = [...(prev.waves as unknown[])]; const cur = (list[idx] && typeof list[idx] === 'object' ? list[idx] : {}) as UnknownRecord; list[idx] = { ...cur, medium: n != null ? n : null }; return { ...prev, waves: list, error: '' }; }); }} placeholder="5" className="w-full bg-black/30 border border-neutral-700 rounded-lg px-2 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                                            </div>
                                            <div className="space-y-1">
                                                <div className="text-[10px] text-neutral-500 uppercase tracking-widest">Ultra leve (reps)</div>
                                                <input inputMode="numeric" value={w?.ultra != null ? String(w.ultra) : ''} onChange={(e) => { const n = parseTrainingNumber(e?.target?.value); setWaveModal((prev) => { if (!prev || typeof prev !== 'object') return prev; const list = [...(prev.waves as unknown[])]; const cur = (list[idx] && typeof list[idx] === 'object' ? list[idx] : {}) as UnknownRecord; list[idx] = { ...cur, ultra: n != null ? n : null }; return { ...prev, waves: list, error: '' }; }); }} placeholder="2" className="w-full bg-black/30 border border-neutral-700 rounded-lg px-2 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                <div className="space-y-1">
                                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400">RPE (opcional)</div>
                                    <input inputMode="decimal" value={String(waveModal.rpe ?? '')} onChange={(e) => setWaveModal((prev) => prev && typeof prev === 'object' ? { ...prev, rpe: e?.target?.value ?? '' } : prev)} placeholder="1–10" className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                                </div>
                            </div>
                            <div className="p-4 border-t border-neutral-800 flex items-center justify-between gap-2">
                                <button type="button" onClick={() => setWaveModal(null)} className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800">Cancelar</button>
                                <button type="button" onClick={saveWaveModal} className="min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest hover:bg-yellow-400 inline-flex items-center gap-2"><Save size={16} />Salvar</button>
                            </div>
                        </div>
                    </div>
                );
            })()}
            {/* ── Cluster Modal ── */}
            {clusterModal && (
                <div
                    className="fixed inset-0 z-[1400] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe"
                    onClick={() => setClusterModal(null)}
                >
                    <div
                        className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Cluster</div>
                                <div className="text-white font-black text-lg truncate">Preencher blocos</div>
                                <div className="text-xs text-neutral-400 truncate">
                                    {Array.isArray(clusterModal?.plannedBlocks) ? `${clusterModal.plannedBlocks.length} blocos` : 'Blocos'}
                                    {Array.isArray(clusterModal?.restsByGap) && clusterModal.restsByGap.length
                                        ? ` • descanso ${clusterModal.restsByGap[0]}s`
                                        : clusterModal?.intra
                                            ? ` • descanso ${clusterModal.intra}s`
                                            : ''}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setClusterModal(null)}
                                className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center"
                                aria-label="Fechar"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto custom-scrollbar">
                            {clusterModal?.error ? (
                                <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-neutral-200">
                                    {String(clusterModal.error)}
                                </div>
                            ) : null}

                            {Array.isArray(clusterModal?.blocks) && clusterModal.blocks.length > 0 ? (
                                <div className="flex items-center justify-end">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setClusterModal((prev) => {
                                                if (!prev || typeof prev !== 'object') return prev;
                                                const plannedBlocks = Array.isArray(prev?.plannedBlocks) ? prev.plannedBlocks : [];
                                                const restsByGap = Array.isArray(prev?.restsByGap) ? prev.restsByGap : [];
                                                const baseWeight = String(prev?.baseWeight ?? '').trim();
                                                const blocks = plannedBlocks.map((p) => ({ planned: p, weight: baseWeight, reps: null as number | null }));
                                                return { ...prev, restsByGap, blocks, error: '' };
                                            });
                                        }}
                                        className="min-h-[40px] px-4 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800"
                                    >
                                        Resetar pesos
                                    </button>
                                </div>
                            ) : null}

                            {!Array.isArray(clusterModal?.blocks) || clusterModal.blocks.length === 0 ? (
                                <div className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Configurar Cluster</div>
                                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                                        <input
                                            inputMode="decimal"
                                            value={String((((clusterModal as UnknownRecord | null)?.planned as UnknownRecord | null)?.total_reps ?? '') as unknown)}
                                            onChange={(e) => {
                                                const v = parseTrainingNumber(e?.target?.value);
                                                setClusterModal((prev) => {
                                                    if (!isObject(prev)) return prev;
                                                    const planned: UnknownRecord = isObject(prev.planned) ? (prev.planned as UnknownRecord) : {};
                                                    return { ...prev, planned: { ...planned, total_reps: v ?? null }, error: '' };
                                                });
                                            }}
                                            placeholder="Total reps (ex.: 12)"
                                            className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                                        />
                                        <input
                                            inputMode="decimal"
                                            value={String((((clusterModal as UnknownRecord | null)?.planned as UnknownRecord | null)?.cluster_blocks_count ?? '') as unknown)}
                                            onChange={(e) => {
                                                const v = parseTrainingNumber(e?.target?.value);
                                                setClusterModal((prev) => {
                                                    if (!isObject(prev)) return prev;
                                                    const planned: UnknownRecord = isObject(prev.planned) ? (prev.planned as UnknownRecord) : {};
                                                    return { ...prev, planned: { ...planned, cluster_blocks_count: v ?? null }, error: '' };
                                                });
                                            }}
                                            placeholder="Blocos (ex.: 3)"
                                            className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                                        />
                                        <input
                                            inputMode="decimal"
                                            value={String((((clusterModal as UnknownRecord | null)?.planned as UnknownRecord | null)?.intra_rest_sec ?? (clusterModal as UnknownRecord | null)?.intra ?? '') as unknown)}
                                            onChange={(e) => {
                                                const v = parseTrainingNumber(e?.target?.value);
                                                setClusterModal((prev) => {
                                                    if (!isObject(prev)) return prev;
                                                    const planned: UnknownRecord = isObject(prev.planned) ? (prev.planned as UnknownRecord) : {};
                                                    return { ...prev, planned: { ...planned, intra_rest_sec: v ?? null }, intra: v ?? prev.intra ?? 15, error: '' };
                                                });
                                            }}
                                            placeholder="Descanso (s) (ex.: 15)"
                                            className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                                        />
                                    </div>
                                    <div className="mt-2 flex items-center justify-end">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const planned = (clusterModal as UnknownRecord | null)?.planned as UnknownRecord | null;
                                                const total = parseTrainingNumber(planned?.total_reps);
                                                const blocksCount = parseTrainingNumber(planned?.cluster_blocks_count);
                                                const intra = parseTrainingNumber(planned?.intra_rest_sec) ?? parseTrainingNumber((clusterModal as UnknownRecord | null)?.intra) ?? 15;
                                                const plannedBlocks = buildBlocksByCount(total, blocksCount);
                                                if (!plannedBlocks.length) {
                                                    setClusterModal((prev) =>
                                                        prev && typeof prev === 'object'
                                                            ? { ...prev, error: 'Configuração inválida. Preencha total reps e quantidade de blocos.' }
                                                            : prev,
                                                    );
                                                    return;
                                                }
                                                const restsByGap = plannedBlocks.length > 1 ? Array.from({ length: plannedBlocks.length - 1 }).map(() => intra) : [];
                                                const baseWeight = String(clusterModal?.baseWeight ?? '').trim();
                                                const blocks = plannedBlocks.map((p) => ({ planned: p, weight: baseWeight, reps: null as number | null }));
                                                setClusterModal((prev) => {
                                                    if (!prev || typeof prev !== 'object') return prev;
                                                    const pl = prev.planned && typeof prev.planned === 'object' ? prev.planned : {};
                                                    return {
                                                        ...prev,
                                                        planned: { ...pl, total_reps: total ?? null, cluster_blocks_count: blocksCount ?? null, intra_rest_sec: intra ?? null },
                                                        plannedBlocks,
                                                        restsByGap,
                                                        blocks,
                                                        error: '',
                                                    };
                                                });
                                            }}
                                            className="min-h-[40px] px-4 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800"
                                        >
                                            Gerar blocos
                                        </button>
                                    </div>
                                </div>
                            ) : null}

                            {Array.isArray(clusterModal?.blocks) &&
                                ((clusterModal as UnknownRecord).blocks as unknown[]).map((b, idx) => {
                                    const modal = clusterModal as UnknownRecord;
                                    const modalBlocks = Array.isArray(modal.blocks) ? (modal.blocks as unknown[]) : [];
                                    const block = isObject(b) ? (b as UnknownRecord) : ({} as UnknownRecord);
                                    const plannedValue = block.planned ?? null;
                                    const plannedLabel = plannedValue == null ? '' : String(plannedValue);
                                    const repsValue = block.reps == null ? '' : String(block.reps);
                                    const weightValue = String(block.weight ?? '');
                                    const isLast = idx >= modalBlocks.length - 1;
                                    const restsByGap: unknown[] = Array.isArray(modal.restsByGap) ? (modal.restsByGap as unknown[]) : [];
                                    const restSec = restsByGap.length ? Number(restsByGap[idx]) : Number(modal.intra);
                                    const safeRestSec = Number.isFinite(restSec) && restSec > 0 ? restSec : 0;
                                    return (
                                        <div key={`cluster-block-${idx}`} className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3 relative">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="text-[10px] uppercase tracking-widest font-bold text-neutral-400">Bloco {idx + 1}</div>
                                                {plannedLabel ? <div className="text-[10px] font-mono text-neutral-500">plan {plannedLabel}</div> : <div />}
                                            </div>
                                            {!isLast && safeRestSec ? (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        startTimer(safeRestSec, { kind: 'cluster', key: modal.key, blockIndex: idx });
                                                    }}
                                                    className="absolute top-3 right-3 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 hover:bg-neutral-800 active:scale-95 transition-transform z-10"
                                                    aria-label={`Iniciar descanso ${safeRestSec}s`}
                                                >
                                                    <Clock size={14} className="text-yellow-500" />
                                                    <span className="text-xs font-black">{safeRestSec}s</span>
                                                </button>
                                            ) : null}
                                            <div className="mt-2 grid grid-cols-2 gap-2">
                                                <input
                                                    inputMode="decimal"
                                                    value={weightValue}
                                                    onChange={(e) => {
                                                        const v = e?.target?.value ?? '';
                                                        setClusterModal((prev) => {
                                                            if (!prev || typeof prev !== 'object') return prev;
                                                            const nextBlocks = Array.isArray(prev.blocks) ? [...prev.blocks] : [];
                                                            const cur = nextBlocks[idx] && typeof nextBlocks[idx] === 'object' ? nextBlocks[idx] : {};
                                                            nextBlocks[idx] = { ...cur, weight: v };
                                                            return { ...prev, blocks: nextBlocks, error: '' };
                                                        });
                                                    }}
                                                    placeholder="kg"
                                                    className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                                                />
                                                <input
                                                    inputMode="decimal"
                                                    value={repsValue}
                                                    ref={(el) => {
                                                        if (!clusterRefs.current) clusterRefs.current = {};
                                                        const key = String(modal.key || '');
                                                        if (!clusterRefs.current[key]) clusterRefs.current[key] = [];
                                                        clusterRefs.current[key][idx] = el;
                                                    }}
                                                    onChange={(e) => {
                                                        const v = parseTrainingNumber(e?.target?.value);
                                                        const next = v != null && v > 0 ? v : null;
                                                        setClusterModal((prev) => {
                                                            if (!prev || typeof prev !== 'object') return prev;
                                                            const nextBlocks = Array.isArray(prev.blocks) ? [...prev.blocks] : [];
                                                            const cur = nextBlocks[idx] && typeof nextBlocks[idx] === 'object' ? nextBlocks[idx] : {};
                                                            nextBlocks[idx] = { ...cur, reps: next };
                                                            return { ...prev, blocks: nextBlocks, error: '' };
                                                        });
                                                    }}
                                                    placeholder="reps"
                                                    className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500"
                                                />
                                            </div>
                                            {!isLast ? <div className="mt-2 text-xs text-neutral-500">Descanso: {safeRestSec}s</div> : null}
                                        </div>
                                    );
                                })}

                            <div className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-3">
                                <div className="text-xs font-black uppercase tracking-widest text-neutral-400">RPE da série</div>
                                <input
                                    inputMode="decimal"
                                    value={String(clusterModal?.rpe ?? '')}
                                    onChange={(e) => {
                                        const v = e?.target?.value ?? '';
                                        setClusterModal((prev) => (prev && typeof prev === 'object' ? { ...prev, rpe: v, error: '' } : prev));
                                    }}
                                    placeholder="RPE (0-10)"
                                    className="mt-2 w-full bg-black/30 border border-yellow-500/30 rounded-lg px-3 py-2 text-sm text-yellow-500 font-bold outline-none focus:ring-1 ring-yellow-500"
                                />
                            </div>
                        </div>

                        <div className="p-4 border-t border-neutral-800 flex items-center justify-between gap-2">
                            <button
                                type="button"
                                onClick={() => setClusterModal(null)}
                                className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={saveClusterModal}
                                disabled={!Array.isArray(clusterModal?.blocks) || clusterModal.blocks.length === 0}
                                className={
                                    !Array.isArray(clusterModal?.blocks) || clusterModal.blocks.length === 0
                                        ? 'min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500/40 text-black/60 font-black text-xs uppercase tracking-widest inline-flex items-center gap-2 cursor-not-allowed'
                                        : 'min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest hover:bg-yellow-400 inline-flex items-center gap-2'
                                }
                            >
                                <Save size={16} />
                                Salvar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

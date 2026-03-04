'use client';

import React from 'react';
import { Save, X } from 'lucide-react';
import { parseTrainingNumber } from '@/utils/trainingNumber';
import { useWorkoutContext } from './WorkoutContext';
import { UnknownRecord } from './types';

/**
 * ModalsSimpleMethods
 *
 * Renders the "simple" advanced method modals that share a similar structure
 * (single-set with optional RPE): HeavyDuty, PontoZero, ForcedReps,
 * NegativeReps, PartialReps, Sistema21, GroupMethod.
 *
 * Each modal reads its own slice of state from WorkoutContext — no props needed.
 */
export function ModalsSimpleMethods() {
    const {
        heavyDutyModal, setHeavyDutyModal, saveHeavyDutyModal,
        pontoZeroModal, setPontoZeroModal, savePontoZeroModal,
        forcedRepsModal, setForcedRepsModal, saveForcedRepsModal,
        negativeRepsModal, setNegativeRepsModal, saveNegativeRepsModal,
        partialRepsModal, setPartialRepsModal, savePartialRepsModal,
        sistema21Modal, setSistema21Modal, saveSistema21Modal,
        groupMethodModal, setGroupMethodModal, saveGroupMethodModal,
    } = useWorkoutContext();

    return (
        <>
            {/* ── Heavy Duty Modal ── */}
            {heavyDutyModal && (
                <div className="fixed inset-0 z-[1400] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe" onClick={() => setHeavyDutyModal(null)}>
                    <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Heavy Duty</div>
                                <div className="text-white font-black text-lg">Alta intensidade até a falha</div>
                                <div className="text-xs text-neutral-400">Treine até a falha total • Opcional: forçadas e negativas</div>
                            </div>
                            <button type="button" onClick={() => setHeavyDutyModal(null)} className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center" aria-label="Fechar"><X size={18} /></button>
                        </div>
                        <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto custom-scrollbar">
                            {heavyDutyModal.error ? <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-neutral-200">{String(heavyDutyModal.error)}</div> : null}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Peso (kg)</div>
                                    <input inputMode="decimal" value={String(heavyDutyModal.weight ?? '')} onChange={(e) => setHeavyDutyModal((prev) => prev && typeof prev === 'object' ? { ...prev, weight: e?.target?.value ?? '', error: '' } : prev)} placeholder="Ex: 80" className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                                </div>
                                <div className="space-y-1">
                                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Reps até falha</div>
                                    <input inputMode="numeric" value={String(heavyDutyModal.reps_failure ?? '')} onChange={(e) => setHeavyDutyModal((prev) => prev && typeof prev === 'object' ? { ...prev, reps_failure: e?.target?.value ?? '', error: '' } : prev)} placeholder="Ex: 8" className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                                </div>
                            </div>
                            <div className="rounded-xl bg-neutral-800/40 border border-neutral-700/50 p-3 space-y-3">
                                <div className="text-xs font-black uppercase tracking-widest text-neutral-500">Opcional</div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <div className="text-xs text-neutral-400">Reps Forçadas</div>
                                        <input inputMode="numeric" value={String(heavyDutyModal.forced_count ?? '')} onChange={(e) => setHeavyDutyModal((prev) => prev && typeof prev === 'object' ? { ...prev, forced_count: e?.target?.value ?? '' } : prev)} placeholder="0" className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                                    </div>
                                    <div className="space-y-1">
                                        <div className="text-xs text-neutral-400">Reps Negativas</div>
                                        <input inputMode="numeric" value={String(heavyDutyModal.negatives_count ?? '')} onChange={(e) => setHeavyDutyModal((prev) => prev && typeof prev === 'object' ? { ...prev, negatives_count: e?.target?.value ?? '' } : prev)} placeholder="0" className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                                    </div>
                                    <div className="space-y-1">
                                        <div className="text-xs text-neutral-400">Excêntrico (seg/rep)</div>
                                        <input inputMode="decimal" value={String(heavyDutyModal.eccentric_sec ?? '')} onChange={(e) => setHeavyDutyModal((prev) => prev && typeof prev === 'object' ? { ...prev, eccentric_sec: e?.target?.value ?? '' } : prev)} placeholder="0" className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                                    </div>
                                    <div className="space-y-1">
                                        <div className="text-xs text-neutral-400">RPE</div>
                                        <input inputMode="decimal" value={String(heavyDutyModal.rpe ?? '')} onChange={(e) => setHeavyDutyModal((prev) => prev && typeof prev === 'object' ? { ...prev, rpe: e?.target?.value ?? '' } : prev)} placeholder="1–10" className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="p-4 border-t border-neutral-800 flex items-center justify-between gap-2">
                            <button type="button" onClick={() => setHeavyDutyModal(null)} className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800">Cancelar</button>
                            <button type="button" onClick={saveHeavyDutyModal} className="min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest hover:bg-yellow-400 inline-flex items-center gap-2"><Save size={16} />Salvar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Ponto Zero Modal ── */}
            {pontoZeroModal && (
                <div className="fixed inset-0 z-[1400] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe" onClick={() => setPontoZeroModal(null)}>
                    <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Ponto Zero</div>
                                <div className="text-white font-black text-lg">Hold no ponto de alongamento</div>
                                <div className="text-xs text-neutral-400">Execute as reps e segure no ponto máximo de alongamento</div>
                            </div>
                            <button type="button" onClick={() => setPontoZeroModal(null)} className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center" aria-label="Fechar"><X size={18} /></button>
                        </div>
                        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
                            {pontoZeroModal.error ? <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-neutral-200">{String(pontoZeroModal.error)}</div> : null}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Peso (kg)</div>
                                    <input inputMode="decimal" value={String(pontoZeroModal.weight ?? '')} onChange={(e) => setPontoZeroModal((prev) => prev && typeof prev === 'object' ? { ...prev, weight: e?.target?.value ?? '', error: '' } : prev)} placeholder="Ex: 60" className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                                </div>
                                <div className="space-y-1">
                                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Reps</div>
                                    <input inputMode="numeric" value={String(pontoZeroModal.reps ?? '')} onChange={(e) => setPontoZeroModal((prev) => prev && typeof prev === 'object' ? { ...prev, reps: e?.target?.value ?? '', error: '' } : prev)} placeholder="Ex: 10" className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Hold no alongamento</div>
                                <div className="flex gap-2">
                                    {[3, 4, 5].map((s) => {
                                        const cur = parseTrainingNumber(pontoZeroModal.hold_sec) ?? 4;
                                        return (
                                            <button key={s} type="button" onClick={() => setPontoZeroModal((prev) => prev && typeof prev === 'object' ? { ...prev, hold_sec: s } : prev)} className={`flex-1 min-h-[44px] rounded-xl font-black text-sm border transition-colors ${cur === s ? 'bg-yellow-500 text-black border-yellow-500' : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700'}`}>{s}s</button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="space-y-1">
                                <div className="text-xs font-black uppercase tracking-widest text-neutral-400">RPE (opcional)</div>
                                <input inputMode="decimal" value={String(pontoZeroModal.rpe ?? '')} onChange={(e) => setPontoZeroModal((prev) => prev && typeof prev === 'object' ? { ...prev, rpe: e?.target?.value ?? '' } : prev)} placeholder="1–10" className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                            </div>
                        </div>
                        <div className="p-4 border-t border-neutral-800 flex items-center justify-between gap-2">
                            <button type="button" onClick={() => setPontoZeroModal(null)} className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800">Cancelar</button>
                            <button type="button" onClick={savePontoZeroModal} className="min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest hover:bg-yellow-400 inline-flex items-center gap-2"><Save size={16} />Salvar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Forced Reps Modal ── */}
            {forcedRepsModal && (
                <div className="fixed inset-0 z-[1400] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe" onClick={() => setForcedRepsModal(null)}>
                    <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Repetições Forçadas</div>
                                <div className="text-white font-black text-lg">Além da falha com ajuda</div>
                                <div className="text-xs text-neutral-400">Treine até a falha + reps extras com auxílio do parceiro</div>
                            </div>
                            <button type="button" onClick={() => setForcedRepsModal(null)} className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center" aria-label="Fechar"><X size={18} /></button>
                        </div>
                        <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto custom-scrollbar">
                            {forcedRepsModal.error ? <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-neutral-200">{String(forcedRepsModal.error)}</div> : null}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Peso (kg)</div>
                                    <input inputMode="decimal" value={String(forcedRepsModal.weight ?? '')} onChange={(e) => setForcedRepsModal((prev) => prev && typeof prev === 'object' ? { ...prev, weight: e?.target?.value ?? '', error: '' } : prev)} placeholder="Ex: 80" className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                                </div>
                                <div className="space-y-1">
                                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Reps até falha</div>
                                    <input inputMode="numeric" value={String(forcedRepsModal.reps_failure ?? '')} onChange={(e) => setForcedRepsModal((prev) => prev && typeof prev === 'object' ? { ...prev, reps_failure: e?.target?.value ?? '', error: '' } : prev)} placeholder="Ex: 8" className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                                </div>
                                <div className="space-y-1">
                                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Reps Forçadas</div>
                                    <input inputMode="numeric" value={String(forcedRepsModal.forced_count ?? '')} onChange={(e) => setForcedRepsModal((prev) => prev && typeof prev === 'object' ? { ...prev, forced_count: e?.target?.value ?? '', error: '' } : prev)} placeholder="Ex: 3" className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                                </div>
                                <div className="space-y-1">
                                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400">RPE (opcional)</div>
                                    <input inputMode="decimal" value={String(forcedRepsModal.rpe ?? '')} onChange={(e) => setForcedRepsModal((prev) => prev && typeof prev === 'object' ? { ...prev, rpe: e?.target?.value ?? '' } : prev)} placeholder="1–10" className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                                </div>
                            </div>
                        </div>
                        <div className="p-4 border-t border-neutral-800 flex items-center justify-between gap-2">
                            <button type="button" onClick={() => setForcedRepsModal(null)} className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800">Cancelar</button>
                            <button type="button" onClick={saveForcedRepsModal} className="min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest hover:bg-yellow-400 inline-flex items-center gap-2"><Save size={16} />Salvar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Negative Reps Modal ── */}
            {negativeRepsModal && (
                <div className="fixed inset-0 z-[1400] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe" onClick={() => setNegativeRepsModal(null)}>
                    <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Repetições Negativas</div>
                                <div className="text-white font-black text-lg">Foco na fase excêntrica</div>
                                <div className="text-xs text-neutral-400">Execute a descida lentamente para maximizar o estímulo</div>
                            </div>
                            <button type="button" onClick={() => setNegativeRepsModal(null)} className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center" aria-label="Fechar"><X size={18} /></button>
                        </div>
                        <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto custom-scrollbar">
                            {negativeRepsModal.error ? <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-neutral-200">{String(negativeRepsModal.error)}</div> : null}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Peso (kg)</div>
                                    <input inputMode="decimal" value={String(negativeRepsModal.weight ?? '')} onChange={(e) => setNegativeRepsModal((prev) => prev && typeof prev === 'object' ? { ...prev, weight: e?.target?.value ?? '', error: '' } : prev)} placeholder="Ex: 100" className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                                </div>
                                <div className="space-y-1">
                                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Reps</div>
                                    <input inputMode="numeric" value={String(negativeRepsModal.reps ?? '')} onChange={(e) => setNegativeRepsModal((prev) => prev && typeof prev === 'object' ? { ...prev, reps: e?.target?.value ?? '', error: '' } : prev)} placeholder="Ex: 5" className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                                </div>
                                <div className="space-y-1">
                                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Excêntrico (seg/rep)</div>
                                    <input inputMode="decimal" value={String(negativeRepsModal.eccentric_sec ?? '')} onChange={(e) => setNegativeRepsModal((prev) => prev && typeof prev === 'object' ? { ...prev, eccentric_sec: e?.target?.value ?? '', error: '' } : prev)} placeholder="Ex: 4" className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                                </div>
                                <div className="space-y-1">
                                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400">RPE (opcional)</div>
                                    <input inputMode="decimal" value={String(negativeRepsModal.rpe ?? '')} onChange={(e) => setNegativeRepsModal((prev) => prev && typeof prev === 'object' ? { ...prev, rpe: e?.target?.value ?? '' } : prev)} placeholder="1–10" className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                                </div>
                            </div>
                        </div>
                        <div className="p-4 border-t border-neutral-800 flex items-center justify-between gap-2">
                            <button type="button" onClick={() => setNegativeRepsModal(null)} className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800">Cancelar</button>
                            <button type="button" onClick={saveNegativeRepsModal} className="min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest hover:bg-yellow-400 inline-flex items-center gap-2"><Save size={16} />Salvar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Partial Reps Modal ── */}
            {partialRepsModal && (
                <div className="fixed inset-0 z-[1400] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe" onClick={() => setPartialRepsModal(null)}>
                    <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Repetições Parciais</div>
                                <div className="text-white font-black text-lg">Reps completas + parciais</div>
                                <div className="text-xs text-neutral-400">Complete as reps inteiras e continue com reps parciais até falha</div>
                            </div>
                            <button type="button" onClick={() => setPartialRepsModal(null)} className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center" aria-label="Fechar"><X size={18} /></button>
                        </div>
                        <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto custom-scrollbar">
                            {partialRepsModal.error ? <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-neutral-200">{String(partialRepsModal.error)}</div> : null}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Peso (kg)</div>
                                    <input inputMode="decimal" value={String(partialRepsModal.weight ?? '')} onChange={(e) => setPartialRepsModal((prev) => prev && typeof prev === 'object' ? { ...prev, weight: e?.target?.value ?? '', error: '' } : prev)} placeholder="Ex: 60" className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                                </div>
                                <div className="space-y-1">
                                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Reps Completas</div>
                                    <input inputMode="numeric" value={String(partialRepsModal.full_reps ?? '')} onChange={(e) => setPartialRepsModal((prev) => prev && typeof prev === 'object' ? { ...prev, full_reps: e?.target?.value ?? '', error: '' } : prev)} placeholder="Ex: 8" className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                                </div>
                                <div className="space-y-1">
                                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Reps Parciais</div>
                                    <input inputMode="numeric" value={String(partialRepsModal.partial_count ?? '')} onChange={(e) => setPartialRepsModal((prev) => prev && typeof prev === 'object' ? { ...prev, partial_count: e?.target?.value ?? '', error: '' } : prev)} placeholder="Ex: 5" className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                                </div>
                                <div className="space-y-1">
                                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400">RPE (opcional)</div>
                                    <input inputMode="decimal" value={String(partialRepsModal.rpe ?? '')} onChange={(e) => setPartialRepsModal((prev) => prev && typeof prev === 'object' ? { ...prev, rpe: e?.target?.value ?? '' } : prev)} placeholder="1–10" className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                                </div>
                            </div>
                        </div>
                        <div className="p-4 border-t border-neutral-800 flex items-center justify-between gap-2">
                            <button type="button" onClick={() => setPartialRepsModal(null)} className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800">Cancelar</button>
                            <button type="button" onClick={savePartialRepsModal} className="min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest hover:bg-yellow-400 inline-flex items-center gap-2"><Save size={16} />Salvar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Sistema 21 Modal ── */}
            {sistema21Modal && (
                <div className="fixed inset-0 z-[1400] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe" onClick={() => setSistema21Modal(null)}>
                    <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Sistema 21</div>
                                <div className="text-white font-black text-lg">7 + 7 + 7 reps</div>
                                <div className="text-xs text-neutral-400">Fase 1: ½ inferior • Fase 2: ½ superior • Fase 3: amplitude completa</div>
                            </div>
                            <button type="button" onClick={() => setSistema21Modal(null)} className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center" aria-label="Fechar"><X size={18} /></button>
                        </div>
                        <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto custom-scrollbar">
                            {sistema21Modal.error ? <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-neutral-200">{String(sistema21Modal.error)}</div> : null}
                            <div className="space-y-1">
                                <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Peso (kg)</div>
                                <input inputMode="decimal" value={String(sistema21Modal.weight ?? '')} onChange={(e) => setSistema21Modal((prev) => prev && typeof prev === 'object' ? { ...prev, weight: e?.target?.value ?? '', error: '' } : prev)} placeholder="Ex: 30" className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                            </div>
                            {[{ key: 'phase1', label: 'Fase 1 — ½ inferior (início → meio)' }, { key: 'phase2', label: 'Fase 2 — ½ superior (meio → topo)' }, { key: 'phase3', label: 'Fase 3 — Amplitude completa' }].map(({ key: phaseKey, label }) => (
                                <div key={phaseKey} className="rounded-xl bg-neutral-800/60 border border-neutral-700 p-3 space-y-2">
                                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400">{label}</div>
                                    <input inputMode="numeric" value={String((sistema21Modal as UnknownRecord)[phaseKey] ?? 7)} onChange={(e) => setSistema21Modal((prev) => prev && typeof prev === 'object' ? { ...prev, [phaseKey]: e?.target?.value ?? '', error: '' } : prev)} placeholder="7" className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                                </div>
                            ))}
                            <div className="space-y-1">
                                <div className="text-xs font-black uppercase tracking-widest text-neutral-400">RPE (opcional)</div>
                                <input inputMode="decimal" value={String(sistema21Modal.rpe ?? '')} onChange={(e) => setSistema21Modal((prev) => prev && typeof prev === 'object' ? { ...prev, rpe: e?.target?.value ?? '' } : prev)} placeholder="1–10" className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                            </div>
                        </div>
                        <div className="p-4 border-t border-neutral-800 flex items-center justify-between gap-2">
                            <button type="button" onClick={() => setSistema21Modal(null)} className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800">Cancelar</button>
                            <button type="button" onClick={saveSistema21Modal} className="min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest hover:bg-yellow-400 inline-flex items-center gap-2"><Save size={16} />Salvar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Group Method Modal (Bi-Set / Super-Set / Tri-Set / Giant-Set / Pré-exaustão / Pós-exaustão) ── */}
            {groupMethodModal && (() => {
                const methodName = String(groupMethodModal.method ?? '').trim();
                const info = String(groupMethodModal.info ?? '').trim();
                const methodDescriptions: Record<string, { subtitle: string; tip: string }> = {
                    'Bi-Set': { subtitle: 'Dois exercícios sem descanso', tip: 'Execute o próximo exercício imediatamente após este, sem descanso entre eles.' },
                    'Super-Set': { subtitle: 'Exercícios antagonistas sem descanso', tip: 'Execute exercícios de grupos musculares opostos para máximo volume em menos tempo.' },
                    'Tri-Set': { subtitle: 'Três exercícios sem descanso', tip: 'Complete os 3 exercícios em sequência sem parar. Descanse apenas após o último.' },
                    'Giant-Set': { subtitle: '4+ exercícios em sequência', tip: 'Execute todos os exercícios em sequência. Alto volume e intensidade.' },
                    'Pré-exaustão': { subtitle: 'Isolador antes do composto', tip: 'Esgote o músculo alvo com o isolador primeiro. Depois vá direto ao composto.' },
                    'Pós-exaustão': { subtitle: 'Composto antes do isolador', tip: 'Execute o composto pesado primeiro, depois finalize com o isolador para exaurir o músculo.' },
                };
                const desc = methodDescriptions[methodName] ?? { subtitle: info, tip: '' };
                return (
                    <div className="fixed inset-0 z-[1400] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe" onClick={() => setGroupMethodModal(null)}>
                        <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                            <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="text-xs font-black uppercase tracking-widest text-yellow-500">{methodName}</div>
                                    <div className="text-white font-black text-lg truncate">{desc.subtitle}</div>
                                    {desc.tip && <div className="text-xs text-neutral-400 mt-0.5">{desc.tip}</div>}
                                </div>
                                <button type="button" onClick={() => setGroupMethodModal(null)} className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center" aria-label="Fechar"><X size={18} /></button>
                            </div>
                            <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto custom-scrollbar">
                                {groupMethodModal.error ? <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-neutral-200">{String(groupMethodModal.error)}</div> : null}
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="space-y-1">
                                        <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Peso (kg)</div>
                                        <input inputMode="decimal" value={String(groupMethodModal.weight ?? '')} onChange={(e) => setGroupMethodModal((prev) => prev && typeof prev === 'object' ? { ...prev, weight: e?.target?.value ?? '', error: '' } : prev)} placeholder="Ex: 60" className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                                    </div>
                                    <div className="space-y-1">
                                        <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Reps</div>
                                        <input inputMode="numeric" value={String(groupMethodModal.reps ?? '')} onChange={(e) => setGroupMethodModal((prev) => prev && typeof prev === 'object' ? { ...prev, reps: e?.target?.value ?? '', error: '' } : prev)} placeholder="Ex: 12" className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                                    </div>
                                    <div className="space-y-1">
                                        <div className="text-xs font-black uppercase tracking-widest text-neutral-400">RPE</div>
                                        <input inputMode="decimal" value={String(groupMethodModal.rpe ?? '')} onChange={(e) => setGroupMethodModal((prev) => prev && typeof prev === 'object' ? { ...prev, rpe: e?.target?.value ?? '' } : prev)} placeholder="1–10" className="w-full bg-black/30 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500" />
                                    </div>
                                </div>
                            </div>
                            <div className="p-4 border-t border-neutral-800 flex items-center justify-between gap-2">
                                <button type="button" onClick={() => setGroupMethodModal(null)} className="min-h-[44px] px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800">Cancelar</button>
                                <button type="button" onClick={saveGroupMethodModal} className="min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest hover:bg-yellow-400 inline-flex items-center gap-2"><Save size={16} />Salvar</button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </>
    );
}

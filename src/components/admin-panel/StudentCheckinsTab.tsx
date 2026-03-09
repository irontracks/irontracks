'use client';

import React from 'react';
import { useAdminPanel } from './AdminPanelContext';
import type { UnknownRecord } from '@/types/app';

export function StudentCheckinsTab() {
    const {
        selectedStudent,
        studentCheckinsRows,
        studentCheckinsLoading,
        studentCheckinsError,
        studentCheckinsRange,
        setStudentCheckinsRange,
        studentCheckinsFilter,
        setStudentCheckinsFilter,
    } = useAdminPanel();

    const toNumberOrNull = (v: unknown): number | null => {
        const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
        return Number.isFinite(n) ? n : null;
    };
    const avg = (vals: Array<number | null>): number | null => {
        const list = vals.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
        if (!list.length) return null;
        return list.reduce((a, b) => a + b, 0) / list.length;
    };

    const rows = Array.isArray(studentCheckinsRows) ? studentCheckinsRows : [];
    const filter = String(studentCheckinsFilter || 'all');
    const filtered = filter === 'all' ? rows : rows.filter((r) => String(r?.kind || '').trim() === filter);

    const preRows = rows.filter((r) => String(r?.kind || '').trim() === 'pre');
    const postRows = rows.filter((r) => String(r?.kind || '').trim() === 'post');
    const preAvgEnergy = avg(preRows.map((r) => toNumberOrNull(r?.energy)));
    const preAvgSoreness = avg(preRows.map((r) => toNumberOrNull(r?.soreness)));
    const preAvgTime = avg(preRows.map((r) => {
        const answers: UnknownRecord = r?.answers && typeof r.answers === 'object' ? (r.answers as UnknownRecord) : {};
        return toNumberOrNull(answers.time_minutes ?? answers.timeMinutes);
    }));
    const postAvgSoreness = avg(postRows.map((r) => toNumberOrNull(r?.soreness)));
    const postAvgSatisfaction = avg(postRows.map((r) => toNumberOrNull(r?.mood)));
    const postAvgRpe = avg(postRows.map((r) => {
        const answers: UnknownRecord = r?.answers && typeof r.answers === 'object' ? (r.answers as UnknownRecord) : {};
        return toNumberOrNull(answers.rpe);
    }));

    const highSorenessCount = rows.filter((r) => { const s = toNumberOrNull(r?.soreness); return s != null && s >= 7; }).length;
    const lowEnergyCount = preRows.filter((r) => { const e = toNumberOrNull(r?.energy); return e != null && e <= 2; }).length;

    const alerts: string[] = [];
    if (highSorenessCount >= 3) alerts.push('Dor alta (≥ 7) apareceu 3+ vezes no período.');
    if (preAvgSoreness != null && preAvgSoreness >= 7) alerts.push('Média de dor no pré está alta (≥ 7).');
    if (lowEnergyCount >= 3) alerts.push('Energia baixa (≤ 2) apareceu 3+ vezes no período.');
    if (postAvgSatisfaction != null && postAvgSatisfaction <= 2) alerts.push('Satisfação média no pós está baixa (≤ 2).');

    const suggestions: string[] = [];
    if (highSorenessCount >= 3 || (preAvgSoreness != null && preAvgSoreness >= 7) || (postAvgSoreness != null && postAvgSoreness >= 7))
        suggestions.push('Dor alta: reduzir volume/carga 20–30% e priorizar técnica + mobilidade.');
    if (lowEnergyCount >= 3 || (preAvgEnergy != null && preAvgEnergy <= 2.2))
        suggestions.push('Energia baixa: treino mais curto, sem falha, foco em recuperação (sono/estresse).');
    if (postAvgRpe != null && postAvgRpe >= 9)
        suggestions.push('RPE médio alto: reduzir intensidade e aumentar descanso entre séries.');
    if (postAvgSatisfaction != null && postAvgSatisfaction <= 2)
        suggestions.push('Satisfação baixa: revisar seleção de exercícios e meta da sessão.');
    if (preAvgTime != null && preAvgTime > 0 && preAvgTime < 45)
        suggestions.push('Pouco tempo: usar treino "mínimo efetivo" (menos exercícios e mais foco).');

    return (
        <div className="space-y-4">
            <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.25)]">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-500"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l4 2" /></svg>
                            <h3 className="text-base font-black text-white tracking-tight">Check-ins do aluno</h3>
                        </div>
                        <div className="mt-1 text-xs text-neutral-400 font-semibold">
                            {studentCheckinsLoading ? 'Carregando...' : `${rows.length} item(s)`}
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                        {['7d', '30d'].map((k) => (
                            <button key={k} type="button" onClick={() => setStudentCheckinsRange(k)}
                                className={`min-h-[44px] px-4 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 active:scale-95 ${String(studentCheckinsRange || '7d') === k ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/15' : 'bg-neutral-900/70 border border-neutral-800 text-neutral-200 hover:bg-neutral-900'}`}
                            >
                                {k === '7d' ? '7 dias' : '30 dias'}
                            </button>
                        ))}
                        {['all', 'pre', 'post'].map((k) => (
                            <button key={k} type="button" onClick={() => setStudentCheckinsFilter(k)}
                                className={`min-h-[44px] px-4 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 active:scale-95 ${String(studentCheckinsFilter || 'all') === k ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/15' : 'bg-neutral-900/70 border border-neutral-800 text-neutral-200 hover:bg-neutral-900'}`}
                            >
                                {k === 'all' ? 'Todos' : k === 'pre' ? 'Pré' : 'Pós'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {studentCheckinsError ? <div className="bg-neutral-950/40 border border-yellow-500/20 rounded-2xl p-4 text-sm text-neutral-200">{studentCheckinsError}</div> : null}

            <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                        <div className="text-[11px] font-black uppercase tracking-widest text-yellow-500">Pré</div>
                        <div className="mt-2 grid grid-cols-3 gap-3">
                            <div><div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Energia</div><div className="font-black text-white">{preAvgEnergy == null ? '—' : preAvgEnergy.toFixed(1)}</div></div>
                            <div><div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Dor</div><div className="font-black text-white">{preAvgSoreness == null ? '—' : preAvgSoreness.toFixed(1)}</div></div>
                            <div><div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Tempo</div><div className="font-black text-white">{preAvgTime == null ? '—' : `${Math.round(preAvgTime)}m`}</div></div>
                        </div>
                    </div>
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                        <div className="text-[11px] font-black uppercase tracking-widest text-yellow-500">Pós</div>
                        <div className="mt-2 grid grid-cols-3 gap-3">
                            <div><div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">RPE</div><div className="font-black text-white">{postAvgRpe == null ? '—' : postAvgRpe.toFixed(1)}</div></div>
                            <div><div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Satisf.</div><div className="font-black text-white">{postAvgSatisfaction == null ? '—' : postAvgSatisfaction.toFixed(1)}</div></div>
                            <div><div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Dor</div><div className="font-black text-white">{postAvgSoreness == null ? '—' : postAvgSoreness.toFixed(1)}</div></div>
                        </div>
                    </div>
                </div>

                {alerts.length ? (
                    <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-4">
                        <div className="text-[11px] font-black uppercase tracking-widest text-yellow-500">Alertas</div>
                        <div className="mt-2 space-y-1 text-sm text-neutral-200">{alerts.map((a) => <div key={a}>{a}</div>)}</div>
                    </div>
                ) : null}

                {suggestions.length ? (
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                        <div className="text-[11px] font-black uppercase tracking-widest text-neutral-200">Sugestões</div>
                        <div className="mt-2 space-y-1 text-sm text-neutral-200">{suggestions.map((s) => <div key={s}>{s}</div>)}</div>
                    </div>
                ) : null}

                {filtered.length === 0 ? (
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4 text-sm text-neutral-400">Nenhum check-in encontrado.</div>
                ) : (
                    <div className="space-y-2">
                        {filtered.map((r) => {
                            const kind = String(r?.kind || '').trim();
                            const createdAt = r?.created_at ? new Date(String(r.created_at)) : null;
                            const dateLabel = createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt.toLocaleString('pt-BR') : '—';
                            const energy = r?.energy != null ? String(r.energy) : '—';
                            const soreness = r?.soreness != null ? String(r.soreness) : '—';
                            const mood = r?.mood != null ? String(r.mood) : '—';
                            const answers: UnknownRecord = r?.answers && typeof r.answers === 'object' ? (r.answers as UnknownRecord) : {};
                            const rpe = answers.rpe != null ? String(answers.rpe) : '—';
                            const timeMinutes = answers.time_minutes != null ? String(answers.time_minutes) : answers.timeMinutes != null ? String(answers.timeMinutes) : '—';
                            const notes = r?.notes ? String(r.notes) : '';
                            return (
                                <div key={String(r?.id || dateLabel)} className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="text-[11px] font-black uppercase tracking-widest text-yellow-500">{kind === 'pre' ? 'Pré' : 'Pós'}</div>
                                            <div className="text-xs text-neutral-500">{dateLabel}</div>
                                        </div>
                                        <div className="text-xs text-neutral-300 font-mono">
                                            {kind === 'pre' ? `E:${energy} D:${soreness} T:${timeMinutes}` : `RPE:${rpe} Sat:${mood} D:${soreness}`}
                                        </div>
                                    </div>
                                    {notes ? <div className="mt-2 text-sm text-neutral-200">{notes}</div> : null}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}


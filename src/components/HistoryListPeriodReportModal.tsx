'use client';

import React from 'react';
import { Download, Loader2 } from 'lucide-react';
import { PeriodStats } from '@/types/workout';

export interface PeriodReport {
    type: 'week' | 'month';
    stats: PeriodStats;
}

export interface PeriodAiState {
    status: 'idle' | 'loading' | 'ready' | 'error';
    ai: Record<string, unknown> | null;
    error: string;
}

export interface PeriodPdfState {
    status: 'idle' | 'loading' | 'ready' | 'error';
    url: string | null;
    blob: Blob | null;
    error: string;
}

interface PeriodReportModalProps {
    periodReport: PeriodReport;
    periodAi: PeriodAiState;
    periodPdf: PeriodPdfState;
    shareError: string;
    buildShareText: (report: PeriodReport | null) => string;
    onClose: () => void;
    onDownloadPdf: () => void;
    onShareReport: () => void;
}

/**
 * HistoryListPeriodReportModal
 *
 * Modal "Relatório de Evolução" (semanal/mensal + IA insights + PDF download).
 * Extraído do HistoryList.tsx (L1550–1726). Lógica de geração permanece no pai.
 */
export function HistoryListPeriodReportModal({
    periodReport,
    periodAi,
    periodPdf,
    shareError,
    buildShareText,
    onClose,
    onDownloadPdf,
    onShareReport,
}: PeriodReportModalProps) {
    const typeLabel = periodReport.type === 'week' ? 'Resumo semanal' : periodReport.type === 'month' ? 'Resumo mensal' : 'Resumo';
    const totalVolumeKg = Number(periodReport.stats?.totalVolumeKg || 0);

    return (
        <div
            role="presentation"
            className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label={typeLabel}
                className="bg-neutral-900 w-full max-w-md rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-4 border-b border-neutral-800">
                    <div className="text-[11px] uppercase tracking-wider text-neutral-500 font-bold">Relatório de evolução</div>
                    <div className="text-lg font-black text-white">{typeLabel}</div>
                </div>

                {/* Body */}
                <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
                    {/* Stat grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[
                            { label: 'Treinos', value: String(Number(periodReport.stats?.count || 0)) },
                            { label: 'Tempo total (min)', value: String(Number(periodReport.stats?.totalMinutes || 0)) },
                            { label: 'Média (min)', value: String(Number(periodReport.stats?.avgMinutes || 0)) },
                            { label: 'Volume total (kg)', value: Number.isFinite(totalVolumeKg) && totalVolumeKg > 0 ? totalVolumeKg.toLocaleString('pt-BR') : '0' },
                        ].map(({ label, value }) => (
                            <div key={label} className="bg-neutral-950 border border-neutral-800 rounded-xl p-3">
                                <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">{label}</div>
                                <div className="text-xl font-black tracking-tight text-white font-mono">{value}</div>
                            </div>
                        ))}
                    </div>

                    {/* AI insights */}
                    <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 space-y-3">
                        <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">IA • Insights</div>
                        {periodAi.status === 'loading' && (
                            <div className="text-sm text-neutral-300 animate-pulse">Gerando insights com IA...</div>
                        )}
                        {periodAi.status === 'error' && (
                            <div className="text-sm text-red-400">{periodAi.error || 'Falha ao gerar insights.'}</div>
                        )}
                        {periodAi.status === 'ready' && periodAi.ai && (
                            <div className="space-y-3">
                                {(['summary', 'highlights', 'focus', 'nextSteps', 'warnings'] as const).map((key) => {
                                    const labels: Record<string, string> = {
                                        summary: 'Resumo',
                                        highlights: 'Destaques',
                                        focus: 'Foco',
                                        nextSteps: 'Próximos passos',
                                        warnings: 'Atenções',
                                    };
                                    const isWarning = key === 'warnings';
                                    const items = Array.isArray(periodAi.ai?.[key]) ? (periodAi.ai[key] as unknown[]) : [];
                                    if (!items.length) return null;
                                    return (
                                        <div key={key}>
                                            <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold mb-1">{labels[key]}</div>
                                            <ul className={`space-y-1 text-sm ${isWarning ? 'text-yellow-400' : 'text-neutral-100'}`}>
                                                {items.map((item, idx) => (
                                                    <li key={idx}>• {String(item || '').trim()}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Share text */}
                    <div>
                        <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold mb-1">Texto para compartilhar</div>
                        <textarea
                            readOnly
                            value={buildShareText(periodReport)}
                            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-sm text-neutral-100 outline-none h-32 resize-none"
                        />
                    </div>

                    {/* Share error */}
                    {shareError ? (
                        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
                            <div className="font-black">Falha ao compartilhar</div>
                            <div className="text-xs text-red-200/90">{String(shareError).slice(0, 260)}</div>
                        </div>
                    ) : null}

                    {/* PDF error */}
                    {periodPdf.status === 'error' && (
                        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
                            {String(periodPdf.error || 'Falha ao gerar PDF.')}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-neutral-900/50 flex flex-col sm:flex-row gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 py-3 rounded-xl bg-neutral-800 text-neutral-300 font-bold hover:bg-neutral-700"
                    >
                        Fechar
                    </button>
                    <button
                        type="button"
                        onClick={onDownloadPdf}
                        disabled={periodPdf.status === 'loading'}
                        className="flex-1 py-3 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-200 font-bold hover:bg-neutral-900 disabled:opacity-60 inline-flex items-center justify-center gap-2"
                    >
                        {periodPdf.status === 'loading' ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                        Baixar PDF
                    </button>
                    <button
                        type="button"
                        onClick={onShareReport}
                        className="flex-1 py-3 rounded-xl bg-yellow-500 text-black font-bold hover:bg-yellow-400"
                    >
                        Compartilhar
                    </button>
                </div>
            </div>
        </div>
    );
}

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

// ─── Sparkline SVG helper ─────────────────────────────────────────────────────
// Renders a simple inline sparkline from an array of numbers
function Sparkline({ values, width = 80, height = 28 }: { values: number[]; width?: number; height?: number }) {
    if (!values || values.length < 2) return null;
    const safe = values.map((v) => (Number.isFinite(v) ? v : 0));
    const max = Math.max(1, ...safe);
    const min = Math.min(0, ...safe);
    const span = max - min || 1;
    const step = width / Math.max(1, safe.length - 1);
    const points = safe
        .map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / span) * (height - 4) - 2).toFixed(1)}`)
        .join(' ');
    const lastX = ((safe.length - 1) * step).toFixed(1);
    const lastY = (height - ((safe[safe.length - 1] - min) / span) * (height - 4) - 2).toFixed(1);
    const trend = safe[safe.length - 1] >= safe[0];
    const color = trend ? '#4ade80' : '#f87171';
    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
            <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={points} opacity="0.7" />
            <circle cx={lastX} cy={lastY} r="2.5" fill={color} />
        </svg>
    );
}

/**
 * HistoryListPeriodReportModal
 *
 * Modal de relatório periódico (semanal/mensal) com sparklines, stats expandidos,
 * top exercícios com volume e insights IA.
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
    const { type, stats } = periodReport;
    const typeLabel = type === 'week' ? 'Resumo semanal' : type === 'month' ? 'Resumo mensal' : 'Resumo';
    const totalVolumeKg = Number(stats?.totalVolumeKg || 0);
    const avgVolumeKg = Number(stats?.avgVolumeKg || 0);
    const count = Number(stats?.count || 0);
    const totalMinutes = Number(stats?.totalMinutes || 0);
    const avgMinutes = Number(stats?.avgMinutes || 0);
    const totalSets = Number(stats?.totalSets || 0);
    const totalReps = Number(stats?.totalReps || 0);
    const uniqueDays = Number(stats?.uniqueDaysCount || 0);

    // Build sparkline from session summaries (volume per session)
    const sessionSummaries = Array.isArray(stats?.sessionSummaries)
        ? (stats.sessionSummaries as Array<{ minutes: number; volumeKg: number }>)
        : [];
    const sparklineVolumeValues = sessionSummaries.map((s) => Number(s?.volumeKg || 0));
    const sparklineDurationValues = sessionSummaries.map((s) => Number(s?.minutes || 0));

    // Top exercises by volume
    const topByVolume = Array.isArray(stats?.topExercisesByVolume)
        ? (stats.topExercisesByVolume as Array<{ name: string; volumeKg: number; sets: number; sessionsCount: number }>)
        : [];

    // Performance "score" based on consistency: days trained / possible days × 100
    const possibleDays = type === 'week' ? 7 : type === 'month' ? 30 : Number(stats?.days || 7);
    const consistencyPct = possibleDays > 0 ? Math.min(100, Math.round((uniqueDays / possibleDays) * 100)) : 0;
    const consistencyColor = consistencyPct >= 60 ? 'text-green-400' : consistencyPct >= 30 ? 'text-yellow-400' : 'text-red-400';

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
                className="bg-neutral-900 w-full max-w-lg rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-4 border-b border-neutral-800 bg-gradient-to-r from-neutral-900 to-neutral-900/60">
                    <div className="text-[11px] uppercase tracking-wider text-neutral-500 font-bold">Relatório de evolução</div>
                    <div className="text-lg font-black text-white">{typeLabel}</div>
                    {uniqueDays > 0 && (
                        <div className="mt-1 text-xs text-neutral-400">
                            <span className={consistencyColor + ' font-black'}>{uniqueDays} dia{uniqueDays !== 1 ? 's' : ''}</span>
                            {' '}treinado{uniqueDays !== 1 ? 's' : ''} — consistência{' '}
                            <span className={consistencyColor + ' font-black'}>{consistencyPct}%</span>
                        </div>
                    )}
                </div>

                {/* Body */}
                <div className="p-4 space-y-4 max-h-[72vh] overflow-y-auto">
                    {/* Primary stat grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[
                            { label: 'Treinos', value: String(count || 0) },
                            { label: 'Tempo total', value: totalMinutes > 0 ? `${totalMinutes} min` : '—' },
                            { label: 'Média/treino', value: avgMinutes > 0 ? `${avgMinutes} min` : '—' },
                            { label: 'Dias ativos', value: uniqueDays > 0 ? String(uniqueDays) : '—' },
                        ].map(({ label, value }) => (
                            <div key={label} className="bg-neutral-950 border border-neutral-800 rounded-xl p-3">
                                <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">{label}</div>
                                <div className="text-xl font-black tracking-tight text-white font-mono">{value}</div>
                            </div>
                        ))}
                    </div>

                    {/* Volume stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[
                            {
                                label: 'Volume total', value: totalVolumeKg > 0
                                    ? `${totalVolumeKg.toLocaleString('pt-BR')} kg`
                                    : '—',
                                accent: true
                            },
                            {
                                label: 'Média/treino', value: avgVolumeKg > 0
                                    ? `${avgVolumeKg.toLocaleString('pt-BR')} kg`
                                    : '—'
                            },
                            {
                                label: 'Séries totais', value: totalSets > 0 ? String(totalSets) : '—'
                            },
                            {
                                label: 'Reps totais', value: totalReps > 0 ? String(totalReps) : '—'
                            },
                        ].map(({ label, value, accent }) => (
                            <div key={label} className={`border rounded-xl p-3 ${accent ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-neutral-950 border-neutral-800'}`}>
                                <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">{label}</div>
                                <div className={`text-xl font-black tracking-tight font-mono ${accent ? 'text-yellow-400' : 'text-white'}`}>{value}</div>
                            </div>
                        ))}
                    </div>

                    {/* Sparklines */}
                    {sparklineVolumeValues.length >= 2 && (
                        <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3">
                            <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold mb-3">Tendência das sessões</div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <div className="text-[10px] text-neutral-400 mb-1">Volume por sessão</div>
                                    <Sparkline values={sparklineVolumeValues} width={120} height={32} />
                                    <div className="text-[10px] text-neutral-500 mt-1">
                                        {sparklineVolumeValues.length} sessão{sparklineVolumeValues.length !== 1 ? 'ões' : ''}
                                    </div>
                                </div>
                                {sparklineDurationValues.length >= 2 && (
                                    <div>
                                        <div className="text-[10px] text-neutral-400 mb-1">Duração por sessão (min)</div>
                                        <Sparkline values={sparklineDurationValues} width={120} height={32} />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Top exercises by volume */}
                    {topByVolume.length > 0 && (
                        <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3">
                            <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold mb-3">Top exercícios por volume</div>
                            <div className="space-y-2">
                                {topByVolume.slice(0, 5).map((ex, idx) => {
                                    const maxVol = topByVolume[0]?.volumeKg || 1;
                                    const pct = Math.round((ex.volumeKg / maxVol) * 100);
                                    return (
                                        <div key={ex.name + idx}>
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-xs font-semibold text-neutral-200 truncate max-w-[55%]">{ex.name}</span>
                                                <span className="text-xs font-mono text-yellow-400 font-black">
                                                    {ex.volumeKg.toLocaleString('pt-BR')} kg
                                                </span>
                                            </div>
                                            <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-yellow-500/70 rounded-full transition-all"
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                            <div className="text-[9px] text-neutral-500 mt-0.5">
                                                {ex.sets} séries · {ex.sessionsCount} sessão{ex.sessionsCount !== 1 ? 'ões' : ''}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* AI insights */}
                    <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 space-y-3">
                        <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">✨ Insights</div>
                        {periodAi.status === 'loading' && (
                            <div className="text-sm text-neutral-300 animate-pulse">Gerando insights...</div>
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

                    {/* Errors */}
                    {shareError ? (
                        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
                            <div className="font-black">Falha ao compartilhar</div>
                            <div className="text-xs text-red-200/90">{String(shareError).slice(0, 260)}</div>
                        </div>
                    ) : null}
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

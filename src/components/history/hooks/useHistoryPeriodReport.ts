'use client';

import { useState } from 'react';
import { generatePeriodReportInsights } from '@/actions/workout-actions';
import { buildPeriodReportHtml } from '@/utils/report/buildPeriodReportHtml';
import { PeriodStats } from '@/types/workout';
import { PeriodReport, PeriodAiState, PeriodPdfState, WorkoutSummary, isRecord, parseRawSession, RawSessionObjectSchema } from '@/components/historyListTypes';
import { toDateMs, calculateTotalVolumeFromLogs } from './useHistoryData';

const REPORT_DAYS_WEEK = 7;
const REPORT_DAYS_MONTH = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_SESSIONS_LIMIT = 30;
const TOP_EXERCISES_LIMIT = 5;

interface UseHistoryPeriodReportProps {
    historyItems: WorkoutSummary[];
    user: { displayName?: string; name?: string; email?: string } | null;
    alert: (msg: string, title?: string) => Promise<unknown>;
}

export function useHistoryPeriodReport({ historyItems, user, alert }: UseHistoryPeriodReportProps) {
    const [periodReport, setPeriodReport] = useState<PeriodReport | null>(null);
    const [periodAi, setPeriodAi] = useState<PeriodAiState>({ status: 'idle', ai: null, error: '' });
    const [periodPdf, setPeriodPdf] = useState<PeriodPdfState>({ status: 'idle', url: null, blob: null, error: '' });
    const [shareError, setShareError] = useState('');

    // ── buildPeriodStats ─────────────────────────────────────────────────────
    const buildPeriodStats = (days: unknown): PeriodStats | null => {
        try {
            const historyList = Array.isArray(historyItems) ? historyItems : [];
            const daysNumber = Number(days);
            if (!Number.isFinite(daysNumber) || daysNumber <= 0) return null;
            const cutoff = Date.now() - daysNumber * DAY_MS;
            const list = historyList.filter((s) => {
                const t = toDateMs(s?.dateMs) ?? toDateMs(s?.date);
                return Number.isFinite(t) && t !== null && t >= cutoff;
            });
            if (!list.length) return null;

            const totalSeconds = list.reduce((acc, s) => acc + (Number(s?.totalTime) || 0), 0);
            const totalMinutes = Math.max(0, Math.round(totalSeconds / 60));
            const count = list.length;
            const avgMinutes = count > 0 ? Math.max(0, Math.round(totalMinutes / count)) : 0;
            let totalVolumeKg = 0, totalSets = 0, totalReps = 0;
            const uniqueDays = new Set<string>();
            const exerciseMap = new Map<string, { name: string; sets: number; reps: number; volumeKg: number; sessions: Set<string> }>();
            const sessionSummaries: Array<{ date: unknown; minutes: number; volumeKg: number }> = [];

            list.forEach((item) => {
                const rawParsed = RawSessionObjectSchema.safeParse(item?.rawSession);
                const raw = rawParsed.success ? rawParsed.data : null;
                const logs = raw?.logs ?? {};
                const exercises: unknown[] = Array.isArray(raw?.exercises) ? raw.exercises : [];
                const v = calculateTotalVolumeFromLogs(logs);
                const safeVolume = Number.isFinite(v) && v > 0 ? v : 0;
                if (safeVolume > 0) totalVolumeKg += safeVolume;
                const dateValue = item?.date ?? raw?.date ?? item?.created_at ?? null;
                let dayKey = '';
                try {
                    const t = toDateMs(dateValue);
                    if (Number.isFinite(t) && t !== null) { dayKey = new Date(t).toISOString().slice(0, 10); uniqueDays.add(dayKey); }
                } catch { }
                const sessionMinutes = Math.max(0, Math.round((Number(item?.totalTime ?? raw?.totalTime) || 0) / 60));
                sessionSummaries.push({ date: dateValue, minutes: sessionMinutes, volumeKg: Math.max(0, Math.round(safeVolume || 0)) });
                Object.entries(logs || {}).forEach(([key, log]) => {
                    if (!isRecord(log)) return;
                    const w = Number(String(log.weight ?? '').replace(',', '.'));
                    const r = Number(String(log.reps ?? '').replace(',', '.'));
                    if (!Number.isFinite(w) || !Number.isFinite(r)) return;
                    if (w <= 0 || r <= 0) return;
                    totalSets += 1; totalReps += r;
                    const exIdx = Number.parseInt(String(key || '').split('-')[0] || '', 10);
                    const ex = Number.isFinite(exIdx) ? exercises?.[exIdx] : null;
                    const name = String(isRecord(ex) ? (ex.name ?? '') : '').trim() || 'Exercício';
                    const current = exerciseMap.get(name) || { name, sets: 0, reps: 0, volumeKg: 0, sessions: new Set<string>() };
                    current.sets += 1; current.reps += r; current.volumeKg += w * r;
                    if (dayKey) current.sessions.add(dayKey);
                    exerciseMap.set(name, current);
                });
            });

            const avgVolumeKg = count > 0 ? Math.max(0, Math.round(totalVolumeKg / count)) : 0;
            const exercisesList = Array.from(exerciseMap.values())
                .map(item => ({ name: String(item?.name || '').trim(), sets: Number(item?.sets) || 0, reps: Number(item?.reps) || 0, volumeKg: Math.max(0, Math.round(Number(item?.volumeKg) || 0)), sessionsCount: item?.sessions ? item.sessions.size : 0 }))
                .filter(item => item.name);
            const topExercisesByVolume = [...exercisesList].sort((a, b) => (b.volumeKg || 0) - (a.volumeKg || 0)).slice(0, TOP_EXERCISES_LIMIT);
            const topExercisesByFrequency = [...exercisesList].sort((a, b) => (b.sessionsCount || 0) - (a.sessionsCount || 0) || (b.sets || 0) - (a.sets || 0)).slice(0, TOP_EXERCISES_LIMIT);

            return {
                days: daysNumber, count, totalMinutes, avgMinutes,
                totalVolumeKg: Math.max(0, Math.round(totalVolumeKg)), avgVolumeKg,
                totalSets, totalReps, uniqueDaysCount: uniqueDays.size,
                topExercisesByVolume, topExercisesByFrequency,
                sessionSummaries: sessionSummaries.slice(0, PERIOD_SESSIONS_LIMIT),
            };
        } catch { return null; }
    };

    // ── buildShareText ───────────────────────────────────────────────────────
    const buildShareText = (report: PeriodReport | null) => {
        if (!report) return '';
        const label = report.type === 'week' ? 'semanal' : report.type === 'month' ? 'mensal' : 'período';
        const { stats } = report;
        const count = Number(stats.count) || 0;
        const totalMinutes = Number(stats.totalMinutes) || 0;
        const avgMinutes = Number(stats.avgMinutes) || 0;
        const totalVolume = Number(stats.totalVolumeKg) || 0;
        const avgVolume = Number(stats.avgVolumeKg) || 0;
        const totalVolumeLabel = Number.isFinite(totalVolume) && totalVolume > 0 ? `${totalVolume.toLocaleString('pt-BR')} kg` : '0 kg';
        const avgVolumeLabel = Number.isFinite(avgVolume) && avgVolume > 0 ? `${avgVolume.toLocaleString('pt-BR')} kg` : '0 kg';
        return ['Relatório ' + label + ' IronTracks', 'Treinos finalizados: ' + count, 'Tempo total: ' + totalMinutes + ' min', 'Média por treino: ' + avgMinutes + ' min', 'Volume total: ' + totalVolumeLabel, 'Volume médio/treino: ' + avgVolumeLabel].join('\n');
    };

    // ── openPeriodReport ─────────────────────────────────────────────────────
    const openPeriodReport = async (type: 'week' | 'month') => {
        try {
            const key = type === 'week' ? REPORT_DAYS_WEEK : REPORT_DAYS_MONTH;
            const stats = buildPeriodStats(key);
            if (!stats) { await alert('Sem treinos suficientes nesse período para gerar um relatório.'); return; }
            setPeriodReport({ type, stats });
            setPeriodAi({ status: 'loading', ai: null, error: '' });
            try {
                const res = await generatePeriodReportInsights({ type, stats });
                if (!res?.ok) { setPeriodAi({ status: 'error', ai: null, error: String(res?.error || 'Falha ao gerar insights') }); return; }
                setPeriodAi({ status: 'ready', ai: res.ai || null, error: '' });
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                setPeriodAi({ status: 'error', ai: null, error: msg || 'Falha ao gerar insights' });
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            await alert('Erro ao gerar relatório: ' + msg);
        }
    };

    const closePeriodReport = () => {
        setPeriodReport(null);
        setPeriodAi({ status: 'idle', ai: null, error: '' });
        try { if (periodPdf?.url) URL.revokeObjectURL(periodPdf.url); } catch { }
        setPeriodPdf({ status: 'idle', url: null, blob: null, error: '' });
        setShareError('');
    };

    // ── downloadPeriodPdf ────────────────────────────────────────────────────
    const downloadPeriodPdf = async () => {
        const current = periodReport && typeof periodReport === 'object' ? periodReport : null;
        if (!current || periodPdf.status === 'loading') return;
        setPeriodPdf((prev) => ({ ...prev, status: 'loading', error: '' }));
        try {
            const baseUrl = typeof window !== 'undefined' ? String(window.location.origin || '').trim() : '';
            const userName = String(user?.displayName || user?.name || user?.email || '').trim();
            const html = buildPeriodReportHtml({ type: current.type, stats: current.stats, ai: periodAi?.ai || null, baseUrl, userName });
            const dateLabel = new Date().toISOString().slice(0, 10);
            const kind = current.type === 'week' ? 'Semanal' : 'Mensal';
            const fileName = `Relatorio_${kind}_${dateLabel}`;
            try {
                const blobPrint = new Blob([html], { type: 'text/html' });
                const blobPrintUrl = URL.createObjectURL(blobPrint);
                const printWindow = window.open(blobPrintUrl, '_blank');
                if (printWindow) {
                    setTimeout(() => {
                        try { printWindow.focus(); printWindow.print(); } catch { }
                        setTimeout(() => URL.revokeObjectURL(blobPrintUrl), 60_000);
                    }, 500);
                } else {
                    URL.revokeObjectURL(blobPrintUrl);
                    const blob = new Blob([html], { type: 'text/html' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url; a.download = `${fileName}.html`;
                    document.body.appendChild(a); a.click(); a.remove();
                    URL.revokeObjectURL(url);
                }
                setPeriodPdf({ status: 'ready', url: null, blob: null, error: '' });
            } catch { }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setPeriodPdf((prev) => ({ ...prev, status: 'error', error: msg || 'Falha ao gerar PDF' }));
        } finally {
            setTimeout(() => setPeriodPdf((prev) => (prev?.status === 'loading' ? { ...prev, status: 'idle' } : prev)), 400);
        }
    };

    // ── handleShareReport ────────────────────────────────────────────────────
    const handleShareReport = async () => {
        const current = periodReport && typeof periodReport === 'object' ? periodReport : null;
        if (!current) return;
        const text = buildShareText(current);
        if (!text) return;

        const legacyCopy = async () => {
            try {
                if (typeof document === 'undefined') return false;
                const ta = document.createElement('textarea');
                ta.value = text; ta.setAttribute('readonly', 'true');
                ta.style.position = 'fixed'; ta.style.top = '-1000px'; ta.style.left = '-1000px';
                document.body.appendChild(ta); ta.focus(); ta.select();
                const ok = document.execCommand && document.execCommand('copy');
                ta.remove(); return !!ok;
            } catch { return false; }
        };

        try {
            const nav = typeof navigator !== 'undefined' ? navigator : null;
            if (nav && typeof nav.share === 'function') { await nav.share({ text }); setShareError(''); return; }
        } catch { }

        try {
            const nav = typeof navigator !== 'undefined' ? navigator : null;
            if (nav?.clipboard && typeof nav.clipboard.writeText === 'function') {
                await nav.clipboard.writeText(text); setShareError('');
                await alert('Texto do relatório copiado para a área de transferência.'); return;
            }
            const copied = await legacyCopy();
            if (copied) { setShareError(''); await alert('Texto do relatório copiado para a área de transferência.'); return; }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            const copied = await legacyCopy();
            if (copied) { setShareError(''); await alert('Texto do relatório copiado para a área de transferência.'); return; }
            setShareError(msg || 'Falha ao compartilhar');
            await alert('Seu navegador bloqueou o compartilhamento/cópia automática. Copie o texto manualmente abaixo.', 'Compartilhamento indisponível');
            return;
        }
        setShareError('O compartilhamento nativo não está disponível neste navegador.');
        await alert('Compartilhamento nativo indisponível. Copie o texto manualmente abaixo.', 'Compartilhamento indisponível');
    };

    return {
        periodReport, periodAi, periodPdf, shareError,
        buildPeriodStats, buildShareText,
        openPeriodReport, closePeriodReport,
        downloadPeriodPdf, handleShareReport,
    };
}

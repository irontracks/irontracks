'use client';

import { useState } from 'react';
import { generatePeriodReportInsights } from '@/actions/workout-actions';
import { buildPeriodReportHtml } from '@/utils/report/buildPeriodReportHtml';
import { translateAiError } from '@/utils/ai/clientErrors';
import { PeriodStats } from '@/types/workout';
import { PeriodReport, PeriodAiState, PeriodPdfState, WorkoutSummary, isRecord, RawSessionObjectSchema } from '@/components/historyListTypes';
import { toDateMs, calculateTotalVolumeFromLogs } from './useHistoryData';
import { setVolume, setTopWeightReps } from '@/utils/report/setVolume';
import { buildPeriodSessionDetails, PeriodSessionDetail } from '@/utils/report/periodSessionDetails';
import { exportHtmlAsPdf } from '@/utils/report/exportHtmlAsPdf';
import { fetchLogoDataUrl } from '@/utils/report/fetchLogoDataUrl';
import { brtDateKey } from '@/utils/cron/dateBrt';

const REPORT_DAYS_WEEK = 7;
const REPORT_DAYS_MONTH = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_SESSIONS_LIMIT = 30;
const TOP_EXERCISES_LIMIT = 5;

interface UseHistoryPeriodReportProps {
    historyItems: WorkoutSummary[];
    user: { displayName?: string; name?: string; email?: string } | null;
    alert: (msg: string, title?: string) => Promise<unknown>;
    /** Busca os `notes` que a lista magra não baixou (1 query em lote). */
    hydrateSessions?: () => Promise<WorkoutSummary[]>;
}

export function useHistoryPeriodReport({ historyItems, user, alert, hydrateSessions }: UseHistoryPeriodReportProps) {
    const [periodReport, setPeriodReport] = useState<PeriodReport | null>(null);
    const [periodAi, setPeriodAi] = useState<PeriodAiState>({ status: 'idle', ai: null, error: '' });
    const [periodPdf, setPeriodPdf] = useState<PeriodPdfState>({ status: 'idle', url: null, blob: null, error: '' });
    const [shareError, setShareError] = useState('');

    // ── buildPeriodStats ─────────────────────────────────────────────────────
    // Devolve os agregados (que vão ao prompt da IA) E o detalhe série a série
    // (que vai só ao arquivo exportado) — separados de propósito: mandar o mês
    // inteiro de séries ao modelo custa dinheiro e não melhora o insight.
    const buildPeriodStats = (
        days: unknown,
        listOverride?: WorkoutSummary[],
    ): { stats: PeriodStats; sessions: PeriodSessionDetail[] } | null => {
        try {
            const historyList = Array.isArray(listOverride) ? listOverride : (Array.isArray(historyItems) ? historyItems : []);
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
            const detailSources: Array<{ date: unknown; totalTime: unknown; title: unknown; logs: unknown; exercises: unknown }> = [];

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
                    // O dia é o do USUÁRIO, não o do servidor. Era
                    // `toISOString().slice(0,10)` — dia UTC —, então todo treino
                    // depois das 21h BRT contava no dia SEGUINTE: "dias
                    // treinados" e "consistência" saíam inflados no relatório
                    // que a pessoa manda ao professor. É a mesma classe já
                    // corrigida no streak (5,7% das sessões caíam em dia
                    // divergente) e no heatmap de nutrição.
                    if (Number.isFinite(t) && t !== null) { dayKey = brtDateKey(t); if (dayKey) uniqueDays.add(dayKey); }
                } catch { }
                const sessionMinutes = Math.max(0, Math.round((Number(item?.totalTime ?? raw?.totalTime) || 0) / 60));
                sessionSummaries.push({ date: dateValue, minutes: sessionMinutes, volumeKg: Math.max(0, Math.round(safeVolume || 0)) });
                detailSources.push({
                    date: dateValue,
                    totalTime: item?.totalTime ?? raw?.totalTime ?? 0,
                    title: raw?.workoutTitle ?? item?.title ?? item?.name ?? '',
                    logs,
                    exercises,
                });
                Object.entries(logs || {}).forEach(([key, log]) => {
                    if (!isRecord(log)) return;
                    // setTopWeightReps/setVolume tratam unilateral (L_/R_).
                    const { weight: w, reps: r } = setTopWeightReps(log);
                    if (w <= 0 || r <= 0) return;
                    const vol = setVolume(log);
                    totalSets += 1; totalReps += r;
                    const exIdx = Number.parseInt(String(key || '').split('-')[0] || '', 10);
                    const ex = Number.isFinite(exIdx) ? exercises?.[exIdx] : null;
                    const name = String(isRecord(ex) ? (ex.name ?? '') : '').trim() || 'Exercício';
                    const current = exerciseMap.get(name) || { name, sets: 0, reps: 0, volumeKg: 0, sessions: new Set<string>() };
                    current.sets += 1; current.reps += r; current.volumeKg += vol;
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
                stats: {
                    days: daysNumber, count, totalMinutes, avgMinutes,
                    totalVolumeKg: Math.max(0, Math.round(totalVolumeKg)), avgVolumeKg,
                    totalSets, totalReps, uniqueDaysCount: uniqueDays.size,
                    topExercisesByVolume, topExercisesByFrequency,
                    sessionSummaries: sessionSummaries.slice(0, PERIOD_SESSIONS_LIMIT),
                },
                // Sem `slice`: o arquivo é o registro do período INTEIRO. O teto de
                // `sessionSummaries` existe por causa do payload da IA, e o detalhe
                // não passa por lá.
                sessions: buildPeriodSessionDetails(detailSources),
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
            // Lista magra não tem os logs — hidrata (1 query) antes de agregar.
            const list = hydrateSessions ? await hydrateSessions() : undefined;
            const built = buildPeriodStats(key, list);
            if (!built) { await alert('Sem treinos suficientes nesse período para gerar um relatório.'); return; }
            const { stats, sessions } = built;
            setPeriodReport({ type, stats, sessions });
            setPeriodAi({ status: 'loading', ai: null, error: '' });
            try {
                const res = await generatePeriodReportInsights({ type, stats });
                if (!res?.ok) { setPeriodAi({ status: 'error', ai: null, error: translateAiError(res?.error) }); return; }
                setPeriodAi({ status: 'ready', ai: (res.ai as Record<string, unknown>) || null, error: '' });
            } catch (err) {
                setPeriodAi({ status: 'error', ai: null, error: translateAiError(err) });
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
    /**
     * Gera o arquivo do período e entrega ao usuário pelo caminho ÚNICO de
     * export (`exportHtmlAsPdf`).
     *
     * Até 22/08/2026 este hook reimplementava a sequência antiga —
     * `window.open(blobUrl)` + `printWindow.print()` — que **não existe no
     * WKWebView**: no iPhone o botão "Baixar PDF" simplesmente não fazia nada, e
     * o `catch {}` vazio logo abaixo engolia a falha, então nem a mensagem de
     * erro aparecia. É a mesma família de bug que criou o
     * `exportHtmlAsPdf` em jul/2026 para as outras três telas; esta ficou de
     * fora porque o guard daquele PR listava os chamadores que já se conhecia.
     */
    const buildCurrentHtml = (current: PeriodReport, logoDataUrl: string | null) => {
        const baseUrl = typeof window !== 'undefined' ? String(window.location.origin || '').trim() : '';
        const userName = String(user?.displayName || user?.name || user?.email || '').trim();
        return buildPeriodReportHtml({
            type: current.type,
            stats: current.stats,
            // Sem o base64 a marca sai como retângulo vazio no PDF do iPhone: o
            // gerador nativo não espera a rede para resolver um `src` remoto.
            logoDataUrl,
            // O detalhe treino a treino é o que o dono pediu no arquivo — sem ele
            // o export volta a ser só o agregado do mês.
            sessions: current.sessions ?? [],
            ai: periodAi?.ai || null,
            baseUrl,
            userName,
        });
    };

    const exportCurrentReport = async () => {
        const current = periodReport && typeof periodReport === 'object' ? periodReport : null;
        if (!current || periodPdf.status === 'loading') return;
        setPeriodPdf((prev) => ({ ...prev, status: 'loading', error: '' }));
        try {
            const logoDataUrl = await fetchLogoDataUrl().catch((): null => null);
            const html = buildCurrentHtml(current, logoDataUrl);
            const dateLabel = new Date().toISOString().slice(0, 10);
            const kind = current.type === 'week' ? 'Semanal' : 'Mensal';
            const res = await exportHtmlAsPdf({
                html,
                title: `Relatório ${kind.toLowerCase()}`,
                baseFileName: `IronTracks_Relatorio_${kind}_${dateLabel}`,
                alert: (msg) => { void alert(msg); },
            });
            if (res.ok) { setPeriodPdf({ status: 'ready', url: null, blob: null, error: '' }); return; }
            if (res.via === 'cancelled') { setPeriodPdf({ status: 'idle', url: null, blob: null, error: '' }); return; }
            setPeriodPdf({ status: 'error', url: null, blob: null, error: res.error || 'Falha ao gerar o arquivo do relatório.' });
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setPeriodPdf({ status: 'error', url: null, blob: null, error: msg || 'Falha ao gerar PDF' });
        }
    };

    const downloadPeriodPdf = exportCurrentReport;

    // ── copyShareText ────────────────────────────────────────────────────────
    // O botão "Compartilhar" saiu do rodapé: ele chamava `navigator.share({ text })`
    // com as 6 linhas de `buildShareText`, e o share sheet do iOS transforma
    // texto solto em `.txt` — era isso que chegava do outro lado (relato do
    // dono, 22/08/2026). Compartilhar o ARQUIVO é o que o export já faz no iOS,
    // então sobrou aqui só a cópia do resumo, para quem quer colar num chat.
    const copyShareText = async () => {
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

        // Só clipboard — `navigator.share({ text })` era o caminho que virava
        // `.txt` no share sheet do iOS. Quem quer arquivo usa Compartilhar.
        try {
            const nav = typeof navigator !== 'undefined' ? navigator : null;
            if (nav?.clipboard && typeof nav.clipboard.writeText === 'function') {
                await nav.clipboard.writeText(text); setShareError('');
                await alert('Resumo copiado para a área de transferência.'); return;
            }
            const copied = await legacyCopy();
            if (copied) { setShareError(''); await alert('Resumo copiado para a área de transferência.'); return; }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            const copied = await legacyCopy();
            if (copied) { setShareError(''); await alert('Resumo copiado para a área de transferência.'); return; }
            setShareError(msg || 'Falha ao copiar');
            await alert('Seu navegador bloqueou a cópia automática. Selecione o texto abaixo e copie manualmente.', 'Cópia indisponível');
            return;
        }
        setShareError('A cópia automática não está disponível neste navegador.');
        await alert('Cópia automática indisponível. Selecione o texto abaixo e copie manualmente.', 'Cópia indisponível');
    };

    return {
        periodReport, periodAi, periodPdf, shareError,
        buildPeriodStats, buildShareText,
        openPeriodReport, closePeriodReport,
        downloadPeriodPdf, copyShareText,
    };
}

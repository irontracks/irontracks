'use client';

import { useState } from 'react';
import { generatePeriodReportInsights } from '@/actions/workout-actions';
import { buildPeriodReportHtml } from '@/utils/report/buildPeriodReportHtml';
import { translateAiError } from '@/utils/ai/clientErrors';
import { PeriodReport, PeriodAiState, PeriodPdfState, WorkoutSummary } from '@/components/historyListTypes';
import { exportHtmlAsPdf } from '@/utils/report/exportHtmlAsPdf';
import { fetchLogoDataUrl } from '@/utils/report/fetchLogoDataUrl';
import { buildPeriodStats as buildPeriodStatsPure, REPORT_DAYS_WEEK, REPORT_DAYS_MONTH } from '@/utils/report/periodStats';


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
    // Puro em utils/report/periodStats.ts — o dossiê usa a MESMA conta.
    const buildPeriodStats = (days: unknown, listOverride?: WorkoutSummary[]) =>
        buildPeriodStatsPure(Array.isArray(historyItems) ? historyItems : [], days, listOverride);

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

"use client"
import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Download, ArrowLeft, FileText, Code, Users, Sparkles, Loader2, Check, MessageSquare } from 'lucide-react';
import { buildReportHTML } from '@/utils/report/buildHtml';
import { workoutPlanHtml } from '@/utils/report/templates';
import { generatePostWorkoutInsights, applyProgressionToNextTemplate } from '@/actions/workout-actions';
import { useVipCredits } from '@/hooks/useVipCredits';
import StoryComposer from '@/components/StoryComposer';
import CoachChatModal from '@/components/CoachChatModal';
import { FEATURE_KEYS, isFeatureEnabled } from '@/utils/featureFlags';
import { getErrorMessage } from '@/utils/errorMessage'
import { escapeHtml } from '@/utils/escapeHtml'
import {
    formatDate as sharedFormatDate,
    formatDuration as sharedFormatDuration,
    normalizeExerciseKey,
} from '@/utils/report/formatters'
import { ReportMetricsPanel } from '@/components/workout-report/ReportMetricsPanel'
import { MuscleTrendPanel } from '@/components/workout-report/MuscleTrendPanel'
import { MuscleTrend4wPanel } from '@/components/workout-report/MuscleTrend4wPanel'
import { ExerciseTrendPanel } from '@/components/workout-report/ExerciseTrendPanel'
import { ReportCheckinPanel } from '@/components/workout-report/ReportCheckinPanel'
import { ReportAiSection } from '@/components/workout-report/ReportAiSection'
import { ReportSummaryCards } from '@/components/workout-report/ReportSummaryCards'
import { ReportExerciseCard } from '@/components/workout-report/ReportExerciseCard'
import {
    useReportData,
    remapPrevLogsByCanonical,
    remapPrevBaseMsByCanonical,
    applyCanonicalNamesToSession,
    type AiState,
} from '@/hooks/useReportData'
import { MUSCLE_BY_ID } from '@/utils/muscleMapConfig'

type AnyObj = Record<string, unknown>

const buildSparklinePoints = (values: number[], width: number, height: number) => {
    const safe = values.map((v) => (Number.isFinite(v) ? v : 0))
    const max = Math.max(1, ...safe)
    const min = Math.min(0, ...safe)
    const span = max - min || 1
    return safe
        .map((v, i) => {
            const x = (width / Math.max(1, safe.length - 1)) * i
            const y = height - ((v - min) / span) * height
            return `${x.toFixed(1)},${y.toFixed(1)}`
        })
        .join(' ')
};

interface WorkoutReportProps {
    session: AnyObj | null
    previousSession?: AnyObj | null
    user: AnyObj | null
    isVip?: boolean
    onClose: () => void
    settings?: AnyObj | null
    onUpgrade?: () => void
}

const WorkoutReport = ({ session, previousSession, user, isVip, onClose, settings, onUpgrade }: WorkoutReportProps) => {
    const safeSession = session && typeof session === 'object' ? (session as AnyObj) : null;
    const reportRef = useRef<HTMLDivElement | null>(null);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [showStory, setShowStory] = useState(false);
    const storiesV2Enabled = useMemo(() => isFeatureEnabled(settings, FEATURE_KEYS.storiesV2), [settings]);
    const [showStoryPrompt, setShowStoryPrompt] = useState(false);
    const [showCoachChat, setShowCoachChat] = useState(false);
    const { credits } = useVipCredits();
    const formatLimit = (limit: number | null | undefined) => (limit == null ? '∞' : limit > 1000 ? '∞' : limit)
    const isInsightsExhausted = (entry?: { used: number; limit: number | null }) => !!entry && entry.limit !== null && entry.used >= entry.limit
    // Celebration splash — 8.1
    const [showSplash, setShowSplash] = useState(true);
    useEffect(() => { const t = setTimeout(() => setShowSplash(false), 2500); return () => clearTimeout(t); }, []);

    // ── Data hook ──────────────────────────────────────────────────────────
    const {
        supabase,
        effectivePreviousSession,
        resolvePreviousFromHistory,
        targetUserId,
        preCheckin: rawPreCheckin,
        postCheckin: rawPostCheckin,
        aiState, setAiState,
        applyState, setApplyState,
        sessionLogs, currentVolume, volumeDelta, calories, outdoorBike,
        reportMeta, reportTotals, reportRest, reportWeekly, reportLoadFlags,
        prevLogsMap, prevBaseMsMap,
        muscleTrend, muscleTrend4w, exerciseTrend,
        isGenerating, setIsGenerating,
        pdfUrl, setPdfUrl, pdfBlob, setPdfBlob, pdfFrameRef,
    } = useReportData({ session, previousSession, user });

    useEffect(() => {
        if (!storiesV2Enabled) { setShowStoryPrompt(false); return; }
        if (!session) { setShowStoryPrompt(false); return; }
        setShowStoryPrompt(true);
    }, [storiesV2Enabled, session]);

    // Use shared formatters
    const formatDate = sharedFormatDate;
    const formatDuration = sharedFormatDuration;
    const getCurrentDate = () => new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const prevSessionLogs: Record<string, unknown> = effectivePreviousSession?.logs && typeof effectivePreviousSession.logs === 'object' ? (effectivePreviousSession.logs as Record<string, unknown>) : {};

    if (!session) return null;

    const handleApplyProgression = async () => {
        if (!session) return;
        const ai = aiState?.result && typeof aiState.result === 'object' ? (aiState.result as AnyObj) : null
        if (!ai) return;
        const items = Array.isArray(ai.progression) ? ai.progression : [];
        if (!items.length) return;
        if (applyState.status === 'loading') return;
        setApplyState({ status: 'loading', error: '', templateId: null });
        try {
            const res = await applyProgressionToNextTemplate({
                session,
                historyId: session.id ?? null,
                progression: items
            });
            if (!res || res.ok === false) {
                throw new Error((typeof res?.error === 'string' ? res.error : null) || 'Falha ao aplicar progressão');
            }
            setApplyState({
                status: 'success',
                error: '',
                templateId: (res.templateId && typeof res.templateId === 'string') ? res.templateId : null
            });
        } catch (e: unknown) {
            const msg = getErrorMessage(e) ? String(getErrorMessage(e)) : String(e);
            setApplyState({ status: 'error', error: msg || 'Falha ao aplicar progressão', templateId: null });
        }
    };

    const handleDownloadPDF = async () => {
        try {
            setIsGenerating(true);
            try { if (pdfUrl) URL.revokeObjectURL(pdfUrl); } catch { }
            const prev = effectivePreviousSession ?? (await resolvePreviousFromHistory());
            let canonicalMap: Record<string, unknown> = {};
            try {
                const currentNames = (Array.isArray(session?.exercises) ? (session.exercises as unknown[]) : [])
                    .map((e: unknown) => {
                        const exObj = e && typeof e === 'object' ? (e as AnyObj) : ({} as AnyObj)
                        return exObj?.name
                    })
                    .filter(Boolean);
                const prevNames = (Array.isArray((prev as AnyObj | null)?.exercises) ? (((prev as AnyObj).exercises) as unknown[]) : [])
                    .map((e: unknown) => {
                        const exObj = e && typeof e === 'object' ? (e as AnyObj) : ({} as AnyObj)
                        return exObj?.name
                    })
                    .filter(Boolean);
                const allNames = Array.from(new Set([...currentNames, ...prevNames].map((v) => String(v || '').trim()).filter(Boolean))).slice(0, 120);
                if (allNames.length) {
                    const resp = await fetch('/api/exercises/canonicalize', {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ names: allNames, mode: 'prefetch' }),
                    });
                    const json = await resp.json().catch((): unknown => null);
                    if (resp.ok && json?.ok && json?.map && typeof json.map === 'object') {
                        canonicalMap = json.map as Record<string, unknown>;
                    }
                }
            } catch { }

            const sessionForReport = applyCanonicalNamesToSession(session, canonicalMap);
            const prevForReport = applyCanonicalNamesToSession(prev, canonicalMap);
            const prevLogsForReport = remapPrevLogsByCanonical(prevLogsMap, canonicalMap);
            const prevBaseForReport = remapPrevBaseMsByCanonical(prevBaseMsMap, canonicalMap);
            let aiToUse: unknown = aiState?.result || (session?.ai && typeof session.ai === 'object' ? session.ai : null) || null;
            if (!aiToUse) {
                try {
                    const res = await generatePostWorkoutInsights({
                        workoutId: typeof session?.id === 'string' ? session.id : null,
                        session
                    });
                    if (res?.ok && res?.ai) {
                        aiToUse = res.ai;
                        setAiState({ loading: false, error: null, result: (res.ai && typeof res.ai === 'object' ? (res.ai as Record<string, unknown>) : null), cached: !!res.saved });
                    }
                } catch { }
            }
            const html = buildReportHTML(sessionForReport, prevForReport, String(user?.displayName || user?.email || ''), calories, {
                prevLogsByExercise: prevLogsForReport,
                prevBaseMsByExercise: prevBaseForReport,
                ai: aiToUse || null,
            });

            const title = String(session?.workoutTitle || 'Treino').trim() || 'Treino'
            const fileName = `${title.replace(/\s+/g, '_')}_irontracks.html`

            // iOS WKWebView blocks window.open() and print().
            // Web Share API: opens native share sheet → user taps "Print" → save as PDF.
            const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
            if (canShare) {
                try {
                    const blob = new Blob([html], { type: 'text/html' })
                    const file = new File([blob], fileName, { type: 'text/html' })
                    const canShareFiles = typeof (navigator as { canShare?: (data: { files: File[] }) => boolean }).canShare === 'function'
                        && (navigator as { canShare: (data: { files: File[] }) => boolean }).canShare({ files: [file] })
                    if (canShareFiles) {
                        await navigator.share({ files: [file], title: `${title} • IronTracks` })
                    } else {
                        const url = URL.createObjectURL(blob)
                        await navigator.share({ title: `${title} • IronTracks`, url })
                        URL.revokeObjectURL(url)
                    }
                    setShowExportMenu(false)
                    return
                } catch (shareErr) {
                    const msg = shareErr instanceof Error ? shareErr.message : ''
                    if (msg.toLowerCase().includes('cancel') || msg.toLowerCase().includes('abort')) return
                    // other error: fall through to desktop fallback
                }
            }

            // Desktop fallback: open new tab + native print dialog (Save as PDF)
            const printWindow = window.open('', '_blank');
            if (printWindow) {
                printWindow.document.open();
                printWindow.document.write(html);
                printWindow.document.close();
                setTimeout(() => {
                    try {
                        printWindow.focus();
                        printWindow.print();
                    } catch { }
                }, 500);
            } else {
                // Last resort: downloadable HTML file
                const blob = new Blob([html], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
            }

        } catch (e: unknown) {
            alert('Não foi possível abrir impressão: ' + (getErrorMessage(e)) + '\nPermita pop-ups para este site.');
        } finally {
            setIsGenerating(false);
            setTimeout(() => setIsGenerating(false), 500);
        }
    };

    const handleGenerateAi = async () => {
        if (!session) return;
        if (aiState?.loading) return;
        setAiState((prev: AiState) => ({ ...(prev || { loading: false, error: null, result: null, cached: false }), loading: true, error: null, cached: false }));
        try {
            const res = await generatePostWorkoutInsights({
                workoutId: typeof session?.id === 'string' ? session.id : null,
                session
            });
            if (!res?.ok) {
                if (res.upgradeRequired) {
                    if (onUpgrade) onUpgrade();
                    else alert('Upgrade necessário para usar esta função.');
                }
                setAiState((prev: AiState) => ({ ...(prev || { loading: false, error: null, result: null, cached: false }), loading: false, error: String(res?.error || 'Falha ao gerar insights'), cached: false }));
                return;
            }
            setAiState({ loading: false, error: null, result: (res.ai && typeof res.ai === 'object' ? (res.ai as Record<string, unknown>) : null), cached: !!res.saved });
        } catch (e) {
            setAiState((prev: AiState) => ({ ...(prev || { loading: false, error: null, result: null, cached: false }), loading: false, error: String((e as AnyObj | null)?.message || e || 'Falha ao gerar insights'), cached: false }));
        }
    };

    const renderAiRating = () => {
        const ai = aiState?.result && typeof aiState.result === 'object' ? (aiState.result as AnyObj) : null
        const raw = ai?.rating ?? ai?.stars ?? ai?.score ?? null;
        const n = Number(raw);
        if (!Number.isFinite(n)) return null;
        const rating = Math.max(0, Math.min(5, Math.round(n)));
        const reason = String(ai?.rating_reason || ai?.ratingReason || ai?.reason || '').trim();
        return (
            <div className="bg-neutral-950 rounded-xl border border-neutral-800 p-4">
                <div className="text-xs font-black uppercase tracking-widest text-yellow-500 mb-2">Avaliação da IA</div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center text-[20px] leading-none tracking-[0.25em] text-yellow-400">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <span key={i} className={i < rating ? 'opacity-100' : 'opacity-20'}>
                                ★
                            </span>
                        ))}
                    </div>
                    <div className="text-xs font-black text-neutral-200">{rating}/5</div>
                </div>
                {reason ? <div className="mt-2 text-sm text-neutral-200">{reason}</div> : null}
            </div>
        );
    };

    const handlePartnerPlan = (participant: unknown) => {
        try {
            const part = participant && typeof participant === 'object' ? (participant as AnyObj) : null
            if (!part) return;
            const exercises = Array.isArray(session?.exercises) ? (session.exercises as unknown[]) : [];
            const workout = {
                title: escapeHtml(session?.workoutTitle || 'Treino'),
                exercises: exercises.map((ex: unknown) => {
                    const e = ex && typeof ex === 'object' ? (ex as AnyObj) : ({} as AnyObj)
                    return ({
                        name: escapeHtml(e?.name),
                        sets: Number(e?.sets) || 0,
                        reps: escapeHtml(e?.reps),
                        rpe: escapeHtml(e?.rpe),
                        cadence: escapeHtml(e?.cadence),
                        restTime: escapeHtml(e?.restTime),
                        method: escapeHtml(e?.method),
                        notes: escapeHtml(e?.notes)
                    })
                })
            };
            const partnerUser = {
                displayName: escapeHtml(part?.name || part?.uid || ''),
                email: escapeHtml(part?.email || '')
            };
            const html = workoutPlanHtml(workout, partnerUser);
            const win = window.open('', '_blank');
            if (!win) {
                alert('Não foi possível abrir o PDF do parceiro.\nAtive pop-ups para este site e tente novamente.');
                return;
            }
            win.document.open();
            win.document.write(html);
            win.document.close();
            win.focus();
            setTimeout(() => {
                try {
                    win.print();
                } catch { }
            }, 300);
        } catch (e: unknown) {
            alert('Não foi possível gerar o PDF do parceiro: ' + (getErrorMessage(e)));
        }
    };

    const closePreview = () => {
        try { if (pdfUrl) URL.revokeObjectURL(pdfUrl); } catch { }
        setPdfUrl(null);
        setPdfBlob(null);
    };

    const handlePrintIframe = () => {
        try { pdfFrameRef.current?.contentWindow?.print(); } catch { }
    };

    const handleShare = async () => {
        try {
            if (!pdfUrl && !pdfBlob) {
                alert('Gere o PDF antes de compartilhar.');
                return;
            }
            const title = 'Relatório IronTracks';
            if (navigator.share) {
                const isPdf = String(pdfBlob?.type || '').toLowerCase() === 'application/pdf';
                const fileName = isPdf ? 'relatorio-irontracks.pdf' : 'relatorio-irontracks.html';
                const mime = isPdf ? 'application/pdf' : 'text/html';
                if (pdfBlob && navigator.canShare && navigator.canShare({ files: [new File([pdfBlob], fileName, { type: mime })] })) {
                    const file = new File([pdfBlob], fileName, { type: mime });
                    await navigator.share({ files: [file], title });
                    return;
                }
                if (pdfUrl) await navigator.share({ title, url: pdfUrl });
                return;
            }
            if (!pdfUrl) {
                alert('Não foi possível gerar o link do PDF. Tente novamente.');
                return;
            }
            const a = document.createElement('a');
            a.href = pdfUrl;
            const isPdf = String(pdfBlob?.type || '').toLowerCase() === 'application/pdf';
            a.download = isPdf ? 'relatorio-irontracks.pdf' : 'relatorio-irontracks.html';
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (e) {
            alert('Não foi possível compartilhar. Baixei o arquivo para você.\n+Abra com seu gerenciador e compartilhe.');
            try {
                if (!pdfUrl) return;
                const a = document.createElement('a');
                a.href = pdfUrl;
                const isPdf = String(pdfBlob?.type || '').toLowerCase() === 'application/pdf';
                a.download = isPdf ? 'relatorio-irontracks.pdf' : 'relatorio-irontracks.html';
                document.body.appendChild(a);
                a.click();
                a.remove();
            } catch { }
        }
    };

    const handleDownloadJson = () => {
        try {
            const payload = safeSession || {};
            const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(payload, null, 2))}`;
            const link = document.createElement('a');
            link.href = jsonString;
            const baseName = String(safeSession?.workoutTitle || 'Treino');
            link.download = `${baseName}_${new Date().toISOString()}.json`;
            document.body.appendChild(link);
            link.click();
            link.remove();
        } finally {
            setShowExportMenu(false);
        }
    };

    const teamMeta = safeSession?.teamMeta && typeof safeSession.teamMeta === 'object' ? (safeSession.teamMeta as AnyObj) : null;
    const rawParticipants = teamMeta && Array.isArray(teamMeta.participants) ? (teamMeta.participants as unknown[]) : [];
    const currentUserId = user?.id || user?.uid || null;
    const partners = rawParticipants.filter((p: unknown) => {
        const part = p && typeof p === 'object' ? (p as AnyObj) : ({} as AnyObj)
        const uid = part && (part.uid || part.id || null);
        if (!uid || !currentUserId) return true;
        return uid !== currentUserId;
    });

    const isTeamSession = partners.length > 0;
    const exercisesList = Array.isArray(safeSession?.exercises) ? (safeSession.exercises as unknown[]) : [];
    const preCheckin = (() => {
        const local = session?.preCheckin && typeof session.preCheckin === 'object' ? (session.preCheckin as AnyObj) : null;
        const db = rawPreCheckin || null;
        if (db) {
            const answers = db?.answers && typeof db.answers === 'object' ? (db.answers as AnyObj) : {};
            const timeMinutes = answers?.time_minutes ?? answers?.timeMinutes ?? null;
            const base: AnyObj = local ? ({ ...local } as AnyObj) : {};
            if (db?.energy != null) base.energy = db.energy;
            if (db?.soreness != null) base.soreness = db.soreness;
            if (timeMinutes != null && String(timeMinutes) !== '') base.timeMinutes = timeMinutes;
            if (db?.notes != null && String(db.notes).trim()) base.notes = db.notes;
            return base;
        }
        return local;
    })();
    const postCheckin = (() => {
        const local = session?.postCheckin && typeof session.postCheckin === 'object' ? (session.postCheckin as AnyObj) : null;
        const db = rawPostCheckin || null;
        if (db) {
            const answers = db?.answers && typeof db.answers === 'object' ? (db.answers as AnyObj) : {};
            const rpe = answers?.rpe ?? null;
            const base: AnyObj = local ? ({ ...local } as AnyObj) : {};
            if (rpe != null && String(rpe) !== '') base.rpe = rpe;
            if (db?.mood != null) base.satisfaction = db.mood;
            if (db?.soreness != null) base.soreness = db.soreness;
            if (db?.notes != null && String(db.notes).trim()) base.notes = db.notes;
            return base;
        }
        return local;
    })();
    const checkinRecommendations = (() => {
        const toNumberOrNull = (v: unknown) => {
            try {
                const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
                return Number.isFinite(n) ? n : null;
            } catch {
                return null;
            }
        };
        const recs: string[] = [];
        const preEnergy = toNumberOrNull(preCheckin?.energy);
        const preSoreness = toNumberOrNull(preCheckin?.soreness);
        const preTime = toNumberOrNull(preCheckin?.timeMinutes);
        const postRpe = toNumberOrNull(postCheckin?.rpe);
        const postSatisfaction = toNumberOrNull(postCheckin?.satisfaction);
        const postSoreness = toNumberOrNull(postCheckin?.soreness);

        if ((preSoreness != null && preSoreness >= 7) || (postSoreness != null && postSoreness >= 7)) {
            recs.push('Dor alta: reduzir volume/carga 20–30% e priorizar técnica + mobilidade.');
        }
        if (preEnergy != null && preEnergy <= 2) {
            recs.push('Energia baixa: mantenha o treino mais curto, evite falha e foque em recuperação (sono/estresse).');
        }
        if (postRpe != null && postRpe >= 9) {
            recs.push('RPE alto: reduza um pouco a intensidade e aumente descanso entre séries.');
        }
        if (
            postRpe != null
            && postRpe >= 9
            && (
                (preSoreness != null && preSoreness >= 7)
                || (postSoreness != null && postSoreness >= 7)
                || (postSatisfaction != null && postSatisfaction <= 3)
            )
        ) {
            recs.push('Sinais de fadiga: considere 5–7 dias de deload (−10–20% carga ou −1 série por exercício).');
        }
        if (postSatisfaction != null && postSatisfaction <= 2) {
            recs.push('Satisfação baixa: revise seleção de exercícios e meta da sessão para manter consistência.');
        }
        if (preTime != null && preTime > 0 && preTime < 45) {
            recs.push('Pouco tempo: use um treino “mínimo efetivo” (menos exercícios e mais foco).');
        }
        return recs;
    })();
    const workoutTitleRaw = String(session?.workoutTitle || '').trim();
    const workoutTitleMain = (() => {
        const m = workoutTitleRaw.match(/^\s*.+?\s*-\s*(.+)$/);
        const v = (m ? m[1] : workoutTitleRaw).trim();
        return v || 'Treino';
    })();
    const ai = aiState?.result && typeof aiState.result === 'object' ? (aiState.result as AnyObj) : null

    return (
        <div className="fixed inset-0 z-[1000] bg-neutral-950 text-white flex flex-col">
            {/* 8.1 — Celebration Splash Overlay */}
            {showSplash && (
                <div
                    className="fixed inset-0 z-[1200] flex flex-col items-center justify-center bg-neutral-950 animate-fade-in"
                    onClick={() => setShowSplash(false)}
                >
                    {/* Confetti particles */}
                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                        {[...Array(18)].map((_, i) => (
                            <div
                                key={i}
                                className="absolute w-2 h-2 rounded-full animate-bounce"
                                style={{
                                    left: `${(i * 17 + 8) % 95}%`,
                                    top: `${(i * 23 + 5) % 90}%`,
                                    backgroundColor: ['#eab308', '#f59e0b', '#84cc16', '#22c55e', '#a78bfa', '#f472b6', '#60a5fa'][i % 7],
                                    animationDelay: `${(i * 0.15) % 1}s`,
                                    animationDuration: `${0.8 + (i % 3) * 0.3}s`,
                                }}
                            />
                        ))}
                    </div>
                    <div className="relative z-10 flex flex-col items-center gap-4 text-center px-6">
                        <div className="text-6xl">🏆</div>
                        <div className="text-3xl sm:text-4xl font-black uppercase tracking-tight text-white">
                            Treino Finalizado!
                        </div>
                        <div className="text-lg font-black text-yellow-400 truncate max-w-xs">
                            {String(safeSession?.workoutTitle || '')}
                        </div>
                        <div className="flex items-center gap-6 mt-2">
                            {Number(safeSession?.totalTime) > 0 && (
                                <div className="text-center">
                                    <div className="text-2xl font-black text-white">
                                        {Math.floor(Number(safeSession?.totalTime ?? 0) / 60)}min
                                    </div>
                                    <div className="text-[10px] font-black uppercase text-neutral-500">Duração</div>
                                </div>
                            )}
                        </div>
                        <div className="mt-4 text-xs font-bold text-neutral-500">Toque para continuar</div>
                    </div>
                </div>
            )}
            <div className={`sticky top-0 z-[1100] no-print bg-neutral-950/95 backdrop-blur border-b border-neutral-800/80 px-4 md:px-6 pt-safe pb-3 ${isGenerating ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="max-w-4xl mx-auto flex items-center justify-between gap-2">
                    <button
                        onClick={onClose}
                        className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors text-sm font-black"
                    >
                        <ArrowLeft size={16} /> Fechar
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <button
                                onClick={() => setShowExportMenu(v => !v)}
                                className="min-h-[44px] flex items-center gap-2 px-4 bg-neutral-900 hover:bg-neutral-800 text-neutral-100 rounded-xl transition-colors border border-neutral-800"
                            >
                                <Download size={16} className="text-yellow-500" />
                                <span className="text-sm font-black">Salvar</span>
                            </button>
                            {showExportMenu && (
                                <div className="absolute right-0 mt-2 w-52 bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden">
                                    <button onClick={() => { setShowExportMenu(false); handleDownloadPDF(); }} className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm text-neutral-200 hover:bg-neutral-900">
                                        <FileText size={16} className="text-yellow-500" />
                                        <span className="font-bold">Salvar PDF</span>
                                    </button>
                                    <button onClick={handleDownloadJson} className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm text-neutral-200 hover:bg-neutral-900">
                                        <Code size={16} className="text-yellow-500" />
                                        <span className="font-bold">Salvar JSON</span>
                                    </button>
                                </div>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => { setShowExportMenu(false); setShowStoryPrompt(false); setShowStory(true); }}
                            className="min-h-[44px] bg-yellow-500 hover:bg-yellow-400 text-black px-4 rounded-xl font-black shadow-lg inline-flex items-center gap-2"
                        >
                            <span className="text-xs uppercase tracking-widest">Foto</span>
                        </button>
                        <button onClick={onClose} className="min-h-[44px] bg-neutral-900 hover:bg-neutral-800 text-white px-4 rounded-xl font-black shadow-lg inline-flex items-center gap-2 border border-neutral-800">
                            <ArrowLeft size={18} />
                            <span className="text-xs uppercase tracking-widest">Voltar</span>
                        </button>
                    </div>
                    {storiesV2Enabled && showStoryPrompt && !showStory ? (
                        <div className="max-w-4xl mx-auto mt-3">
                            <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="text-xs font-black uppercase tracking-widest text-yellow-500">1 clique</div>
                                    <div className="text-sm font-black text-white">Quer criar um story deste treino agora?</div>
                                    <div className="text-xs text-neutral-300">Gera a arte e você escolhe publicar ou só compartilhar.</div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => { setShowStoryPrompt(false); setShowStory(true); }}
                                        className="min-h-[40px] px-4 rounded-xl bg-yellow-500 text-black font-black hover:bg-yellow-400 transition-colors"
                                    >
                                        Criar story
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowStoryPrompt(false)}
                                        className="min-h-[40px] px-4 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black hover:bg-neutral-800 transition-colors"
                                    >
                                        Agora não
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>

                <div className="flex-1 overflow-y-auto bg-neutral-950" style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
                    <div ref={reportRef} className="min-h-screen bg-neutral-950 text-white p-6 md:p-8 max-w-4xl mx-auto">
                        <div className="pb-8 mb-8">
                            <div className="flex items-start justify-between gap-6">
                                <div className="min-w-0">
                                    <div className="flex flex-col">
                                        <div className="text-xl font-black tracking-tight leading-none">
                                            <span className="text-neutral-100">IRON</span>
                                            <span className="text-yellow-500">TRACKS</span>
                                        </div>
                                        <div className="mt-1 text-[9px] font-black uppercase tracking-[0.24em] text-neutral-400 leading-none">
                                            Relatório de Performance
                                        </div>
                                    </div>

                                    <div className="mt-4 min-w-0">
                                        <h1 className="text-4xl sm:text-5xl font-black uppercase leading-tight tracking-tight text-white text-balance break-normal hyphens-none">
                                            {workoutTitleMain}
                                        </h1>
                                    </div>
                                </div>

                                <div className="shrink-0 text-right">
                                    <div className="font-mono text-xs font-semibold text-neutral-300">
                                        {formatDate(safeSession?.date)}
                                    </div>
                                </div>
                            </div>

                            <div className="relative mt-6">
                                <div className="h-px bg-neutral-800" />
                                <div className="absolute left-0 top-0 h-px w-28 bg-yellow-500" />
                            </div>
                        </div>

                        {reportMeta && (
                            <ReportMetricsPanel
                                reportTotals={reportTotals}
                                reportRest={reportRest}
                                reportWeekly={reportWeekly}
                                reportLoadFlags={reportLoadFlags}
                            />
                        )}

                        {muscleTrend.status === 'ready' && muscleTrend.data && (
                            <MuscleTrendPanel data={muscleTrend.data} muscleById={MUSCLE_BY_ID} />
                        )}

                        {muscleTrend4w.status === 'ready' && muscleTrend4w.data && (
                            <MuscleTrend4wPanel
                                data={muscleTrend4w.data}
                                muscleById={MUSCLE_BY_ID}
                                buildSparklinePoints={buildSparklinePoints}
                            />
                        )}

                        {exerciseTrend.status === 'ready' && exerciseTrend.data && exerciseTrend.data.series.length > 0 && (
                            <ExerciseTrendPanel data={exerciseTrend.data} buildSparklinePoints={buildSparklinePoints} />
                        )}

                        {reportMeta && Array.isArray(reportMeta.exercises) && reportMeta.exercises.length > 0 && (
                            <div className="mb-8 p-4 rounded-xl border border-neutral-800 bg-neutral-900/60">
                                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                    <div className="min-w-0">
                                        <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Ordem e execução</div>
                                        <div className="text-lg font-black text-white">Detalhe por exercício</div>
                                        <div className="text-xs text-neutral-300">Ordem, descanso e volume executado.</div>
                                    </div>
                                </div>
                                <div className="mt-4 overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-neutral-950 text-neutral-400 uppercase text-[10px] font-bold">
                                            <tr>
                                                <th className="px-3 py-2">#</th>
                                                <th className="px-3 py-2">Exercício</th>
                                                <th className="px-3 py-2 text-center">Séries</th>
                                                <th className="px-3 py-2 text-center">Reps</th>
                                                <th className="px-3 py-2 text-center">Execução</th>
                                                <th className="px-3 py-2 text-center">Descanso (real)</th>
                                                <th className="px-3 py-2 text-center">Descanso (plan)</th>
                                                <th className="px-3 py-2 text-right">Peso médio</th>
                                                <th className="px-3 py-2 text-right">Volume</th>
                                                <th className="px-3 py-2 text-right">Δ Volume</th>
                                                <th className="px-3 py-2 text-right">Δ Reps</th>
                                                <th className="px-3 py-2 text-right">Δ Peso</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-neutral-800">
                                            {(reportMeta.exercises as unknown[]).map((raw, idx) => {
                                                const ex = raw && typeof raw === 'object' ? (raw as AnyObj) : null
                                                if (!ex) return null
                                                const name = String(ex.name || '').trim() || '—'
                                                const order = Number(ex.order || idx + 1)
                                                const setsDone = Number(ex.setsDone || 0)
                                                const repsDone = Number(ex.repsDone || 0)
                                                const executionMinutes = Number(ex.executionMinutes || 0)
                                                const restMinutes = Number(ex.restMinutes || 0)
                                                const rest = Number(ex.restTimePlannedSec || 0)
                                                const avgWeight = Number(ex.avgWeightKg || 0)
                                                const volume = Number(ex.volumeKg || 0)
                                                const deltaVolume = ex.delta && typeof ex.delta === 'object' ? Number((ex.delta as AnyObj).volumeKg) : NaN
                                                const deltaReps = ex.delta && typeof ex.delta === 'object' ? Number((ex.delta as AnyObj).reps) : NaN
                                                const deltaWeight = ex.delta && typeof ex.delta === 'object' ? Number((ex.delta as AnyObj).avgWeightKg) : NaN
                                                const deltaVolumeLabel = Number.isFinite(deltaVolume) ? `${deltaVolume > 0 ? '+' : ''}${deltaVolume.toFixed(1)} kg` : '—'
                                                const deltaRepsLabel = Number.isFinite(deltaReps) ? `${deltaReps > 0 ? '+' : ''}${Math.round(deltaReps)}` : '—'
                                                const deltaWeightLabel = Number.isFinite(deltaWeight) ? `${deltaWeight > 0 ? '+' : ''}${deltaWeight.toFixed(1)} kg` : '—'
                                                const deltaVolumeClass = Number.isFinite(deltaVolume) && deltaVolume < 0 ? 'text-red-300' : 'text-emerald-300'
                                                const deltaRepsClass = Number.isFinite(deltaReps) && deltaReps < 0 ? 'text-red-300' : 'text-emerald-300'
                                                const deltaWeightClass = Number.isFinite(deltaWeight) && deltaWeight < 0 ? 'text-red-300' : 'text-emerald-300'
                                                return (
                                                    <tr key={`${name}-${idx}`} className="hover:bg-neutral-800/40">
                                                        <td className="px-3 py-2 font-mono text-neutral-300">{Number.isFinite(order) ? order : idx + 1}</td>
                                                        <td className="px-3 py-2 font-semibold text-white">{name}</td>
                                                        <td className="px-3 py-2 text-center font-mono text-neutral-300">{Number.isFinite(setsDone) && setsDone > 0 ? setsDone : '—'}</td>
                                                        <td className="px-3 py-2 text-center font-mono text-neutral-300">{Number.isFinite(repsDone) && repsDone > 0 ? repsDone : '—'}</td>
                                                        <td className="px-3 py-2 text-center font-mono text-neutral-300">{Number.isFinite(executionMinutes) && executionMinutes > 0 ? `${executionMinutes.toFixed(1)} min` : '—'}</td>
                                                        <td className="px-3 py-2 text-center font-mono text-neutral-300">{Number.isFinite(restMinutes) && restMinutes > 0 ? `${restMinutes.toFixed(1)} min` : '—'}</td>
                                                        <td className="px-3 py-2 text-center font-mono text-neutral-300">{Number.isFinite(rest) && rest > 0 ? `${Math.round(rest)}s` : '—'}</td>
                                                        <td className="px-3 py-2 text-right font-mono text-neutral-200">{Number.isFinite(avgWeight) && avgWeight > 0 ? `${avgWeight.toFixed(1)} kg` : '—'}</td>
                                                        <td className="px-3 py-2 text-right font-mono text-neutral-200">{Number.isFinite(volume) && volume > 0 ? `${volume.toLocaleString('pt-BR')} kg` : '—'}</td>
                                                        <td className={`px-3 py-2 text-right font-mono ${Number.isFinite(deltaVolume) ? deltaVolumeClass : 'text-neutral-500'}`}>{deltaVolumeLabel}</td>
                                                        <td className={`px-3 py-2 text-right font-mono ${Number.isFinite(deltaReps) ? deltaRepsClass : 'text-neutral-500'}`}>{deltaRepsLabel}</td>
                                                        <td className={`px-3 py-2 text-right font-mono ${Number.isFinite(deltaWeight) ? deltaWeightClass : 'text-neutral-500'}`}>{deltaWeightLabel}</td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        <ReportCheckinPanel
                            preCheckin={preCheckin}
                            postCheckin={postCheckin}
                            recommendations={checkinRecommendations}
                        />

                        <ReportAiSection
                            ai={ai}
                            aiState={{ loading: aiState.loading, error: aiState.error, cached: aiState.cached }}
                            credits={credits}
                            applyState={applyState}
                            onGenerateAi={handleGenerateAi}
                            onApplyProgression={handleApplyProgression}
                            onOpenChat={() => setShowCoachChat(true)}
                            renderAiRating={renderAiRating}
                        />

                        {isTeamSession && (
                            <div className="mb-8 p-4 rounded-lg border border-neutral-800 bg-neutral-900/60 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-full bg-black text-white flex items-center justify-center">
                                        <Users size={18} />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-widest text-neutral-400">Treino em Equipe</p>
                                        <p className="text-sm font-semibold text-neutral-100">
                                            {partners.length === 1 ? '1 parceiro treinando com você' : `${partners.length} parceiros treinando com você`}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {partners.map((p: unknown, idx: number) => {
                                        const part = p && typeof p === 'object' ? (p as AnyObj) : ({} as AnyObj)
                                        return (
                                            <button
                                                key={String(part.uid || part.id || idx)}
                                                onClick={() => handlePartnerPlan(part)}
                                                className="px-3 py-2 rounded-full bg-black text-white text-xs font-bold uppercase tracking-wide hover:bg-neutral-900"
                                            >
                                                Ver PDF de {String(part.name || 'Parceiro')}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        <ReportSummaryCards
                            session={safeSession}
                            currentVolume={currentVolume}
                            volumeDelta={volumeDelta}
                            calories={calories}
                            outdoorBike={outdoorBike}
                            hasPreviousSession={!!effectivePreviousSession}
                        />

                        <div className="space-y-8">
                            {exercisesList.length === 0 && (
                                <div className="text-neutral-300 p-4 bg-neutral-900/60 rounded-lg border border-neutral-800">
                                    Nenhum dado de exercício registrado para este treino.
                                </div>
                            )}
                            {exercisesList.map((ex, exIdx) => {
                                const obj = (ex && typeof ex === 'object' ? ex as Record<string, unknown> : {}) as Record<string, unknown>;
                                const exKey = normalizeExerciseKey(obj?.name);
                                return (
                                    <ReportExerciseCard
                                        key={exIdx}
                                        exercise={obj}
                                        exIdx={exIdx}
                                        sessionLogs={sessionLogs}
                                        prevLogs={(Array.isArray(prevLogsMap[exKey]) ? prevLogsMap[exKey] : []) as unknown[]}
                                        baseMs={prevBaseMsMap[exKey] ?? null}
                                    />
                                );
                            })}
                        </div>
                        <div className="mt-12 pt-6 border-t border-neutral-800 text-center text-xs text-neutral-400 uppercase tracking-widest">
                            IronTracks System • {getCurrentDate()}
                        </div>
                    </div>
                </div>

                {pdfUrl && (
                    <div className="fixed inset-0 z-[1200] bg-black/80 backdrop-blur flex flex-col">
                        <div className="p-4 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between h-16 pt-safe">
                            <h3 className="text-white font-bold">Pré-visualização</h3>
                            <button onClick={closePreview} className="bg-neutral-800 text-white px-4 py-2 rounded-lg font-bold border border-neutral-700 hover:bg-neutral-700">Fechar</button>
                        </div>
                        <div className="flex-1 bg-white">
                            <iframe ref={pdfFrameRef} src={pdfUrl} className="w-full h-full" />
                        </div>
                        <div className="p-4 bg-neutral-900 border-t border-neutral-800 flex items-center justify-end gap-2 pb-safe">
                            <button onClick={handleShare} className="bg-neutral-800 text-white px-4 py-2 rounded-lg">Compartilhar</button>
                            <button onClick={handlePrintIframe} className="bg-yellow-500 text-black px-4 py-2 rounded-lg font-bold">Imprimir</button>
                        </div>
                    </div>
                )}
                {showStory ? <StoryComposer open={showStory} session={session} onClose={() => setShowStory(false)} /> : null}
                {showCoachChat && (
                    <CoachChatModal
                        isOpen={showCoachChat}
                        onClose={() => setShowCoachChat(false)}
                        session={session}
                        previousSession={effectivePreviousSession ?? undefined}
                        isVip={isVip}
                        onUpgrade={onUpgrade}
                        onSaveToReport={(summary: unknown) => {
                            setAiState((prev: AiState) => {
                                const ai = prev?.result && typeof prev.result === 'object' ? (prev.result as AnyObj) : {}
                                const current = Array.isArray(ai.summary) ? (ai.summary as unknown[]) : []
                                return { ...prev, result: { ...ai, summary: [...current, summary] } }
                            })
                        }}
                    />
                )}
            </div>
        </div>
    );
};

export default WorkoutReport;

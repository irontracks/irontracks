"use client"
import React, { useRef, useState, useEffect, useMemo, Suspense } from 'react';
import dynamic from 'next/dynamic';
import NextImage from 'next/image';
import { Download, ArrowLeft, FileText, Code, Share2 } from 'lucide-react';
import { buildReportHTML } from '@/utils/report/buildHtml';
import { fetchLogoDataUrl } from '@/utils/report/fetchLogoDataUrl';
import { workoutPlanHtml } from '@/utils/report/templates';
import { generatePostWorkoutInsights, applyProgressionToNextTemplate } from '@/actions/workout-actions';
import { useVipCredits } from '@/hooks/useVipCredits';
import { FEATURE_KEYS, isFeatureEnabled } from '@/utils/featureFlags';
import { logError } from '@/lib/logger'
import { getErrorMessage } from '@/utils/errorMessage'
import { escapeHtml } from '@/utils/escapeHtml'
import {
    formatDate as sharedFormatDate,
    formatDuration as _sharedFormatDuration,
    normalizeExerciseKey,
} from '@/utils/report/formatters'
import { ReportMetricsPanel } from '@/components/workout-report/ReportMetricsPanel'
import { ReportSummaryCards } from '@/components/workout-report/ReportSummaryCards'
import { ReportExerciseCard } from '@/components/workout-report/ReportExerciseCard'
import { ReportHighlightsPanel } from '@/components/workout-report/ReportHighlightsPanel'
import { ReportExerciseTable } from '@/components/workout-report/ReportExerciseTable'
import { ReportTeamSection } from '@/components/workout-report/ReportTeamSection'

/** Skeleton placeholder for lazy-loaded report sections */
const SectionSkeleton = () => (
    <div className="mb-8 p-4 rounded-xl border border-neutral-800 bg-neutral-900/40 animate-pulse">
        <div className="h-3 w-32 bg-neutral-800 rounded mb-3" />
        <div className="h-5 w-48 bg-neutral-800 rounded mb-2" />
        <div className="h-24 bg-neutral-800/60 rounded" />
    </div>
)

// Lazy-loaded panels (secondary data, deferred rendering)
const MuscleTrendPanel = dynamic(() => import('@/components/workout-report/MuscleTrendPanel').then(m => ({ default: m.MuscleTrendPanel })), { ssr: false, loading: () => <SectionSkeleton /> })
const ExerciseTrendPanel = dynamic(() => import('@/components/workout-report/ExerciseTrendPanel').then(m => ({ default: m.ExerciseTrendPanel })), { ssr: false, loading: () => <SectionSkeleton /> })
const ReportCheckinPanel = dynamic(() => import('@/components/workout-report/ReportCheckinPanel').then(m => ({ default: m.ReportCheckinPanel })), { ssr: false, loading: () => <SectionSkeleton /> })
const ReportAiSection = dynamic(() => import('@/components/workout-report/ReportAiSection').then(m => ({ default: m.ReportAiSection })), { ssr: false, loading: () => <SectionSkeleton /> })
const ReportMusclePieChart = dynamic(() => import('@/components/workout-report/ReportMusclePieChart').then(m => ({ default: m.ReportMusclePieChart })), { ssr: false, loading: () => <SectionSkeleton /> })

// Modals — loaded only when user opens them
const StoryComposer = dynamic(() => import('@/components/StoryComposer'), { ssr: false, loading: () => null })
const WorkoutShareCard = dynamic(() => import('@/components/WorkoutShareCard'), { ssr: false, loading: () => null })

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

const WorkoutReport = ({ session, previousSession, user, isVip: _isVip, onClose, settings, onUpgrade }: WorkoutReportProps) => {
    const safeSession = session && typeof session === 'object' ? (session as AnyObj) : null;
    const reportRef = useRef<HTMLDivElement | null>(null);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [showStory, setShowStory] = useState(false);
    const [showShareCard, setShowShareCard] = useState(false);
    const [sharing, setSharing] = useState(false);
    const storiesV2Enabled = useMemo(() => isFeatureEnabled(settings, FEATURE_KEYS.storiesV2), [settings]);
    const [_showStoryPrompt, setShowStoryPrompt] = useState(false);

    const { credits } = useVipCredits();
    const _formatLimit = (limit: number | null | undefined) => (limit == null ? '∞' : limit > 1000 ? '∞' : `${limit}`)
    const _isInsightsExhausted = (entry?: { used: number; limit: number | null }) => !!entry && entry.limit !== null && entry.used >= entry.limit
    // Celebration splash — 8.1
    const [showSplash, setShowSplash] = useState(true);
    useEffect(() => { const t = setTimeout(() => setShowSplash(false), 1200); return () => clearTimeout(t); }, []);

    // ── Data hook ──────────────────────────────────────────────────────────
    const {
        supabase: _supabase,
        effectivePreviousSession,
        targetUserId: _targetUserId,
        preCheckin: rawPreCheckin,
        postCheckin: rawPostCheckin,
        aiState, setAiState,
        applyState, setApplyState,
        sessionLogs, currentVolume, volumeDelta, volumeDeltaAbs, calories, outdoorBike,
        setsCompleted, setsPlanned, setCompletionPct,
        reportMeta, reportTotals, reportRest, reportWeekly, reportLoadFlags,
        prevLogsMap, prevBaseMsMap,
        detectedPrs, prCount, allTimePrCount, historicalBestE1rm,
        muscleTrend, muscleTrend4w, exerciseTrend,
        isGenerating, setIsGenerating,
        pdfUrl, setPdfUrl, pdfBlob, setPdfBlob, pdfFrameRef,
    } = useReportData({ session, previousSession, user, settings });

    useEffect(() => {
        if (!storiesV2Enabled) { setShowStoryPrompt(false); return; }
        if (!session) { setShowStoryPrompt(false); return; }
        setShowStoryPrompt(true);
    }, [storiesV2Enabled, session]);

    // Use shared formatters
    const formatDate = sharedFormatDate;
    const getCurrentDate = () => new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const _prevSessionLogs: Record<string, unknown> = effectivePreviousSession?.logs && typeof effectivePreviousSession.logs === 'object' ? (effectivePreviousSession.logs as Record<string, unknown>) : {};

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
            const prev = effectivePreviousSession;
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
            } catch (e) { logError('component:WorkoutReport.canonicalize', e) }

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
                } catch (e) { logError('component:WorkoutReport.generateAiForPdf', e) }
            }
            const logoDataUrl = await fetchLogoDataUrl().catch(() => null)
            const html = buildReportHTML(sessionForReport, prevForReport, String(user?.displayName || user?.email || ''), calories, {
                prevLogsByExercise: prevLogsForReport,
                prevBaseMsByExercise: prevBaseForReport,
                ai: aiToUse || null,
                logoDataUrl: logoDataUrl || undefined,
                // User profile data for accurate calorie calculation
                bodyWeightKg: Number(settings?.bodyWeightKg) || undefined,
                biologicalSex: String(settings?.biologicalSex || '').toLowerCase() || undefined,
                rpe: Number(postCheckin?.rpe) || undefined,
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
            const blobFallback = new Blob([html], { type: 'text/html' });
            const blobFallbackUrl = URL.createObjectURL(blobFallback);
            const printWindow = window.open(blobFallbackUrl, '_blank');
            if (printWindow) {
                setTimeout(() => {
                    try {
                        printWindow.focus();
                        printWindow.print();
                    } catch { }
                    setTimeout(() => URL.revokeObjectURL(blobFallbackUrl), 60_000);
                }, 500);
            } else {
                URL.revokeObjectURL(blobFallbackUrl);
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
            const blob = new Blob([html], { type: 'text/html' });
            const blobUrl = URL.createObjectURL(blob);
            const win = window.open(blobUrl, '_blank');
            if (!win) {
                URL.revokeObjectURL(blobUrl);
                alert('Não foi possível abrir o PDF do parceiro.\nAtive pop-ups para este site e tente novamente.');
                return;
            }
            setTimeout(() => {
                try { win.print(); } catch { }
                setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
            }, 400);
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
        if (sharing) return;
        setSharing(true);
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
        } catch {
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
        } finally {
            setSharing(false);
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
        <div className="fixed inset-0 z-[1000] bg-neutral-950 text-white overflow-y-auto overflow-x-hidden">
            {/* 8.1 — Celebration Splash Overlay */}
            {showSplash && (
                <button
                    type="button"
                    className="fixed inset-0 z-[1200] flex flex-col items-end justify-end bg-neutral-950 overflow-hidden w-full border-0 p-0 text-left"
                    onClick={() => setShowSplash(false)}
                >
                    {/* Victory hero — full screen background */}
                    <div className="absolute inset-0">
                        <NextImage
                            src="/report-victory.png"
                            alt=""
                            fill
                            priority
                            unoptimized
                            className="object-cover object-center"
                        />
                        {/* Bottom gradient so text is readable */}
                        <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/50 to-neutral-950/20" />
                        {/* Top vignette */}
                        <div className="absolute inset-0 bg-gradient-to-b from-neutral-950/70 via-transparent to-transparent" />
                    </div>

                    {/* Content — pinned to bottom */}
                    <div className="relative z-10 w-full px-6 pb-16 flex flex-col items-center text-center gap-3">
                        <div className="text-[10px] font-black uppercase tracking-[0.3em] text-yellow-500">IronTracks</div>
                        <div className="text-4xl sm:text-5xl font-black uppercase tracking-tight text-white leading-tight">
                            Treino Finalizado!
                        </div>
                        <div className="text-base font-black text-yellow-400 max-w-xs truncate">
                            {String(safeSession?.workoutTitle || '')}
                        </div>
                        {Number(safeSession?.totalTime) > 0 && (
                            <div className="flex items-center gap-2 px-4 py-2 rounded-full mt-1"
                                style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.3)' }}>
                                <span className="text-xl font-black text-white">
                                    {Math.floor(Number(safeSession?.totalTime ?? 0) / 60)}min
                                </span>
                                <span className="text-[10px] font-black uppercase text-yellow-500">duração</span>
                            </div>
                        )}
                        <div className="mt-3 text-xs font-bold text-neutral-400">Toque para ver o relatório</div>
                    </div>
                </button>
            )}
            {/* Fixed header bar */}
            <div className={`fixed top-0 left-0 right-0 z-[1100] no-print bg-neutral-950/95 backdrop-blur border-b border-neutral-800/80 px-3 md:px-6 pt-safe pb-1.5 ${isGenerating ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="max-w-4xl mx-auto flex items-center justify-between gap-1.5">
                    <button
                        onClick={onClose}
                        className="flex items-center gap-1.5 text-neutral-400 hover:text-white transition-colors text-sm font-black"
                    >
                        <ArrowLeft size={16} /> Fechar
                    </button>
                    <div className="flex items-center gap-1.5">
                        <div className="relative">
                            <button
                                onClick={() => setShowExportMenu(v => !v)}
                                className="min-h-[36px] flex items-center gap-1.5 px-3 bg-neutral-900 hover:bg-neutral-800 text-neutral-100 rounded-xl transition-colors border border-neutral-800"
                            >
                                <Download size={14} className="text-yellow-500" />
                                <span className="text-xs font-black">Salvar</span>
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
                            className="min-h-[36px] bg-yellow-500 hover:bg-yellow-400 text-black px-3 rounded-xl font-black shadow-lg inline-flex items-center gap-1.5"
                        >
                            <span className="text-xs uppercase tracking-widest">Storie</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => { setShowExportMenu(false); setShowStoryPrompt(false); setShowShareCard(true); }}
                            className="min-h-[36px] bg-neutral-800 hover:bg-neutral-700 text-white px-3 rounded-xl font-black inline-flex items-center gap-1.5 border border-neutral-700"
                        >
                            <Share2 size={14} className="text-yellow-500" />
                            <span className="text-xs uppercase tracking-widest">Card</span>
                        </button>
                    </div>

                </div>
            </div>

            {/* Report content — starts below fixed header with pt for safe offset */}
            <div ref={reportRef} className="bg-neutral-950 text-white p-6 md:p-8 max-w-4xl mx-auto" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 60px)' }}>
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

                        <div className="shrink-0 text-right flex flex-col items-end gap-0">
                            {/* Athlete header illustration — desktop only */}
                            <div className="hidden sm:block opacity-30 -mb-2">
                                <NextImage src="/report-athlete-header.png" alt="" width={88} height={88} unoptimized className="object-contain" />
                            </div>
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

                {/* ─── HITEK Highlights Panel ───────────────────────────────────────── */}
                <ReportHighlightsPanel
                    prCount={prCount}
                    allTimePrCount={allTimePrCount}
                    detectedPrs={detectedPrs}
                    volumeDeltaAbs={volumeDeltaAbs}
                    volumeDelta={volumeDelta}
                    currentVolume={currentVolume}
                    setCompletionPct={setCompletionPct}
                    setsCompleted={setsCompleted}
                    setsPlanned={setsPlanned}
                />

                {reportMeta && (
                    <ReportMetricsPanel
                        reportTotals={reportTotals}
                        reportRest={reportRest}
                        reportWeekly={reportWeekly}
                        reportLoadFlags={reportLoadFlags}
                    />
                )}

                <Suspense fallback={<SectionSkeleton />}>
                    {muscleTrend.status === 'ready' && muscleTrend.data && (
                        <MuscleTrendPanel
                            data={muscleTrend.data}
                            muscleById={MUSCLE_BY_ID}
                            series={muscleTrend4w.status === 'ready' ? muscleTrend4w.data?.series : undefined}
                            buildSparklinePoints={buildSparklinePoints}
                        />
                    )}

                    {exerciseTrend.status === 'ready' && exerciseTrend.data && exerciseTrend.data.series.length > 0 && (
                        <ExerciseTrendPanel data={exerciseTrend.data} buildSparklinePoints={buildSparklinePoints} />
                    )}

                    {/* ─── Muscle Volume Pie Chart ─────────────────────────────────── */}
                    {muscleTrend.status === 'ready' && muscleTrend.data && (
                        <ReportMusclePieChart data={muscleTrend.data as Record<string, unknown>} />
                    )}
                </Suspense>

                <ReportExerciseTable
                    exercises={reportMeta?.exercises as unknown[] || []}
                    historicalBestE1rm={historicalBestE1rm}
                />

                <ReportCheckinPanel
                    preCheckin={preCheckin}
                    postCheckin={postCheckin}
                    recommendations={checkinRecommendations}
                />

                {/* ─── AI Section Header with Brain illustration ───────────────────── */}
                <div className="mb-3 flex items-center gap-3">
                    <div className="w-14 h-14 rounded-2xl overflow-hidden shrink-0 opacity-90"
                        style={{ background: 'rgba(15,10,30,0.8)', border: '1px solid rgba(100,60,255,0.2)', boxShadow: '0 0 16px rgba(80,40,255,0.12)' }}>
                        <NextImage src="/report-ai-brain.png" alt="" width={56} height={56} unoptimized className="w-full h-full object-cover" />
                    </div>
                    <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-purple-400">Análise Inteligente</div>
                        <div className="text-base font-black text-white leading-tight">Coach IA & Insights</div>
                    </div>
                </div>
                <ReportAiSection
                    ai={ai}
                    aiState={{ loading: aiState.loading, error: aiState.error, cached: aiState.cached }}
                    credits={credits}
                    applyState={applyState}
                    onGenerateAi={handleGenerateAi}
                    onApplyProgression={handleApplyProgression}

                    renderAiRating={renderAiRating}
                />

                <ReportTeamSection
                    isTeamSession={isTeamSession}
                    partners={partners}
                    onPartnerPlan={handlePartnerPlan}
                />

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
                <div className="mt-12 pt-6 border-t border-neutral-800 text-center text-xs text-neutral-400 uppercase tracking-widest flex items-center justify-center gap-2">
                    <NextImage src="/report-barbell-mini.png" alt="" width={18} height={18} unoptimized className="opacity-50 object-contain" />
                    IronTracks System • {getCurrentDate()}
                    <NextImage src="/report-barbell-mini.png" alt="" width={18} height={18} unoptimized className="opacity-50 object-contain scale-x-[-1]" />
                </div>
            </div>

            {pdfUrl && (
                <div className="fixed inset-0 z-[1200] bg-black/80 backdrop-blur flex flex-col">
                    <div className="p-4 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between h-16 pt-safe">
                        <h3 className="text-white font-bold">Pré-visualização</h3>
                        <button onClick={closePreview} className="bg-neutral-800 text-white px-4 py-2 rounded-lg font-bold border border-neutral-700 hover:bg-neutral-700">Fechar</button>
                    </div>
                    <div className="flex-1 bg-white">
                        <iframe ref={pdfFrameRef} src={pdfUrl} className="w-full h-full" title="Relatório de treino PDF" />
                    </div>
                    <div className="p-4 bg-neutral-900 border-t border-neutral-800 flex items-center justify-end gap-2 pb-safe">
                        <button onClick={handleShare} disabled={sharing} className="bg-neutral-800 text-white px-4 py-2 rounded-lg disabled:opacity-60">Compartilhar</button>
                        <button onClick={handlePrintIframe} className="bg-yellow-500 text-black px-4 py-2 rounded-lg font-bold">Imprimir</button>
                    </div>
                </div>
            )}
            {showStory ? <StoryComposer open={showStory} session={session} calories={calories} onClose={() => setShowStory(false)} /> : null}
            {showShareCard ? (
                <WorkoutShareCard
                    session={safeSession}
                    dateStr={formatDate(safeSession?.date)}
                    workoutTitle={workoutTitleMain}
                    calories={typeof calories === 'number' ? calories : 0}
                    currentVolume={typeof currentVolume === 'number' ? currentVolume : 0}
                    setsCompleted={typeof setsCompleted === 'number' ? setsCompleted : 0}
                    totalTime={typeof safeSession?.totalTime === 'number' ? (safeSession.totalTime as number) : 0}
                    prCount={typeof prCount === 'number' ? prCount : 0}
                    detectedPrs={Array.isArray(detectedPrs) ? (detectedPrs as { exerciseName?: string; name?: string; e1rm?: number; weight?: number }[]) : []}
                    onClose={() => setShowShareCard(false)}
                />
            ) : null}

        </div>
    );
};

export default WorkoutReport;

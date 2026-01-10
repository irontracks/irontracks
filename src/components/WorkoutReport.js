"use client"
import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { Download, ArrowLeft, TrendingUp, TrendingDown, Flame, FileText, Code, Users, Sparkles, Loader2, Check } from 'lucide-react';
import { buildReportHTML } from '@/utils/report/buildHtml';
import { workoutPlanHtml } from '@/utils/report/templates';
import { generatePostWorkoutInsights, applyProgressionToNextTemplate } from '@/actions/workout-actions';
import { createClient } from '@/utils/supabase/client';

const parseSessionNotes = (notes) => {
    try {
        if (typeof notes === 'string') {
            const trimmed = notes.trim();
            if (!trimmed) return null;
            return JSON.parse(trimmed);
        }
        if (notes && typeof notes === 'object') return notes;
        return null;
    } catch {
        return null;
    }
};

const toDateMs = (v) => {
    try {
        if (!v) return null;
        if (v?.toDate) {
            const d = v.toDate();
            const ms = d instanceof Date ? d.getTime() : new Date(d).getTime();
            return Number.isFinite(ms) ? ms : null;
        }
        if (v instanceof Date) {
            const ms = v.getTime();
            return Number.isFinite(ms) ? ms : null;
        }
        const ms = new Date(v).getTime();
        return Number.isFinite(ms) ? ms : null;
    } catch {
        return null;
    }
};

const normalizeTitleKey = (v) => {
    try {
        return String(v || '').trim().toLowerCase();
    } catch {
        return '';
    }
};

const computeMatchKey = (s) => {
    if (!s || typeof s !== 'object') return { originId: null, titleKey: '' };
    const originId = s?.originWorkoutId ?? s?.workoutId ?? null;
    const titleKey = normalizeTitleKey(s?.workoutTitle ?? s?.name ?? '');
    return { originId: originId ? String(originId) : null, titleKey };
};

const WorkoutReport = ({ session, previousSession, user, onClose }) => {
    const reportRef = useRef();
    const [isGenerating, setIsGenerating] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [pdfUrl, setPdfUrl] = useState(null);
    const [pdfBlob, setPdfBlob] = useState(null);
    const pdfFrameRef = useRef(null);
    const supabase = useMemo(() => createClient(), []);
    const previousFetchInFlightRef = useRef(false);
    const [resolvedPreviousSession, setResolvedPreviousSession] = useState(null);
    const [aiState, setAiState] = useState(() => {
        const existing = session?.ai && typeof session.ai === 'object' ? session.ai : null;
        return { status: existing ? 'ready' : 'idle', ai: existing, saved: false, error: '' };
    });

    useEffect(() => {
        const onAfterPrint = () => { setIsGenerating(false); };
        const onFocus = () => { setIsGenerating(false); };
        const onVisibility = () => { if (!document.hidden) setIsGenerating(false); };
        window.addEventListener('afterprint', onAfterPrint);
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            window.removeEventListener('afterprint', onAfterPrint);
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, []);

    useEffect(() => {
        const existing = session?.ai && typeof session.ai === 'object' ? session.ai : null;
        setAiState((prev) => {
            if (existing) return { ...prev, status: 'ready', ai: existing, error: '' };
            if (prev?.status === 'ready') return prev;
            return prev;
        });
    }, [session]);

    const [applyState, setApplyState] = useState({ status: 'idle', error: '', templateId: null });

    const resolvePreviousFromHistory = useCallback(async () => {
        try {
            if (previousSession) return previousSession;
            if (resolvedPreviousSession) return resolvedPreviousSession;
            if (!user?.id) return null;
            if (!session || typeof session !== 'object') return null;
            if (previousFetchInFlightRef.current) return null;

            const currentMs = toDateMs(session?.date) ?? toDateMs(session?.completed_at) ?? toDateMs(session?.completedAt) ?? null;
            const { originId: currentOriginId, titleKey: currentTitleKey } = computeMatchKey(session);
            if (!currentOriginId && !currentTitleKey) return null;

            previousFetchInFlightRef.current = true;

            let query = supabase
                .from('workouts')
                .select('id, date, created_at, notes, name')
                .eq('user_id', user.id)
                .eq('is_template', false)
                .order('date', { ascending: false })
                .limit(200);

            const currentId = typeof session?.id === 'string' && session.id ? session.id : null;
            if (currentId) query = query.neq('id', currentId);

            const { data: rows, error } = await query;
            if (error) throw error;

            const candidates = Array.isArray(rows) ? rows : [];
            let best = null;
            let bestMs = -1;

            for (const r of candidates) {
                if (!r || typeof r !== 'object') continue;
                const parsed = parseSessionNotes(r.notes);
                if (!parsed || typeof parsed !== 'object') continue;

                const candidateMs = toDateMs(parsed?.date) ?? toDateMs(r?.date) ?? toDateMs(r?.created_at) ?? null;
                if (!Number.isFinite(candidateMs)) continue;
                if (Number.isFinite(currentMs) && candidateMs >= currentMs) continue;

                const { originId: candOriginId, titleKey: candTitleKey } = computeMatchKey(parsed);
                const originMatches = !!(currentOriginId && candOriginId && currentOriginId === candOriginId);
                const titleMatches = !!(currentTitleKey && candTitleKey && currentTitleKey === candTitleKey);
                if (!originMatches && !titleMatches) continue;

                if (candidateMs > bestMs) {
                    bestMs = candidateMs;
                    best = { ...parsed, id: parsed?.id ?? r?.id ?? null };
                }
            }

            if (best && typeof best === 'object') {
                setResolvedPreviousSession(best);
                return best;
            }

            return null;
        } catch {
            return null;
        } finally {
            previousFetchInFlightRef.current = false;
        }
    }, [previousSession, resolvedPreviousSession, session, supabase, user?.id]);

    useEffect(() => {
        resolvePreviousFromHistory().catch(() => {});
    }, [resolvePreviousFromHistory]);

    if (!session) return null;

    const formatDate = (ts) => {
        if (!ts) return '';
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
    };

    const formatDuration = (s) => {
        const mins = Math.floor(s / 60);
        const secs = Math.floor(s % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    const getCurrentDate = () => new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const calculateTotalVolume = (logs) => {
        try {
            const safeLogs = logs && typeof logs === 'object' ? logs : {};
            let volume = 0;
            Object.values(safeLogs).forEach((log) => {
                if (!log || typeof log !== 'object') return;
                const w = Number(log.weight);
                const r = Number(log.reps);
                if (!Number.isFinite(w) || !Number.isFinite(r)) return;
                if (w <= 0 || r <= 0) return;
                volume += w * r;
            });
            return volume;
        } catch {
            return 0;
        }
    };

    const effectivePreviousSession = previousSession ?? resolvedPreviousSession;

    const sessionLogs = session?.logs && typeof session.logs === 'object' ? session.logs : {};
    const prevSessionLogs = effectivePreviousSession?.logs && typeof effectivePreviousSession.logs === 'object' ? effectivePreviousSession.logs : {};
    const currentVolume = calculateTotalVolume(sessionLogs);
    const prevVolume = effectivePreviousSession ? calculateTotalVolume(prevSessionLogs) : 0;
    const volumeDelta = prevVolume > 0 ? ((currentVolume - prevVolume) / prevVolume) * 100 : 0;
    const durationInMinutes = (Number(session?.totalTime) || 0) / 60;
    const outdoorBike = session?.outdoorBike && typeof session.outdoorBike === 'object' ? session.outdoorBike : null;
    const calories = (() => {
        const bikeKcal = Number(outdoorBike?.caloriesKcal);
        if (Number.isFinite(bikeKcal) && bikeKcal > 0) return Math.round(bikeKcal);
        return Math.round((currentVolume * 0.02) + (durationInMinutes * 4));
    })();

    const formatKm = (meters) => {
        const m = Number(meters);
        if (!Number.isFinite(m) || m <= 0) return '-';
        return `${(m / 1000).toFixed(2)} km`;
    };

    const formatKmh = (kmh) => {
        const v = Number(kmh);
        if (!Number.isFinite(v) || v <= 0) return '-';
        return `${v.toFixed(1)} km/h`;
    };

    const prevLogsMap = {};
    if (effectivePreviousSession && Array.isArray(effectivePreviousSession?.exercises)) {
        const safePrevLogs = prevSessionLogs;
        effectivePreviousSession.exercises.forEach((ex, exIdx) => {
            if (!ex || typeof ex !== 'object') return;
            const exName = String(ex?.name || '').trim();
            if (!exName) return;
            const exLogs = [];
            Object.keys(safePrevLogs).forEach((key) => {
                try {
                    const parts = String(key || '').split('-');
                    const eIdx = Number(parts[0]);
                    if (!Number.isFinite(eIdx)) return;
                    if (eIdx !== exIdx) return;
                    exLogs.push(safePrevLogs[key]);
                } catch {
                    return;
                }
            });
            prevLogsMap[exName] = exLogs;
        });
    }

    const handleApplyProgression = async () => {
        if (!session) return;
        if (!aiState || !aiState.ai) return;
        const items = Array.isArray(aiState.ai.progression) ? aiState.ai.progression : [];
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
                throw new Error(res?.error || 'Falha ao aplicar progressão');
            }
            setApplyState({ status: 'success', error: '', templateId: res.templateId || null });
        } catch (e) {
            const msg = e?.message ? String(e.message) : String(e);
            setApplyState({ status: 'error', error: msg || 'Falha ao aplicar progressão', templateId: null });
        }
    };

    const handleDownloadPDF = async () => {
        try {
            setIsGenerating(true);
            const prev = effectivePreviousSession ?? (await resolvePreviousFromHistory());
            const html = buildReportHTML(session, prev, user?.displayName || user?.email || '');
            const blob = new Blob([html], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            setPdfBlob(blob);
            setPdfUrl(url);
        } catch (e) {
            alert('Não foi possível abrir impressão: ' + (e?.message ?? String(e)) + '\nPermita pop-ups para este site.');
        } finally {
            setIsGenerating(false);
            setTimeout(() => setIsGenerating(false), 500);
        }
    };

    const handleGenerateAi = async () => {
        if (!session) return;
        if (aiState?.status === 'loading') return;
        setAiState((prev) => ({ ...(prev || {}), status: 'loading', error: '', saved: false }));
        try {
            const res = await generatePostWorkoutInsights({
                workoutId: typeof session?.id === 'string' ? session.id : null,
                session
            });
            if (!res?.ok) {
                setAiState((prev) => ({ ...(prev || {}), status: 'error', error: String(res?.error || 'Falha ao gerar insights') }));
                return;
            }
            setAiState({ status: 'ready', ai: res.ai || null, saved: !!res.saved, error: '' });
        } catch (e) {
            setAiState((prev) => ({ ...(prev || {}), status: 'error', error: String(e?.message || e || 'Falha ao gerar insights') }));
        }
    };

    const handlePartnerPlan = (participant) => {
        try {
            if (!participant) return;
            const exercises = Array.isArray(session.exercises) ? session.exercises : [];
            const workout = {
                title: session.workoutTitle || 'Treino',
                exercises: exercises.map((ex) => ({
                    name: ex.name,
                    sets: Number(ex.sets) || 0,
                    reps: ex.reps,
                    rpe: ex.rpe,
                    cadence: ex.cadence,
                    restTime: ex.restTime,
                    method: ex.method,
                    notes: ex.notes
                }))
            };
            const partnerUser = {
                displayName: participant.name || participant.uid || '',
                email: participant.email || ''
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
                } catch {}
            }, 300);
        } catch (e) {
            alert('Não foi possível gerar o PDF do parceiro: ' + (e?.message || String(e)));
        }
    };

    const closePreview = () => {
        try { if (pdfUrl) URL.revokeObjectURL(pdfUrl); } catch {}
        setPdfUrl(null);
        setPdfBlob(null);
    };

    const handlePrintIframe = () => {
        try { pdfFrameRef.current?.contentWindow?.print(); } catch {}
    };

    const handleShare = async () => {
        try {
            if (!pdfUrl && !pdfBlob) {
                alert('Gere o PDF antes de compartilhar.');
                return;
            }
            const title = 'Relatório IronTracks';
            if (navigator.share) {
                if (pdfBlob && navigator.canShare && navigator.canShare({ files: [new File([pdfBlob], 'relatorio-irontracks.html', { type: 'text/html' })] })) {
                    const file = new File([pdfBlob], 'relatorio-irontracks.html', { type: 'text/html' });
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
            a.download = 'relatorio-irontracks.html';
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch ( e) {
            alert('Não foi possível compartilhar. Baixei o arquivo para você.\n+Abra com seu gerenciador e compartilhe.');
            try {
                if (!pdfUrl) return;
                const a = document.createElement('a');
                a.href = pdfUrl;
                a.download = 'relatorio-irontracks.html';
                document.body.appendChild(a);
                a.click();
                a.remove();
            } catch {}
        }
    };

    const handleDownloadJson = () => {
        try {
            const payload = session || {};
            const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(payload, null, 2))}`;
            const link = document.createElement('a');
            link.href = jsonString;
            const baseName = (session.workoutTitle || 'Treino');
            link.download = `${baseName}_${new Date().toISOString()}.json`;
            document.body.appendChild(link);
            link.click();
            link.remove();
        } finally {
            setShowExportMenu(false);
        }
    };

    const teamMeta = session.teamMeta && typeof session.teamMeta === 'object' ? session.teamMeta : null;
    const rawParticipants = teamMeta && Array.isArray(teamMeta.participants) ? teamMeta.participants : [];
    const currentUserId = user?.id || user?.uid || null;
    const partners = rawParticipants.filter((p) => {
        const uid = p && (p.uid || p.id || null);
        if (!uid || !currentUserId) return true;
        return uid !== currentUserId;
    });

    const isTeamSession = partners.length > 0;

    return (
        <div className="fixed inset-0 z-[1000] overflow-y-auto bg-neutral-900 text-black">
            <div className={`fixed top-4 right-4 mt-safe mr-safe flex gap-2 no-print z-[1100] pointer-events-auto ${isGenerating ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="relative">
                    <button
                        onClick={() => setShowExportMenu(v => !v)}
                        className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors"
                    >
                        <Download size={16} />
                        <span className="text-sm font-medium">Salvar</span>
                    </button>
                    {showExportMenu && (
                        <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-100 rounded-lg shadow-xl overflow-hidden">
                            <button onClick={() => { setShowExportMenu(false); handleDownloadPDF(); }} className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm text-gray-800 hover:bg-gray-50">
                                <FileText size={16} className="text-gray-600" />
                                <span>Salvar PDF</span>
                            </button>
                            <button onClick={handleDownloadJson} className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm text-gray-800 hover:bg-gray-50">
                                <Code size={16} className="text-gray-600" />
                                <span>Salvar JSON</span>
                            </button>
                        </div>
                    )}
                </div>
                <button onClick={onClose} className="bg-white text.black px-3 py-2 rounded-xl font-bold shadow-lg inline-flex items-center gap-2">
                    <ArrowLeft size={18} />
                    <span className="text-xs">Voltar</span>
                </button>
            </div>
            <div ref={reportRef} className="min-h-screen bg-white text-black p-8 max-w-4xl mx-auto" style={{ paddingTop: 'calc(2rem + env(safe-area-inset-top))' }}>
                <div className="border-b-4 border-black pb-6 mb-8 flex justify-between items-end">
                    <div>
                        <h1 className="text-4xl font-black italic tracking-tighter mb-1">IRON<span className="text-neutral-500">TRACKS</span></h1>
                        <p className="text-sm font-bold uppercase tracking-widest text-neutral-500">Relatório de Performance</p>
                    </div>
                    <div className="text-right">
                        <p className="text-2xl font-bold">{session.workoutTitle}</p>
                        <p className="text-neutral-600">{formatDate(session.date)}</p>
                    </div>
                </div>

                <div className="mb-8 p-4 rounded-xl border border-neutral-200 bg-neutral-50">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                            <div className="text-xs font-black uppercase tracking-widest text-neutral-500">IA</div>
                            <div className="text-lg font-black text-neutral-900">Insights pós-treino</div>
                            <div className="text-xs text-neutral-600">Resumo + progressão + motivação com IA IronTracks</div>
                        </div>
                        <button
                            type="button"
                            onClick={handleGenerateAi}
                            disabled={aiState?.status === 'loading'}
                            className="min-h-[44px] px-4 py-2 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black font-black flex items-center justify-center gap-2 disabled:opacity-60 w-full md:w-auto"
                        >
                            {aiState?.status === 'loading' ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                            {aiState?.ai ? 'Regerar' : 'Gerar'}
                        </button>
                    </div>

                    {aiState?.status === 'error' && (
                        <div className="mt-3 text-sm font-semibold text-red-600">{aiState?.error || 'Falha ao gerar insights.'}</div>
                    )}

                    {aiState?.ai && (
                        <div className="mt-4 space-y-3">
                            {aiState.ai.metrics && typeof aiState.ai.metrics === 'object' && (
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <div className="bg-white rounded-xl border border-neutral-200 p-3">
                                        <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-1">Volume total</div>
                                        <div className="text-lg font-mono font-bold text-neutral-900">
                                            {(() => {
                                                const v = Number(aiState.ai.metrics.totalVolumeKg || 0);
                                                if (!Number.isFinite(v) || v <= 0) return '—';
                                                return `${v.toLocaleString('pt-BR')}kg`;
                                            })()}
                                        </div>
                                    </div>
                                    <div className="bg-white rounded-xl border border-neutral-200 p-3">
                                        <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-1">Séries concluídas</div>
                                        <div className="text-lg font-mono font-bold text-neutral-900">
                                            {(() => {
                                                const v = Number(aiState.ai.metrics.totalSetsDone || 0);
                                                if (!Number.isFinite(v) || v <= 0) return '—';
                                                return v.toString();
                                            })()}
                                        </div>
                                    </div>
                                    <div className="bg-white rounded-xl border border-neutral-200 p-3">
                                        <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-1">Exercícios</div>
                                        <div className="text-lg font-mono font-bold text-neutral-900">
                                            {(() => {
                                                const v = Number(aiState.ai.metrics.totalExercises || 0);
                                                if (!Number.isFinite(v) || v <= 0) return '—';
                                                return v.toString();
                                            })()}
                                        </div>
                                    </div>
                                    <div className="bg-white rounded-xl border border-neutral-200 p-3">
                                        <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-1">Top exercício</div>
                                        <div className="text-xs font-semibold text-neutral-900">
                                            {(() => {
                                                const list = Array.isArray(aiState.ai.metrics.topExercises) ? aiState.ai.metrics.topExercises : [];
                                                if (!list.length) return '—';
                                                const first = list[0] && typeof list[0] === 'object' ? list[0] : null;
                                                if (!first) return '—';
                                                const name = String(first.name || '').trim() || '—';
                                                const v = Number(first.volumeKg || 0);
                                                const volumeLabel = Number.isFinite(v) && v > 0 ? `${v.toLocaleString('pt-BR')}kg` : '';
                                                return volumeLabel ? `${name} • ${volumeLabel}` : name;
                                            })()}
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="md:col-span-2 bg-white rounded-xl border border-neutral-200 p-4">
                                    <div className="text-xs font-black uppercase tracking-widest text-neutral-500 mb-2">Resumo</div>
                                    <ul className="space-y-2">
                                        {(Array.isArray(aiState.ai.summary) ? aiState.ai.summary : []).map((item, idx) => (
                                            <li key={idx} className="text-sm text-neutral-900">• {String(item || '')}</li>
                                    ))}
                                </ul>

                                {Array.isArray(aiState.ai.highlights) && aiState.ai.highlights.length > 0 && (
                                    <div className="mt-4">
                                        <div className="text-xs font-black uppercase tracking-widest text-neutral-500 mb-2">Destaques</div>
                                        <ul className="space-y-2">
                                            {aiState.ai.highlights.map((item, idx) => (
                                                <li key={idx} className="text-sm text-neutral-900">• {String(item || '')}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {Array.isArray(aiState.ai.warnings) && aiState.ai.warnings.length > 0 && (
                                    <div className="mt-4">
                                        <div className="text-xs font-black uppercase tracking-widest text-neutral-500 mb-2">Atenção</div>
                                        <ul className="space-y-2">
                                            {aiState.ai.warnings.map((item, idx) => (
                                                <li key={idx} className="text-sm text-neutral-900">• {String(item || '')}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                </div>

                                <div className="bg-black rounded-xl p-4 text-white">
                                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400 mb-2">Motivação</div>
                                    <div className="text-sm font-semibold">{String(aiState.ai.motivation || '').trim() || '—'}</div>

                                    {Array.isArray(aiState.ai.prs) && aiState.ai.prs.length > 0 && (
                                        <div className="mt-4">
                                            <div className="text-xs font-black uppercase tracking-widest text-neutral-400 mb-2">PRs</div>
                                            <div className="space-y-2">
                                                {aiState.ai.prs.map((p, idx) => (
                                                    <div key={idx} className="text-xs text-neutral-200">
                                                        <span className="font-black">{String(p.exercise || '').trim() || '—'}</span>{' '}
                                                        <span className="text-neutral-400">{String(p.label || '').trim() ? `(${String(p.label).trim()})` : ''}</span>{' '}
                                                        <span className="font-semibold">{String(p.value || '').trim()}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="mt-4">
                                        {aiState?.saved ? (
                                            <div className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-yellow-400">
                                                <Check size={14} /> Salvo no histórico
                                            </div>
                                        ) : (
                                            <div className="text-[11px] font-semibold text-neutral-400">Ao gerar, salva no histórico automaticamente.</div>
                                        )}
                                    </div>
                                </div>

                                {Array.isArray(aiState.ai.progression) && aiState.ai.progression.length > 0 && (
                                    <div className="md:col-span-3 bg-white rounded-xl border border-neutral-200 p-4">
                                        <div className="flex items-center justify-between gap-3 mb-3">
                                            <div className="text-xs font-black uppercase tracking-widest text-neutral-500">Progressão sugerida (próximo treino)</div>
                                            <button
                                                type="button"
                                                onClick={handleApplyProgression}
                                                disabled={applyState.status === 'loading'}
                                                className="min-h-[36px] px-3 py-1.5 rounded-full bg-black text-white text-[11px] font-bold uppercase tracking-wide flex items-center gap-2 disabled:opacity-60"
                                            >
                                                {applyState.status === 'loading' ? (
                                                    <Loader2 size={14} className="animate-spin" />
                                                ) : (
                                                    <Sparkles size={14} />
                                                )}
                                                <span>{applyState.status === 'success' ? 'Aplicado' : 'Aplicar no próximo treino'}</span>
                                            </button>
                                        </div>
                                        {applyState.status === 'error' && (
                                            <div className="mb-2 text-[11px] font-semibold text-red-600">{applyState.error}</div>
                                        )}
                                        {applyState.status === 'success' && (
                                            <div className="mb-2 text-[11px] font-semibold text-green-700 flex items-center gap-1">
                                                <Check size={12} />
                                                <span>Template criado para o próximo treino.</span>
                                            </div>
                                        )}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {aiState.ai.progression.map((rec, idx) => (
                                                <div key={idx} className="rounded-xl border border-neutral-200 p-3">
                                                    <div className="text-sm font-black text-neutral-900">{String(rec.exercise || '').trim() || '—'}</div>
                                                    <div className="text-sm text-neutral-900 mt-1">{String(rec.recommendation || '').trim()}</div>
                                                    {String(rec.reason || '').trim() && (
                                                        <div className="text-xs text-neutral-600 mt-2">{String(rec.reason || '').trim()}</div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {isTeamSession && (
                    <div className="mb-8 p-4 rounded-lg border border-neutral-200 bg-neutral-50 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-black text-white flex items-center justify-center">
                                <Users size={18} />
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">Treino em Equipe</p>
                                <p className="text-sm font-semibold text-neutral-900">
                                    {partners.length === 1 ? '1 parceiro treinando com você' : `${partners.length} parceiros treinando com você`}
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {partners.map((p, idx) => (
                                <button
                                    key={p.uid || p.id || idx}
                                    onClick={() => handlePartnerPlan(p)}
                                    className="px-3 py-2 rounded-full bg-black text-white text-xs font-bold uppercase tracking-wide hover:bg-neutral-900"
                                >
                                    Ver PDF de {p.name || 'Parceiro'}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <div className="bg-neutral-100 p-4 rounded-lg border border-neutral-200 flex flex-col justify-between">
                        <p className="text-xs font-bold uppercase text-neutral-500 mb-1">Tempo Total</p>
                        <p className="text-3xl font-mono font-bold">{formatDuration(session.totalTime)}</p>
                    </div>
                    <div className="bg-neutral-100 p-4 rounded-lg border border-neutral-200 flex flex-col justify-between">
                        <p className="text-xs font-bold uppercase text-neutral-500 mb-1">Volume (Kg)</p>
                        <div className="flex flex-col gap-1">
                            <p className="text-3xl font-mono font-bold">{currentVolume.toLocaleString()}kg</p>
                            {effectivePreviousSession && Number.isFinite(volumeDelta) && (
                                <span
                                    className={`inline-flex items-center px-2 py-1 rounded-full text-[11px] font-semibold w-fit ${
                                        volumeDelta >= 0
                                            ? 'bg-green-50 text-green-700'
                                            : 'bg-red-50 text-red-700'
                                    }`}
                                >
                                    {volumeDelta >= 0 ? <TrendingUp size={12} className="mr-1" /> : <TrendingDown size={12} className="mr-1" />}
                                    {volumeDelta > 0 ? '+' : ''}{volumeDelta.toFixed(1)}%
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="bg-orange-50 p-4 rounded-lg border border-orange-200 flex flex-col justify-between">
                        <p className="text-xs font-bold uppercase text-orange-500 mb-1 flex items-center gap-1">
                            <Flame size={12} /> Calorias
                        </p>
                        <p className="text-3xl font-mono font-bold text-orange-600">~{calories}</p>
                    </div>
                    <div className="bg-black text-white p-4 rounded-lg flex flex-col justify-between">
                        <p className="text-xs font-bold uppercase text-neutral-400 mb-1">Status</p>
                        <p className="text-xl font-bold uppercase italic">CONCLUÍDO</p>
                    </div>
                </div>

                {outdoorBike && (Number(outdoorBike?.distanceMeters) > 0 || Number(outdoorBike?.durationSeconds) > 0) && (
                    <div className="mb-8">
                        <div className="text-xs font-black uppercase tracking-widest text-neutral-500 mb-3">Bike Outdoor</div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-neutral-100 p-4 rounded-lg border border-neutral-200">
                                <p className="text-xs font-bold uppercase text-neutral-500 mb-1">Distância</p>
                                <p className="text-2xl font-mono font-bold">{formatKm(outdoorBike.distanceMeters)}</p>
                            </div>
                            <div className="bg-neutral-100 p-4 rounded-lg border border-neutral-200">
                                <p className="text-xs font-bold uppercase text-neutral-500 mb-1">Vel. Média</p>
                                <p className="text-2xl font-mono font-bold">{formatKmh(outdoorBike.avgSpeedKmh)}</p>
                            </div>
                            <div className="bg-neutral-100 p-4 rounded-lg border border-neutral-200">
                                <p className="text-xs font-bold uppercase text-neutral-500 mb-1">Vel. Máx</p>
                                <p className="text-2xl font-mono font-bold">{formatKmh(outdoorBike.maxSpeedKmh)}</p>
                            </div>
                            <div className="bg-neutral-100 p-4 rounded-lg border border-neutral-200">
                                <p className="text-xs font-bold uppercase text-neutral-500 mb-1">Tempo Bike</p>
                                <p className="text-2xl font-mono font-bold">{formatDuration(Number(outdoorBike.durationSeconds) || 0)}</p>
                            </div>
                        </div>
                    </div>
                )}

                <div className="space-y-8">
                {(!Array.isArray(session?.exercises) || session.exercises.length === 0) && (
                    <div className="text-neutral-500 p-4 bg-neutral-100 rounded-lg border border-neutral-200">
                        Nenhum dado de exercício registrado para este treino.
                    </div>
                )}
                {(Array.isArray(session?.exercises) ? session.exercises : []).map((ex, exIdx) => {
                    const exName = String(ex?.name || '').trim();
                    const prevLogs = prevLogsMap[exName] || [];
                    return (
                        <div key={exIdx} className="break-inside-avoid">
                            <div className="flex justify-between items-end mb-2 border-b-2 border-neutral-200 pb-2">
                                <h3 className="text-xl font-bold uppercase flex items-center gap-2">
                                    <span className="bg-black text-white w-6 h-6 flex items-center justify-center rounded text-xs">{exIdx + 1}</span>
                                    {exName || '—'}
                                </h3>
                                <div className="flex gap-3 text-xs font-mono text-neutral-500">
                                    {ex?.method && ex.method !== 'Normal' && <span className="text-red-600 font-bold uppercase">{ex.method}</span>}
                                    {ex?.rpe && <span>RPE: <span className="font-bold text-black">{ex.rpe}</span></span>}
                                    <span>Cad: <span className="font-bold text-black">{ex?.cadence || '-'}</span></span>
                                </div>
                            </div>
                            <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-[10px] uppercase tracking-widest text-neutral-500 border-b border-neutral-100">
                                            <th className="py-2 text-left w-16 font-black">Série</th>
                                            <th className="py-2 text-center w-24 font-black">Carga</th>
                                            <th className="py-2 text-center w-24 font-black">Reps</th>
                                            <th className="py-2 text-center w-32 font-black">Evolução</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                    {Array.from({ length: Number(ex?.sets) || 0 }).map((_, sIdx) => {
                                        const key = `${exIdx}-${sIdx}`;
                                        const log = sessionLogs[key];
                                        const prevLog = prevLogs[sIdx];

                                        if (!log || typeof log !== 'object') return null;
                                        if (!log.weight && !log.reps) return null;

                                            let progressionText = "-";
                                            let rowClass = "";

                                            if (prevLog && prevLog.weight) {
                                                const delta = parseFloat(log.weight) - parseFloat(prevLog.weight);
                                                if (delta > 0) {
                                                    progressionText = `+${delta}kg`;
                                                    rowClass = "bg-green-50 text-green-900 font-bold";
                                                } else if (delta < 0) {
                                                    progressionText = `${delta}kg`;
                                                    rowClass = "text-red-600 font-bold";
                                                } else {
                                                    progressionText = "=";
                                                }
                                            }

                                            return (
                                                <tr key={sIdx} className="border-b border-neutral-100">
                                                    <td className="py-2 font-mono text-neutral-500 text-xs">#{sIdx + 1}</td>
                                                    <td className="py-2 text-center font-semibold text-sm">{log.weight}</td>
                                                    <td className="py-2 text-center font-mono text-sm">{log.reps}</td>
                                                    <td className={`py-2 text-center text-[11px] uppercase ${rowClass}`}>{progressionText}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        );
                    })}
                </div>
                <div className="mt-12 pt-6 border-t border-neutral-200 text-center text-xs text-neutral-400 uppercase tracking-widest">
                    IronTracks System • {getCurrentDate()}
                </div>
            </div>

            {pdfUrl && (
                <div className="fixed inset-0 z-[1200] bg-black/80 backdrop-blur flex flex-col">
                    <div className="p-4 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between h-16 pt-safe">
                        <h3 className="text-white font-bold">Pré-visualização</h3>
                        <button onClick={closePreview} className="bg-white text-black px-4 py-2 rounded-lg font-bold">Fechar</button>
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
        </div>
    );
};

export default WorkoutReport;

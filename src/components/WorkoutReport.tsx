"use client"
import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { Download, ArrowLeft, TrendingUp, TrendingDown, Flame, FileText, Code, Users, Sparkles, Loader2, Check, MessageSquare } from 'lucide-react';
import { buildReportHTML } from '@/utils/report/buildHtml';
import { workoutPlanHtml } from '@/utils/report/templates';
import { generatePostWorkoutInsights, applyProgressionToNextTemplate, getMuscleMapWeek } from '@/actions/workout-actions';
import { createClient } from '@/utils/supabase/client';
import { useVipCredits } from '@/hooks/useVipCredits';
import StoryComposer from '@/components/StoryComposer';
import CoachChatModal from '@/components/CoachChatModal';
import { getKcalEstimate } from '@/utils/calories/kcalClient';
import { normalizeExerciseName } from '@/utils/normalizeExerciseName';
import { FEATURE_KEYS, isFeatureEnabled } from '@/utils/featureFlags';
import { getErrorMessage } from '@/utils/errorMessage'
import { parseJsonWithSchema } from '@/utils/zod'
import { z } from 'zod'
import { escapeHtml } from '@/utils/escapeHtml'
import {
    formatDate as sharedFormatDate,
    formatDuration as sharedFormatDuration,
    formatKm as sharedFormatKm,
    formatKmh as sharedFormatKmh,
    calculateTotalVolume,
} from '@/utils/report/formatters'
import { MUSCLE_BY_ID } from '@/utils/muscleMapConfig'
import { ReportMetricsPanel } from '@/components/workout-report/ReportMetricsPanel'
import { MuscleTrendPanel } from '@/components/workout-report/MuscleTrendPanel'
import { MuscleTrend4wPanel } from '@/components/workout-report/MuscleTrend4wPanel'
import { ExerciseTrendPanel } from '@/components/workout-report/ExerciseTrendPanel'
import { ReportCheckinPanel } from '@/components/workout-report/ReportCheckinPanel'
import { ReportAiSection } from '@/components/workout-report/ReportAiSection'
import { ReportSummaryCards } from '@/components/workout-report/ReportSummaryCards'
import { ReportExerciseCard } from '@/components/workout-report/ReportExerciseCard'

type AnyObj = Record<string, unknown>

interface AiState {
    loading: boolean
    error: string | null
    result: Record<string, unknown> | null
    cached: boolean
}

interface WorkoutReportProps {
    session: AnyObj | null
    previousSession?: AnyObj | null
    user: AnyObj | null
    isVip?: boolean
    onClose: () => void
    settings?: AnyObj | null
    onUpgrade?: () => void
}

const parseSessionNotes = (notes: unknown): AnyObj | null => {
    try {
        if (typeof notes === 'string') {
            const trimmed = notes.trim();
            if (!trimmed) return null;
            return parseJsonWithSchema(trimmed, z.record(z.unknown()));
        }
        if (notes && typeof notes === 'object') return notes as AnyObj;
        return null;
    } catch {
        return null;
    }
};

// normalizeExerciseKey is now in @/utils/report/formatters
import { normalizeExerciseKey } from '@/utils/report/formatters'


const remapPrevLogsByCanonical = (prevLogsByExercise: unknown, canonicalMap: unknown): Record<string, unknown> => {
    try {
        const src = prevLogsByExercise && typeof prevLogsByExercise === 'object' ? (prevLogsByExercise as Record<string, unknown>) : {};
        const map = canonicalMap && typeof canonicalMap === 'object' ? (canonicalMap as Record<string, unknown>) : {};
        const out: Record<string, unknown> = {};
        Object.keys(src).forEach((k) => {
            const baseKey = String(k || '').trim();
            if (!baseKey) return;
            const aliasNorm = normalizeExerciseName(baseKey);
            const canonicalName = String(map?.[aliasNorm] || baseKey).trim() || baseKey;
            const nextKey = normalizeExerciseKey(canonicalName);
            if (!nextKey) return;
            const logsArr = Array.isArray(src[k]) ? (src[k] as unknown[]) : [];
            if (!out[nextKey]) {
                out[nextKey] = logsArr;
                return;
            }
            const merged = Array.isArray(out[nextKey]) ? (out[nextKey] as unknown[]).slice() : [];
            const maxLen = Math.max(merged.length, logsArr.length);
            for (let i = 0; i < maxLen; i += 1) {
                if (merged[i] == null && logsArr[i] != null) merged[i] = logsArr[i];
            }
            out[nextKey] = merged;
        });
        return out;
    } catch {
        return (prevLogsByExercise && typeof prevLogsByExercise === 'object') ? (prevLogsByExercise as Record<string, unknown>) : {};
    }
};

const remapPrevBaseMsByCanonical = (prevBaseMsByExercise: unknown, canonicalMap: unknown): Record<string, unknown> => {
    try {
        const src = prevBaseMsByExercise && typeof prevBaseMsByExercise === 'object' ? (prevBaseMsByExercise as Record<string, unknown>) : {};
        const map = canonicalMap && typeof canonicalMap === 'object' ? (canonicalMap as Record<string, unknown>) : {};
        const out: Record<string, unknown> = {};
        Object.keys(src).forEach((k) => {
            const baseKey = String(k || '').trim();
            if (!baseKey) return;
            const aliasNorm = normalizeExerciseName(baseKey);
            const canonicalName = String(map?.[aliasNorm] || baseKey).trim() || baseKey;
            const nextKey = normalizeExerciseKey(canonicalName);
            if (!nextKey) return;
            if (out[nextKey] == null) out[nextKey] = src[k];
        });
        return out;
    } catch {
        return (prevBaseMsByExercise && typeof prevBaseMsByExercise === 'object') ? (prevBaseMsByExercise as Record<string, unknown>) : {};
    }
};

const applyCanonicalNamesToSession = (sessionObj: unknown, canonicalMap: unknown): unknown => {
    try {
        const base = sessionObj && typeof sessionObj === 'object' ? (sessionObj as Record<string, unknown>) : null;
        if (!base) return sessionObj;
        const map = canonicalMap && typeof canonicalMap === 'object' ? (canonicalMap as Record<string, unknown>) : {};
        const exs = Array.isArray(base?.exercises) ? (base.exercises as unknown[]) : [];
        if (!exs.length) return sessionObj;
        const nextExercises = exs.map((ex: unknown) => {
            try {
                const exObj = ex && typeof ex === 'object' ? (ex as Record<string, unknown>) : ({} as Record<string, unknown>)
                const rawName = String(exObj?.name || '').trim();
                if (!rawName) return ex;
                const aliasNorm = normalizeExerciseName(rawName);
                const canonicalName = String(map?.[aliasNorm] || rawName).trim();
                if (!canonicalName || canonicalName === rawName) return ex;
                return { ...(exObj as Record<string, unknown>), name: canonicalName };
            } catch {
                return ex;
            }
        });
        return { ...base, exercises: nextExercises };
    } catch {
        return sessionObj;
    }
};

const extractExerciseLogsByIndex = (sessionObj: unknown, exIdx: number): unknown[] => {
    try {
        const base = sessionObj && typeof sessionObj === 'object' ? (sessionObj as Record<string, unknown>) : null;
        const logs = base?.logs && typeof base.logs === 'object' ? (base.logs as Record<string, unknown>) : {};
        const out: unknown[] = [];
        Object.keys(logs).forEach((key) => {
            const parts = String(key || '').split('-');
            const eIdx = Number(parts[0]);
            const sIdx = Number(parts[1]);
            if (!Number.isFinite(eIdx) || !Number.isFinite(sIdx)) return;
            if (eIdx !== exIdx) return;
            out[sIdx] = logs[key];
        });
        return out;
    } catch {
        return [];
    }
};

const hasAnyComparableLog = (logsArr: unknown): boolean => {
    try {
        const arr = Array.isArray(logsArr) ? logsArr : [];
        for (const l of arr) {
            if (!l || typeof l !== 'object') continue;
            const obj = l as Record<string, unknown>
            const w = Number(String(obj?.weight ?? '').replace(',', '.'));
            const r = Number(String(obj?.reps ?? '').replace(',', '.'));
            if ((Number.isFinite(w) && w > 0) || (Number.isFinite(r) && r > 0)) return true;
        }
        return false;
    } catch {
        return false;
    }
};

const toDateMs = (v: unknown): number | null => {
    try {
        if (!v) return null;
        const vObj = v && typeof v === 'object' ? (v as Record<string, unknown>) : null
        if (vObj?.toDate && typeof vObj.toDate === 'function') {
            const d = (vObj.toDate as () => unknown)();
            const ms = d instanceof Date ? d.getTime() : new Date(d as unknown as string | number | Date).getTime();
            return Number.isFinite(ms) ? ms : null;
        }
        if (v instanceof Date) {
            const ms = v.getTime();
            return Number.isFinite(ms) ? ms : null;
        }
        if (vObj) {
            const seconds = Number(vObj?.seconds ?? vObj?._seconds ?? vObj?.sec ?? null);
            const nanos = Number(vObj?.nanoseconds ?? vObj?._nanoseconds ?? 0);
            if (Number.isFinite(seconds) && seconds > 0) {
                const ms = seconds * 1000 + Math.floor(nanos / 1e6);
                return Number.isFinite(ms) ? ms : null;
            }
        }
        const ms = new Date(v as unknown as string | number | Date).getTime();
        return Number.isFinite(ms) ? ms : null;
    } catch {
        return null;
    }
};

const normalizeTitleKey = (v: unknown): string => {
    try {
        return String(v || '').trim().toLowerCase();
    } catch {
        return '';
    }
};

const computeMatchKey = (s: unknown): { originId: string | null; titleKey: string } => {
    if (!s || typeof s !== 'object') return { originId: null, titleKey: '' };
    const obj = s as Record<string, unknown>
    const originId = obj?.originWorkoutId ?? obj?.workoutId ?? null;
    const titleKey = normalizeTitleKey(obj?.workoutTitle ?? obj?.name ?? '');
    return { originId: originId ? String(originId) : null, titleKey };
};

const getWeekStartIso = (date: Date) => {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short',
    })
    const parts = formatter.formatToParts(date)
    const map = parts.reduce<Record<string, string>>((acc, part) => {
        if (part.type !== 'literal') acc[part.type] = part.value
        return acc
    }, {})
    const weekday = String(map.weekday || '').toLowerCase()
    const weekdayIndex =
        weekday === 'mon' ? 1 : weekday === 'tue' ? 2 : weekday === 'wed' ? 3 : weekday === 'thu' ? 4 : weekday === 'fri' ? 5 : weekday === 'sat' ? 6 : 0
    const y = Number(map.year)
    const m = Number(map.month)
    const d = Number(map.day) - ((weekdayIndex + 6) % 7)
    const base = new Date(Date.UTC(y, m - 1, d, 3, 0, 0))
    return base.toISOString().slice(0, 10)
};

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

const WorkoutReport = ({ session, previousSession, user, isVip, onClose, settings, onUpgrade }: WorkoutReportProps) => {
    const safeSession = session && typeof session === 'object' ? (session as AnyObj) : null;
    const reportRef = useRef<HTMLDivElement | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [showStory, setShowStory] = useState(false);
    const storiesV2Enabled = useMemo(() => {
        return isFeatureEnabled(settings, FEATURE_KEYS.storiesV2);
    }, [settings]);
    const [showStoryPrompt, setShowStoryPrompt] = useState(false);
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
    const pdfFrameRef = useRef<HTMLIFrameElement | null>(null);
    const supabase = useMemo(() => {
        try {
            return createClient();
        } catch {
            return null;
        }
    }, []);
    const previousFetchInFlightRef = useRef(false);
    const [resolvedPreviousSession, setResolvedPreviousSession] = useState<Record<string, unknown> | null>(null);
    const prevByExerciseFetchInFlightRef = useRef(false);
    const [prevByExercise, setPrevByExercise] = useState<{ logsByExercise: Record<string, unknown>; baseMsByExercise: Record<string, unknown> }>({ logsByExercise: {}, baseMsByExercise: {} });
    const [checkinsByKind, setCheckinsByKind] = useState<{ pre: AnyObj | null; post: AnyObj | null }>({ pre: null, post: null });
    const [aiState, setAiState] = useState<AiState>(() => {
        const existing = session?.ai && typeof session.ai === 'object' ? (session.ai as Record<string, unknown>) : null;
        return { loading: false, error: null, result: existing, cached: !!existing };
    });
    const [showCoachChat, setShowCoachChat] = useState(false);
    const [muscleTrend, setMuscleTrend] = useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; data: null | { current: Record<string, number>; previous: Record<string, number> } }>({ status: 'idle', data: null })
    const [muscleTrend4w, setMuscleTrend4w] = useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; data: null | { weeks: string[]; series: Record<string, number[]> } }>({ status: 'idle', data: null })
    const [exerciseTrend, setExerciseTrend] = useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; data: null | { weeks: string[]; series: Array<{ name: string; values: number[] }> } }>({ status: 'idle', data: null })
    const { credits } = useVipCredits();
    const formatLimit = (limit: number | null | undefined) => (limit == null ? '∞' : limit > 1000 ? '∞' : limit)
    const isInsightsExhausted = (entry?: { used: number; limit: number | null }) => !!entry && entry.limit !== null && entry.used >= entry.limit

    useEffect(() => {
        if (!storiesV2Enabled) {
            setShowStoryPrompt(false);
            return;
        }
        if (!session) {
            setShowStoryPrompt(false);
            return;
        }
        setShowStoryPrompt(true);
    }, [storiesV2Enabled, session]);

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
            if (existing && typeof existing === 'object') return { ...prev, loading: false, error: null, result: existing as Record<string, unknown>, cached: true };
            return prev;
        });
    }, [session]);

    const [applyState, setApplyState] = useState<{ status: 'idle' | 'loading' | 'success' | 'error'; error: string; templateId: string | null }>({ status: 'idle', error: '', templateId: null });

    const targetUserId = useMemo(() => {
        const candidates = [
            session?.user_id,
            session?.userId,
            session?.student_id,
            session?.studentId,
            session?.owner_id,
            session?.ownerId,
            user?.id,
            user?.uid
        ];
        const found = candidates.find((v) => typeof v === 'string' && v.trim());
        return found ? String(found) : null;
    }, [session, user?.id, user?.uid]);

    useEffect(() => {
        const id = session?.id ? String(session.id) : '';
        if (!id || !supabase) {
            setCheckinsByKind({ pre: null, post: null });
            return;
        }
        const originWorkoutId = session?.originWorkoutId ? String(session.originWorkoutId) : '';
        const baseMs =
            toDateMs(session?.date) ?? toDateMs(session?.completed_at) ?? toDateMs(session?.completedAt) ?? (id ? Date.now() : null);
        const validBaseMs = typeof baseMs === 'number' && Number.isFinite(baseMs) ? baseMs : null;
        const windowStartIso = validBaseMs ? new Date(validBaseMs - 12 * 60 * 60 * 1000).toISOString() : null;
        const windowEndIso = validBaseMs ? new Date(validBaseMs + 2 * 60 * 60 * 1000).toISOString() : null;
        let cancelled = false;
        (async () => {
            try {
                const { data } = await supabase
                    .from('workout_checkins')
                    .select('kind, energy, mood, soreness, notes, answers, created_at')
                    .eq('workout_id', id)
                    .order('created_at', { ascending: true })
                    .limit(10);
                if (cancelled) return;
                const rows = Array.isArray(data) ? data : [];
                const next: { pre: AnyObj | null; post: AnyObj | null } = { pre: null, post: null };
                rows.forEach((r) => {
                    const row = r && typeof r === 'object' ? (r as AnyObj) : null
                    if (!row) return
                    const kind = String(row?.kind || '').trim();
                    if (kind === 'pre') next.pre = row;
                    if (kind === 'post') next.post = row;
                });

                if (!next.pre && originWorkoutId && targetUserId && windowStartIso && windowEndIso) {
                    try {
                        const { data: preRow } = await supabase
                            .from('workout_checkins')
                            .select('kind, energy, mood, soreness, notes, answers, created_at')
                            .eq('user_id', targetUserId)
                            .eq('kind', 'pre')
                            .eq('planned_workout_id', originWorkoutId)
                            .gte('created_at', windowStartIso)
                            .lte('created_at', windowEndIso)
                            .order('created_at', { ascending: false })
                            .limit(1)
                            .maybeSingle();
                        if (!cancelled && preRow) next.pre = preRow;
                    } catch { }
                }

                setCheckinsByKind(next);
            } catch {
                if (cancelled) return;
                setCheckinsByKind({ pre: null, post: null });
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [session?.id, session?.originWorkoutId, session?.date, session?.completed_at, session?.completedAt, supabase, targetUserId]);

    const resolvePreviousFromHistory = useCallback(async () => {
        try {
            if (!supabase) return null;
            if (previousSession) return previousSession;
            if (resolvedPreviousSession) return resolvedPreviousSession;
            if (!targetUserId) return null;
            if (!session || typeof session !== 'object') return null;
            if (previousFetchInFlightRef.current) return null;

            const currentMs = toDateMs(session?.date) ?? toDateMs(session?.completed_at) ?? toDateMs(session?.completedAt) ?? null;
            const { originId: currentOriginId, titleKey: currentTitleKey } = computeMatchKey(session);
            if (!currentOriginId && !currentTitleKey) return null;

            previousFetchInFlightRef.current = true;

            let query = supabase
                .from('workouts')
                .select('id, date, created_at, notes, name')
                .eq('user_id', targetUserId)
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
                if (typeof candidateMs !== 'number' || !Number.isFinite(candidateMs)) continue;

                if (typeof currentMs === 'number' && Number.isFinite(currentMs) && candidateMs >= currentMs) continue;

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
    }, [previousSession, resolvedPreviousSession, session, supabase, targetUserId]);

    useEffect(() => {
        resolvePreviousFromHistory().catch(() => { });
    }, [resolvePreviousFromHistory]);

    const resolvePrevByExerciseFromHistory = useCallback(async () => {
        try {
            if (!supabase) return;
            if (!targetUserId) return;
            if (!session || typeof session !== 'object') return;
            if (prevByExerciseFetchInFlightRef.current) return;

            const exercisesArr = Array.isArray(session?.exercises) ? session.exercises : [];
            if (!exercisesArr.length) return;

            const wanted = new Map();
            exercisesArr.forEach((ex) => {
                const name = String(ex?.name || '').trim();
                if (!name) return;
                const key = normalizeExerciseKey(name);
                if (!key) return;
                if (!wanted.has(key)) wanted.set(key, name);
            });
            if (!wanted.size) return;

            const currentMs =
                toDateMs(session?.date) ?? toDateMs(session?.completed_at) ?? toDateMs(session?.completedAt) ?? Date.now();

            prevByExerciseFetchInFlightRef.current = true;

            let query = supabase
                .from('workouts')
                .select('id, date, created_at, notes')
                .eq('user_id', targetUserId)
                .eq('is_template', false)
                .order('date', { ascending: false })
                .limit(350);

            const currentId = typeof session?.id === 'string' && session.id ? session.id : null;
            if (currentId) query = query.neq('id', currentId);

            const { data: rows, error } = await query;
            if (error) throw error;

            const candidates = Array.isArray(rows) ? rows : [];
            const resolvedLogs: Record<string, unknown> = {};
            const resolvedBaseMs: Record<string, number> = {};
            const remaining = new Set(Array.from(wanted.keys()));

            for (const r of candidates) {
                if (!remaining.size) break;
                if (!r || typeof r !== 'object') continue;
                const parsed = parseSessionNotes(r.notes);
                if (!parsed || typeof parsed !== 'object') continue;

                const candidateMs = toDateMs(parsed?.date) ?? toDateMs(r?.date) ?? toDateMs(r?.created_at) ?? null;
                const validCandidateMs = (typeof candidateMs === 'number' && Number.isFinite(candidateMs)) ? candidateMs : null;
                if (validCandidateMs === null) continue;

                const validCurrentMs = (typeof currentMs === 'number' && Number.isFinite(currentMs)) ? currentMs : null;
                if (validCurrentMs !== null && validCandidateMs >= validCurrentMs) continue;

                const exArr = Array.isArray(parsed?.exercises) ? parsed.exercises : [];
                if (!exArr.length) continue;

                exArr.forEach((ex, exIdx) => {
                    if (!remaining.size) return;
                    const name = String(ex?.name || '').trim();
                    if (!name) return;
                    const key = normalizeExerciseKey(name);
                    if (!key) return;
                    if (!remaining.has(key)) return;
                    const logs = extractExerciseLogsByIndex(parsed, exIdx);
                    if (!hasAnyComparableLog(logs)) return;
                    resolvedLogs[key] = logs;
                    resolvedBaseMs[key] = validCandidateMs;
                    remaining.delete(key);
                });
            }

            setPrevByExercise({ logsByExercise: resolvedLogs, baseMsByExercise: resolvedBaseMs });
        } catch {
            setPrevByExercise({ logsByExercise: {}, baseMsByExercise: {} });
        } finally {
            prevByExerciseFetchInFlightRef.current = false;
        }
    }, [session, supabase, targetUserId]);

    useEffect(() => {
        resolvePrevByExerciseFromHistory().catch(() => { });
    }, [resolvePrevByExerciseFromHistory]);

    const [kcalEstimate, setKcalEstimate] = useState(0);

    useEffect(() => {
        if (!session) {
            setKcalEstimate(0);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const kcal = await getKcalEstimate({ session, workoutId: session?.id ?? null });
                if (cancelled) return;
                if (Number.isFinite(Number(kcal)) && Number(kcal) > 0) setKcalEstimate(Math.round(Number(kcal)));
            } catch {
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [session]);

    useEffect(() => {
        let cancelled = false
        if (!session?.date) return
        const run = async () => {
            setMuscleTrend({ status: 'loading', data: null })
            try {
                const base = new Date(String(session.date))
                const weekStart = getWeekStartIso(base)
                const prevWeek = new Date(`${weekStart}T00:00:00.000Z`)
                prevWeek.setDate(prevWeek.getDate() - 7)
                const prevWeekStart = prevWeek.toISOString().slice(0, 10)
                const [curRes, prevRes] = await Promise.all([
                    getMuscleMapWeek({ weekStart }),
                    getMuscleMapWeek({ weekStart: prevWeekStart }),
                ])
                if (cancelled) return
                const curMuscles = (curRes?.ok && curRes.muscles && typeof curRes.muscles === 'object') ? (curRes.muscles as Record<string, unknown>) : {}
                const prevMuscles = (prevRes?.ok && prevRes.muscles && typeof prevRes.muscles === 'object') ? (prevRes.muscles as Record<string, unknown>) : {}
                const current = Object.fromEntries(Object.entries(curMuscles).map(([id, v]) => [id, Number((v as AnyObj)?.sets || 0)]))
                const previous = Object.fromEntries(Object.entries(prevMuscles).map(([id, v]) => [id, Number((v as AnyObj)?.sets || 0)]))
                setMuscleTrend({ status: 'ready', data: { current, previous } })
            } catch {
                if (!cancelled) setMuscleTrend({ status: 'error', data: null })
            }
        }
        run()
        return () => {
            cancelled = true
        }
    }, [session?.date])

    useEffect(() => {
        let cancelled = false
        if (!session?.date) return
        const run = async () => {
            setMuscleTrend4w({ status: 'loading', data: null })
            try {
                const base = new Date(String(session.date))
                const baseWeek = getWeekStartIso(base)
                const weekDates: string[] = [0, 1, 2, 3].map((idx) => {
                    const d = new Date(`${baseWeek}T00:00:00.000Z`)
                    d.setDate(d.getDate() - idx * 7)
                    return d.toISOString().slice(0, 10)
                })
                const responses = await Promise.all(weekDates.map((weekStart) => getMuscleMapWeek({ weekStart })))
                if (cancelled) return
                const series: Record<string, number[]> = {}
                Object.keys(MUSCLE_BY_ID).forEach((id) => {
                    series[id] = responses.map((res) => {
                        const muscles = res?.ok && res.muscles && typeof res.muscles === 'object' ? (res.muscles as Record<string, unknown>) : {}
                        const entry = muscles[id]
                        const sets = entry && typeof entry === 'object' ? Number((entry as AnyObj).sets || 0) : 0
                        return Number.isFinite(sets) ? sets : 0
                    }).reverse()
                })
                setMuscleTrend4w({ status: 'ready', data: { weeks: weekDates.reverse(), series } })
            } catch {
                if (!cancelled) setMuscleTrend4w({ status: 'error', data: null })
            }
        }
        run()
        return () => {
            cancelled = true
        }
    }, [session?.date])

    useEffect(() => {
        let cancelled = false
        if (!session?.date || !supabase) return
        const run = async () => {
            setExerciseTrend({ status: 'loading', data: null })
            try {
                const base = new Date(String(session.date))
                const baseWeek = getWeekStartIso(base)
                const weekDates: string[] = [0, 1, 2, 3].map((idx) => {
                    const d = new Date(`${baseWeek}T00:00:00.000Z`)
                    d.setDate(d.getDate() - idx * 7)
                    return d.toISOString().slice(0, 10)
                })
                const startDate = new Date(`${weekDates[weekDates.length - 1]}T00:00:00.000Z`)
                const { data: rows } = await supabase
                    .from('workouts')
                    .select('notes, date, created_at')
                    .eq('user_id', user?.id || '')
                    .eq('is_template', false)
                    .gte('date', startDate.toISOString())
                    .order('date', { ascending: false })
                    .limit(220)
                const sessions = (Array.isArray(rows) ? rows : [])
                    .map((row) => {
                        if (row?.notes && typeof row.notes === 'object') return row.notes as Record<string, unknown>
                        if (typeof row?.notes === 'string') return parseJsonWithSchema(row.notes, z.record(z.unknown()))
                        return null
                    })
                    .filter((s): s is Record<string, unknown> => Boolean(s && typeof s === 'object'))
                const reportMetaLocal = session?.reportMeta && typeof session.reportMeta === 'object' ? (session.reportMeta as Record<string, unknown>) : null
                const keyExercises = Array.isArray(reportMetaLocal?.exercises)
                    ? (reportMetaLocal?.exercises as Array<Record<string, unknown>>)
                        .map((e) => ({ name: String(e?.name || '').trim(), volume: Number((e?.volumeKg ?? 0) as number) || 0 }))
                        .filter((e) => e.name)
                        .sort((a, b) => b.volume - a.volume)
                        .slice(0, 4)
                        .map((e) => e.name)
                    : []
                if (!keyExercises.length) {
                    setExerciseTrend({ status: 'ready', data: { weeks: weekDates.reverse(), series: [] } })
                    return
                }
                const weekIndexByDate = new Map<string, number>()
                weekDates.forEach((w, idx) => weekIndexByDate.set(w, idx))
                const series = keyExercises.map((name) => ({ name, values: [0, 0, 0, 0] }))
                const normalizeKey = (value: string) => normalizeExerciseName(value).toLowerCase()
                const seriesByKey = new Map(series.map((s) => [normalizeKey(s.name), s]))

                const addToSeries = (sessionObj: Record<string, unknown>) => {
                    const dateRaw = sessionObj?.date ?? sessionObj?.created_at ?? null
                    const dateMs = dateRaw ? new Date(String(dateRaw)).getTime() : 0
                    if (!Number.isFinite(dateMs)) return
                    const weekStart = getWeekStartIso(new Date(dateMs))
                    const weekIdx = weekIndexByDate.get(weekStart)
                    if (weekIdx == null) return
                    const exercises = Array.isArray(sessionObj.exercises) ? (sessionObj.exercises as unknown[]) : []
                    const logs = sessionObj.logs && typeof sessionObj.logs === 'object' ? (sessionObj.logs as Record<string, unknown>) : {}
                    exercises.forEach((raw, exIdx) => {
                        if (!raw || typeof raw !== 'object') return
                        const exObj = raw as Record<string, unknown>
                        const name = String(exObj.name || '').trim()
                        if (!name) return
                        const key = normalizeKey(name)
                        const bucket = seriesByKey.get(key)
                        if (!bucket) return
                        let volume = 0
                        Object.entries(logs).forEach(([k, v]) => {
                            const parts = String(k || '').split('-')
                            const eIdx = Number(parts[0])
                            if (!Number.isFinite(eIdx) || eIdx !== exIdx) return
                            if (!v || typeof v !== 'object') return
                            const obj = v as Record<string, unknown>
                            const w = Number(String(obj.weight ?? '').replace(',', '.'))
                            const r = Number(String(obj.reps ?? '').replace(',', '.'))
                            if (!Number.isFinite(w) || !Number.isFinite(r) || w <= 0 || r <= 0) return
                            volume += w * r
                        })
                        bucket.values[weekIdx] += volume
                    })
                }

                sessions.forEach(addToSeries)
                const normalizedSeries = series.map((s) => ({ name: s.name, values: s.values.map((v) => Math.round(v * 10) / 10).reverse() }))
                setExerciseTrend({ status: 'ready', data: { weeks: weekDates.reverse(), series: normalizedSeries } })
            } catch {
                if (!cancelled) setExerciseTrend({ status: 'error', data: null })
            }
        }
        run()
        return () => {
            cancelled = true
        }
    }, [session?.date, session?.reportMeta, supabase, user?.id])

    if (!session) return null;

    // Use shared formatters from @/utils/report/formatters
    const formatDate = sharedFormatDate;
    const formatDuration = sharedFormatDuration;
    const formatKm = sharedFormatKm;
    const formatKmh = sharedFormatKmh;
    const getCurrentDate = () => new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const effectivePreviousSession = (() => {
        if (!previousSession) return resolvedPreviousSession;
        const prevUserId = previousSession?.user_id ?? previousSession?.userId ?? previousSession?.student_id ?? previousSession?.studentId ?? null;
        if (prevUserId && targetUserId && String(prevUserId) !== String(targetUserId)) return resolvedPreviousSession;
        return previousSession;
    })();

    const sessionLogs: Record<string, unknown> = session?.logs && typeof session.logs === 'object' ? (session.logs as Record<string, unknown>) : {};
    const prevSessionLogs: Record<string, unknown> = effectivePreviousSession?.logs && typeof effectivePreviousSession.logs === 'object' ? (effectivePreviousSession.logs as Record<string, unknown>) : {};
    const currentVolume = calculateTotalVolume(sessionLogs);
    const prevVolume = effectivePreviousSession ? calculateTotalVolume(prevSessionLogs) : 0;
    const volumeDelta = prevVolume > 0 ? ((currentVolume - prevVolume) / prevVolume) * 100 : 0;
    const durationInMinutes = (Number(session?.totalTime) || 0) / 60;
    const outdoorBike = session?.outdoorBike && typeof session.outdoorBike === 'object' ? (session.outdoorBike as AnyObj) : null;
    const calories = (() => {
        const ov = Number(kcalEstimate);
        if (Number.isFinite(ov) && ov > 0) return Math.round(ov);
        const bikeKcal = Number(outdoorBike?.caloriesKcal);
        if (Number.isFinite(bikeKcal) && bikeKcal > 0) return Math.round(bikeKcal);
        return Math.round((currentVolume * 0.02) + (durationInMinutes * 4));
    })();
    const reportMeta = session?.reportMeta && typeof session.reportMeta === 'object' ? (session.reportMeta as AnyObj) : null
    const reportTotals = reportMeta?.totals && typeof reportMeta.totals === 'object' ? (reportMeta.totals as AnyObj) : null
    const reportRest = reportMeta?.rest && typeof reportMeta.rest === 'object' ? (reportMeta.rest as AnyObj) : null
    const reportWeekly = reportMeta?.weekly && typeof reportMeta.weekly === 'object' ? (reportMeta.weekly as AnyObj) : null
    const reportLoadFlags = reportMeta?.loadFlags && typeof reportMeta.loadFlags === 'object' ? (reportMeta.loadFlags as AnyObj) : null

    const prevLogsMap = (() => {
        try {
            const fromPerExercise = prevByExercise?.logsByExercise && typeof prevByExercise.logsByExercise === 'object'
                ? prevByExercise.logsByExercise
                : null;
            if (fromPerExercise && Object.keys(fromPerExercise).length) return fromPerExercise;
        } catch { }

        const out: Record<string, unknown> = {};
        if (effectivePreviousSession && Array.isArray(effectivePreviousSession?.exercises)) {
            const safePrevLogs = prevSessionLogs as Record<string, unknown>;
            (effectivePreviousSession.exercises as unknown[]).forEach((ex: unknown, exIdx: number) => {
                const exObj = ex && typeof ex === 'object' ? (ex as AnyObj) : null
                if (!exObj) return;
                const exName = String(exObj?.name || '').trim();
                const keyName = normalizeExerciseKey(exName);
                if (!keyName) return;
                const exLogs: Array<Record<string, unknown>> = [];
                Object.keys(safePrevLogs).forEach((key) => {
                    try {
                        const parts = String(key || '').split('-');
                        const eIdx = Number(parts[0]);
                        const sIdx = Number(parts[1]);
                        if (!Number.isFinite(eIdx) || !Number.isFinite(sIdx)) return;
                        if (eIdx !== exIdx) return;
                        const value = safePrevLogs[key]
                        if (value && typeof value === 'object') exLogs[sIdx] = value as Record<string, unknown>;
                    } catch {
                        return;
                    }
                });
                out[keyName] = exLogs;
            });
        }
        return out;
    })();

    const prevBaseMsMap = (() => {
        try {
            const m = prevByExercise?.baseMsByExercise && typeof prevByExercise.baseMsByExercise === 'object'
                ? prevByExercise.baseMsByExercise
                : null;
            if (m && Object.keys(m).length) return m;
        } catch { }
        return {};
    })();

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

            // Client-side PDF: open HTML in hidden iframe and trigger browser print dialog
            // This works on both iOS (WKWebView/Safari) and desktop browsers
            // The browser's native "Save as PDF" handles the conversion
            try {
                const printWindow = window.open('', '_blank');
                if (printWindow) {
                    printWindow.document.open();
                    printWindow.document.write(html);
                    printWindow.document.close();
                    // Wait for content to render before triggering print
                    setTimeout(() => {
                        try {
                            printWindow.focus();
                            printWindow.print();
                        } catch { }
                    }, 500);
                } else {
                    // Fallback: use a hidden iframe if popup is blocked
                    const iframe = document.createElement('iframe');
                    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:none;';
                    document.body.appendChild(iframe);
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (iframeDoc) {
                        iframeDoc.open();
                        iframeDoc.write(html);
                        iframeDoc.close();
                        setTimeout(() => {
                            try {
                                iframe.contentWindow?.focus();
                                iframe.contentWindow?.print();
                            } catch { }
                            setTimeout(() => { try { iframe.remove(); } catch { } }, 5000);
                        }, 500);
                    }
                }
            } catch {
                // Last resort: create downloadable HTML file
                const blob = new Blob([html], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'relatorio-irontracks.html';
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
        setAiState((prev) => ({ ...(prev || { loading: false, error: null, result: null, cached: false }), loading: true, error: null, cached: false }));
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
                setAiState((prev) => ({ ...(prev || { loading: false, error: null, result: null, cached: false }), loading: false, error: String(res?.error || 'Falha ao gerar insights'), cached: false }));
                return;
            }
            setAiState({ loading: false, error: null, result: (res.ai && typeof res.ai === 'object' ? (res.ai as Record<string, unknown>) : null), cached: !!res.saved });
        } catch (e) {
            setAiState((prev) => ({ ...(prev || { loading: false, error: null, result: null, cached: false }), loading: false, error: String((e as AnyObj | null)?.message || e || 'Falha ao gerar insights'), cached: false }));
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
        const db = checkinsByKind?.pre || null;
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
        const db = checkinsByKind?.post || null;
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
            <div className={`sticky top-0 z-[1100] no-print bg-neutral-950/95 backdrop-blur border-b border-neutral-800 px-4 md:px-6 pt-safe pb-3 ${isGenerating ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="max-w-4xl mx-auto flex items-center justify-end gap-2">
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

            <div className="flex-1 overflow-y-auto bg-neutral-950">
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
                        setAiState((prev) => {
                            const ai = prev?.result && typeof prev.result === 'object' ? (prev.result as AnyObj) : {}
                            const current = Array.isArray(ai.summary) ? (ai.summary as unknown[]) : []
                            return { ...prev, result: { ...ai, summary: [...current, summary] } }
                        })
                    }}
                />
            )}
        </div>
    );
};

export default WorkoutReport;

"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { HistorySummaryCard } from '@/components/history/HistorySummaryCard';
import { HistoryEmptyState, HistoryEmptyPeriod } from '@/components/history/HistoryEmptyStates';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Dumbbell, Edit3, FileText, Flame, History, Plus, Trash2, TrendingUp, Trophy, CheckCircle2, Circle, Lock } from 'lucide-react';
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { createClient } from '@/utils/supabase/client';
import ExerciseEditor from '@/components/ExerciseEditor';
import WorkoutReport from '@/components/WorkoutReport';
import { generatePeriodReportInsights } from '@/actions/workout-actions';
import { useDialog } from '@/contexts/DialogContext';
import { buildPeriodReportHtml } from '@/utils/report/buildPeriodReportHtml';
import { FEATURE_KEYS, isFeatureEnabled } from '@/utils/featureFlags';
import { adminFetchJson } from '@/utils/admin/adminFetch';
import { PeriodStats } from '@/types/workout';
import { SkeletonList } from '@/components/ui/Skeleton';
import { logError, logWarn, logInfo } from '@/lib/logger';
import { HistoryListManualModal } from '@/components/HistoryListManualModal';
import { HistoryListPeriodReportModal } from '@/components/HistoryListPeriodReportModal';
import { HistoryListEditModal } from '@/components/HistoryListEditModal';
import { z } from 'zod';
import {
    UnknownRecord, WorkoutLog, RawSession, WorkoutSummary, WorkoutTemplate, ManualExercise,
    NewWorkoutState, PeriodReport, PeriodAiState, PeriodPdfState, HistoryListProps,
    WorkoutLogSchema, RawSessionObjectSchema, RawSessionJsonSchema,
    WorkoutIdNameSchema, ExerciseIdSchema, SetLiteSchema,
    isRecord, parseRawSession,
} from '@/components/historyListTypes';

const REPORT_DAYS_WEEK = 7;
const REPORT_DAYS_MONTH = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_SESSIONS_LIMIT = 30;
const TOP_EXERCISES_LIMIT = 5;



const HistoryList: React.FC<HistoryListProps> = ({ user, settings, onViewReport, onBack, targetId, targetEmail, readOnly, title, embedded = false, vipLimits, onUpgrade }) => {
    const { confirm, alert } = useDialog();
    const [history, setHistory] = useState<WorkoutSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const supabase = useMemo(() => createClient(), []);
    const safeUserId = user?.id ? String(user.id) : '';
    const safeUserEmail = String(user?.email || '').trim().toLowerCase();
    const isReadOnly = !!readOnly;
    const [range, setRange] = useState(() => (readOnly ? 'all' : '30'));
    const [showManual, setShowManual] = useState(false);
    const [manualDate, setManualDate] = useState(new Date().toISOString().slice(0, 16));
    const [manualDuration, setManualDuration] = useState('45');
    const [manualNotes, setManualNotes] = useState('');
    const [manualTab, setManualTab] = useState('existing');
    const weeklyReportCtaEnabled = useMemo(() => isFeatureEnabled(settings, FEATURE_KEYS.weeklyReportCTA), [settings]);
    const [availableWorkouts, setAvailableWorkouts] = useState<WorkoutTemplate[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState<WorkoutTemplate | null>(null);
    const [newWorkout, setNewWorkout] = useState<NewWorkoutState>({ title: '', exercises: [] });
    const [manualExercises, setManualExercises] = useState<ManualExercise[]>([]);
    const [showEdit, setShowEdit] = useState(false);
    const [selectedSession, setSelectedSession] = useState<Record<string, unknown> | null>(null);
    const [editId, setEditId] = useState<string | null>(null);
    const normalizeEditorWorkout = useCallback((workout: unknown): NewWorkoutState => {
        const base = isRecord(workout) ? workout : {};
        const title = String(base?.title || base?.name || '').trim();
        const exercises = (Array.isArray(base?.exercises) ? base.exercises : []).map((e) => {
            const row = isRecord(e) ? e : {};
            return {
                name: String(row?.name || ''),
                sets: Number(row?.sets || 0) || 0,
                reps: String(row?.reps || ''),
                restTime: Number(row?.restTime ?? row?.rest_time ?? 0) || 0,
                cadence: String(row?.cadence || ''),
                notes: String(row?.notes || ''),
                weights: Array.isArray(row?.weights) ? row.weights.map((v: unknown) => String(v ?? '')) : undefined,
                repsPerSet: Array.isArray(row?.repsPerSet) ? row.repsPerSet.map((v: unknown) => String(v ?? '')) : undefined,
            } as ManualExercise;
        });
        return { title, exercises };
    }, []);

    const editorWorkout = useMemo(() => {
        const exercises = (Array.isArray(newWorkout.exercises) ? newWorkout.exercises : []).map((e) => {
            const row = (isRecord(e) ? e : {}) as Record<string, unknown>;
            const rpeRaw = Number(row?.rpe);
            const rpe = Number.isFinite(rpeRaw) ? rpeRaw : null;
            return {
                name: String(row?.name || ''),
                sets: Number(row?.sets ?? 0) || 0,
                reps: String(row?.reps ?? ''),
                rpe,
                restTime: Number(row?.restTime ?? row?.rest_time ?? 0) || 0,
                cadence: String(row?.cadence ?? ''),
                notes: String(row?.notes ?? ''),
            };
        });
        return { title: String(newWorkout.title || ''), exercises };
    }, [newWorkout]);
    const [editTitle, setEditTitle] = useState('');
    const [editDate, setEditDate] = useState(new Date().toISOString().slice(0, 16));
    const [editDuration, setEditDuration] = useState('45');
    const [editNotes, setEditNotes] = useState('');
    const [editExercises, setEditExercises] = useState<ManualExercise[]>([]);
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [periodReport, setPeriodReport] = useState<PeriodReport | null>(null);
    const [periodAi, setPeriodAi] = useState<PeriodAiState>({ status: 'idle', ai: null, error: '' });
    const [periodPdf, setPeriodPdf] = useState<PeriodPdfState>({ status: 'idle', url: null, blob: null, error: '' });
    const [shareError, setShareError] = useState('');

    const toggleSelectionMode = () => {
        setIsSelectionMode(!isSelectionMode);
        setSelectedIds(new Set());
    };

    const toggleItemSelection = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return;
        if (!(await confirm(`Excluir ${selectedIds.size} itens selecionados?`))) return;

        try {
            const ids = Array.from(selectedIds);
            const { error } = await supabase
                .from('workouts')
                .delete()
                .in('id', ids)
                .eq('is_template', false);

            if (error) throw error;

            setHistory(prev => prev.filter(h => !selectedIds.has(h.id)));
            setIsSelectionMode(false);
            setSelectedIds(new Set());
            await alert('Itens excluídos com sucesso');
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            await alert('Erro ao excluir: ' + msg);
        }
    };

    const formatHistoryTitle = (title: unknown) => {
        return typeof title === 'string' && title ? title : 'Treino';
    };

    const formatCompletedAt = (dateValue: unknown) => {
        try {
            if (!dateValue) return 'Data desconhecida';
            const d = new Date(String(dateValue));
            if (isNaN(d.getTime())) return 'Data desconhecida';
            const dateStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
            const timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            return `${dateStr} • ${timeStr}`;
        } catch {
            return 'Data desconhecida';
        }
    };

    const rangeLabel = useMemo(() => {
        if (range === '7') return 'Últimos 7 dias';
        if (range === '30') return 'Últimos 30 dias';
        if (range === '90') return 'Últimos 90 dias';
        return 'Tudo';
    }, [range]);

    const historyItems = useMemo(() => {
        return Array.isArray(history) ? history : [];
    }, [history]);

    const toDateMs = (value: unknown): number | null => {
        try {
            if (!value) return null;
            if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
                const d = (value as { toDate: () => unknown }).toDate();
                const t = d instanceof Date ? d.getTime() : new Date(String(d)).getTime();
                return Number.isFinite(t) ? t : null;
            }
            if (value instanceof Date) {
                const t = value.getTime();
                return Number.isFinite(t) ? t : null;
            }
            if (isRecord(value)) {
                const seconds = Number(value.seconds ?? value._seconds ?? value.sec ?? null);
                const nanos = Number(value.nanoseconds ?? value._nanoseconds ?? 0);
                if (Number.isFinite(seconds) && seconds > 0) {
                    const t = seconds * 1000 + Math.floor(nanos / 1e6);
                    return Number.isFinite(t) ? t : null;
                }
            }
            const t = new Date(String(value)).getTime();
            return Number.isFinite(t) ? t : null;
        } catch {
            return null;
        }
    };

    const filteredHistory = useMemo(() => {
        if (range === 'all') return historyItems;
        const days = Number(range);
        if (!Number.isFinite(days) || days <= 0) return historyItems;
        const cutoff = Date.now() - days * DAY_MS;
        return historyItems.filter((s) => {
            const t = toDateMs(s?.dateMs) ?? toDateMs(s?.date);
            return Number.isFinite(t) && t !== null && t >= cutoff;
        });
    }, [historyItems, range]);

    const { visibleHistory, blockedCount } = useMemo(() => {
        const days = vipLimits?.history_days;
        if (typeof days !== 'number') return { visibleHistory: filteredHistory, blockedCount: 0 };

        const cutoff = Date.now() - days * DAY_MS;
        const visible: WorkoutSummary[] = [];
        let blocked = 0;

        filteredHistory.forEach(item => {
            const t = toDateMs(item?.dateMs) ?? toDateMs(item?.date);
            if (Number.isFinite(t) && t !== null && t >= cutoff) {
                visible.push(item);
            } else {
                blocked++;
            }
        });

        return { visibleHistory: visible, blockedCount: blocked };
    }, [filteredHistory, vipLimits]);

    const parentRef = useRef<HTMLDivElement | null>(null)
    const [scrollMargin, setScrollMargin] = useState(0)
    useLayoutEffect(() => {
        const el = parentRef.current
        if (!el) return
        const rect = el.getBoundingClientRect()
        setScrollMargin(rect.top + window.scrollY)
    }, [])
    const rowVirtualizer = useWindowVirtualizer({
        count: visibleHistory.length,
        estimateSize: () => 156,
        overscan: 5,
        scrollMargin,
    })
    const virtualItems = rowVirtualizer.getVirtualItems()

    // Must be defined BEFORE summary useMemo (avoids Temporal Dead Zone on first render)
    const calculateTotalVolumeFromLogs = (logs: unknown) => {
        try {
            const safeLogs: Record<string, unknown> = isRecord(logs) ? logs : {};
            let volume = 0;
            Object.values(safeLogs).forEach((log) => {
                if (!isRecord(log)) return;
                const w = Number(String(log.weight ?? '').replace(',', '.'));
                const r = Number(String(log.reps ?? '').replace(',', '.'));
                if (!Number.isFinite(w) || !Number.isFinite(r)) return;
                if (w <= 0 || r <= 0) return;
                volume += w * r;
            });
            return volume;
        } catch {
            return 0;
        }
    };

    const summary = useMemo(() => {
        const totalSeconds = visibleHistory.reduce((acc, s) => acc + (Number(s?.totalTime) || 0), 0);
        const totalMinutes = Math.max(0, Math.round(totalSeconds / 60));
        const count = visibleHistory.length;
        const avgMinutes = count > 0 ? Math.max(0, Math.round(totalMinutes / count)) : 0;
        // Volume total across all visible sessions
        let totalVolume = 0;
        visibleHistory.forEach((s) => {
            const raw = parseRawSession(s?.rawSession ?? s?.notes);
            if (raw?.logs) totalVolume += calculateTotalVolumeFromLogs(raw.logs);
        });
        const volumeLabel = totalVolume >= 1000 ? `${(totalVolume / 1000).toFixed(1)}t` : `${Math.round(totalVolume)}kg`;
        return { count, totalMinutes, avgMinutes, totalVolume, volumeLabel };
    }, [visibleHistory]);


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
            let totalVolumeKg = 0;
            let totalSets = 0;
            let totalReps = 0;
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
                    if (Number.isFinite(t) && t !== null) {
                        dayKey = new Date(t).toISOString().slice(0, 10);
                        uniqueDays.add(dayKey);
                    }
                } catch { }
                const sessionMinutes = Math.max(0, Math.round((Number(item?.totalTime ?? raw?.totalTime) || 0) / 60));
                sessionSummaries.push({ date: dateValue, minutes: sessionMinutes, volumeKg: Math.max(0, Math.round(safeVolume || 0)) });
                Object.entries(logs || {}).forEach(([key, log]) => {
                    if (!isRecord(log)) return;
                    const w = Number(String(log.weight ?? '').replace(',', '.'));
                    const r = Number(String(log.reps ?? '').replace(',', '.'));
                    if (!Number.isFinite(w) || !Number.isFinite(r)) return;
                    if (w <= 0 || r <= 0) return;
                    totalSets += 1;
                    totalReps += r;
                    const exIdx = Number.parseInt(String(key || '').split('-')[0] || '', 10);
                    const ex = Number.isFinite(exIdx) ? exercises?.[exIdx] : null;
                    const rawName = isRecord(ex) ? ex.name : null;
                    const name = String(rawName || '').trim() || 'Exercício';
                    const current = exerciseMap.get(name) || { name, sets: 0, reps: 0, volumeKg: 0, sessions: new Set<string>() };
                    current.sets += 1;
                    current.reps += r;
                    current.volumeKg += w * r;
                    if (dayKey) current.sessions.add(dayKey);
                    exerciseMap.set(name, current);
                });
            });
            const avgVolumeKg = count > 0 ? Math.max(0, Math.round(totalVolumeKg / count)) : 0;
            const exercisesList = Array.from(exerciseMap.values()).map((item) => ({
                name: String(item?.name || '').trim(),
                sets: Number(item?.sets) || 0,
                reps: Number(item?.reps) || 0,
                volumeKg: Math.max(0, Math.round(Number(item?.volumeKg) || 0)),
                sessionsCount: item?.sessions ? item.sessions.size : 0
            })).filter((item) => item.name);
            const topExercisesByVolume = [...exercisesList]
                .sort((a, b) => (b.volumeKg || 0) - (a.volumeKg || 0))
                .slice(0, TOP_EXERCISES_LIMIT);
            const topExercisesByFrequency = [...exercisesList]
                .sort((a, b) => (b.sessionsCount || 0) - (a.sessionsCount || 0) || (b.sets || 0) - (a.sets || 0))
                .slice(0, TOP_EXERCISES_LIMIT);
            return {
                days: daysNumber,
                count,
                totalMinutes,
                avgMinutes,
                totalVolumeKg: Math.max(0, Math.round(totalVolumeKg)),
                avgVolumeKg,
                totalSets,
                totalReps,
                uniqueDaysCount: uniqueDays.size,
                topExercisesByVolume,
                topExercisesByFrequency,
                sessionSummaries: sessionSummaries.slice(0, PERIOD_SESSIONS_LIMIT)
            };
        } catch {
            return null;
        }
    };

    const buildShareText = (report: PeriodReport | null) => {
        const data = report;
        if (!data) return '';
        const label = data.type === 'week' ? 'semanal' : data.type === 'month' ? 'mensal' : 'período';
        const stats = data.stats;
        const count = Number(stats.count) || 0;
        const totalMinutes = Number(stats.totalMinutes) || 0;
        const avgMinutes = Number(stats.avgMinutes) || 0;
        const totalVolume = Number(stats.totalVolumeKg) || 0;
        const avgVolume = Number(stats.avgVolumeKg) || 0;
        let totalVolumeLabel = '0 kg';
        let avgVolumeLabel = '0 kg';
        if (Number.isFinite(totalVolume) && totalVolume > 0) {
            totalVolumeLabel = `${totalVolume.toLocaleString('pt-BR')} kg`;
        }
        if (Number.isFinite(avgVolume) && avgVolume > 0) {
            avgVolumeLabel = `${avgVolume.toLocaleString('pt-BR')} kg`;
        }
        const lines = [
            'Relatório ' + label + ' IronTracks',
            'Treinos finalizados: ' + count,
            'Tempo total: ' + totalMinutes + ' min',
            'Média por treino: ' + avgMinutes + ' min',
            'Volume total: ' + totalVolumeLabel,
            'Volume médio/treino: ' + avgVolumeLabel,
        ];
        return lines.join('\n');
    };

    const openSession = (session: WorkoutSummary) => {
        const rawSessionParsed = RawSessionObjectSchema.safeParse(session?.rawSession);
        const rawSession = rawSessionParsed.success ? rawSessionParsed.data : null;
        const sessionRecord: UnknownRecord = isRecord(session) ? session : {};
        const payload = rawSession
            ? {
                ...rawSession,
                id: rawSession.id ?? session?.id ?? null,
                user_id: session?.raw?.user_id ?? rawSession?.user_id ?? sessionRecord.user_id ?? null,
                student_id: session?.raw?.student_id ?? rawSession?.student_id ?? sessionRecord.student_id ?? null
            }
            : session;
        if (typeof onViewReport === 'function') {
            try {
                onViewReport(payload);
                return;
            } catch { }
        }
        setSelectedSession(isRecord(payload) ? payload : null);
    };

    useEffect(() => {
        if (!isSelectionMode) return;
        setSelectedIds(new Set());
    }, [isSelectionMode, range]);

    useEffect(() => {
        const loadHistory = async () => {
            try {
                setLoading(true);
                const baseUserId = user?.id;
                const role = String(user?.role || '').toLowerCase();
                const canUseAdmin = role === 'admin' || role === 'teacher';
                const tId = String(targetId || '').trim();
                const tEmail = String(targetEmail || '').trim().toLowerCase();
                const wantsOtherUser = (!!tId && tId !== safeUserId) || (!!tEmail && tEmail !== safeUserEmail);
                const hasTarget = canUseAdmin && wantsOtherUser;

                if (!baseUserId && !hasTarget) {
                    setHistory([]);
                    return;
                }

                let data: WorkoutSummary[] = [];

                if (hasTarget) {
                    const qs = targetId
                        ? `id=${encodeURIComponent(targetId)}`
                        : `email=${encodeURIComponent(targetEmail || '')}`;
                    const json = await adminFetchJson<{ ok: boolean; rows?: WorkoutSummary[]; error?: string }>(
                        supabase,
                        `/api/admin/workouts/history?${qs}`,
                    );
                    if (!json?.ok) throw new Error(json?.error || 'Falha ao carregar histórico');
                    data = Array.isArray(json?.rows) ? json.rows : [];
                } else {
                    const resp = await fetch('/api/workouts/history?limit=200')
                    const json = await resp.json()
                    if (!json?.ok) throw new Error(json?.error || 'Falha ao carregar histórico')
                    data = Array.isArray(json?.rows) ? json.rows : []
                }

                const formatted = (data || []).map(w => {
                    const raw = parseRawSession(w.notes);
                    const dateMs = toDateMs(raw?.date) ?? toDateMs(w?.date) ?? toDateMs(w?.completed_at) ?? toDateMs(w?.created_at) ?? null;
                    const dateIso = dateMs ? new Date(dateMs).toISOString() : null;
                    return {
                        id: w.id,
                        workoutTitle: raw?.workoutTitle || w.name || 'Treino Recuperado',
                        date: dateIso,
                        dateMs,
                        totalTime: raw?.totalTime || 0,
                        rawSession: raw,
                        raw: w,
                        isTemplate: w.is_template === true
                    }
                });

                setHistory(formatted);
            } catch (e) {
                logError('error', "Erro histórico", e);
                setHistory([]);
            } finally {
                setLoading(false);
            }
        };
        loadHistory();
    }, [supabase, user?.id, user?.role, targetId, targetEmail, safeUserEmail, safeUserId, setHistory, setLoading]);

    const saveManualExisting = async () => {
        try {
            if (!selectedTemplate) throw new Error('Selecione um treino');
            const sourceExercises = Array.isArray(selectedTemplate.exercises) ? selectedTemplate.exercises : [];
            const exIds = sourceExercises
                .map((e) => {
                    const parsed = ExerciseIdSchema.safeParse(e);
                    return parsed.success ? String(parsed.data.id || '').trim() : '';
                })
                .filter(Boolean);
            const setsMap: Record<string, Array<z.infer<typeof SetLiteSchema>>> = {};
            if (exIds.length > 0) {
                const { data: setsData } = await supabase
                    .from('sets')
                    .select('exercise_id, set_number, reps, rpe, weight')
                    .in('exercise_id', exIds)
                    .order('set_number');
                const parsedSets = z.array(SetLiteSchema).safeParse(Array.isArray(setsData) ? setsData : []);
                (parsedSets.success ? parsedSets.data : []).forEach((s) => {
                    const exId = String(s.exercise_id || '').trim();
                    if (!exId) return;
                    const arr = setsMap[exId] || (setsMap[exId] = []);
                    arr.push(s);
                });
            }
            const exercises: ManualExercise[] = manualExercises.length
                ? manualExercises
                : sourceExercises.map((e) => {
                    const row = (isRecord(e) ? e : {}) as Record<string, unknown>;
                    const id = String(row.id ?? '');
                    return {
                        name: String(row.name ?? ''),
                        sets: (id && setsMap[id] ? setsMap[id].length : 0) || (Number(row.sets) || 0),
                        reps: String(row.reps ?? ''),
                        restTime: Number(row.rest_time) || Number(row.restTime) || 0,
                        cadence: String(row.cadence ?? ''),
                        notes: String(row.notes ?? ''),
                    };
                });
            const logs: Record<string, WorkoutLog> = {};
            exercises.forEach((ex, exIdx) => {
                const count = Number(ex.sets) || 0;
                const weights = Array.isArray(ex.weights) ? ex.weights : [];
                for (let sIdx = 0; sIdx < count; sIdx++) {
                    logs[`${exIdx}-${sIdx}`] = {
                        weight: weights[sIdx] ?? '',
                        reps: (ex.repsPerSet?.[sIdx] ?? ex.reps) ?? '',
                        done: true
                    };
                }
            });
            const totalSeconds = parseInt(manualDuration || '0', 10) * 60;
            const session = {
                workoutTitle: selectedTemplate.name || 'Treino',
                date: new Date(manualDate).toISOString(),
                totalTime: totalSeconds,
                realTotalTime: totalSeconds,
                logs,
                exercises,
                notes: manualNotes || '',
                originWorkoutId: selectedTemplate.id
            };
            const resp = await fetch('/api/workouts/finish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session })
            });
            const json = await resp.json();
            if (!json.ok) throw new Error(json.error || 'Falha ao salvar');
            setShowManual(false);
            setHistory(prev => [{ id: json.saved.id, workoutTitle: session.workoutTitle, date: new Date(manualDate).toISOString(), totalTime: parseInt(manualDuration, 10) * 60, rawSession: session }, ...prev]);
            await alert('Histórico adicionado');
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            await alert('Erro: ' + msg);
        }
    };

    const saveManualNew = async () => {
        try {
            if (!newWorkout.title) throw new Error('Informe o título');
            const exercises: ManualExercise[] = (Array.isArray(newWorkout.exercises) ? newWorkout.exercises : []).map((e) => {
                const row = (isRecord(e) ? e : {}) as Record<string, unknown>;
                return {
                    name: String(row.name ?? ''),
                    sets: Number(row.sets ?? 0) || 0,
                    reps: String(row.reps ?? ''),
                    restTime: Number(row.restTime ?? 0) || 0,
                    cadence: String(row.cadence ?? ''),
                    notes: String(row.notes ?? ''),
                };
            });
            const logs: Record<string, WorkoutLog> = {};
            exercises.forEach((ex, exIdx) => {
                for (let sIdx = 0; sIdx < (Number(ex.sets) || 0); sIdx++) {
                    logs[`${exIdx}-${sIdx}`] = { weight: '', reps: ex.reps || '', done: true };
                }
            });
            const totalSeconds = parseInt(manualDuration || '0', 10) * 60;
            const session = {
                workoutTitle: newWorkout.title,
                date: new Date(manualDate).toISOString(),
                totalTime: totalSeconds,
                realTotalTime: totalSeconds,
                logs,
                exercises,
                notes: manualNotes || ''
            };
            const resp = await fetch('/api/workouts/finish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session })
            });
            const json = await resp.json();
            if (!json.ok) throw new Error(json.error || 'Falha ao salvar');
            setShowManual(false);
            setHistory(prev => [{ id: json.saved.id, workoutTitle: session.workoutTitle, date: new Date(manualDate).toISOString(), totalTime: parseInt(manualDuration, 10) * 60, rawSession: session }, ...prev]);
            await alert('Histórico adicionado');
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            await alert('Erro: ' + msg);
        }
    };

    useEffect(() => {
        const fetchAvailableWorkouts = async () => {
            try {
                if (!safeUserId) { setAvailableWorkouts([]); return; }
                const { data } = await supabase
                    .from('workouts')
                    .select('id, name')
                    .eq('user_id', safeUserId)
                    .eq('is_template', false)
                    .order('created_at', { ascending: false });
                setAvailableWorkouts(Array.isArray(data) ? data : []);
            } catch { setAvailableWorkouts([]); }
        };
        if (showManual && manualTab === 'existing') fetchAvailableWorkouts();
    }, [manualTab, showManual, supabase, safeUserId]);

    useEffect(() => {
        const buildManualFromTemplate = async () => {
            if (!selectedTemplate) { setManualExercises([]); return; }
            const sourceExercises = Array.isArray(selectedTemplate?.exercises) ? selectedTemplate.exercises : [];
            const exIds = sourceExercises
                .map((e) => {
                    const parsed = ExerciseIdSchema.safeParse(e);
                    return parsed.success ? String(parsed.data.id || '').trim() : '';
                })
                .filter(Boolean);
            const setsMap: Record<string, Array<z.infer<typeof SetLiteSchema>>> = {};
            if (exIds.length > 0) {
                const { data: setsData } = await supabase
                    .from('sets')
                    .select('exercise_id, set_number, reps, rpe, weight')
                    .in('exercise_id', exIds)
                    .order('set_number');
                const parsedSets = z.array(SetLiteSchema).safeParse(Array.isArray(setsData) ? setsData : []);
                (parsedSets.success ? parsedSets.data : []).forEach((s) => {
                    const exId = String(s.exercise_id || '').trim();
                    if (!exId) return;
                    const arr = setsMap[exId] || (setsMap[exId] = []);
                    arr.push(s);
                });
            }
            const exs: ManualExercise[] = sourceExercises.map((e) => {
                const row = (isRecord(e) ? e : {}) as Record<string, unknown>;
                const id = String(row.id ?? '');
                const setRows = id ? (setsMap[id] || []) : [];
                return {
                    name: String(row.name ?? ''),
                    sets: setRows.length || (Number(row.sets) || 0),
                    reps: String(row.reps ?? ''),
                    restTime: Number(row.rest_time) || Number(row.restTime) || 0,
                    cadence: String(row.cadence ?? ''),
                    notes: String(row.notes ?? ''),
                    weights: setRows.map((s) => String(s.weight ?? '')),
                    repsPerSet: setRows.map((s) => String(s.reps ?? ''))
                };
            });
            setManualExercises(exs);
        };
        if (selectedTemplate && manualTab === 'existing') buildManualFromTemplate();
    }, [manualTab, selectedTemplate, supabase]);

    const updateManualExercise = (idx: number, field: string, value: unknown) => {
        setManualExercises(prev => {
            const next = [...prev];
            if (field === 'weight') {
                const tuple = Array.isArray(value) ? value : [0, ''];
                const wIdx = Number(tuple[0]) || 0;
                const val = String(tuple[1] ?? '');
                const weights = Array.from({ length: Number(next[idx].sets) || 0 }, (_, i) => next[idx].weights?.[i] ?? '');
                weights[wIdx] = val;
                next[idx] = { ...next[idx], weights };
            } else if (field === 'rep') {
                const tuple = Array.isArray(value) ? value : [0, ''];
                const rIdx = Number(tuple[0]) || 0;
                const val = String(tuple[1] ?? '');
                const repsPerSet = Array.from({ length: Number(next[idx].sets) || 0 }, (_, i) => next[idx].repsPerSet?.[i] ?? '');
                repsPerSet[rIdx] = val;
                next[idx] = { ...next[idx], repsPerSet };
            } else {
                next[idx] = { ...next[idx], [field]: value };
                if (field === 'sets') {
                    const n = Number(value as number | string | null | undefined) || 0;
                    const weights = Array.from({ length: n }, (_, i) => next[idx].weights?.[i] ?? '');
                    const repsPerSet = Array.from({ length: n }, (_, i) => next[idx].repsPerSet?.[i] ?? '');
                    next[idx] = { ...next[idx], weights, repsPerSet };
                }
            }
            return next;
        });
    };

    const handleDeleteClick = async (e: React.MouseEvent, session: WorkoutSummary) => {
        e.stopPropagation();
        e.preventDefault();

        if (!window.confirm("Tem certeza que deseja excluir este histórico permanentemente?")) return;

        try {
            const { error } = await supabase
                .from('workouts')
                .delete()
                .eq('id', session.id)
                .eq('is_template', false);
            if (error) throw error;
            setHistory(prev => prev.filter(h => h.id !== session.id));
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            await alert("Erro ao excluir: " + msg);
        }
    };

    const openEdit = (session: WorkoutSummary) => {
        const raw = parseRawSession(session.rawSession ?? session.notes);
        setEditId(session.id);
        setEditTitle(session.workoutTitle || raw?.workoutTitle || 'Treino');
        const d = raw?.date ? new Date(raw.date) : (session.date ? new Date(session.date) : new Date());
        setEditDate(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
        setEditDuration(String(Math.floor((raw?.totalTime || session.totalTime || 0) / 60) || 45));
        setEditNotes(raw?.notes || '');
        const exs: ManualExercise[] = (raw?.exercises || []).map((ex, exIdx: number) => {
            const exRecord = (isRecord(ex) ? ex : {}) as Record<string, unknown>;
            const count = Number(exRecord.sets ?? 0) || 0;
            const logs = raw?.logs ?? {};
            const weights = Array.from({ length: count }, (_, sIdx) => {
                const key = `${exIdx}-${sIdx}`;
                const entry = logs[key];
                const logRow = entry && isRecord(entry) ? entry : {};
                return String(logRow.weight ?? '');
            });
            const repsPerSet = Array.from({ length: count }, (_, sIdx) => {
                const key = `${exIdx}-${sIdx}`;
                const entry = logs[key];
                const logRow = entry && isRecord(entry) ? entry : {};
                return String(logRow.reps ?? exRecord.reps ?? '');
            });
            return {
                name: String(exRecord.name ?? ''),
                sets: count,
                reps: String(exRecord.reps ?? ''),
                restTime: Number(exRecord.restTime ?? 0) || 0,
                cadence: String(exRecord.cadence ?? ''),
                notes: String(exRecord.notes ?? ''),
                weights,
                repsPerSet,
            };
        });
        setEditExercises(exs);
        setShowEdit(true);
    };

    const updateEditExercise = (idx: number, field: string, value: unknown) => {
        setEditExercises(prev => {
            const next = [...prev];
            if (field === 'weight') {
                const tuple = Array.isArray(value) ? value : [0, ''];
                const wIdx = Number(tuple[0]) || 0;
                const val = String(tuple[1] ?? '');
                const weights = Array.from({ length: Number(next[idx].sets) || 0 }, (_, i) => next[idx].weights?.[i] ?? '');
                weights[wIdx] = val;
                next[idx] = { ...next[idx], weights };
            } else if (field === 'rep') {
                const tuple = Array.isArray(value) ? value : [0, ''];
                const rIdx = Number(tuple[0]) || 0;
                const val = String(tuple[1] ?? '');
                const repsPerSet = Array.from({ length: Number(next[idx].sets) || 0 }, (_, i) => next[idx].repsPerSet?.[i] ?? '');
                repsPerSet[rIdx] = val;
                next[idx] = { ...next[idx], repsPerSet };
            } else {
                next[idx] = { ...next[idx], [field]: value };
                if (field === 'sets') {
                    const n = Number(value as number | string | null | undefined) || 0;
                    const weights = Array.from({ length: n }, (_, i) => next[idx].weights?.[i] ?? '');
                    const repsPerSet = Array.from({ length: n }, (_, i) => next[idx].repsPerSet?.[i] ?? '');
                    next[idx] = { ...next[idx], weights, repsPerSet };
                }
            }
            return next;
        });
    };

    const saveEdit = async () => {
        if (!user?.id) return;
        try {
            const exercises: ManualExercise[] = editExercises.map(ex => ({ name: ex.name || '', sets: Number(ex.sets) || 0, reps: ex.reps || '', restTime: Number(ex.restTime) || 0, cadence: ex.cadence || '', notes: ex.notes || '' }));
            const logs: Record<string, WorkoutLog> = {};
            exercises.forEach((ex, exIdx) => {
                const count = Number(ex.sets) || 0;
                for (let sIdx = 0; sIdx < count; sIdx++) {
                    logs[`${exIdx}-${sIdx}`] = { weight: editExercises[exIdx]?.weights?.[sIdx] ?? '', reps: (editExercises[exIdx]?.repsPerSet?.[sIdx] ?? ex.reps) ?? '', done: true };
                }
            });
            const totalSeconds = parseInt(editDuration || '0', 10) * 60;
            const session = { workoutTitle: editTitle, date: new Date(editDate).toISOString(), totalTime: totalSeconds, realTotalTime: totalSeconds, logs, exercises, notes: editNotes || '' };
            const { error } = await supabase
                .from('workouts')
                .update({ name: editTitle, date: new Date(editDate).toISOString(), notes: JSON.stringify(session) })
                .eq('id', editId)
                .eq('user_id', user.id);
            if (error) throw error;
            setShowEdit(false);
            setHistory(prev => prev.map(h => h.id === editId ? { ...h, workoutTitle: editTitle, date: new Date(editDate).toISOString(), totalTime: parseInt(editDuration || '0', 10) * 60, rawSession: session } : h));
            await alert('Histórico atualizado');
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            await alert('Erro: ' + msg);
        }
    };

    const openPeriodReport = async (type: 'week' | 'month') => {
        try {
            const key = type === 'week' ? REPORT_DAYS_WEEK : type === 'month' ? REPORT_DAYS_MONTH : null;
            if (!key) return;
            const stats = buildPeriodStats(key);
            if (!stats) {
                await alert('Sem treinos suficientes nesse período para gerar um relatório.');
                return;
            }
            setPeriodReport({ type, stats });
            setPeriodAi({ status: 'loading', ai: null, error: '' });
            try {
                const res = await generatePeriodReportInsights({ type, stats });
                if (!res?.ok) {
                    setPeriodAi({ status: 'error', ai: null, error: String(res?.error || 'Falha ao gerar insights') });
                    return;
                }
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

    const downloadPeriodPdf = async () => {
        const current = periodReport && typeof periodReport === 'object' ? periodReport : null;
        if (!current) return;
        if (periodPdf.status === 'loading') return;
        setPeriodPdf((prev) => ({ ...prev, status: 'loading', error: '' }));
        try {
            const baseUrl = typeof window !== 'undefined' ? String(window.location.origin || '').trim() : '';
            const userName = String(user?.displayName || user?.name || user?.email || '').trim();
            const html = buildPeriodReportHtml({
                type: current.type,
                stats: current.stats,
                ai: periodAi?.ai || null,
                baseUrl,
                userName
            });
            const dateLabel = new Date().toISOString().slice(0, 10);
            const kind = current.type === 'week' ? 'Semanal' : current.type === 'month' ? 'Mensal' : 'Periodo';
            const fileName = `Relatorio_${kind}_${dateLabel}`;
            // Client-side PDF: open HTML via Blob URL and trigger print dialog
            try {
                const blobPrint = new Blob([html], { type: 'text/html' });
                const blobPrintUrl = URL.createObjectURL(blobPrint);
                const printWindow = window.open(blobPrintUrl, '_blank');
                if (printWindow) {
                    setTimeout(() => {
                        try {
                            printWindow.focus();
                            printWindow.print();
                        } catch { }
                        setTimeout(() => URL.revokeObjectURL(blobPrintUrl), 60_000);
                    }, 500);
                } else {
                    URL.revokeObjectURL(blobPrintUrl);
                    // Fallback: download as HTML
                    const blob = new Blob([html], { type: 'text/html' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${fileName}.html`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                }
                setPeriodPdf({ status: 'ready', url: null, blob: null, error: '' });
            } catch {
                // Print approach failed silently
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setPeriodPdf((prev) => ({ ...prev, status: 'error', error: msg || 'Falha ao gerar PDF' }));
        } finally {
            setTimeout(() => setPeriodPdf((prev) => (prev?.status === 'loading' ? { ...prev, status: 'idle' } : prev)), 400);
        }
    };

    const handleShareReport = async () => {
        const current = periodReport && typeof periodReport === 'object' ? periodReport : null;
        if (!current) return;
        const text = buildShareText(current);
        if (!text) return;

        const legacyCopy = async () => {
            try {
                if (typeof document === 'undefined') return false;
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.setAttribute('readonly', 'true');
                ta.style.position = 'fixed';
                ta.style.top = '-1000px';
                ta.style.left = '-1000px';
                document.body.appendChild(ta);
                ta.focus();
                ta.select();
                const ok = document.execCommand && document.execCommand('copy');
                ta.remove();
                return !!ok;
            } catch {
                return false;
            }
        };

        try {
            const nav = typeof navigator !== 'undefined' ? navigator : null;
            if (nav && typeof nav.share === 'function') {
                await nav.share({ text });
                setShareError('');
                return;
            }
        } catch { }
        try {
            const nav = typeof navigator !== 'undefined' ? navigator : null;
            if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
                await nav.clipboard.writeText(text);
                setShareError('');
                await alert('Texto do relatório copiado para a área de transferência.');
                return;
            }
            const copied = await legacyCopy();
            if (copied) {
                setShareError('');
                await alert('Texto do relatório copiado para a área de transferência.');
                return;
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            const copied = await legacyCopy();
            if (copied) {
                setShareError('');
                await alert('Texto do relatório copiado para a área de transferência.');
                return;
            }
            setShareError(msg || 'Falha ao compartilhar');
            await alert('Seu navegador bloqueou o compartilhamento/cópia automática. Copie o texto manualmente abaixo.', 'Compartilhamento indisponível');
            return;
        }
        setShareError('O compartilhamento nativo não está disponível neste navegador.');
        await alert('Compartilhamento nativo indisponível. Copie o texto manualmente abaixo.', 'Compartilhamento indisponível');
    };

    // ─── Extracted exercise + volume info from rawSession ───
    const getSessionMeta = (s: WorkoutSummary) => {
        const raw = parseRawSession(s?.rawSession ?? s?.notes);
        const exCount = Array.isArray(raw?.exercises) ? raw.exercises.length : 0;
        const vol = raw?.logs ? calculateTotalVolumeFromLogs(raw.logs) : 0;
        return { exCount, vol };
    };

    return (
        <>
            <div className={embedded ? "w-full text-white" : "min-h-screen bg-neutral-900 text-white p-4 pb-safe-extra"}>
                {!embedded && (
                    <div className="mb-5 flex items-center gap-2 sm:gap-3">
                        <button type="button" onClick={onBack} className="cursor-pointer relative z-10 w-10 h-10 flex items-center justify-center rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 transition-all duration-300 active:scale-95"><ChevronLeft className="pointer-events-none" /></button>
                        <div className="flex-1 min-w-0">
                            <div className="min-w-0">
                                <h2 className="text-xl font-black flex items-center gap-2 truncate"><History className="text-yellow-500" /> {title || 'Histórico'}</h2>
                                <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">{rangeLabel}</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 justify-end shrink-0">
                            {!isReadOnly && historyItems.length > 0 && (
                                <button
                                    type="button"
                                    onClick={toggleSelectionMode}
                                    className={`h-9 px-3 rounded-xl font-black text-[11px] uppercase tracking-wider transition-all duration-300 active:scale-95 ${isSelectionMode ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20' : 'bg-neutral-800 border border-neutral-700 text-yellow-400 hover:bg-neutral-700'}`}
                                >
                                    {isSelectionMode ? 'Cancelar' : 'Selecionar'}
                                </button>
                            )}
                            {!isReadOnly && !isSelectionMode && (
                                <button
                                    type="button"
                                    onClick={() => setShowManual(true)}
                                    className="cursor-pointer relative z-10 w-9 h-9 bg-yellow-500 text-black rounded-xl hover:bg-yellow-400 font-black flex items-center justify-center shadow-lg shadow-yellow-500/20 transition-all duration-300 active:scale-95"
                                >
                                    <Plus size={16} />
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {embedded && (
                    <div className="flex items-center justify-end gap-2 mb-4">
                        {!isReadOnly && historyItems.length > 0 && (
                            <button
                                type="button"
                                onClick={toggleSelectionMode}
                                className={`min-h-[44px] px-4 py-2 rounded-xl font-black text-xs uppercase tracking-wider transition-all duration-300 active:scale-95 ${isSelectionMode ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20' : 'bg-neutral-900 border border-neutral-800 text-yellow-400 hover:bg-neutral-800'}`}
                            >
                                {isSelectionMode ? 'Cancelar' : 'Selecionar'}
                            </button>
                        )}
                        {!isReadOnly && !isSelectionMode && (
                            <button
                                type="button"
                                onClick={() => setShowManual(true)}
                                className="cursor-pointer relative z-10 min-h-[44px] px-4 py-2 bg-yellow-500 text-black rounded-xl hover:bg-yellow-400 font-black flex items-center gap-2 shadow-lg shadow-yellow-500/20 transition-all duration-300 active:scale-95"
                            >
                                <Plus size={16} />
                                <span className="hidden sm:inline">Adicionar treino</span>
                                <span className="sm:hidden">Adicionar</span>
                            </button>
                        )}
                    </div>
                )}

                <div className="space-y-4">
                    {/* ═══ PREMIUM SUMMARY CARD ═══ */}
                    <HistorySummaryCard
                        summary={summary}
                        rangeLabel={rangeLabel}
                        range={range}
                        hasItems={historyItems.length > 0}
                        loading={loading}
                        onRangeChange={setRange}
                        onOpenReport={openPeriodReport}
                    />

                    {!loading && historyItems.length === 0 && (
                        <HistoryEmptyState
                            isReadOnly={isReadOnly}
                            onAdd={() => setShowManual(true)}
                    )}

                    {!loading && historyItems.length > 0 && filteredHistory.length === 0 && (
                        <HistoryEmptyPeriod
                            onSeeAll={() => setRange('all')}
                            on90Days={() => setRange('90')}
                        />
                    )}

                </div>{/* end aria-live */}

                {/* ═══ VIRTUALIZED SESSION LIST ═══ */}
                {!loading && (visibleHistory.length > 0 || blockedCount > 0) && (
                    <div ref={parentRef} className="pb-24">
                        <div
                            className="relative"
                            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
                        >
                            {virtualItems.map((row) => {
                                const session = visibleHistory[row.index]
                                const minutes = Math.floor((Number(session?.totalTime) || 0) / 60)
                                const isSelected = selectedIds.has(session.id)
                                const meta = getSessionMeta(session)

                                // Week group header — show when week changes from previous item
                                const getWeekStart = (dateVal: unknown): string | null => {
                                    try {
                                        const t = toDateMs(dateVal)
                                        if (!t || !Number.isFinite(t)) return null
                                        const d = new Date(t)
                                        const dayOfWeek = d.getDay() // 0=Sun
                                        const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)
                                        const monday = new Date(d.setDate(diff))
                                        return monday.toISOString().slice(0, 10) // YYYY-MM-DD
                                    } catch { return null }
                                }
                                const currentWeek = getWeekStart(session?.date ?? session?.dateMs)
                                const prevSession = row.index > 0 ? visibleHistory[row.index - 1] : null
                                const prevWeek = prevSession ? getWeekStart(prevSession?.date ?? prevSession?.dateMs) : '__NONE__'
                                const showWeekHeader = currentWeek && currentWeek !== prevWeek
                                const weekHeaderLabel = (() => {
                                    if (!currentWeek) return ''
                                    const d = new Date(currentWeek + 'T12:00:00')
                                    return `Semana de ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`
                                })()

                                return (
                                    <div
                                        key={row.key}
                                        data-index={row.index}
                                        ref={rowVirtualizer.measureElement}
                                        style={{
                                            position: 'absolute',
                                            top: 0,
                                            left: 0,
                                            width: '100%',
                                            transform: `translateY(${row.start - rowVirtualizer.options.scrollMargin}px)`,
                                            paddingBottom: '12px',
                                        }}
                                    >
                                        {/* ── Premium Week Header ── */}
                                        {showWeekHeader && (
                                            <div className="flex items-center gap-2 mb-3 pt-1">
                                                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-yellow-500/20 to-transparent" />
                                                <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-yellow-500/70 bg-yellow-500/5 border border-yellow-500/15 px-3 py-1 rounded-full">
                                                    <CalendarDays size={10} />
                                                    {weekHeaderLabel}
                                                </span>
                                                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-yellow-500/20 to-transparent" />
                                            </div>
                                        )}

                                        {/* ── Premium Session Card ── */}
                                        <div
                                            onClick={() => (isSelectionMode ? toggleItemSelection(session.id) : openSession(session))}
                                            className={`relative rounded-2xl cursor-pointer transition-all duration-300 overflow-hidden ${isSelectionMode ? (isSelected ? 'shadow-lg shadow-yellow-500/10' : '') : 'hover:shadow-lg hover:shadow-black/30 group'}`}
                                        >
                                            {/* Gold accent bar */}
                                            <div className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-l-2xl transition-colors duration-300 ${isSelected ? 'bg-yellow-500' : 'bg-yellow-500/30 group-hover:bg-yellow-500/60'}`} />

                                            <div className={`rounded-2xl p-4 pl-5 ${isSelectionMode ? (isSelected ? 'border-yellow-500/50' : '') : 'group-hover:border-yellow-500/25'}`} style={{ background: 'rgba(255,255,255,0.02)', border: isSelectionMode ? (isSelected ? '1px solid rgba(234,179,8,0.5)' : '1px solid rgba(255,255,255,0.05)') : '1px solid rgba(255,255,255,0.05)' }}>
                                                <div className="flex items-start gap-3">
                                                    {isSelectionMode && (
                                                        <div className="mt-0.5">
                                                            {isSelected ? <CheckCircle2 className="text-yellow-500 fill-yellow-500/20" /> : <Circle className="text-neutral-600" />}
                                                        </div>
                                                    )}

                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="min-w-0">
                                                                <h3 className="font-black tracking-tight text-white truncate">{formatHistoryTitle(session?.workoutTitle)}</h3>
                                                                <div className="mt-1.5 flex items-center gap-2.5 text-xs text-neutral-400 flex-wrap">
                                                                    <span className="inline-flex items-center gap-1">
                                                                        <CalendarDays size={12} className="text-yellow-500/60" />
                                                                        {formatCompletedAt(session?.date)}
                                                                    </span>
                                                                    <span className="inline-flex items-center gap-1">
                                                                        <Clock size={12} className="text-yellow-500/60" />
                                                                        {minutes} min
                                                                    </span>
                                                                </div>
                                                                {/* Exercise & Volume chips */}
                                                                {(meta.exCount > 0 || meta.vol > 0) && (
                                                                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                                                                        {meta.exCount > 0 && (
                                                                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-neutral-400 bg-neutral-800/80 border border-neutral-700/50 px-2 py-0.5 rounded-full">
                                                                                <Dumbbell size={10} className="text-yellow-500/60" />
                                                                                {meta.exCount} exercício{meta.exCount !== 1 ? 's' : ''}
                                                                            </span>
                                                                        )}
                                                                        {meta.vol > 0 && (
                                                                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-yellow-500/80 bg-yellow-500/5 border border-yellow-500/15 px-2 py-0.5 rounded-full">
                                                                                <TrendingUp size={10} />
                                                                                {meta.vol >= 1000 ? `${(meta.vol / 1000).toFixed(1)}t` : `${Math.round(meta.vol)}kg`}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>

                                                            <div className="flex items-center gap-1.5 shrink-0">
                                                                {!isReadOnly && !isSelectionMode && (
                                                                    <>
                                                                        <button
                                                                            type="button"
                                                                            onClick={(e) => handleDeleteClick(e, session)}
                                                                            className="cursor-pointer relative z-20 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl transition-colors bg-neutral-950 text-neutral-500 border border-neutral-800 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 active:scale-95"
                                                                            aria-label="Excluir"
                                                                        >
                                                                            <Trash2 size={16} className="pointer-events-none" />
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                openEdit(session);
                                                                            }}
                                                                            className="cursor-pointer relative z-20 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl transition-colors bg-neutral-950 text-neutral-500 border border-neutral-800 hover:bg-yellow-500/10 hover:text-yellow-400 hover:border-yellow-500/20 active:scale-95"
                                                                            aria-label="Editar"
                                                                        >
                                                                            <Edit3 size={16} className="pointer-events-none" />
                                                                        </button>
                                                                    </>
                                                                )}
                                                                {!isSelectionMode && (
                                                                    <ChevronRight size={16} className="text-neutral-600 group-hover:text-yellow-500/60 transition-colors ml-0.5" />
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        {/* ── VIP Locked Sessions ── */}
                        {blockedCount > 0 && (
                            <div className="bg-neutral-950/50 border border-yellow-500/20 rounded-2xl p-6 text-center space-y-3 relative overflow-hidden group cursor-pointer" onClick={onUpgrade}>
                                <div className="absolute inset-0 bg-gradient-to-b from-yellow-500/5 to-transparent pointer-events-none" />
                                <div className="relative z-10 flex flex-col items-center gap-2">
                                    <div className="w-12 h-12 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center mb-1 group-hover:scale-110 transition-transform duration-300">
                                        <Lock className="text-yellow-500" size={20} />
                                    </div>
                                    <h3 className="text-lg font-black text-white">
                                        {blockedCount} treinos antigos bloqueados
                                    </h3>
                                    <p className="text-sm text-neutral-400 max-w-xs mx-auto">
                                        Seu plano atual permite visualizar apenas os últimos {vipLimits?.history_days} dias de histórico.
                                    </p>
                                    <button
                                        type="button"
                                        className="mt-2 px-5 py-2 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-wider hover:bg-yellow-400 transition-colors shadow-lg shadow-yellow-500/10"
                                    >
                                        Desbloquear Histórico
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div >
        </div >

            {!isReadOnly && isSelectionMode && (
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-neutral-950 border-t border-neutral-800 pb-safe z-50 flex justify-between items-center">
                    <span className="text-neutral-500 text-sm font-bold">{selectedIds.size} selecionado{selectedIds.size !== 1 ? 's' : ''}</span>
                    <button
                        onClick={handleBulkDelete}
                        disabled={selectedIds.size === 0}
                        className="px-4 py-2 bg-red-500/10 text-red-500 rounded-xl font-bold flex items-center gap-2 disabled:opacity-50 hover:bg-red-500/20 transition-colors"
                    >
                        <Trash2 size={18} /> Excluir
                    </button>
                </div>
            )
}

{
    !isReadOnly && showManual && (
        <HistoryListManualModal
            manualTab={manualTab as 'existing' | 'new'}
            setManualTab={setManualTab as (v: 'existing' | 'new') => void}
            manualDate={manualDate}
            setManualDate={setManualDate}
            manualDuration={manualDuration}
            setManualDuration={setManualDuration}
            manualNotes={manualNotes}
            setManualNotes={setManualNotes}
            availableWorkouts={availableWorkouts}
            selectedTemplate={selectedTemplate}
            setSelectedTemplate={setSelectedTemplate}
            manualExercises={manualExercises}
            updateManualExercise={updateManualExercise}
            editorWorkout={editorWorkout}
            setNewWorkout={(w) => setNewWorkout(normalizeEditorWorkout(w))}
            normalizeEditorWorkout={normalizeEditorWorkout}
            supabase={supabase}
            onClose={() => setShowManual(false)}
            onSaveExisting={saveManualExisting}
            onSaveNew={saveManualNew}
        />
    )
}

{
    periodReport && (
        <HistoryListPeriodReportModal
            periodReport={periodReport}
            periodAi={periodAi}
            periodPdf={periodPdf}
            shareError={shareError}
            buildShareText={buildShareText}
            onClose={closePeriodReport}
            onDownloadPdf={downloadPeriodPdf}
            onShareReport={handleShareReport}
        />
    )
}

{
    showEdit && (
        <HistoryListEditModal
            editTitle={editTitle}
            setEditTitle={setEditTitle}
            editDate={editDate}
            setEditDate={setEditDate}
            editDuration={editDuration}
            setEditDuration={setEditDuration}
            editNotes={editNotes}
            setEditNotes={setEditNotes}
            editExercises={editExercises}
            updateEditExercise={updateEditExercise}
            onClose={() => setShowEdit(false)}
            onSave={saveEdit}
        />
    )
}

{
    selectedSession && (
        <div className="fixed inset-0 z-[1200] bg-neutral-900 overflow-y-auto pt-safe" onClick={() => setSelectedSession(null)}>
            <div onClick={(e) => e.stopPropagation()}>
                <WorkoutReport
                    session={selectedSession}
                    previousSession={null}
                    user={user}
                    isVip={false}
                    settings={settings}
                    onClose={() => setSelectedSession(null)}
                    onUpgrade={onUpgrade}
                />
            </div>
        </div>
    )
}
        </>
    );
};

export default HistoryList;

"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, Clock, Edit3, History, Plus, Trash2, CheckCircle2, Circle, Download, Loader2, Lock } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import ExerciseEditor from '@/components/ExerciseEditor';
import WorkoutReport from '@/components/WorkoutReport';
import { generatePeriodReportInsights } from '@/actions/workout-actions';
import { useDialog } from '@/contexts/DialogContext';
import { buildPeriodReportHtml } from '@/utils/report/buildPeriodReportHtml';
import { FEATURE_KEYS, isFeatureEnabled } from '@/utils/featureFlags';
import { adminFetchJson } from '@/utils/admin/adminFetch';

const REPORT_DAYS_WEEK = 7;
const REPORT_DAYS_MONTH = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_SESSIONS_LIMIT = 30;
const TOP_EXERCISES_LIMIT = 5;

interface WorkoutLog {
    weight?: string | number | null;
    reps?: string | number | null;
    done?: boolean;
    [key: string]: unknown;
}

interface RawSession {
    id?: string;
    user_id?: string;
    student_id?: string;
    workoutTitle?: string;
    date?: string;
    totalTime?: number;
    logs?: Record<string, WorkoutLog>;
    exercises?: unknown[];
    notes?: string;
    [key: string]: unknown;
}

interface WorkoutSummary {
    id: string;
    workoutTitle?: string | null;
    date?: string | null;
    dateMs?: number | null;
    totalTime?: number;
    rawSession?: RawSession | null;
    raw?: Record<string, unknown> | null;
    isTemplate?: boolean;
    exercises?: Array<Record<string, unknown>>;
    name?: string | null;
    created_at?: string;
    notes?: string | Record<string, unknown>;
    is_template?: boolean;
    completed_at?: string;
    [key: string]: unknown;
}

interface WorkoutTemplate {
    id: string;
    name?: string | null;
    exercises?: Array<Record<string, unknown>>;
    [key: string]: unknown;
}

interface ManualExercise {
    name: string;
    sets: number | string;
    reps: string;
    restTime: number;
    cadence: string;
    notes: string;
    weights?: string[];
    repsPerSet?: string[];
    rest_time?: number;
    [key: string]: unknown;
}

interface PeriodStats {
    count: number;
    totalMinutes: number;
    avgMinutes: number;
    totalVolumeKg: number;
    avgVolumeKg: number;
    [key: string]: unknown;
}

type PeriodReport = { type: 'week' | 'month'; stats: PeriodStats };
type PeriodAiState = { status: 'idle' | 'loading' | 'ready' | 'error'; ai: Record<string, unknown> | null; error: string };
type PeriodPdfState = { status: 'idle' | 'loading' | 'ready' | 'error'; url: string | null; blob: Blob | null; error: string };

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

interface HistoryListProps {
    user: { id: string; email?: string; displayName?: string; name?: string; role?: string } | null;
    settings?: Record<string, unknown>;
    onViewReport?: (session: unknown) => void;
    onBack?: () => void;
    targetId?: string;
    targetEmail?: string;
    readOnly?: boolean;
    title?: string;
    embedded?: boolean;
    vipLimits?: { history_days?: number };
    onUpgrade?: () => void;
}

const HistoryList: React.FC<HistoryListProps> = ({ user, settings, onViewReport, onBack, targetId, targetEmail, readOnly, title, embedded = false, vipLimits, onUpgrade }) => {
    const { confirm, alert } = useDialog();
    const [history, setHistory] = useState<WorkoutSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const supabase = useMemo(() => createClient(), []);
    const safeUserId = user?.id ? String(user.id) : '';
    const safeUserEmail = String((user as any)?.email || '').trim().toLowerCase();
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
    const [newWorkout, setNewWorkout] = useState({ title: '', exercises: [] });
    const [manualExercises, setManualExercises] = useState<ManualExercise[]>([]);
    const [showEdit, setShowEdit] = useState(false);
    const [selectedSession, setSelectedSession] = useState<Record<string, unknown> | null>(null);
    const [editId, setEditId] = useState<string | null>(null);
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
        } catch (e: any) {
            await alert('Erro ao excluir: ' + (e?.message ?? String(e)));
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

    const toDateMs = (value: any): number | null => {
        try {
            if (!value) return null;
            if (value?.toDate) {
                const d = value.toDate();
                const t = d instanceof Date ? d.getTime() : new Date(d).getTime();
                return Number.isFinite(t) ? t : null;
            }
            if (value instanceof Date) {
                const t = value.getTime();
                return Number.isFinite(t) ? t : null;
            }
            if (typeof value === 'object') {
                const seconds = Number(value?.seconds ?? value?._seconds ?? value?.sec ?? null);
                const nanos = Number(value?.nanoseconds ?? value?._nanoseconds ?? 0);
                if (Number.isFinite(seconds) && seconds > 0) {
                    const t = seconds * 1000 + Math.floor(nanos / 1e6);
                    return Number.isFinite(t) ? t : null;
                }
            }
            const t = new Date(value).getTime();
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

    const summary = useMemo(() => {
        const totalSeconds = visibleHistory.reduce((acc, s) => acc + (Number(s?.totalTime) || 0), 0);
        const totalMinutes = Math.max(0, Math.round(totalSeconds / 60));
        const count = visibleHistory.length;
        const avgMinutes = count > 0 ? Math.max(0, Math.round(totalMinutes / count)) : 0;
        return { count, totalMinutes, avgMinutes };
    }, [visibleHistory]);

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
                const raw = isRecord(item?.rawSession) ? (item.rawSession as Record<string, unknown>) : null;
                const logs: Record<string, unknown> = raw && isRecord(raw?.logs) ? (raw.logs as Record<string, unknown>) : {};
                const exercises: unknown[] = raw && Array.isArray(raw?.exercises) ? (raw.exercises as unknown[]) : [];
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
        const data = report && typeof report === 'object' ? report : null;
        if (!data) return '';
        const label = data.type === 'week' ? 'semanal' : data.type === 'month' ? 'mensal' : 'período';
        const stats = (data.stats && typeof data.stats === 'object' ? data.stats : {}) as any;
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
        const rawSession = session?.rawSession && typeof session.rawSession === 'object' ? session.rawSession : null;
        const payload = rawSession
            ? {
                ...rawSession,
                id: rawSession.id ?? session?.id ?? null,
                user_id: session?.raw?.user_id ?? rawSession?.user_id ?? (session as any)?.user_id ?? null,
                student_id: session?.raw?.student_id ?? rawSession?.student_id ?? (session as any)?.student_id ?? null
            }
            : session;
        if (typeof onViewReport === 'function') {
            try {
                onViewReport(payload);
                return;
            } catch { }
        }
        setSelectedSession(payload as Record<string, unknown>);
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
                const role = String((user as any)?.role || '').toLowerCase();
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
                        supabase as any,
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
                    let raw = null;
                    try {
                        if (typeof w.notes === 'string') raw = JSON.parse(w.notes);
                        else if (typeof w.notes === 'object' && w.notes) raw = w.notes;
                    } catch (err) {
                        console.error('Erro ao processar item:', w, err);
                        raw = null;
                    }
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
                console.error("Erro histórico", e);
                setHistory([]);
            } finally {
                setLoading(false);
            }
        };
        loadHistory();
    }, [supabase, user?.id, targetId, targetEmail]);

    const saveManualExisting = async () => {
        try {
            if (!selectedTemplate) throw new Error('Selecione um treino');
            const sourceExercises = Array.isArray(selectedTemplate.exercises) ? selectedTemplate.exercises : [];
            const exIds = sourceExercises.map(e => String((e as Record<string, unknown>)?.id ?? '')).filter(Boolean);
            const setsMap: Record<string, Array<Record<string, unknown>>> = {};
            if (exIds.length > 0) {
                const { data: setsData } = await supabase
                    .from('sets')
                    .select('exercise_id, set_number, reps, rpe, weight')
                    .in('exercise_id', exIds)
                    .order('set_number');
                (setsData || []).forEach((s) => {
                    const row = isRecord(s) ? (s as Record<string, unknown>) : null;
                    const exId = String(row?.exercise_id ?? '');
                    if (!exId) return;
                    const arr = setsMap[exId] || (setsMap[exId] = []);
                    if (row) arr.push(row);
                });
            }
            const exercises: ManualExercise[] = manualExercises.length
                ? manualExercises
                : sourceExercises.map((e) => {
                    const row = isRecord(e) ? e : {};
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
        } catch (e: any) {
            await alert('Erro: ' + (e?.message ?? String(e)));
        }
    };

    const saveManualNew = async () => {
        try {
            if (!newWorkout.title) throw new Error('Informe o título');
            const exercises: ManualExercise[] = (newWorkout.exercises || []).map((e: any) => ({
                name: e.name || '',
                sets: Number(e.sets) || 0,
                reps: e.reps || '',
                restTime: Number(e.restTime) || 0,
                cadence: e.cadence || '',
                notes: e.notes || ''
            }));
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
        } catch (e: any) {
            await alert('Erro: ' + (e?.message ?? String(e)));
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
            const exIds = sourceExercises.map(e => String((e as Record<string, unknown>)?.id ?? '')).filter(Boolean);
            const setsMap: Record<string, Array<Record<string, unknown>>> = {};
            if (exIds.length > 0) {
                const { data: setsData } = await supabase
                    .from('sets')
                    .select('exercise_id, set_number, reps, rpe, weight')
                    .in('exercise_id', exIds)
                    .order('set_number');
                (setsData || []).forEach((s) => {
                    const row = isRecord(s) ? (s as Record<string, unknown>) : null;
                    const exId = String(row?.exercise_id ?? '');
                    if (!exId) return;
                    const arr = setsMap[exId] || (setsMap[exId] = []);
                    if (row) arr.push(row);
                });
            }
            const exs: ManualExercise[] = sourceExercises.map((e) => {
                const row = isRecord(e) ? e : {};
                const id = String(row.id ?? '');
                const setRows = id ? (setsMap[id] || []) : [];
                return {
                    name: String(row.name ?? ''),
                    sets: setRows.length || (Number(row.sets) || 0),
                    reps: String(row.reps ?? ''),
                    restTime: Number(row.rest_time) || Number(row.restTime) || 0,
                    cadence: String(row.cadence ?? ''),
                    notes: String(row.notes ?? ''),
                    weights: setRows.map(s => String(s.weight ?? '')),
                    repsPerSet: setRows.map(s => String(s.reps ?? ''))
                };
            });
            setManualExercises(exs);
        };
        if (selectedTemplate && manualTab === 'existing') buildManualFromTemplate();
    }, [manualTab, selectedTemplate, supabase]);

    const updateManualExercise = (idx: number, field: string, value: any) => {
        setManualExercises(prev => {
            const next = [...prev];
            if (field === 'weight') {
                const [wIdx, val] = value;
                const weights = Array.from({ length: Number(next[idx].sets) || 0 }, (_, i) => next[idx].weights?.[i] ?? '');
                weights[wIdx] = val;
                next[idx] = { ...next[idx], weights };
            } else if (field === 'rep') {
                const [rIdx, val] = value;
                const repsPerSet = Array.from({ length: Number(next[idx].sets) || 0 }, (_, i) => next[idx].repsPerSet?.[i] ?? '');
                repsPerSet[rIdx] = val;
                next[idx] = { ...next[idx], repsPerSet };
            } else {
                next[idx] = { ...next[idx], [field]: value };
                if (field === 'sets') {
                    const n = Number(value) || 0;
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
        } catch (error: any) {
            await alert("Erro ao excluir: " + (error?.message ?? String(error)));
        }
    };

    const openEdit = (session: WorkoutSummary) => {
        const raw = session.rawSession || (typeof session.notes === 'string' && session.notes?.startsWith('{') ? (() => { try { return JSON.parse(session.notes); } catch { return null; } })() : null);
        setEditId(session.id);
        setEditTitle(session.workoutTitle || raw?.workoutTitle || 'Treino');
        const d = raw?.date ? new Date(raw.date) : (session.date ? new Date(session.date) : new Date());
        setEditDate(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
        setEditDuration(String(Math.floor((raw?.totalTime || session.totalTime || 0) / 60) || 45));
        setEditNotes(raw?.notes || '');
        const exs: ManualExercise[] = (raw?.exercises || []).map((ex: any, exIdx: number) => {
            const count = Number(ex.sets) || 0;
            const weights = Array.from({ length: count }, (_, sIdx) => String(raw?.logs?.[`${exIdx}-${sIdx}`]?.weight ?? ''));
            const repsPerSet = Array.from({ length: count }, (_, sIdx) => String(raw?.logs?.[`${exIdx}-${sIdx}`]?.reps ?? ex.reps ?? ''));
            return { name: ex.name || '', sets: count, reps: ex.reps || '', restTime: Number(ex.restTime) || 0, cadence: ex.cadence || '', notes: ex.notes || '', weights, repsPerSet };
        });
        setEditExercises(exs);
        setShowEdit(true);
    };

    const updateEditExercise = (idx: number, field: string, value: any) => {
        setEditExercises(prev => {
            const next = [...prev];
            if (field === 'weight') {
                const [wIdx, val] = value;
                const weights = Array.from({ length: Number(next[idx].sets) || 0 }, (_, i) => next[idx].weights?.[i] ?? '');
                weights[wIdx] = val;
                next[idx] = { ...next[idx], weights };
            } else if (field === 'rep') {
                const [rIdx, val] = value;
                const repsPerSet = Array.from({ length: Number(next[idx].sets) || 0 }, (_, i) => next[idx].repsPerSet?.[i] ?? '');
                repsPerSet[rIdx] = val;
                next[idx] = { ...next[idx], repsPerSet };
            } else {
                next[idx] = { ...next[idx], [field]: value };
                if (field === 'sets') {
                    const n = Number(value) || 0;
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
        } catch (e: any) {
            await alert('Erro: ' + (e?.message ?? String(e)));
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
            } catch (err: any) {
                setPeriodAi({ status: 'error', ai: null, error: String(err?.message || err || 'Falha ao gerar insights') });
            }
        } catch (e: any) {
            await alert('Erro ao gerar relatório: ' + (e?.message ?? String(e)));
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
            const res = await fetch('/api/report', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ html, fileName })
            });
            if (!res.ok) {
                const txt = await res.text().catch(() => '');
                throw new Error(txt || `Falha ao gerar PDF (${res.status})`);
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            try {
                const a = document.createElement('a');
                a.href = url;
                a.download = `${fileName}.pdf`;
                document.body.appendChild(a);
                a.click();
                a.remove();
            } catch { }
            setPeriodPdf({ status: 'ready', url, blob, error: '' });
        } catch (e: any) {
            const msg = e?.message ? String(e.message) : String(e);
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
        } catch (e: any) {
            const msg = e?.message ? String(e.message) : String(e);
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

    return (
        <>
            <div className={embedded ? "w-full text-white" : "min-h-screen bg-neutral-900 text-white p-4 pb-safe-extra"}>
                {!embedded && (
                    <div className="mb-4 flex items-center gap-2 sm:gap-3">
                        <button type="button" onClick={onBack} className="cursor-pointer relative z-10 w-10 h-10 flex items-center justify-center rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 transition-all duration-300 active:scale-95"><ChevronLeft className="pointer-events-none" /></button>
                        <div className="flex-1 min-w-0">
                            <div className="min-w-0">
                                <h2 className="text-xl font-black flex items-center gap-2 truncate"><History className="text-yellow-500" /> {title || 'Histórico'}</h2>
                                <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">{rangeLabel}</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 justify-end shrink-0">
                            {weeklyReportCtaEnabled && !loading && historyItems.length > 0 ? (
                                <button
                                    type="button"
                                    onClick={() => openPeriodReport('week')}
                                    className="h-9 px-3 rounded-xl font-black text-[11px] uppercase tracking-wider transition-all duration-300 active:scale-95 bg-neutral-800 border border-neutral-700 text-neutral-100 hover:bg-neutral-700"
                                >
                                    Semanal
                                </button>
                            ) : null}
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
                    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 shadow-lg shadow-black/30 relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-b from-yellow-500/10 via-transparent to-transparent pointer-events-none" />
                        <div className="relative">
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                                <div>
                                    <div className="text-[11px] uppercase tracking-wider text-neutral-500 font-bold">Resumo</div>
                                    <div className="text-base font-black tracking-tight text-white">{rangeLabel}</div>
                                </div>
                                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                                    {[
                                        { key: '7', label: '7 dias' },
                                        { key: '30', label: '30 dias' },
                                        { key: '90', label: '90 dias' },
                                        { key: 'all', label: 'Tudo' },
                                    ].map((opt) => (
                                        <button
                                            key={opt.key}
                                            type="button"
                                            onClick={() => setRange(opt.key)}
                                            className={`min-h-[40px] px-3 rounded-full text-xs font-black uppercase tracking-wide transition-all duration-300 active:scale-95 whitespace-nowrap ${range === opt.key ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20' : 'bg-neutral-950 border border-neutral-800 text-neutral-300 hover:bg-neutral-900'}`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
                                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3">
                                    <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">Treinos</div>
                                    <div className="text-xl font-black tracking-tight text-white">{summary.count}</div>
                                </div>
                                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3">
                                    <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">Tempo total</div>
                                    <div className="text-xl font-black tracking-tight text-white">{summary.totalMinutes}<span className="text-sm text-neutral-400 font-black ml-1">min</span></div>
                                </div>
                                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 col-span-2 sm:col-span-1">
                                    <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">Média</div>
                                    <div className="text-xl font-black tracking-tight text-white">{summary.avgMinutes}<span className="text-sm text-neutral-400 font-black ml-1">min</span></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {!loading && historyItems.length > 0 && (
                        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 shadow-lg shadow-black/30">
                            <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
                                <div>
                                    <div className="text-[11px] uppercase tracking-wider text-neutral-500 font-bold">Relatórios rápidos</div>
                                    <div className="text-base font-black tracking-tight text-white">Compartilhe sua evolução</div>
                                </div>
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                                    <button
                                        type="button"
                                        onClick={() => openPeriodReport('week')}
                                        className="min-h-[44px] px-4 rounded-xl bg-yellow-500 text-black text-xs font-black uppercase tracking-wide shadow-lg shadow-yellow-500/20 hover:bg-yellow-400 transition-all duration-300 active:scale-95 w-full sm:w-auto"
                                    >
                                        Relatório semanal
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => openPeriodReport('month')}
                                        className="min-h-[44px] px-4 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-200 text-xs font-black uppercase tracking-wide hover:bg-neutral-900 transition-all duration-300 active:scale-95 w-full sm:w-auto"
                                    >
                                        Relatório mensal
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {loading && (
                        <div className="grid gap-3">
                            {Array.from({ length: 4 }).map((_, idx) => (
                                <div key={idx} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 animate-pulse">
                                    <div className="h-4 bg-neutral-800 rounded w-2/3" />
                                    <div className="mt-3 h-3 bg-neutral-800 rounded w-1/2" />
                                </div>
                            ))}
                        </div>
                    )}

                    {!loading && historyItems.length === 0 && (
                        <div className="text-center py-10 border border-neutral-800 bg-neutral-900 rounded-2xl">
                            <div className="text-neutral-400 font-bold">Nenhum treino finalizado ainda.</div>
                            {!isReadOnly && (
                                <div className="mt-4">
                                    <button
                                        type="button"
                                        onClick={() => setShowManual(true)}
                                        className="min-h-[44px] px-5 py-2.5 bg-yellow-500 text-black rounded-xl hover:bg-yellow-400 font-black shadow-lg shadow-yellow-500/20 transition-all duration-300 active:scale-95"
                                    >
                                        Adicionar primeiro treino
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {!loading && historyItems.length > 0 && filteredHistory.length === 0 && (
                        <div className="border border-neutral-800 bg-neutral-900 rounded-2xl p-4">
                            <div className="text-white font-black">Sem treinos nesse período</div>
                            <div className="text-sm text-neutral-400 mt-1">Tente aumentar o período para ver mais resultados.</div>
                            <div className="mt-4 flex gap-2 flex-wrap">
                                <button type="button" onClick={() => setRange('all')} className="min-h-[44px] px-4 py-2 rounded-xl bg-yellow-500 text-black font-black shadow-lg shadow-yellow-500/20 transition-all duration-300 active:scale-95">Ver tudo</button>
                                <button type="button" onClick={() => setRange('90')} className="min-h-[44px] px-4 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-200 font-black transition-all duration-300 active:scale-95">Últimos 90 dias</button>
                            </div>
                        </div>
                    )}

                    {!loading && (visibleHistory.length > 0 || blockedCount > 0) && (
                        <div className="space-y-3 pb-24">
                            {visibleHistory.map((session) => {
                                const minutes = Math.floor((Number(session?.totalTime) || 0) / 60);
                                const isSelected = selectedIds.has(session.id);
                                return (
                                    <div
                                        key={session.id}
                                        onClick={() => (isSelectionMode ? toggleItemSelection(session.id) : openSession(session))}
                                        className={`bg-neutral-900 border rounded-2xl p-4 cursor-pointer transition-all duration-300 ${isSelectionMode ? (isSelected ? 'border-yellow-500/70 shadow-lg shadow-yellow-500/10' : 'border-neutral-800 hover:border-neutral-700') : 'border-neutral-800 hover:border-yellow-500/40 hover:shadow-lg hover:shadow-black/30'}`}
                                    >
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
                                                        <div className="mt-1 flex items-center gap-3 text-xs text-neutral-400 flex-wrap">
                                                            <span className="inline-flex items-center gap-1.5">
                                                                <CalendarDays size={14} className="text-yellow-500/70" />
                                                                {formatCompletedAt(session?.date)}
                                                            </span>
                                                            <span className="inline-flex items-center gap-1.5">
                                                                <Clock size={14} className="text-yellow-500/70" />
                                                                {minutes} min
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {!isReadOnly && !isSelectionMode && (
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <button
                                                                type="button"
                                                                onClick={(e) => handleDeleteClick(e, session)}
                                                                className="cursor-pointer relative z-20 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-colors bg-neutral-950 text-neutral-400 border border-neutral-800 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 active:scale-95"
                                                                aria-label="Excluir"
                                                            >
                                                                <Trash2 size={18} className="pointer-events-none" />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    openEdit(session);
                                                                }}
                                                                className="cursor-pointer relative z-20 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-colors bg-neutral-950 text-neutral-400 border border-neutral-800 hover:bg-yellow-500/10 hover:text-yellow-400 hover:border-yellow-500/20 active:scale-95"
                                                                aria-label="Editar"
                                                            >
                                                                <Edit3 size={18} className="pointer-events-none" />
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}

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
                </div>
            </div>

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
            )}

            {!isReadOnly && showManual && (
                <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowManual(false)}>
                    <div className="bg-neutral-900 w-full max-w-2xl rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="p-4 border-b border-neutral-800">
                            <h3 className="font-bold text-white">Adicionar Histórico</h3>
                            <div className="mt-3 flex gap-2">
                                <button onClick={() => setManualTab('existing')} className={`px-3 py-2 rounded-lg text-xs font-bold ${manualTab === 'existing' ? 'bg-yellow-500 text-black' : 'bg-neutral-800 text-neutral-300'}`}>Usar Treino</button>
                                <button onClick={() => setManualTab('new')} className={`px-3 py-2 rounded-lg text-xs font-bold ${manualTab === 'new' ? 'bg-yellow-500 text-black' : 'bg-neutral-800 text-neutral-300'}`}>Treino Novo</button>
                            </div>
                        </div>
                        <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
                            <div>
                                <label className="text-[10px] uppercase font-bold text-neutral-500">Data e Hora</label>
                                <input type="datetime-local" value={manualDate} onChange={(e) => setManualDate(e.target.value)} className="w-full bg-neutral-800 border border-neutral-700 rounded-xl p-3 text-white outline-none" />
                            </div>
                            <div>
                                <label className="text-[10px] uppercase font-bold text-neutral-500">Duração (min)</label>
                                <input type="number" value={manualDuration} onChange={(e) => setManualDuration(e.target.value)} className="w-full bg-neutral-800 border border-neutral-700 rounded-xl p-3 text-white outline-none" />
                            </div>
                            <div>
                                <label className="text-[10px] uppercase font-bold text-neutral-500">Notas</label>
                                <textarea value={manualNotes} onChange={(e) => setManualNotes(e.target.value)} className="w-full bg-neutral-800 border border-neutral-700 rounded-xl p-3 text-white outline-none h-20 resize-none" />
                            </div>
                            {manualTab === 'existing' && (
                                <div className="space-y-2">
                                    <label className="text-[10px] uppercase font-bold text-neutral-500">Selecionar Treino</label>
                                    <select value={selectedTemplate?.id || ''} onChange={async (e) => {
                                        const id = e.target.value;
                                        if (!id) { setSelectedTemplate(null); return; }
                                        const { data } = await supabase
                                            .from('workouts')
                                            .select('id, name, exercises(*)')
                                            .eq('id', id)
                                            .single();
                                        setSelectedTemplate(data);
                                    }} className="w-full bg-neutral-800 border border-neutral-700 rounded-xl p-3 text-white outline-none">
                                        <option value="">Selecione...</option>
                                        {availableWorkouts.map(t => (<option key={t.id} value={t.id}>{t.name}</option>))}
                                    </select>
                                    {selectedTemplate && (
                                        <div className="space-y-2">
                                            {manualExercises.map((ex, idx) => (
                                                <div key={idx} className="p-3 bg-neutral-800 rounded-lg border border-neutral-700 space-y-2">
                                                    <p className="text-sm font-bold text-white">{ex.name}</p>
                                                    <div className="grid grid-cols-4 gap-2">
                                                        <div>
                                                            <label className="text-[10px] text-neutral-500">Sets</label>
                                                            <input type="number" value={ex.sets} onChange={(e) => updateManualExercise(idx, 'sets', e.target.value)} className="w-full bg-neutral-900 rounded p-2 text-center text-sm" />
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] text-neutral-500">Reps</label>
                                                            <input value={ex.reps || ''} onChange={(e) => updateManualExercise(idx, 'reps', e.target.value)} className="w-full bg-neutral-900 rounded p-2 text-center text-sm" />
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] text-neutral-500">Cadência</label>
                                                            <input value={ex.cadence || ''} onChange={(e) => updateManualExercise(idx, 'cadence', e.target.value)} className="w-full bg-neutral-900 rounded p-2 text-center text-sm" />
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] text-neutral-500">Descanso (s)</label>
                                                            <input type="number" value={ex.restTime || 0} onChange={(e) => updateManualExercise(idx, 'restTime', e.target.value)} className="w-full bg-neutral-900 rounded p-2 text-center text-sm" />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] text-neutral-500">Pesos por série (kg)</label>
                                                        <div className="grid grid-cols-4 gap-2">
                                                            {Array.from({ length: Number(ex.sets) || 0 }).map((_, sIdx) => (
                                                                <input key={sIdx} value={String(ex.weights?.[sIdx] ?? '')} onChange={(e) => updateManualExercise(idx, 'weight', [sIdx, e.target.value])} className="w-full bg-neutral-900 rounded p-2 text-center text-sm text-white outline-none focus:ring-1 ring-yellow-500 placeholder:text-neutral-600 placeholder:opacity-40 focus:placeholder:opacity-0" placeholder={`#${sIdx + 1}`} />
                                                            ))}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] text-neutral-500">Reps por série</label>
                                                        <div className="grid grid-cols-4 gap-2">
                                                            {Array.from({ length: Number(ex.sets) || 0 }).map((_, sIdx) => (
                                                                <input key={sIdx} value={String(ex.repsPerSet?.[sIdx] ?? '')} onChange={(e) => updateManualExercise(idx, 'rep', [sIdx, e.target.value])} className="w-full bg-neutral-900 rounded p-2 text-center text-sm text-white outline-none focus:ring-1 ring-yellow-500 placeholder:text-neutral-600 placeholder:opacity-40 focus:placeholder:opacity-0" placeholder={`#${sIdx + 1}`} />
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                            {manualTab === 'new' && (
                                <div>
                                    <ExerciseEditor workout={newWorkout} onSave={setNewWorkout as any} onCancel={() => { }} onChange={setNewWorkout as any} onSaved={() => { }} />
                                </div>
                            )}
                        </div>
                        <div className="p-4 bg-neutral-900/50 flex gap-2">
                            <button onClick={() => setShowManual(false)} className="flex-1 py-3 rounded-xl bg-neutral-800 text-neutral-300 font-bold hover:bg-neutral-700">Cancelar</button>
                            {manualTab === 'existing' ? (
                                <button onClick={saveManualExisting} className="flex-1 py-3 rounded-xl bg-yellow-500 text-black font-bold hover:bg-yellow-400">Salvar</button>
                            ) : (
                                <button onClick={saveManualNew} className="flex-1 py-3 rounded-xl bg-yellow-500 text-black font-bold hover:bg-yellow-400">Salvar</button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {periodReport && (
                <div className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={closePeriodReport}>
                    <div className="bg-neutral-900 w-full max-w-md rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="p-4 border-b border-neutral-800">
                            <div className="text-[11px] uppercase tracking-wider text-neutral-500 font-bold">Relatório de evolução</div>
                            <div className="text-lg font-black text-white">
                                {periodReport.type === 'week' ? 'Resumo semanal' : periodReport.type === 'month' ? 'Resumo mensal' : 'Resumo'}
                            </div>
                        </div>
                        <div className="p-4 space-y-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3">
                                    <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">Treinos</div>
                                    <div className="text-xl font-black tracking-tight text-white font-mono">
                                        {Number(periodReport.stats?.count || 0)}
                                    </div>
                                </div>
                                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3">
                                    <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">Tempo total (min)</div>
                                    <div className="text-xl font-black tracking-tight text-white font-mono">
                                        {Number(periodReport.stats?.totalMinutes || 0)}
                                    </div>
                                </div>
                                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3">
                                    <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">Média (min)</div>
                                    <div className="text-xl font-black tracking-tight text-white font-mono">
                                        {Number(periodReport.stats?.avgMinutes || 0)}
                                    </div>
                                </div>
                                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3">
                                    <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">Volume total (kg)</div>
                                    <div className="text-xl font-black tracking-tight text-white font-mono">
                                        {(() => {
                                            const v = Number(periodReport.stats?.totalVolumeKg || 0);
                                            if (!Number.isFinite(v) || v <= 0) return '0';
                                            return v.toLocaleString('pt-BR');
                                        })()}
                                    </div>
                                </div>
                            </div>
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
                                        {Array.isArray(periodAi.ai.summary) && periodAi.ai.summary.length > 0 && (
                                            <div>
                                                <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold mb-1">Resumo</div>
                                                <ul className="space-y-1 text-sm text-neutral-100">
                                                    {(Array.isArray(periodAi.ai.summary) ? periodAi.ai.summary : []).map((item, idx) => (
                                                        <li key={idx}>• {String(item || '').trim()}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                        {Array.isArray(periodAi.ai.highlights) && periodAi.ai.highlights.length > 0 && (
                                            <div>
                                                <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold mb-1">Destaques</div>
                                                <ul className="space-y-1 text-sm text-neutral-100">
                                                    {(Array.isArray(periodAi.ai.highlights) ? periodAi.ai.highlights : []).map((item, idx) => (
                                                        <li key={idx}>• {String(item || '').trim()}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                        {Array.isArray(periodAi.ai.focus) && periodAi.ai.focus.length > 0 && (
                                            <div>
                                                <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold mb-1">Foco</div>
                                                <ul className="space-y-1 text-sm text-neutral-100">
                                                    {(Array.isArray(periodAi.ai.focus) ? periodAi.ai.focus : []).map((item, idx) => (
                                                        <li key={idx}>• {String(item || '').trim()}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                        {Array.isArray(periodAi.ai.nextSteps) && periodAi.ai.nextSteps.length > 0 && (
                                            <div>
                                                <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold mb-1">Próximos passos</div>
                                                <ul className="space-y-1 text-sm text-neutral-100">
                                                    {(Array.isArray(periodAi.ai.nextSteps) ? periodAi.ai.nextSteps : []).map((item, idx) => (
                                                        <li key={idx}>• {String(item || '').trim()}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                        {Array.isArray(periodAi.ai.warnings) && periodAi.ai.warnings.length > 0 && (
                                            <div>
                                                <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold mb-1">Atenções</div>
                                                <ul className="space-y-1 text-sm text-yellow-400">
                                                    {(Array.isArray(periodAi.ai.warnings) ? periodAi.ai.warnings : []).map((item, idx) => (
                                                        <li key={idx}>• {String(item || '').trim()}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div>
                                <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold mb-1">Texto para compartilhar</div>
                                <textarea
                                    readOnly
                                    value={buildShareText(periodReport)}
                                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-sm text-neutral-100 outline-none h-32 resize-none"
                                />
                            </div>
                            {shareError ? (
                                <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200 flex items-start justify-between gap-3">
                                    <div className="min-w-0 break-words">
                                        <div className="font-black">Falha ao compartilhar</div>
                                        <div className="text-xs text-red-200/90">{String(shareError).slice(0, 260)}</div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            try {
                                                if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
                                                    window.dispatchEvent(new CustomEvent('irontracks:error', {
                                                        detail: {
                                                            error: new Error(String(shareError)),
                                                            source: 'period_report_share',
                                                            meta: {
                                                                reportType: String(periodReport?.type || ''),
                                                                hasShare: typeof navigator !== 'undefined' && typeof navigator.share === 'function',
                                                                hasClipboard: typeof navigator !== 'undefined' && !!navigator.clipboard,
                                                                userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
                                                            }
                                                        }
                                                    }));
                                                }
                                            } catch { }
                                        }}
                                        className="shrink-0 h-9 px-3 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-200 font-black hover:bg-neutral-900 transition-all duration-300 active:scale-95"
                                    >
                                        Reportar
                                    </button>
                                </div>
                            ) : null}
                            {periodPdf.status === 'error' && (
                                <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
                                    {String(periodPdf.error || 'Falha ao gerar PDF.')}
                                </div>
                            )}
                        </div>
                        <div className="p-4 bg-neutral-900/50 flex flex-col sm:flex-row gap-2">
                            <button
                                type="button"
                                onClick={closePeriodReport}
                                className="flex-1 py-3 rounded-xl bg-neutral-800 text-neutral-300 font-bold hover:bg-neutral-700"
                            >
                                Fechar
                            </button>
                            <button
                                type="button"
                                onClick={downloadPeriodPdf}
                                disabled={periodPdf.status === 'loading'}
                                className="flex-1 py-3 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-200 font-bold hover:bg-neutral-900 disabled:opacity-60 inline-flex items-center justify-center gap-2"
                            >
                                {periodPdf.status === 'loading' ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                                Baixar PDF
                            </button>
                            <button
                                type="button"
                                onClick={handleShareReport}
                                className="flex-1 py-3 rounded-xl bg-yellow-500 text-black font-bold hover:bg-yellow-400"
                            >
                                Compartilhar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showEdit && (
                <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowEdit(false)}>
                    <div className="bg-neutral-900 w-full max-w-2xl rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="p-4 border-b border-neutral-800">
                            <h3 className="font-bold text-white">Editar Histórico</h3>
                        </div>
                        <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-neutral-500">Título</label>
                                    <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="w-full bg-neutral-800 border border-neutral-700 rounded-xl p-3 text-white outline-none" />
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-neutral-500">Duração (min)</label>
                                    <input type="number" value={editDuration} onChange={(e) => setEditDuration(e.target.value)} className="w-full bg-neutral-800 border border-neutral-700 rounded-xl p-3 text-white outline-none" />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] uppercase font-bold text-neutral-500">Data e Hora</label>
                                <input type="datetime-local" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="w-full bg-neutral-800 border border-neutral-700 rounded-xl p-3 text-white outline-none" />
                            </div>
                            <div>
                                <label className="text-[10px] uppercase font-bold text-neutral-500">Notas</label>
                                <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="w-full bg-neutral-800 border border-neutral-700 rounded-xl p-3 text.white outline-none h-20 resize-none" />
                            </div>
                            <div className="space-y-2">
                                {editExercises.map((ex, idx) => (
                                    <div key={idx} className="p-3 bg-neutral-800 rounded-lg border border-neutral-700 space-y-2">
                                        <p className="text-sm font-bold text-white">{ex.name}</p>
                                        <div className="grid grid-cols-4 gap-2">
                                            <div>
                                                <label className="text-[10px] text-neutral-500">Sets</label>
                                                <input type="number" value={ex.sets} onChange={(e) => updateEditExercise(idx, 'sets', e.target.value)} className="w-full bg-neutral-900 rounded p-2 text-center text-sm" />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-neutral-500">Reps</label>
                                                <input value={ex.reps || ''} onChange={(e) => updateEditExercise(idx, 'reps', e.target.value)} className="w-full bg-neutral-900 rounded p-2 text-center text-sm" />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-neutral-500">Cadência</label>
                                                <input value={ex.cadence || ''} onChange={(e) => updateEditExercise(idx, 'cadence', e.target.value)} className="w-full bg-neutral-900 rounded p-2 text-center text-sm" />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-neutral-500">Descanso (s)</label>
                                                <input type="number" value={ex.restTime || 0} onChange={(e) => updateEditExercise(idx, 'restTime', e.target.value)} className="w-full bg-neutral-900 rounded p-2 text-center text-sm" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-neutral-500">Pesos por série (kg)</label>
                                            <div className="grid grid-cols-4 gap-2">
                                                {Array.from({ length: Number(ex.sets) || 0 }).map((_, sIdx) => (
                                                    <input key={sIdx} value={String(ex.weights?.[sIdx] ?? '')} onChange={(e) => updateEditExercise(idx, 'weight', [sIdx, e.target.value])} className="w-full bg-neutral-900 rounded p-2 text-center text-sm" placeholder={`#${sIdx + 1}`} />
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-neutral-500">Reps por série</label>
                                            <div className="grid grid-cols-4 gap-2">
                                                {Array.from({ length: Number(ex.sets) || 0 }).map((_, sIdx) => (
                                                    <input key={sIdx} value={String(ex.repsPerSet?.[sIdx] ?? '')} onChange={(e) => updateEditExercise(idx, 'rep', [sIdx, e.target.value])} className="w-full bg-neutral-900 rounded p-2 text-center text-sm" placeholder={`#${sIdx + 1}`} />
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="p-4 bg-neutral-900/50 flex gap-2">
                            <button onClick={() => setShowEdit(false)} className="flex-1 py-3 rounded-xl bg-neutral-800 text-neutral-300 font-bold hover:bg-neutral-700">Cancelar</button>
                            <button onClick={saveEdit} className="flex-1 py-3 rounded-xl bg-yellow-500 text-black font-bold hover:bg-yellow-400">Salvar</button>
                        </div>
                    </div>
                </div>
            )}
            {selectedSession && (
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
            )}
        </>
    );
};

export default HistoryList;

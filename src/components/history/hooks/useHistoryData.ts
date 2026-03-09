'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/client';
import { adminFetchJson } from '@/utils/admin/adminFetch';
import { logError } from '@/lib/logger';
import {
    WorkoutLog, WorkoutSummary, WorkoutTemplate, ManualExercise,
    NewWorkoutState, HistoryListProps,
    WorkoutLogSchema, ExerciseIdSchema, SetLiteSchema,
    isRecord, parseRawSession,
} from '@/components/historyListTypes';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Converts various date representations to a millisecond timestamp */
export function toDateMs(value: unknown): number | null {
    try {
        if (!value) return null;
        if (
            typeof value === 'object' && value !== null &&
            'toDate' in value &&
            typeof (value as { toDate?: unknown }).toDate === 'function'
        ) {
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
}

/** Calculates total volume from a logs map */
export function calculateTotalVolumeFromLogs(logs: unknown): number {
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
}

type UseHistoryDataProps = Pick<
    HistoryListProps,
    'user' | 'settings' | 'targetId' | 'targetEmail' | 'vipLimits'
>;

export function useHistoryData({
    user, targetId, targetEmail, vipLimits,
}: UseHistoryDataProps) {
    const [history, setHistory] = useState<WorkoutSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [range, setRange] = useState('30');

    const supabase = useMemo(() => createClient(), []);
    const safeUserId = user?.id ? String(user.id) : '';
    const safeUserEmail = String(user?.email || '').trim().toLowerCase();

    // ── Manual workout state ─────────────────────────────────────────────────
    const [showManual, setShowManual] = useState(false);
    const [manualDate, setManualDate] = useState(new Date().toISOString().slice(0, 16));
    const [manualDuration, setManualDuration] = useState('45');
    const [manualNotes, setManualNotes] = useState('');
    const [manualTab, setManualTab] = useState('existing');
    const [availableWorkouts, setAvailableWorkouts] = useState<WorkoutTemplate[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState<WorkoutTemplate | null>(null);
    const [newWorkout, setNewWorkout] = useState<NewWorkoutState>({ title: '', exercises: [] });
    const [manualExercises, setManualExercises] = useState<ManualExercise[]>([]);

    // ── Load history ─────────────────────────────────────────────────────────
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

                if (!baseUserId && !hasTarget) { setHistory([]); return; }

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
                    const resp = await fetch('/api/workouts/history?limit=50');
                    const json = await resp.json();
                    if (!json?.ok) throw new Error(json?.error || 'Falha ao carregar histórico');
                    data = Array.isArray(json?.rows) ? json.rows : [];
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
                        isTemplate: w.is_template === true,
                    };
                });

                setHistory(formatted);
            } catch (e) {
                logError('error', 'Erro histórico', e);
                setHistory([]);
            } finally {
                setLoading(false);
            }
        };
        loadHistory();
    }, [supabase, user?.id, user?.role, targetId, targetEmail, safeUserEmail, safeUserId]);

    // ── Fetch available workout templates ────────────────────────────────────
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

    // ── Build exercises from template ────────────────────────────────────────
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
                    repsPerSet: setRows.map((s) => String(s.reps ?? '')),
                };
            });
            setManualExercises(exs);
        };
        if (selectedTemplate && manualTab === 'existing') buildManualFromTemplate();
    }, [manualTab, selectedTemplate, supabase]);

    // ── normalizeEditorWorkout ───────────────────────────────────────────────
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

    // ── updateManualExercise ─────────────────────────────────────────────────
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

    // ── saveManualExisting ───────────────────────────────────────────────────
    const saveManualExisting = async (alert: (msg: string, title?: string) => Promise<unknown>) => {
        try {
            if (!selectedTemplate) throw new Error('Selecione um treino');
            const sourceExercises = Array.isArray(selectedTemplate.exercises) ? selectedTemplate.exercises : [];
            const exIds = sourceExercises
                .map((e) => { const p = ExerciseIdSchema.safeParse(e); return p.success ? String(p.data.id || '').trim() : ''; })
                .filter(Boolean);
            const setsMap: Record<string, Array<z.infer<typeof SetLiteSchema>>> = {};
            if (exIds.length > 0) {
                const { data: setsData } = await supabase.from('sets').select('exercise_id, set_number, reps, rpe, weight').in('exercise_id', exIds).order('set_number');
                const parsedSets = z.array(SetLiteSchema).safeParse(Array.isArray(setsData) ? setsData : []);
                (parsedSets.success ? parsedSets.data : []).forEach((s) => {
                    const exId = String(s.exercise_id || '').trim();
                    if (!exId) return;
                    (setsMap[exId] || (setsMap[exId] = [])).push(s);
                });
            }
            const exercises: ManualExercise[] = manualExercises.length
                ? manualExercises
                : sourceExercises.map((e) => {
                    const row = (isRecord(e) ? e : {}) as Record<string, unknown>;
                    const id = String(row.id ?? '');
                    return {
                        name: String(row.name ?? ''), sets: (id && setsMap[id] ? setsMap[id].length : 0) || (Number(row.sets) || 0),
                        reps: String(row.reps ?? ''), restTime: Number(row.rest_time) || Number(row.restTime) || 0,
                        cadence: String(row.cadence ?? ''), notes: String(row.notes ?? ''),
                    };
                });
            const logs: Record<string, WorkoutLog> = {};
            exercises.forEach((ex, exIdx) => {
                const count = Number(ex.sets) || 0;
                const weights = Array.isArray(ex.weights) ? ex.weights : [];
                for (let sIdx = 0; sIdx < count; sIdx++) {
                    logs[`${exIdx}-${sIdx}`] = { weight: weights[sIdx] ?? '', reps: (ex.repsPerSet?.[sIdx] ?? ex.reps) ?? '', done: true };
                }
            });
            const totalSeconds = parseInt(manualDuration || '0', 10) * 60;
            const session = { workoutTitle: selectedTemplate.name || 'Treino', date: new Date(manualDate).toISOString(), totalTime: totalSeconds, realTotalTime: totalSeconds, logs, exercises, notes: manualNotes || '', originWorkoutId: selectedTemplate.id };
            const resp = await fetch('/api/workouts/finish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session }) });
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

    // ── saveManualNew ────────────────────────────────────────────────────────
    const saveManualNew = async (alert: (msg: string, title?: string) => Promise<unknown>) => {
        try {
            if (!newWorkout.title) throw new Error('Informe o título');
            const exercises: ManualExercise[] = (Array.isArray(newWorkout.exercises) ? newWorkout.exercises : []).map((e) => {
                const row = (isRecord(e) ? e : {}) as Record<string, unknown>;
                return { name: String(row.name ?? ''), sets: Number(row.sets ?? 0) || 0, reps: String(row.reps ?? ''), restTime: Number(row.restTime ?? 0) || 0, cadence: String(row.cadence ?? ''), notes: String(row.notes ?? '') };
            });
            const logs: Record<string, WorkoutLog> = {};
            exercises.forEach((ex, exIdx) => {
                for (let sIdx = 0; sIdx < (Number(ex.sets) || 0); sIdx++) {
                    logs[`${exIdx}-${sIdx}`] = { weight: '', reps: ex.reps || '', done: true };
                }
            });
            const totalSeconds = parseInt(manualDuration || '0', 10) * 60;
            const session = { workoutTitle: newWorkout.title, date: new Date(manualDate).toISOString(), totalTime: totalSeconds, realTotalTime: totalSeconds, logs, exercises, notes: manualNotes || '' };
            const resp = await fetch('/api/workouts/finish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session }) });
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

    // ── Derived state ────────────────────────────────────────────────────────
    const historyItems = useMemo(() => Array.isArray(history) ? history : [], [history]);

    const rangeLabel = useMemo(() => {
        if (range === '7') return 'Últimos 7 dias';
        if (range === '30') return 'Últimos 30 dias';
        if (range === '90') return 'Últimos 90 dias';
        return 'Tudo';
    }, [range]);

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
            if (Number.isFinite(t) && t !== null && t >= cutoff) { visible.push(item); } else { blocked++; }
        });
        return { visibleHistory: visible, blockedCount: blocked };
    }, [filteredHistory, vipLimits]);

    const summary = useMemo(() => {
        const totalSeconds = visibleHistory.reduce((acc, s) => acc + (Number(s?.totalTime) || 0), 0);
        const totalMinutes = Math.max(0, Math.round(totalSeconds / 60));
        const count = visibleHistory.length;
        const avgMinutes = count > 0 ? Math.max(0, Math.round(totalMinutes / count)) : 0;
        let totalVolume = 0;
        visibleHistory.forEach((s) => {
            const raw = parseRawSession(s?.rawSession ?? s?.notes);
            if (raw?.logs) totalVolume += calculateTotalVolumeFromLogs(raw.logs);
        });
        const volumeLabel = totalVolume >= 1000 ? `${(totalVolume / 1000).toFixed(1)}t` : `${Math.round(totalVolume)}kg`;
        return { count, totalMinutes, avgMinutes, totalVolume, volumeLabel };
    }, [visibleHistory]);

    return {
        history, setHistory, loading, supabase,
        range, setRange, rangeLabel,
        historyItems, filteredHistory, visibleHistory, blockedCount, summary,
        showManual, setShowManual,
        manualDate, setManualDate,
        manualDuration, setManualDuration,
        manualNotes, setManualNotes,
        manualTab, setManualTab,
        availableWorkouts,
        selectedTemplate, setSelectedTemplate,
        newWorkout, setNewWorkout,
        manualExercises,
        normalizeEditorWorkout, editorWorkout,
        updateManualExercise,
        saveManualExisting, saveManualNew,
    };
}

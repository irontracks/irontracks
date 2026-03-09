'use client';

import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ManualExercise, WorkoutLog, WorkoutSummary, isRecord, parseRawSession } from '@/components/historyListTypes';
import { calculateTotalVolumeFromLogs } from './useHistoryData';

interface UseHistoryActionsProps {
    user: { id?: string; role?: string } | null;
    supabase: SupabaseClient;
    setHistory: React.Dispatch<React.SetStateAction<WorkoutSummary[]>>;
    alert: (msg: string, title?: string) => Promise<unknown>;
    confirm: (msg: string, title?: string) => Promise<boolean>;
}

export function useHistoryActions({ user, supabase, setHistory, alert, confirm }: UseHistoryActionsProps) {
    // ── Selection mode ───────────────────────────────────────────────────────
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const toggleSelectionMode = () => {
        setIsSelectionMode(prev => !prev);
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
            const { error } = await supabase.from('workouts').delete().in('id', ids).eq('is_template', false);
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

    // ── Delete single session ────────────────────────────────────────────────
    const handleDeleteClick = async (e: React.MouseEvent, session: WorkoutSummary) => {
        e.stopPropagation();
        e.preventDefault();
        if (!window.confirm('Tem certeza que deseja excluir este histórico permanentemente?')) return;
        try {
            const { error } = await supabase.from('workouts').delete().eq('id', session.id).eq('is_template', false);
            if (error) throw error;
            setHistory(prev => prev.filter(h => h.id !== session.id));
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            await alert('Erro ao excluir: ' + msg);
        }
    };

    // ── Edit session state ───────────────────────────────────────────────────
    const [showEdit, setShowEdit] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [editDate, setEditDate] = useState(new Date().toISOString().slice(0, 16));
    const [editDuration, setEditDuration] = useState('45');
    const [editNotes, setEditNotes] = useState('');
    const [editExercises, setEditExercises] = useState<ManualExercise[]>([]);

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
                name: String(exRecord.name ?? ''), sets: count, reps: String(exRecord.reps ?? ''),
                restTime: Number(exRecord.restTime ?? 0) || 0, cadence: String(exRecord.cadence ?? ''),
                notes: String(exRecord.notes ?? ''), weights, repsPerSet,
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
            const exercises: ManualExercise[] = editExercises.map(ex => ({
                name: ex.name || '', sets: Number(ex.sets) || 0, reps: ex.reps || '',
                restTime: Number(ex.restTime) || 0, cadence: ex.cadence || '', notes: ex.notes || '',
            }));
            const logs: Record<string, WorkoutLog> = {};
            exercises.forEach((ex, exIdx) => {
                const count = Number(ex.sets) || 0;
                for (let sIdx = 0; sIdx < count; sIdx++) {
                    logs[`${exIdx}-${sIdx}`] = {
                        weight: editExercises[exIdx]?.weights?.[sIdx] ?? '',
                        reps: (editExercises[exIdx]?.repsPerSet?.[sIdx] ?? ex.reps) ?? '',
                        done: true,
                    };
                }
            });
            const totalSeconds = parseInt(editDuration || '0', 10) * 60;
            const session = { workoutTitle: editTitle, date: new Date(editDate).toISOString(), totalTime: totalSeconds, realTotalTime: totalSeconds, logs, exercises, notes: editNotes || '' };
            const { error } = await supabase.from('workouts').update({ name: editTitle, date: new Date(editDate).toISOString(), notes: JSON.stringify(session) }).eq('id', editId).eq('user_id', user.id);
            if (error) throw error;
            setShowEdit(false);
            setHistory(prev => prev.map(h => h.id === editId ? { ...h, workoutTitle: editTitle, date: new Date(editDate).toISOString(), totalTime: parseInt(editDuration || '0', 10) * 60, rawSession: session } : h));
            await alert('Histórico atualizado');
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            await alert('Erro: ' + msg);
        }
    };

    // ── Open session report ──────────────────────────────────────────────────
    const [selectedSession, setSelectedSession] = useState<Record<string, unknown> | null>(null);

    const openSession = (session: WorkoutSummary, onViewReport?: (s: unknown) => void) => {
        const { RawSessionObjectSchema } = require('@/components/historyListTypes') as typeof import('@/components/historyListTypes');
        const rawSessionParsed = RawSessionObjectSchema.safeParse(session?.rawSession);
        const rawSession = rawSessionParsed.success ? rawSessionParsed.data : null;
        const sessionRecord = isRecord(session) ? session : {} as Record<string, unknown>;
        const payload = rawSession
            ? { ...rawSession, id: rawSession.id ?? session?.id ?? null, user_id: session?.raw?.user_id ?? rawSession?.user_id ?? sessionRecord.user_id ?? null, student_id: session?.raw?.student_id ?? rawSession?.student_id ?? sessionRecord.student_id ?? null }
            : session;
        if (typeof onViewReport === 'function') {
            try { onViewReport(payload); return; } catch { }
        }
        setSelectedSession(isRecord(payload) ? payload : null);
    };

    // ── Session metadata ─────────────────────────────────────────────────────
    const getSessionMeta = (s: WorkoutSummary) => {
        const raw = parseRawSession(s?.rawSession ?? s?.notes);
        const exCount = Array.isArray(raw?.exercises) ? raw.exercises.length : 0;
        const vol = raw?.logs ? calculateTotalVolumeFromLogs(raw.logs) : 0;
        return { exCount, vol };
    };

    return {
        isSelectionMode, selectedIds, setSelectedIds,
        toggleSelectionMode, toggleItemSelection, handleBulkDelete,
        handleDeleteClick,
        showEdit, setShowEdit, editId, editTitle, setEditTitle, editDate, setEditDate,
        editDuration, setEditDuration, editNotes, setEditNotes, editExercises,
        openEdit, updateEditExercise, saveEdit,
        selectedSession, setSelectedSession, openSession,
        getSessionMeta,
    };
}

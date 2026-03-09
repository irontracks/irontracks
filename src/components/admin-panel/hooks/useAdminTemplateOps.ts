import { useState, useCallback } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminUser, AdminWorkoutTemplate } from '@/types/admin';
import type { UnknownRecord } from '@/types/app';
import type { Exercise } from '@/types/app';
import { useDialog } from '@/contexts/DialogContext';
import { workoutPlanHtml } from '@/utils/report/templates';
import { escapeHtml } from '@/utils/escapeHtml';
import React from 'react';

export type UseAdminTemplateOpsParams = {
    selectedStudent: AdminUser | null;
    user: AdminUser;
    supabase: SupabaseClient;
    setTemplates: React.Dispatch<React.SetStateAction<UnknownRecord[]>>;
    setStudentWorkouts: React.Dispatch<React.SetStateAction<UnknownRecord[]>>;
    setSyncedWorkouts: React.Dispatch<React.SetStateAction<UnknownRecord[]>>;
};

export const useAdminTemplateOps = ({
    selectedStudent,
    user,
    supabase,
    setTemplates,
    setStudentWorkouts,
    setSyncedWorkouts,
}: UseAdminTemplateOpsParams) => {
    const { alert, confirm } = useDialog();

    // ─── Template/Workout State ───────────────────────────────────────────────
    const [editingTemplate, setEditingTemplate] = useState<AdminWorkoutTemplate | null>(null);
    const [editingStudentWorkout, setEditingStudentWorkout] = useState<UnknownRecord | null>(null);
    const [viewWorkout, setViewWorkout] = useState<UnknownRecord | null>(null);

    // ─── Utility ──────────────────────────────────────────────────────────────
    const getSetsCount = useCallback((value: unknown): number => {
        if (Array.isArray(value)) return value.length;
        if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
        if (typeof value === 'string') {
            const n = Number(value);
            return Number.isFinite(n) ? n : 0;
        }
        return 0;
    }, []);

    // ─── Template Handlers ────────────────────────────────────────────────────
    const openEditWorkout = useCallback((e: React.MouseEvent, w: UnknownRecord) => {
        try { e?.stopPropagation?.(); } catch { }
        setEditingStudentWorkout({
            id: w.id,
            title: w.name || w.title,
            exercises: (Array.isArray(w.exercises) ? w.exercises : []).map((ex: UnknownRecord) => ({
                name: ex.name || '',
                sets: getSetsCount(ex?.sets) || 4,
                reps: ex.reps ?? '10',
                rpe: ex.rpe ?? 8,
                cadence: ex.cadence || '2020',
                restTime: ex.rest_time ?? 60,
                method: ex.method || 'Normal',
                videoUrl: ex.video_url || '',
                notes: ex.notes || ''
            }))
        });
    }, [getSetsCount]);

    const openEditTemplate = useCallback((t: UnknownRecord) => {
        setEditingTemplate({
            id: String(t.id || t.uuid || ''),
            title: String(t.name || t.title || ''),
            created_at: String(t.created_at || new Date().toISOString()),
            exercises: (Array.isArray(t.exercises) ? t.exercises : []).map((ex: UnknownRecord) => ({
                name: String(ex.name || ''),
                sets: getSetsCount(ex?.sets) || 4,
                reps: String(ex.reps ?? '10'),
                rpe: Number(ex.rpe ?? 8),
                cadence: String(ex.cadence || '2020'),
                restTime: Number(ex.rest_time ?? 60),
                method: String(ex.method || 'Normal'),
                videoUrl: String(ex.video_url || ''),
                notes: String(ex.notes || '')
            }))
        });
    }, [getSetsCount]);

    const handleSaveTemplate = useCallback(async (data: unknown) => {
        if (!editingTemplate) return;
        const d = data && typeof data === 'object' ? (data as UnknownRecord) : {};
        const title = String(d.title || editingTemplate.title || '').trim();
        if (!title) { await alert('Preencha o nome do treino.'); return; }
        const exercises = Array.isArray(d.exercises) ? d.exercises : [];
        try {
            const workoutId = String(editingTemplate.id || '');
            if (!workoutId) { await alert('ID do treino não encontrado.'); return; }
            const { error: wErr } = await supabase
                .from('workouts')
                .update({ name: title })
                .eq('id', workoutId);
            if (wErr) throw wErr;
            for (let i = 0; i < exercises.length; i++) {
                const ex = exercises[i] && typeof exercises[i] === 'object' ? (exercises[i] as UnknownRecord) : {};
                if (ex.id) {
                    await supabase.from('exercises').update({
                        name: String(ex.name || ''),
                        sets: getSetsCount(ex.sets) || 4,
                        reps: ex.reps ?? '10',
                        rpe: ex.rpe ?? 8,
                        cadence: String(ex.cadence || '2020'),
                        rest_time: ex.restTime ?? ex.rest_time ?? 60,
                        method: String(ex.method || 'Normal'),
                        video_url: String(ex.videoUrl || ex.video_url || ''),
                        notes: String(ex.notes || '')
                    }).eq('id', String(ex.id));
                }
            }
            setTemplates(prev => prev.map(t =>
                String((t as UnknownRecord).id) === workoutId
                    ? { ...(t as UnknownRecord), name: title, exercises } as AdminWorkoutTemplate
                    : t
            ));
            setEditingTemplate(null);
            await alert('Treino atualizado com sucesso!', 'Sucesso');
        } catch (e: unknown) {
            const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
            await alert('Erro ao salvar treino: ' + msg);
        }
    }, [alert, editingTemplate, supabase, getSetsCount, setTemplates]);

    const handleAddTemplateToStudent = useCallback(async (template: UnknownRecord) => {
        if (!selectedStudent) return;
        const targetUserId = selectedStudent.user_id || '';
        if (!targetUserId) { await alert('Este aluno ainda não possui acesso ao app.'); return; }
        if (!(await confirm(`Adicionar treino "${template?.name || 'Treino'}" para ${selectedStudent.name || selectedStudent.email}?`))) return;
        try {
            const templateExercises: UnknownRecord[] = Array.isArray(template.exercises) ? (template.exercises as UnknownRecord[]) : [];
            const payload = {
                user_id: targetUserId,
                created_by: user?.id,
                is_template: true,
                name: template?.name || '',
                notes: template?.notes || ''
            };
            const { data: newWorkout, error: wErr } = await supabase
                .from('workouts')
                .insert(payload)
                .select()
                .single();
            if (wErr) throw wErr;
            const toInsert = templateExercises.map((e: UnknownRecord) => ({
                workout_id: newWorkout.id,
                name: e?.name || '',
                sets: getSetsCount(e?.sets) || 4,
                reps: e?.reps ?? '10',
                rpe: e?.rpe ?? 8,
                cadence: e?.cadence || '2020',
                rest_time: e?.rest_time ?? 60,
                method: e?.method || 'Normal',
                video_url: e?.video_url || '',
                notes: e?.notes || ''
            }));
            let newExs: UnknownRecord[] = [];
            if (toInsert.length) {
                const { data: exRows, error: exErr } = await supabase.from('exercises').insert(toInsert).select();
                if (exErr) throw exErr;
                newExs = exRows || [];
            }
            for (let i = 0; i < templateExercises.length; i++) {
                const srcEx: UnknownRecord = templateExercises[i] || ({} as UnknownRecord);
                const dstEx = newExs[i] || null;
                const setsArr: UnknownRecord[] = Array.isArray(srcEx.sets) ? (srcEx.sets as UnknownRecord[]) : [];
                if (dstEx && setsArr.length) {
                    const newSets = setsArr.map((s: UnknownRecord) => ({
                        exercise_id: (dstEx as UnknownRecord).id,
                        weight: s?.weight ?? null,
                        reps: s?.reps ?? null,
                        rpe: s?.rpe ?? null,
                        set_number: s?.set_number ?? 1,
                        completed: s?.completed ?? false
                    }));
                    if (newSets.length) {
                        const { error: setErr } = await supabase.from('sets').insert(newSets);
                        if (setErr) throw setErr;
                    }
                }
            }
            let refreshed: UnknownRecord[] = [];
            const { data } = await supabase
                .from('workouts')
                .select('*, exercises(*, sets(*))')
                .eq('user_id', targetUserId)
                .eq('is_template', true)
                .order('name');
            refreshed = data || [];
            refreshed = (Array.isArray(refreshed) ? refreshed : []).filter((w: UnknownRecord) => w && typeof w === 'object' && w.is_template === true);
            const synced = (refreshed || []).filter((w: UnknownRecord) => (String(w?.created_by || '') === String(user.id)) && (String(w?.user_id || '') === String(targetUserId)));
            const syncedIds = new Set((synced || []).map((w: UnknownRecord) => w?.id).filter(Boolean));
            const others = (refreshed || []).filter((w: UnknownRecord) => !syncedIds.has(w?.id));
            setStudentWorkouts(others || []);
            setSyncedWorkouts(synced || []);
            await alert('Treino enviado com sucesso!', 'Sucesso');
        } catch (e: unknown) {
            const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
            await alert('Erro ao enviar: ' + msg);
        }
    }, [alert, confirm, selectedStudent, supabase, user, getSetsCount, setStudentWorkouts, setSyncedWorkouts]);

    // ─── Export Handlers ──────────────────────────────────────────────────────
    const handleExportPdf = useCallback(async () => {
        try {
            const safeWorkout = {
                title: escapeHtml(viewWorkout?.name || ''),
                exercises: (Array.isArray(viewWorkout?.exercises) ? viewWorkout.exercises : []).map((ex: UnknownRecord) => ({
                    name: escapeHtml(ex?.name),
                    sets: getSetsCount(ex?.sets),
                    reps: escapeHtml(ex?.reps ?? '10'),
                    rpe: escapeHtml(ex?.rpe ?? 8),
                    cadence: escapeHtml(ex?.cadence || '2020'),
                    restTime: escapeHtml(ex?.rest_time ?? ex?.restTime),
                    method: escapeHtml(ex?.method),
                    notes: escapeHtml(ex?.notes)
                }))
            };
            const baseUser: UnknownRecord = user && typeof user === 'object' ? user : {};
            const safeUser = {
                ...baseUser,
                displayName: escapeHtml(baseUser.displayName ?? baseUser.name ?? ''),
                name: escapeHtml(baseUser.name ?? baseUser.displayName ?? ''),
                email: escapeHtml(baseUser.email ?? '')
            };
            const html = workoutPlanHtml(safeWorkout, safeUser);
            const blob = new Blob([html], { type: 'text/html' });
            const blobUrl = URL.createObjectURL(blob);
            const win = window.open(blobUrl, '_blank');
            if (!win) { URL.revokeObjectURL(blobUrl); return; }
            setTimeout(() => {
                try { win.print(); } catch { }
                setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
            }, 400);
        } catch (e: unknown) {
            const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
            await alert('Erro ao gerar PDF: ' + msg);
        }
    }, [alert, viewWorkout, user, getSetsCount]);

    const handleExportJson = useCallback(() => {
        if (!viewWorkout) return;
        const json = JSON.stringify({
            workout: {
                title: String(viewWorkout.name || ''),
                exercises: (Array.isArray(viewWorkout.exercises) ? viewWorkout.exercises : []).map((ex: UnknownRecord) => ({
                    name: String(ex.name || ''),
                    sets: getSetsCount(ex?.sets),
                    reps: ex.reps,
                    rpe: ex.rpe,
                    cadence: ex.cadence,
                    restTime: ex.rest_time ?? ex.restTime,
                    method: ex.method,
                    videoUrl: ex.video_url || ex.videoUrl,
                    notes: ex.notes
                }))
            }
        }, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${String(viewWorkout.name || 'treino').replace(/\s+/g, '_')}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    }, [viewWorkout, getSetsCount]);

    return {
        // State
        editingTemplate, setEditingTemplate,
        editingStudentWorkout, setEditingStudentWorkout,
        viewWorkout, setViewWorkout,
        // Utility
        getSetsCount,
        // Handlers
        openEditWorkout,
        openEditTemplate,
        handleSaveTemplate,
        handleAddTemplateToStudent,
        handleExportPdf,
        handleExportJson,
    };
};

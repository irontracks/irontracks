import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useAdminNavigation } from './hooks/useAdminNavigation';
import { useAdminTeacherDetail } from './hooks/useAdminTeacherDetail';
import { useAdminUserActivity } from './hooks/useAdminUserActivity';
import { useAdminPriorities } from './hooks/useAdminPriorities';

import { useRouter } from 'next/navigation';
import { AdminUser, AdminTeacher, ErrorReport, ExecutionVideo, AdminWorkoutTemplate } from '@/types/admin';
import { useStableSupabaseClient } from '@/hooks/useStableSupabaseClient';
import { useDialog } from '@/contexts/DialogContext';
import { sendBroadcastMessage, addTeacher, updateTeacher, exportAllData, importAllData } from '@/actions/admin-actions';
import { workoutTitleKey, normalizeWorkoutTitle } from '@/utils/workoutTitle';
import { logError, logWarn, logInfo } from '@/lib/logger'
import { getErrorMessage } from '@/utils/errorMessage'
import { workoutPlanHtml } from '@/utils/report/templates';
import { adminFetchJson } from '@/utils/admin/adminFetch';
import { parseJsonWithSchema } from '@/utils/zod';
import { z } from 'zod';
import { escapeHtml } from '@/utils/escapeHtml';
import type { Exercise } from '@/types/app';

import { useAdminActions } from './hooks/useAdminActions';
import { useAdminDataFetchers } from './hooks/useAdminDataFetchers';
import type { UnknownRecord } from '@/types/app'


export type AdminPanelProps = {
    user: AdminUser;
    onClose?: () => void;
};

export const useAdminPanelController = ({ user, onClose }: AdminPanelProps) => {
    const { alert, confirm } = useDialog();
    const supabase = useStableSupabaseClient();
    const router = useRouter();

    const getAdminAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
        try {
            if (!supabase) return {};
            const { data } = await supabase.auth.getSession();
            const token = data?.session?.access_token || '';
            if (!token) return {};
            return { Authorization: `Bearer ${token}` };
        } catch {
            return {};
        }
    }, [supabase]);

    // Roles
    const isAdmin = user?.role === 'admin';
    const isTeacher = user?.role === 'teacher';
    const unauthorized = !isAdmin && !isTeacher;

    const {
        usersList, setUsersList,
        teachersList, setTeachersList,
        templates, setTemplates,
        templatesUserId, setTemplatesUserId,
        myWorkoutsCount, setMyWorkoutsCount,
        tab, setTab,
        subTab, setSubTab,
        studentQuery, setStudentQuery,
        studentStatusFilter, setStudentStatusFilter,
        teacherQuery, setTeacherQuery,
        teacherStatusFilter, setTeacherStatusFilter,
        templateQuery, setTemplateQuery,
        normalizeText,
        statusMatches,
        studentMatchesQuery,
        teacherMatchesQuery,
        templateMatchesQuery,
        totalStudents, studentsWithTeacher, studentsWithoutTeacher, totalTeachers,
        studentStatusStats,
        dashboardCharts,
        coachInboxItems,
        studentsWithTeacherFiltered,
        studentsWithoutTeacherFiltered,
        teachersFiltered,
        templatesFiltered,
    } = useAdminNavigation(user?.id ? String(user.id) : undefined, isTeacher);

    // Selected Items
    const [selectedTeacher, setSelectedTeacher] = useState<AdminTeacher | null>(null);
    const [selectedStudent, setSelectedStudent] = useState<AdminUser | null>(null);

    const {
        teacherDetailTab, setTeacherDetailTab,
        teacherStudents, setTeacherStudents,
        teacherStudentsLoading, setTeacherStudentsLoading,
        teacherTemplatesRows, setTeacherTemplatesRows,
        teacherTemplatesLoading, setTeacherTemplatesLoading,
        teacherTemplatesCursor, setTeacherTemplatesCursor,
        teacherHistoryRows, setTeacherHistoryRows,
        teacherHistoryLoading, setTeacherHistoryLoading,
        teacherHistoryCursor, setTeacherHistoryCursor,
        teacherInboxItems, setTeacherInboxItems,
        teacherInboxLoading, setTeacherInboxLoading,
        loadTeacherStudents,
        loadTeacherTemplates,
        loadTeacherHistory,
        loadTeacherInbox,
    } = useAdminTeacherDetail(selectedTeacher, isAdmin, getAdminAuthHeaders);


    // Student Details
    const [studentWorkouts, setStudentWorkouts] = useState<UnknownRecord[]>([]);
    const [syncedWorkouts, setSyncedWorkouts] = useState<UnknownRecord[]>([]);
    const [assessments, setAssessments] = useState<UnknownRecord[]>([]);
    const [studentCheckinsRows, setStudentCheckinsRows] = useState<UnknownRecord[]>([]);
    const [studentCheckinsLoading, setStudentCheckinsLoading] = useState<boolean>(false);
    const [studentCheckinsError, setStudentCheckinsError] = useState<string>('');
    const [studentCheckinsRange, setStudentCheckinsRange] = useState<string>('7d');
    const [studentCheckinsFilter, setStudentCheckinsFilter] = useState<string>('all');
    const loadedStudentInfo = useRef<Set<string>>(new Set<string>());
    // Bug 1 fix: state for self-registered users awaiting approval
    const [pendingProfiles, setPendingProfiles] = useState<UnknownRecord[]>([]);


    // Execution Videos
    const [executionVideos, setExecutionVideos] = useState<ExecutionVideo[]>([]);
    const [executionVideosLoading, setExecutionVideosLoading] = useState<boolean>(false);
    const [executionVideosError, setExecutionVideosError] = useState<string>('');
    const [executionVideoModalOpen, setExecutionVideoModalOpen] = useState<boolean>(false);
    const [executionVideoModalUrl, setExecutionVideoModalUrl] = useState<string>('');
    const [executionVideoFeedbackDraft, setExecutionVideoFeedbackDraft] = useState<UnknownRecord>({});

    // Modals & Editing
    const [showRegisterModal, setShowRegisterModal] = useState<boolean>(false);
    const [newStudent, setNewStudent] = useState<{ name: string; email: string }>({ name: '', email: '' });
    const [registering, setRegistering] = useState<boolean>(false);
    const [editingStudent, setEditingStudent] = useState<boolean>(false);
    const [editedStudent, setEditedStudent] = useState<{ name: string; email: string }>({ name: '', email: '' });

    const [showTeacherModal, setShowTeacherModal] = useState<boolean>(false);
    const [newTeacher, setNewTeacher] = useState<{ name: string; email: string; phone: string; birth_date: string }>({ name: '', email: '', phone: '', birth_date: '' });
    const [addingTeacher, setAddingTeacher] = useState<boolean>(false);
    const [editingTeacher, setEditingTeacher] = useState<AdminTeacher | null>(null);

    const [editingTemplate, setEditingTemplate] = useState<AdminWorkoutTemplate | null>(null);
    const [editingStudentWorkout, setEditingStudentWorkout] = useState<UnknownRecord | null>(null);
    const [viewWorkout, setViewWorkout] = useState<UnknownRecord | null>(null);

    // System / Danger
    const [dangerOpen, setDangerOpen] = useState<boolean>(false);
    const [dangerActionLoading, setDangerActionLoading] = useState<string | null>(null);
    const [dangerStudentsConfirm, setDangerStudentsConfirm] = useState<string>('');
    const [dangerTeachersConfirm, setDangerTeachersConfirm] = useState<string>('');
    const [dangerWorkoutsConfirm, setDangerWorkoutsConfirm] = useState<string>('');
    const [exportOpen, setExportOpen] = useState<boolean>(false);
    const [historyOpen, setHistoryOpen] = useState<boolean>(false);
    const [moreTabsOpen, setMoreTabsOpen] = useState<boolean>(false);

    // Priorities / Inbox
    const {
        prioritiesItems, setPrioritiesItems,
        prioritiesLoading, setPrioritiesLoading,
        prioritiesError, setPrioritiesError,
        prioritiesSettingsOpen, setPrioritiesSettingsOpen,
        prioritiesSettings, setPrioritiesSettings,
        prioritiesSettingsLoading, setPrioritiesSettingsLoading,
        prioritiesSettingsError, setPrioritiesSettingsError,
        prioritiesSettingsPrefRef,
        prioritiesComposeOpen, setPrioritiesComposeOpen,
        prioritiesComposeStudentId, setPrioritiesComposeStudentId,
        prioritiesComposeKind, setPrioritiesComposeKind,
        prioritiesComposeText, setPrioritiesComposeText,
        fetchPriorities,
        normalizeCoachInboxSettings,
        loadPrioritiesSettings,
        savePrioritiesSettings,
    } = useAdminPriorities({ tab, userId: user?.id ? String(user.id) : undefined, supabase });

    // Broadcast
    const [broadcastTitle, setBroadcastTitle] = useState('');
    const [broadcastMsg, setBroadcastMsg] = useState('');
    const [sendingBroadcast, setSendingBroadcast] = useState(false);

    // Errors & Logs
    const [errorReports, setErrorReports] = useState<ErrorReport[]>([]);
    const [errorsLoading, setErrorsLoading] = useState<boolean>(false);
    const [errorsQuery, setErrorsQuery] = useState<string>('');
    const [errorsStatusFilter, setErrorsStatusFilter] = useState<string>('all');

    // Video Backfill
    const [videoQueue, setVideoQueue] = useState<UnknownRecord[]>([]);
    const [videoLoading, setVideoLoading] = useState<boolean>(false);
    const [videoMissingCount, setVideoMissingCount] = useState<number | null>(null);
    const [videoMissingLoading, setVideoMissingLoading] = useState<boolean>(false);
    const [videoExerciseName, setVideoExerciseName] = useState<string>('');
    const [videoBackfillLimit, setVideoBackfillLimit] = useState<string>('20');
    const [videoCycleRunning, setVideoCycleRunning] = useState<boolean>(false);
    const [videoCycleStats, setVideoCycleStats] = useState<{ processed: number; created: number; skipped: number }>({ processed: 0, created: 0, skipped: 0 });
    const videoCycleStopRef = useRef<boolean>(false);

    // Exercise Aliases
    const [exerciseAliasesReview, setExerciseAliasesReview] = useState<UnknownRecord[]>([]);
    const [exerciseAliasesLoading, setExerciseAliasesLoading] = useState<boolean>(false);
    const [exerciseAliasesError, setExerciseAliasesError] = useState<string>('');
    const [exerciseAliasesBackfillLoading, setExerciseAliasesBackfillLoading] = useState<boolean>(false);
    const [exerciseAliasesNotice, setExerciseAliasesNotice] = useState<string>('');

    const {
        userActivityQuery, setUserActivityQuery,
        userActivityRole, setUserActivityRole,
        userActivityUsers, setUserActivityUsers,
        userActivityLoading, setUserActivityLoading,
        userActivityError, setUserActivityError,
        userActivitySelected, setUserActivitySelected,
        userActivityDays, setUserActivityDays,
        userActivitySummary, setUserActivitySummary,
        userActivitySummaryLoading, setUserActivitySummaryLoading,
        userActivityEvents, setUserActivityEvents,
        userActivityEventsLoading, setUserActivityEventsLoading,
        userActivityEventsBefore, setUserActivityEventsBefore,
        userActivityErrors, setUserActivityErrors,
        userActivityErrorsLoading, setUserActivityErrorsLoading,
        userActivityQueryDebounceRef,
        loadUserActivityUsers,
        loadUserActivitySummary,
        loadUserActivityEvents,
        loadUserActivityErrors,
        openUserActivityUser,
    } = useAdminUserActivity({ isAdmin, tab, getAdminAuthHeaders, supabase });


    // System
    const [systemExporting, setSystemExporting] = useState<boolean>(false);
    const [systemImporting, setSystemImporting] = useState<boolean>(false);
    const systemFileInputRef = useRef<HTMLInputElement | null>(null);

    // Debug / Diagnostic
    const [debugError, setDebugError] = useState<string | null>(null);

    // Loading State (Global)
    const [loading, setLoading] = useState<boolean>(false);

    // --- Actions (extracted to useAdminActions) ---
    const {
        handleRegisterStudent,
        handleAddTeacher,
        handleUpdateTeacher,
        handleSendBroadcast,
        handleUpdateStudentTeacher,
        handleUpdateStudentStatus,
        handleToggleStudentStatus,
        handleDeleteStudent,
        handleDeleteTeacher,
    } = useAdminActions({
        supabase, user, alert, confirm, getAdminAuthHeaders,
        setUsersList, setTeachersList,
        newStudent, setNewStudent, setShowRegisterModal, setRegistering,
        newTeacher, setNewTeacher, setShowTeacherModal, setAddingTeacher,
        editingTeacher, setEditingTeacher,
        broadcastTitle, broadcastMsg, setBroadcastTitle, setBroadcastMsg, setSendingBroadcast,
    });

    // ─── Utility helpers ───────────────────────────────────────────────────────

    const getSetsCount = useCallback((value: unknown): number => {
        if (Array.isArray(value)) return value.length;
        if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
        if (typeof value === 'string') {
            const n = Number(value);
            return Number.isFinite(n) ? n : 0;
        }
        return 0;
    }, []);

    // ─── System handlers ───────────────────────────────────────────────────────

    const handleExportSystem = useCallback(async () => {
        try {
            setSystemExporting(true);
            const res = await exportAllData();
            if (res?.error) throw new Error(String(res.error));
            const json = JSON.stringify(res.data || {}, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `irontracks_full_backup_${new Date().toISOString()}.json`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        } catch (e: unknown) {
            const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
            await alert('Erro ao exportar: ' + msg);
        } finally {
            setSystemExporting(false);
        }
    }, [alert, setSystemExporting]);

    const handleImportSystemClick = useCallback(() => {
        systemFileInputRef.current?.click();
    }, [systemFileInputRef]);

    const handleImportSystem = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            setSystemImporting(true);
            const text = await file.text();
            const data = parseJsonWithSchema(text, z.record(z.unknown()));
            if (!data) throw new Error('invalid_json');
            if (!(await confirm('Importar backup completo do sistema?', 'Importar Backup'))) return;
            const res = await importAllData(data);
            if (res?.error) throw new Error(String(res.error));
            await alert('Backup importado com sucesso!');
        } catch (err: unknown) {
            const msg = err && typeof err === 'object' && 'message' in err && typeof (err as { message?: unknown }).message === 'string' ? (err as { message: string }).message : String(err);
            await alert('Erro ao importar: ' + msg);
        } finally {
            setSystemImporting(false);
            e.target.value = '';
        }
    }, [alert, confirm, setSystemImporting]);

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
            setExportOpen(false);
        } catch (e: unknown) {
            const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
            await alert('Erro ao gerar PDF: ' + msg);
        }
    }, [alert, viewWorkout, user, getSetsCount, setExportOpen]);

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
        setExportOpen(false);
    }, [viewWorkout, getSetsCount, setExportOpen]);

    const openEditWorkout = useCallback((e: React.MouseEvent, w: UnknownRecord) => {
        try {
            e?.stopPropagation?.();
        } catch { }
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
    }, [getSetsCount, setEditingStudentWorkout]);

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
    }, [getSetsCount, setEditingTemplate]);

    // Bug #2 fix: real handleSaveTemplate — was a placeholder `alert()` in Modals.tsx
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
            // For each exercise, upsert by position
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
    }, [alert, editingTemplate, supabase, getSetsCount, setTemplates, setEditingTemplate]);

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
            if (!targetUserId) { await alert('Este aluno ainda não possui acesso ao app.'); return; }
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

    const handleEditStudent = useCallback(() => {
        if (!selectedStudent) return;
        setEditedStudent({ name: String(selectedStudent.name || ''), email: String(selectedStudent.email || '') });
        setEditingStudent(true);
    }, [selectedStudent, setEditedStudent, setEditingStudent]);

    const handleSaveStudentEdit = useCallback(async () => {
        if (!selectedStudent || !editedStudent.name || !editedStudent.email) return await alert('Preencha todos os campos.');
        try {
            const { error } = await supabase
                .from('students')
                .update({ name: editedStudent.name, email: editedStudent.email })
                .eq('id', selectedStudent.id);
            if (error) throw error;
            setSelectedStudent(prev => (prev ? { ...prev, name: editedStudent.name, email: editedStudent.email } : prev));
            setUsersList(prev => prev.map(s => s.id === selectedStudent.id ? { ...s, name: editedStudent.name, email: editedStudent.email } : s));
            setEditingStudent(false);
            await alert('Dados do aluno atualizados.');
        } catch (e: unknown) {
            const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
            await alert('Erro ao salvar: ' + msg);
        }
    }, [alert, selectedStudent, editedStudent, supabase, setSelectedStudent, setUsersList, setEditingStudent]);

    const handleDangerAction = useCallback(async (actionName: string, actionFn: () => Promise<UnknownRecord>) => {
        if (!(await confirm(`Tem certeza que deseja ${actionName}?`, 'ATENÇÃO - PERIGO'))) return false;
        if (!(await confirm(`Esta ação é IRREVERSÍVEL. Todos os dados serão perdidos. Confirmar mesmo?`, 'CONFIRMAÇÃO FINAL'))) return false;
        try {
            const res = await actionFn();
            if (res?.error) throw new Error(String(res.error));
            await alert(`${actionName} realizado com sucesso.`, 'Sucesso');
            setUsersList([]);
            setTeachersList([]);
            setTemplates([]);
            return true;
        } catch (e: unknown) {
            const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
            await alert(`Erro ao executar ${actionName}: ` + msg);
            return false;
        }
    }, [alert, confirm, setUsersList, setTeachersList, setTemplates]);

    const runDangerAction = useCallback(async (actionKey: string, actionName: string, actionFn: () => Promise<UnknownRecord>, resetInput: () => void) => {
        setDangerActionLoading(actionKey);
        try {
            const ok = await handleDangerAction(actionName, actionFn);
            if (ok) resetInput();
        } finally {
            setDangerActionLoading(null);
        }
    }, [handleDangerAction, setDangerActionLoading]);


    // --- Data Fetchers (extracted) ---
    useAdminDataFetchers({
      user, isAdmin, isTeacher, selectedStudent, tab, subTab,
      getAdminAuthHeaders, loadedStudentInfo,
      setUsersList, setTeachersList, setTemplates, setStudentWorkouts,
      setSyncedWorkouts, setAssessments, setPendingProfiles,
      setSelectedStudent, setLoading, setDebugError,
      setErrorReports, setErrorsLoading,
      setVideoQueue, setVideoLoading, setVideoMissingCount, setVideoMissingLoading,
      setExerciseAliasesReview, setExerciseAliasesLoading, setExerciseAliasesError,
      setTab,
    })

    // execution videos
    useEffect(() => {
        const raw = String(process.env.NEXT_PUBLIC_ENABLE_EXECUTION_VIDEO ?? '').trim().toLowerCase();
        const executionVideoEnabled = raw !== 'false';
        if (!executionVideoEnabled) return;
        if (!selectedStudent) return;
        if (subTab !== 'videos') return;
        let cancelled = false;
        const run = async () => {
            const studentUserId = selectedStudent?.user_id ? String(selectedStudent.user_id) : '';
            if (!studentUserId) return;
            setExecutionVideosLoading(true);
            setExecutionVideosError('');
            try {
                const res = await fetch(`/api/teacher/execution-videos/by-student?student_user_id=${encodeURIComponent(studentUserId)}`, { cache: 'no-store', credentials: 'include' });
                const json = await res.json().catch((): null => null);
                if (cancelled) return;
                if (!res.ok || !json?.ok) {
                    setExecutionVideos([]);
                    setExecutionVideosError(String(json?.error || `Falha ao carregar (${res.status})`));
                    return;
                }
                setExecutionVideos(Array.isArray(json.items) ? json.items : []);
            } catch (e: unknown) {
                if (!cancelled) {
                    setExecutionVideos([]);
                    const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : '';
                    setExecutionVideosError(msg || 'Erro ao carregar');
                }
            } finally {
                if (!cancelled) setExecutionVideosLoading(false);
            }
        };
        run();
        return () => { cancelled = true; };
    }, [selectedStudent, subTab, setExecutionVideos, setExecutionVideosError, setExecutionVideosLoading]);

    // checkins
    useEffect(() => {
        if (!selectedStudent) return;
        if (subTab !== 'checkins') return;
        let cancelled = false;
        const run = async () => {
            try {
                setStudentCheckinsLoading(true);
                setStudentCheckinsError('');
                const looksLikeUuid = (v: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || '').trim());
                const rawCandidate = selectedStudent?.user_id || selectedStudent?.id || '';
                const studentUserId = looksLikeUuid(rawCandidate) ? String(rawCandidate) : '';
                if (!studentUserId) {
                    setStudentCheckinsRows([]);
                    setStudentCheckinsError('Aluno sem user_id (não é possível buscar check-ins).');
                    return;
                }
                const days = String(studentCheckinsRange || '7d') === '30d' ? 30 : 7;
                const startIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
                let q = supabase
                    .from('workout_checkins')
                    .select('id, kind, created_at, energy, mood, soreness, notes, answers, workout_id, planned_workout_id')
                    .eq('user_id', studentUserId)
                    .gte('created_at', startIso)
                    .order('created_at', { ascending: false })
                    .limit(400);
                if (studentCheckinsFilter && studentCheckinsFilter !== 'all') q = q.eq('kind', String(studentCheckinsFilter));
                const { data, error } = await q;
                if (error) throw error;
                if (cancelled) return;
                setStudentCheckinsRows(Array.isArray(data) ? data : []);
            } catch (e: unknown) {
                if (cancelled) return;
                setStudentCheckinsRows([]);
                const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : '';
                setStudentCheckinsError(msg || 'Falha ao carregar check-ins.');
            } finally {
                if (!cancelled) setStudentCheckinsLoading(false);
            }
        };
        run();
        return () => { cancelled = true; };
    }, [selectedStudent, subTab, studentCheckinsFilter, studentCheckinsRange, supabase, setStudentCheckinsError, setStudentCheckinsLoading, setStudentCheckinsRows]);

    // teachers list for student
    useEffect(() => {
        if (!selectedStudent || !isAdmin) return;
        const loadTeachers = async () => {
            try {
                const authHeaders = await getAdminAuthHeaders();
                const res = await fetch('/api/admin/teachers/list', { headers: authHeaders });
                const json = await res.json();
                if (json.ok) {
                    const base = json.teachers || [];
                    let enriched = base;
                    try {
                        const emails = base.map((t: UnknownRecord) => t.email).filter(Boolean);
                        if (emails.length > 0) {
                            const { data: profilesMap } = await supabase
                                .from('profiles')
                                .select('id, email')
                                .in('email', emails);
                            const idByEmail = new Map((profilesMap || []).map((p: UnknownRecord) => [String(p.email || ''), p.id]));
                            enriched = base.map((t: UnknownRecord) => ({ ...t, user_id: idByEmail.get(String(t.email || '')) || null }));
                        }
                    } catch { }
                    const currentUid = selectedStudent?.teacher_id || '';
                    if (currentUid && !enriched.some((t: UnknownRecord) => t.user_id === currentUid)) {
                        try {
                            const { data: curProfile } = await supabase
                                .from('profiles')
                                .select('id, display_name, email')
                                .eq('id', currentUid)
                                .maybeSingle();
                            if (curProfile) {
                                enriched = [{ id: curProfile.id, name: curProfile.display_name, email: curProfile.email, user_id: curProfile.id, status: 'active' }, ...enriched];
                            } else {
                                enriched = [{ id: currentUid, name: 'Professor atribuído', email: '', user_id: currentUid, status: 'active' }, ...enriched];
                            }
                        } catch {
                            enriched = [{ id: currentUid, name: 'Professor atribuído', email: '', user_id: currentUid, status: 'active' }, ...enriched];
                        }
                    }
                    setTeachersList(enriched);
                }
            } catch { }
        };
        loadTeachers();
    }, [selectedStudent, isAdmin, supabase, getAdminAuthHeaders, setTeachersList]);

    // historyOpen + selectedTeacher side effects
    useEffect(() => {
        if (!selectedStudent) setHistoryOpen(false);
    }, [selectedStudent, setHistoryOpen]);

    useEffect(() => {
        if (selectedStudent) setSelectedTeacher(null);
    }, [selectedStudent, setSelectedTeacher]);

    // Bug 1 fix: approve a self-registered user → insert into students table
    const approvePendingProfile = useCallback(async (profile: UnknownRecord) => {
        try {
            const authHeaders = await getAdminAuthHeaders();
            const res = await fetch('/api/admin/students/assign-teacher', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders },
                body: JSON.stringify({
                    student_id: String(profile.user_id || ''),
                    email: String(profile.email || ''),
                    teacher_user_id: null,
                }),
            });
            const json = await res.json().catch(() => ({})) as Record<string, unknown>;
            if (!json?.ok) throw new Error(String(json?.error || `HTTP ${res.status}`));
            const newStudent: UnknownRecord = {
                id: json.student_id || profile.user_id,
                user_id: String(profile.user_id || ''),
                name: profile.name || null,
                email: profile.email || null,
                teacher_id: null,
                status: 'pendente',
                workouts: [],
            };
            setUsersList(prev => [...prev, newStudent as AdminUser]);
            setPendingProfiles(prev => prev.filter(p => p.user_id !== profile.user_id));
        } catch (e: unknown) {
            const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
            await alert('Erro ao aprovar membro: ' + msg);
        }
    }, [alert, getAdminAuthHeaders, setUsersList, setPendingProfiles]);

    return {
        user,
        isAdmin,
        isTeacher,
        tab, setTab,
        subTab, setSubTab,
        loading, setLoading,

        // Data
        usersList, setUsersList,
        teachersList, setTeachersList,
        templates, setTemplates,
        templatesUserId,
        myWorkoutsCount,

        // Selections
        selectedTeacher, setSelectedTeacher,
        selectedStudent, setSelectedStudent,
        teacherDetailTab, setTeacherDetailTab,

        // Details
        teacherStudents, setTeacherStudents,
        teacherStudentsLoading, setTeacherStudentsLoading,
        teacherTemplatesRows, setTeacherTemplatesRows,
        teacherTemplatesLoading, setTeacherTemplatesLoading,
        teacherTemplatesCursor, setTeacherTemplatesCursor,
        teacherHistoryRows, setTeacherHistoryRows,
        teacherHistoryLoading, setTeacherHistoryLoading,
        teacherHistoryCursor, setTeacherHistoryCursor,
        teacherInboxItems, setTeacherInboxItems,
        teacherInboxLoading, setTeacherInboxLoading,

        studentWorkouts, setStudentWorkouts,
        syncedWorkouts, setSyncedWorkouts,
        assessments, setAssessments,
        studentCheckinsRows, setStudentCheckinsRows,
        studentCheckinsLoading, setStudentCheckinsLoading,
        studentCheckinsError, setStudentCheckinsError,
        studentCheckinsRange, setStudentCheckinsRange,
        studentCheckinsFilter, setStudentCheckinsFilter,
        loadedStudentInfo,

        // Execution Videos
        executionVideos, setExecutionVideos,
        executionVideosLoading, setExecutionVideosLoading,
        executionVideosError, setExecutionVideosError,
        executionVideoModalOpen, setExecutionVideoModalOpen,
        executionVideoModalUrl, setExecutionVideoModalUrl,
        executionVideoFeedbackDraft, setExecutionVideoFeedbackDraft,

        // Modals & Forms
        showRegisterModal, setShowRegisterModal,
        newStudent, setNewStudent,
        registering, setRegistering,
        editingStudent, setEditingStudent,
        editedStudent, setEditedStudent,
        showTeacherModal, setShowTeacherModal,
        newTeacher, setNewTeacher,
        addingTeacher, setAddingTeacher,
        editingTeacher, setEditingTeacher,
        editingTemplate, setEditingTemplate,
        editingStudentWorkout, setEditingStudentWorkout,
        viewWorkout, setViewWorkout,

        // Filters
        studentQuery, setStudentQuery,
        studentStatusFilter, setStudentStatusFilter,
        teacherQuery, setTeacherQuery,
        teacherStatusFilter, setTeacherStatusFilter,
        templateQuery, setTemplateQuery,

        // System
        dangerOpen, setDangerOpen,
        dangerActionLoading, setDangerActionLoading,
        dangerStudentsConfirm, setDangerStudentsConfirm,
        dangerTeachersConfirm, setDangerTeachersConfirm,
        dangerWorkoutsConfirm, setDangerWorkoutsConfirm,
        exportOpen, setExportOpen,
        historyOpen, setHistoryOpen,
        moreTabsOpen, setMoreTabsOpen,
        systemExporting, setSystemExporting,
        systemImporting, setSystemImporting,
        systemFileInputRef,

        // Priorities
        prioritiesItems, setPrioritiesItems,
        prioritiesLoading, setPrioritiesLoading,
        prioritiesError, setPrioritiesError,
        prioritiesSettingsOpen, setPrioritiesSettingsOpen,
        prioritiesSettings, setPrioritiesSettings,
        prioritiesSettingsLoading, setPrioritiesSettingsLoading,
        prioritiesSettingsError, setPrioritiesSettingsError,
        prioritiesSettingsPrefRef,
        prioritiesComposeOpen, setPrioritiesComposeOpen,
        prioritiesComposeStudentId, setPrioritiesComposeStudentId,
        prioritiesComposeKind, setPrioritiesComposeKind,
        prioritiesComposeText, setPrioritiesComposeText,

        // Broadcast
        broadcastTitle, setBroadcastTitle,
        broadcastMsg, setBroadcastMsg,
        sendingBroadcast, setSendingBroadcast,

        // Errors
        errorReports, setErrorReports,
        errorsLoading, setErrorsLoading,
        errorsQuery, setErrorsQuery,
        errorsStatusFilter, setErrorsStatusFilter,

        // Videos
        videoQueue, setVideoQueue,
        videoLoading, setVideoLoading,
        videoMissingCount, setVideoMissingCount,
        videoMissingLoading, setVideoMissingLoading,
        videoExerciseName, setVideoExerciseName,
        videoBackfillLimit, setVideoBackfillLimit,
        videoCycleRunning, setVideoCycleRunning,
        videoCycleStats, setVideoCycleStats,
        videoCycleStopRef,

        // Aliases
        exerciseAliasesReview, setExerciseAliasesReview,
        exerciseAliasesLoading, setExerciseAliasesLoading,
        exerciseAliasesError, setExerciseAliasesError,
        exerciseAliasesBackfillLoading, setExerciseAliasesBackfillLoading,
        exerciseAliasesNotice, setExerciseAliasesNotice,

        // User Activity
        userActivityQuery, setUserActivityQuery,
        userActivityRole, setUserActivityRole,
        userActivityUsers, setUserActivityUsers,
        userActivityLoading, setUserActivityLoading,
        userActivityError, setUserActivityError,
        userActivitySelected, setUserActivitySelected,
        userActivityDays, setUserActivityDays,
        userActivitySummary, setUserActivitySummary,
        userActivitySummaryLoading, setUserActivitySummaryLoading,
        userActivityEvents, setUserActivityEvents,
        userActivityEventsLoading, setUserActivityEventsLoading,
        userActivityEventsBefore, setUserActivityEventsBefore,
        userActivityErrors, setUserActivityErrors,
        userActivityErrorsLoading, setUserActivityErrorsLoading,
        userActivityQueryDebounceRef,

        // Derived
        studentsWithTeacherFiltered,
        studentsWithoutTeacherFiltered,
        teachersFiltered,
        templatesFiltered,
        dashboardCharts,
        coachInboxItems,
        handleRegisterStudent,
        handleAddTeacher,
        handleUpdateTeacher,
        handleSendBroadcast,
        handleUpdateStudentTeacher,
        handleToggleStudentStatus,
        handleUpdateStudentStatus,
        handleDeleteStudent,
        handleDeleteTeacher,
        getAdminAuthHeaders,

        // Teacher loaders
        loadTeacherStudents,
        loadTeacherTemplates,
        loadTeacherHistory,
        loadTeacherInbox,

        // Priorities
        fetchPriorities,
        loadPrioritiesSettings,
        savePrioritiesSettings,
        normalizeCoachInboxSettings,

        // User Activity
        loadUserActivityUsers,
        loadUserActivitySummary,
        loadUserActivityEvents,
        loadUserActivityErrors,
        openUserActivityUser,

        // Refs (if needed directly)
        supabase,

        // Debug
        debugError, setDebugError,

        // Utility
        getSetsCount,

        // System handlers
        handleExportSystem,
        handleImportSystemClick,
        handleImportSystem,
        handleExportPdf,
        handleExportJson,
        openEditWorkout,
        openEditTemplate,

        // Student handlers
        handleAddTemplateToStudent,
        handleEditStudent,
        handleSaveStudentEdit,
        handleSaveTemplate,
        handleDangerAction,
        runDangerAction,
        // Bug 1 fix: pending self-registered users
        pendingProfiles, setPendingProfiles,
        approvePendingProfile,
    };
};

// ============================================================
// ⚠️  NÃO ALTERAR O LAYOUT DESTE COMPONENTE  ⚠️
// ------------------------------------------------------------
// Layout CORRETO: menu horizontal SUPERIOR (sticky top-0)
//   → flex flex-col + sticky top-0 border-b + tabs no topo
//
// Layout ERRADO (não usar):
//   → aside sidebar lateral (w-20 lg:w-64)
//
// O Trae IDE tende a substituir por sidebar lateral.
// Se isso acontecer, restaurar do commit: 054d9aa
// ============================================================
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
    Crown, X, UserCog, AlertCircle, Trash2, Megaphone, Plus, Copy, ArrowLeft,
    MessageSquare, Send, RefreshCw, Dumbbell, Share2, UserPlus, AlertTriangle, Edit3, ShieldAlert,
    ChevronDown, FileText, Download, History, Search, Play, Video
} from 'lucide-react';
import { Bar } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Tooltip,
    Legend
} from 'chart.js';
import { AdminUser, AdminTeacher, ErrorReport, ExecutionVideo, AdminWorkoutTemplate } from '@/types/admin';
import { useStableSupabaseClient } from '@/hooks/useStableSupabaseClient';
import AdminVipReports from './admin/AdminVipReports';
import AdminWorkoutEditor, { AdminWorkout } from './AdminWorkoutEditor';
import RequestsTab from '@/components/admin/RequestsTab';
import { workoutPlanHtml } from '@/utils/report/templates';
import { useDialog } from '@/contexts/DialogContext';
import { exportAllData, importAllData } from '@/actions/admin-actions';
import { updateWorkout, deleteWorkout } from '@/actions/workout-actions';
import AssessmentButton from '@/components/assessment/AssessmentButton';
import HistoryList from '@/components/HistoryList';
import { normalizeWorkoutTitle, workoutTitleKey } from '@/utils/workoutTitle';
import { normalizeExerciseName } from '@/utils/normalizeExerciseName';
import { adminFetchJson } from '@/utils/admin/adminFetch';
import type { Exercise } from '@/types/app';
import { getErrorMessage } from '@/utils/errorMessage'
import { logError, logWarn, logInfo } from '@/lib/logger'
import { parseJsonWithSchema } from '@/utils/zod'
import { z } from 'zod'
import { useAdminPanelController } from '@/components/admin-panel/useAdminPanelController';
import { AdminPanelProvider } from '@/components/admin-panel/AdminPanelContext';
import { DashboardTab } from '@/components/admin-panel/DashboardTab';
import { StudentsTab } from '@/components/admin-panel/StudentsTab';
import { TeachersTab } from '@/components/admin-panel/TeachersTab';
import { SystemTab } from '@/components/admin-panel/SystemTab';
import { ErrorsTab } from '@/components/admin-panel/ErrorsTab';
import { VideosTab } from '@/components/admin-panel/VideosTab';
import { TemplatesTab } from '@/components/admin-panel/TemplatesTab';
import { PrioritiesTab } from '@/components/admin-panel/PrioritiesTab';
import { AdminPanelHeader } from '@/components/admin-panel/AdminPanelHeader';

const COACH_INBOX_INACTIVE_THRESHOLD_DAYS = 7;
const COACH_INBOX_DEFAULTS = {
    churnDays: 7,
    volumeDropPct: 30,
    loadSpikePct: 60,
    minPrev7Volume: 500,
    minCurrent7VolumeSpike: 800,
    snoozeDefaultMinutes: 1440,
};

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

type UnknownRecord = Record<string, unknown>;

export type AdminPanelV2Props = {
    user: AdminUser;
    onClose?: () => void;
};

const AdminPanelV2 = ({ user, onClose }: AdminPanelV2Props) => {
    const { alert, confirm, prompt } = useDialog();
    const ctrl = useAdminPanelController({ user, onClose });

    // Destructure all state + actions from controller (single source of truth)
    const {
        isAdmin, isTeacher,
        tab, setTab,
        subTab, setSubTab,
        usersList, setUsersList,
        teachersList, setTeachersList,
        templates, setTemplates,
        selectedTeacher, setSelectedTeacher,
        selectedStudent, setSelectedStudent,
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
        studentWorkouts, setStudentWorkouts,
        syncedWorkouts, setSyncedWorkouts,
        assessments, setAssessments,
        studentCheckinsRows, setStudentCheckinsRows,
        studentCheckinsLoading, setStudentCheckinsLoading,
        studentCheckinsError, setStudentCheckinsError,
        studentCheckinsRange, setStudentCheckinsRange,
        studentCheckinsFilter, setStudentCheckinsFilter,
        loadedStudentInfo,
        executionVideos, setExecutionVideos,
        executionVideosLoading, setExecutionVideosLoading,
        executionVideosError, setExecutionVideosError,
        executionVideoModalOpen, setExecutionVideoModalOpen,
        executionVideoModalUrl, setExecutionVideoModalUrl,
        executionVideoFeedbackDraft, setExecutionVideoFeedbackDraft,
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
        exportOpen, setExportOpen,
        historyOpen, setHistoryOpen,
        studentQuery, setStudentQuery,
        studentStatusFilter, setStudentStatusFilter,
        teacherQuery, setTeacherQuery,
        teacherStatusFilter, setTeacherStatusFilter,
        templateQuery, setTemplateQuery,
        dangerOpen, setDangerOpen,
        dangerActionLoading, setDangerActionLoading,
        dangerStudentsConfirm, setDangerStudentsConfirm,
        dangerTeachersConfirm, setDangerTeachersConfirm,
        dangerWorkoutsConfirm, setDangerWorkoutsConfirm,
        moreTabsOpen, setMoreTabsOpen,
        systemExporting, setSystemExporting,
        systemImporting, setSystemImporting,
        systemFileInputRef,
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
        errorReports, setErrorReports,
        errorsLoading, setErrorsLoading,
        errorsQuery, setErrorsQuery,
        errorsStatusFilter, setErrorsStatusFilter,
        videoQueue, setVideoQueue,
        videoLoading, setVideoLoading,
        videoMissingCount, setVideoMissingCount,
        videoMissingLoading, setVideoMissingLoading,
        videoExerciseName, setVideoExerciseName,
        videoBackfillLimit, setVideoBackfillLimit,
        videoCycleRunning, setVideoCycleRunning,
        videoCycleStats, setVideoCycleStats,
        videoCycleStopRef,
        exerciseAliasesReview, setExerciseAliasesReview,
        exerciseAliasesLoading, setExerciseAliasesLoading,
        exerciseAliasesError, setExerciseAliasesError,
        exerciseAliasesBackfillLoading, setExerciseAliasesBackfillLoading,
        exerciseAliasesNotice, setExerciseAliasesNotice,
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
        studentsWithTeacherFiltered,
        studentsWithoutTeacherFiltered,
        teachersFiltered,
        templatesFiltered,
        coachInboxItems,
        handleRegisterStudent,
        handleAddTeacher,
        handleUpdateTeacher,
        handleSendBroadcast,
        handleUpdateStudentTeacher,
        handleToggleStudentStatus,
        handleDeleteStudent,
        getAdminAuthHeaders,
        supabase,
        loading, setLoading,
        broadcastMsg, setBroadcastMsg,
        broadcastTitle, setBroadcastTitle,
        sendingBroadcast, setSendingBroadcast,
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
    } = ctrl;

    const unauthorized = !isAdmin && !isTeacher;

    const getSetsCount = (value: unknown): number => {
        if (Array.isArray(value)) return value.length;
        if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
        if (typeof value === 'string') {
            const n = Number(value);
            return Number.isFinite(n) ? n : 0;
        }
        return 0;
    };

    const escapeHtml = (value: unknown): string => {
        try {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        } catch {
            return '';
        }
    };

    const router = useRouter();
    const executionVideoEnabled = (() => {
        try {
            const raw = String(process.env.NEXT_PUBLIC_ENABLE_EXECUTION_VIDEO ?? '').trim().toLowerCase();
            if (raw === 'false') return false;
            if (raw === 'true') return true;
            return true;
        } catch {
            return true;
        }
    })();

    useEffect(() => {
        if (unauthorized) onClose && onClose();
    }, [unauthorized, onClose]);

    useEffect(() => {
        if (!moreTabsOpen) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setMoreTabsOpen(false);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [moreTabsOpen, setMoreTabsOpen]);

    const normalizeText = useCallback((value: unknown) => String(value || '').toLowerCase(), []);

    const errorsFiltered = useMemo<UnknownRecord[]>(() => {
        const list = Array.isArray(errorReports) ? errorReports : [];
        const q = normalizeText(errorsQuery).trim();
        return list
            .filter((r) => {
                if (!errorsStatusFilter || errorsStatusFilter === 'all') return true;
                return normalizeText(r?.status || '') === normalizeText(errorsStatusFilter);
            })
            .filter((r) => {
                if (!q) return true;
                const msg = normalizeText(r?.message || '');
                const email = normalizeText(r?.user_email || r?.userEmail || '');
                const path = normalizeText(r?.pathname || '');
                return msg.includes(q) || email.includes(q) || path.includes(q);
            });
    }, [errorReports, errorsQuery, errorsStatusFilter, normalizeText]);

    // coachInboxItems — from ctrl (useAdminPanelController)

    useEffect(() => {
        if (!selectedStudent) setHistoryOpen(false);
    }, [selectedStudent, setHistoryOpen]);

    useEffect(() => {
        if (selectedStudent) setSelectedTeacher(null);
    }, [selectedStudent, setSelectedTeacher]);

    const handleExportSystem = async () => {
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
    };

    const handleImportSystemClick = () => {
        systemFileInputRef.current?.click();
    };

    const handleImportSystem = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
    };

    const handleExportPdf = async () => {
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
            const win = window.open('', '_blank');
            if (!win) return;
            win.document.open();
            win.document.write(html);
            win.document.close();
            win.focus();
            setTimeout(() => { try { win.print(); } catch { } }, 300);
            setExportOpen(false);
        } catch (e: unknown) {
            const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
            await alert('Erro ao gerar PDF: ' + msg);
        }
    };

    const handleExportJson = () => {
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
    };

    const openEditWorkout = (e: React.MouseEvent, w: Record<string, unknown>) => {
        try {
            e?.stopPropagation?.();
        } catch { }
        setEditingStudentWorkout({
            id: w.id,
            title: w.name || w.title,
            exercises: (Array.isArray(w.exercises) ? w.exercises : []).map((ex: Record<string, unknown>) => ({
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
    };

    const openEditTemplate = (t: UnknownRecord) => {
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
    };
    // loading, showRegisterModal, newStudent, registering, showTeacherModal, newTeacher,
    // addingTeacher, editingTeacher, broadcastMsg, broadcastTitle, sendingBroadcast — from ctrl

    // DIAGNOSTIC MODE: Connection Test
    const [debugError, setDebugError] = useState<string | null>(null);

    useEffect(() => {
        const testConnection = async () => {
            try {
                // AÇÃO 2: Teste agressivo sem filtros
                if (!supabase) return;
                const { data, error } = await supabase.from('workouts').select('*').limit(1);

                if (error) {
                    logError('error', "ERRO CRÍTICO SUPABASE:", error);
                    setDebugError("Erro Supabase: " + error.message + " | Detalhes: " + JSON.stringify(error));
                } else if (!data || data.length === 0) {
                    // Conexão OK, mas tabela vazia ou bloqueada por RLS
                } else {
                    // Conexão OK — dados encontrados
                }
            } catch (e: unknown) {
                logError('error', "ERRO DE CONEXÃO/FETCH:", e);
                const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
                setDebugError("Erro Catch: " + msg);
            }
        };
        testConnection();
    }, [supabase]);

    useEffect(() => {
        const fetchStudents = async () => {
            setLoading(true);
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            if (!currentUser) { setLoading(false); return; }
            try {
                let list: UnknownRecord[] = [];
                if (isAdmin) {
                    const authHeaders = await getAdminAuthHeaders();
                    const json = await adminFetchJson(supabase, '/api/admin/students/list') as UnknownRecord;
                    if (json?.ok) list = (json.students as UnknownRecord[]) || [];

                    const legacyJson = await adminFetchJson(supabase, '/api/admin/legacy-students') as UnknownRecord;
                    if (legacyJson?.ok && legacyJson.students) {
                        const existingIds = new Set(list.map((s: UnknownRecord) => s.user_id || s.id));
                        const newLegacy = ((legacyJson.students as unknown) as UnknownRecord[]).filter((s: UnknownRecord) => !existingIds.has(s.id));
                        list = [...list, ...newLegacy];

                        // Dedup by email, prefer entries that already have teacher_id
                        const byEmail = new Map();
                        for (const s of (list || [])) {
                            const key = String(s.email || '').toLowerCase();
                            const prev = byEmail.get(key);
                            if (!prev || (!!s.teacher_id && !prev.teacher_id)) {
                                byEmail.set(key, s);
                            }
                        }
                        list = Array.from(byEmail.values());
                    }
                    if (list.length === 0) {
                        const { data: profiles } = await supabase
                            .from('profiles')
                            .select('id, display_name, email, role')
                            .neq('role', 'teacher')
                            .order('display_name');
                        // Fetch teachers via admin API to exclude
                        let teacherEmails = new Set();
                        try {
                            const tJson = await adminFetchJson(supabase, '/api/admin/teachers/list') as UnknownRecord;
                            if (tJson?.ok) teacherEmails = new Set(((tJson.teachers as UnknownRecord[]) || []).map((t: UnknownRecord) => String(t.email || '').toLowerCase()));
                        } catch { }
                        list = (profiles || [])
                            .filter((p: UnknownRecord) => !p.email || !teacherEmails.has(String(p.email).toLowerCase()))
                            .map((p: UnknownRecord) => ({ id: p.id, name: p.display_name, email: p.email, teacher_id: null as string | null, user_id: p.id }));
                        // FINAL FALLBACK: students table (teacher/created_by), same do branch não-admin
                        if ((list || []).length === 0) {
                            let query = supabase
                                .from('students')
                                .select('*, workouts(*)')
                                .order('name');
                            const uid = currentUser?.id ? String(currentUser.id) : '';
                            if (uid) query = query.or(`teacher_id.eq.${uid},user_id.eq.${uid}`);
                            const { data: studentsData } = await query;
                            list = (studentsData || []).filter(s => (s.email || '').toLowerCase() !== (currentUser.email || '').toLowerCase());
                        }
                    }
                    // Extra client-side filter: exclude teachers
                    const { data: tList } = await supabase.from('teachers').select('id, name, email, user_id');
                    const tEmails = new Set((tList || []).map((t: UnknownRecord) => String(t.email || '').toLowerCase()));
                    const filtered = (list || []).filter((s: UnknownRecord) => {
                        const email = String(s.email || '').toLowerCase();
                        const uid = s.user_id || s.id;
                        if (email && tEmails.has(email)) return false;
                        return true;
                    });
                    // Overlay cached teacher assignment by email to ensure UI reflects recent changes
                    try {
                        list = (filtered || []).map((s: UnknownRecord) => {
                            const key = 'student_teacher_' + (s.email || '');
                            let tid = null;
                            try { tid = localStorage.getItem(key) || null; } catch { }
                            return tid && !s.teacher_id ? { ...s, teacher_id: tid } : s;
                        });
                    } catch { list = filtered; }
                    // Ensure dropdown has teachers (enriched with profiles.id mapping)
                    if (teachersList.length === 0) {
                        let jsonT = null;
                        try {
                            jsonT = await adminFetchJson(supabase, '/api/admin/teachers/list') as UnknownRecord;
                        } catch { }
                        if (jsonT?.ok) {
                            const base = (jsonT.teachers as UnknownRecord[]) || [];
                            try {
                                const emails = base.map((t: UnknownRecord) => t.email).filter(Boolean);
                                if (emails.length > 0) {
                                    const { data: profilesMap } = await supabase
                                        .from('profiles')
                                        .select('id, email')
                                        .in('email', emails);
                                    const idByEmail = new Map((profilesMap || []).map((p: UnknownRecord) => [String(p.email || ''), p.id]));
                                    const enriched: UnknownRecord[] = base.map((t: UnknownRecord) => ({ ...t, user_id: idByEmail.get(String(t.email || '')) || null }));
                                    // Ensure currently assigned teacher appears in dropdown
                                    if (selectedStudent?.teacher_id && !enriched.some((t: UnknownRecord) => t.user_id === selectedStudent.teacher_id)) {
                                        const { data: curProfile } = await supabase
                                            .from('profiles')
                                            .select('id, display_name, email')
                                            .eq('id', selectedStudent.teacher_id)
                                            .maybeSingle();
                                        if (curProfile) enriched.unshift({ id: String(curProfile.id || ''), name: curProfile.display_name, email: curProfile.email, user_id: curProfile.id, status: 'active' } as unknown as UnknownRecord)
                                    }
                                    setTeachersList(enriched as unknown as AdminTeacher[]);
                                } else {
                                    setTeachersList(base as unknown as AdminTeacher[]);
                                }
                            } catch { setTeachersList(base as unknown as AdminTeacher[]); }
                        }
                    }
                } else {
                    let query = supabase
                        .from('students')
                        .select('*, workouts(*)')
                        .order('name');
                    const uid = currentUser?.id ? String(currentUser.id) : '';
                    if (uid) query = query.or(`teacher_id.eq.${uid},user_id.eq.${uid}`);
                    const { data: studentsData } = await query;
                    list = (studentsData || []).filter(s => (s.email || '').toLowerCase() !== (currentUser.email || '').toLowerCase());
                    // Overlay cached teacher assignment by email to ensure UI reflects recent changes
                    try {
                        list = (list || []).map(s => {
                            const key = 'student_teacher_' + (s.email || '');
                            let tid = null;
                            try { tid = localStorage.getItem(key) || null; } catch { }
                            return tid && !s.teacher_id ? { ...s, teacher_id: tid } : s;
                        });
                    } catch { }
                }
                setUsersList((list || []) as unknown as AdminUser[]);
            } finally { setLoading(false); }
        };
        fetchStudents();
    }, [registering, isAdmin, supabase, selectedStudent?.teacher_id, teachersList.length, getAdminAuthHeaders, setLoading, setUsersList, setTeachersList]);

    useEffect(() => {
        if (tab === 'teachers' && isAdmin) {
            const fetchTeachers = async () => {
                const authHeaders = await getAdminAuthHeaders();
                let json = null;
                try {
                    const res = await fetch('/api/admin/teachers/list', { headers: authHeaders });
                    const raw = await res.text();
                    json = raw ? parseJsonWithSchema(raw, z.record(z.unknown())) : null;
                } catch { }
                if (json?.ok) {
                    const list = Array.isArray((json as Record<string, unknown>)?.teachers)
                        ? ((json as Record<string, unknown>).teachers as Record<string, unknown>[])
                        : [];
                    const dedup: AdminTeacher[] = [];
                    const seen = new Set();
                    for (const t of list) {
                        const key = String(t?.email || '').toLowerCase();
                        if (!seen.has(key)) { seen.add(key); dedup.push(t as AdminTeacher); }
                    }
                    try {
                        const emails = dedup.map(t => t.email).filter(Boolean);
                        if (emails.length > 0) {
                            const { data: profilesMap } = await supabase
                                .from('profiles')
                                .select('id, email')
                                .in('email', emails);
                            const idByEmail = new Map((profilesMap || []).map(p => [p.email, p.id]));
                            const enriched = dedup.map(t => ({ ...t, user_id: idByEmail.get(t.email) || null }));
                            setTeachersList(enriched);
                        } else {
                            setTeachersList(dedup);
                        }
                    } catch {
                        setTeachersList(dedup);
                    }
                }
            };
            fetchTeachers();
        }
    }, [tab, isAdmin, addingTeacher, editingTeacher, supabase, getAdminAuthHeaders, setTeachersList]);

    // loadTeacher* + effects — moved to useAdminPanelController

    // URL Persistence for Tabs (Fixed)
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const sp = new URLSearchParams(window.location.search);
        const t = sp.get('tab');
        // Only restore if valid tab, otherwise default to dashboard
        if (t && ['dashboard', 'students', 'teachers', 'templates', 'videos', 'broadcast', 'system'].includes(t)) {
            setTab(t);
        }
    }, [setTab]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const sp = new URLSearchParams(window.location.search);
        if (sp.get('tab') !== tab) {
            sp.set('tab', tab);
            // Use replaceState to avoid cluttering history, unless user wants back button support
            // Here we use replaceState to just keep URL in sync
            const url = `${window.location.pathname}?${sp.toString()}`;
            window.history.replaceState(null, '', url);
        }
        try {
            sessionStorage.setItem('irontracks_admin_panel_open', '1');
            sessionStorage.setItem('irontracks_admin_panel_tab', String(tab || 'dashboard'));
        } catch { }
    }, [tab]);

    useEffect(() => {
        if (tab !== 'templates') return;
        const fetchTemplates = async () => {
            try {
                const { data: { user: currentUser } } = await supabase.auth.getUser();
                if (!currentUser) return;
                // templatesUserId tracked by ctrl (useAdminPanelController)
                let list = [];
                if (isAdmin || isTeacher) {
                    try {
                        const authHeaders = await getAdminAuthHeaders();
                        const res = await fetch('/api/admin/workouts/mine', { headers: authHeaders });
                        const json = await res.json();
                        if (json.ok) {
                            list = (json.rows || []).filter((w: UnknownRecord) => w?.is_template === true && w?.user_id === currentUser.id);
                        }
                    } catch (e) { logError('error', "API fetch error", e); }

                    if ((list || []).length === 0) {
                        try {
                            const { data } = await supabase
                                .from('workouts')
                                .select('*, exercises(*, sets(*))')
                                .eq('is_template', true)
                                .eq('user_id', currentUser.id)
                                .order('name');
                            list = (data || []).filter((w: UnknownRecord) => w?.is_template === true && w?.user_id === currentUser.id);
                        } catch (e) { logError('error', "Supabase fetch error", e); }
                    }
                } else {
                    try {
                        const { data } = await supabase
                            .from('workouts')
                            .select('*, exercises(*, sets(*))')
                            .eq('is_template', true)
                            .eq('user_id', currentUser.id)
                            .order('name');
                        list = data || [];
                    } catch (e) { logError('error', "Supabase fetch error", e); }
                }
                try {
                    const resLegacy = await fetch('/api/workouts/list');
                    const jsonLegacy = await resLegacy.json();
                    if (jsonLegacy.ok) {
                        const legacy = (jsonLegacy.rows || []).map((w: UnknownRecord) => ({ id: w.id || w.uuid, name: w.name, exercises: [] as Exercise[] }));
                        list = [...list, ...legacy];
                    }
                } catch { }
                // Deduplicar por título, priorizando treinos completos (maior número de exercícios)
                const score = (w: UnknownRecord) => {
                    const exs = Array.isArray(w.exercises) ? w.exercises : [];
                    const exCount = exs.length;
                    return exCount;
                };
                const byTitle = new Map();
                for (const w of (list || [])) {
                    if (!w || !w.name) continue; // Defensive check
                    try {
                        const key = workoutTitleKey(w.name);
                        const prev = byTitle.get(key);
                        const curHasPrefix = /^[A-Z]\s-\s/.test(normalizeWorkoutTitle(w?.name || ''));
                        const prevHasPrefix = /^[A-Z]\s-\s/.test(normalizeWorkoutTitle(prev?.name || ''));
                        if (
                            !prev
                            || score(w) > score(prev)
                            || (score(w) === score(prev) && curHasPrefix && !prevHasPrefix)
                            || (score(w) === score(prev) && !!w.is_template && !prev.is_template)
                        ) {
                            byTitle.set(key, w);
                        }
                    } catch (e) { logError("Error processing workout", w, e); }
                }
                const deduped = Array.from(byTitle.values())
                    .map((w) => ({ ...w, name: normalizeWorkoutTitle(w?.name || '') }))
                    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                setTemplates(deduped || []);
            } catch (err) {
                logError('error', "Critical error fetching templates", err);
            }
        };
        fetchTemplates();
    }, [tab, isAdmin, isTeacher, supabase, getAdminAuthHeaders, setTemplates]);

    useEffect(() => {
        if (tab !== 'videos' || !isAdmin) return;
        const normalizeExercise = (value: unknown): string => {
            const s = String(value || '').trim().toLowerCase();
            if (!s) return '';
            return s
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]+/g, ' ')
                .trim()
                .replace(/\s+/g, ' ');
        };

        const fetchMissing = async () => {
            setVideoMissingLoading(true);
            try {
                const { data: rows, error } = await supabase
                    .from('exercises')
                    .select('name, video_url')
                    .or('video_url.is.null,video_url.eq.')
                    .limit(2000);

                if (error) throw error;

                const normalized = new Set<string>();
                for (const r of (rows || [])) {
                    const name = String(r?.name || '').trim();
                    if (!name) continue;
                    const n = normalizeExercise(name);
                    if (!n) continue;
                    normalized.add(n);
                    if (normalized.size >= 1000) break;
                }

                const normalizedList = Array.from(normalized);
                if (!normalizedList.length) {
                    setVideoMissingCount(0);
                    return;
                }

                const { data: libRows } = await supabase
                    .from('exercise_library')
                    .select('normalized_name, video_url')
                    .in('normalized_name', normalizedList)
                    .limit(normalizedList.length);

                const withVideo = new Set(
                    (libRows || [])
                        .filter((x) => !!String(x?.video_url || '').trim())
                        .map((x) => String(x?.normalized_name || '').trim())
                        .filter(Boolean)
                );

                let missing = 0;
                for (const n of normalizedList) {
                    if (!withVideo.has(n)) missing += 1;
                }
                setVideoMissingCount(missing);
            } catch {
                setVideoMissingCount(null);
            } finally {
                setVideoMissingLoading(false);
            }
        };

        const fetchVideos = async () => {
            setVideoLoading(true);
            try {
                const { data, error } = await supabase
                    .from('exercise_videos')
                    .select('id, url, title, channel_title, created_at, exercise_library_id, exercise_library:exercise_library_id(display_name_pt)')
                    .eq('status', 'pending')
                    .order('created_at', { ascending: false })
                    .limit(60);
                if (!error) setVideoQueue(data || []);
            } catch {
                setVideoQueue([]);
            } finally {
                setVideoLoading(false);
            }
        };
        fetchVideos();
        fetchMissing();
    }, [tab, isAdmin, supabase, setVideoLoading, setVideoMissingCount, setVideoMissingLoading, setVideoQueue]);

    useEffect(() => {
        if (tab !== 'errors' || !isAdmin) return;
        let cancelled = false;
        const fetchErrors = async () => {
            setErrorsLoading(true);
            try {
                const { data, error } = await supabase
                    .from('error_reports')
                    .select('id, user_id, user_email, message, stack, pathname, url, user_agent, app_version, source, meta, status, created_at, updated_at, resolved_at, resolved_by')
                    .order('created_at', { ascending: false })
                    .limit(200);
                if (cancelled) return;
                if (error) {
                    setErrorReports([]);
                    return;
                }
                setErrorReports(Array.isArray(data) ? data : []);
            } catch {
                if (!cancelled) setErrorReports([]);
            } finally {
                if (!cancelled) setErrorsLoading(false);
            }
        };
        fetchErrors();
        return () => {
            cancelled = true;
        };
    }, [tab, isAdmin, supabase, setErrorReports, setErrorsLoading]);

    useEffect(() => {
        if (tab !== 'system' || !isAdmin) return;
        let cancelled = false;
        const fetchAliases = async () => {
            setExerciseAliasesLoading(true);
            setExerciseAliasesError('');
            try {
                const { data, error } = await supabase
                    .from('exercise_aliases')
                    .select('id, user_id, canonical_id, alias, normalized_alias, confidence, source, needs_review, created_at, updated_at')
                    .eq('needs_review', true)
                    .order('created_at', { ascending: false })
                    .limit(200);
                if (cancelled) return;
                if (error) {
                    setExerciseAliasesReview([]);
                    const msg = String(getErrorMessage(error) || '');
                    if (msg) setExerciseAliasesError(msg);
                    return;
                }
                setExerciseAliasesReview(Array.isArray(data) ? data : []);
            } catch (e: unknown) {
                if (!cancelled) {
                    setExerciseAliasesReview([]);
                    const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : '';
                    if (msg) setExerciseAliasesError(msg);
                }
            } finally {
                if (!cancelled) setExerciseAliasesLoading(false);
            }
        };
        fetchAliases();
        return () => {
            cancelled = true;
        };
    }, [tab, isAdmin, supabase, setExerciseAliasesError, setExerciseAliasesLoading, setExerciseAliasesReview]);

    // fetchMyWorkoutsCount effect removed — myWorkoutsCount managed by ctrl (DashboardTab uses it via context)

    // fetchPriorities, normalizeCoachInboxSettings, loadPrioritiesSettings, savePrioritiesSettings + effect — moved to useAdminPanelController

    useEffect(() => {
        if (!selectedStudent) return;
        const fetchDetails = async () => {
            setLoading(true);
            const expectedStudentId = selectedStudent?.id || null;
            let targetUserId = selectedStudent.user_id || '';
            if (!targetUserId && selectedStudent.email) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('id')
                    .ilike('email', String(selectedStudent.email))
                    .maybeSingle();
                targetUserId = profile?.id || targetUserId;
            }
            try {
                const key = String(selectedStudent?.id || selectedStudent?.email || targetUserId || '');
                if (key && !loadedStudentInfo.current.has(key)) {
                    const authHeaders = await getAdminAuthHeaders();
                    let js = null;
                    try {
                        const resp = await fetch('/api/admin/students/list', { headers: authHeaders });
                        const raw = await resp.text();
                        js = raw ? parseJsonWithSchema(raw, z.record(z.unknown())) : null;
                    } catch { }
                    if (js?.ok) {
                        const studentsList = Array.isArray((js as Record<string, unknown>)?.students)
                            ? ((js as Record<string, unknown>).students as UnknownRecord[])
                            : [];
                        const row = studentsList.find((s: UnknownRecord) => (s.id === selectedStudent.id) || (s.user_id && s.user_id === (selectedStudent.user_id || targetUserId)) || (String(s.email || '').toLowerCase() === String(selectedStudent.email || '').toLowerCase()));
                        if (row) {
                            const nextTeacher = row.teacher_id ? String(row.teacher_id) : null;
                            const nextUserId = row.user_id ? String(row.user_id) : '';
                            const shouldUpdate = (nextTeacher !== selectedStudent.teacher_id) || (nextUserId !== String(selectedStudent.user_id || ''));
                            if (shouldUpdate) {
                                setSelectedStudent(prev => {
                                    if (!prev) return prev;
                                    if (expectedStudentId && prev?.id && String(prev.id) !== String(expectedStudentId)) return prev;
                                    return { ...prev, teacher_id: nextTeacher, user_id: nextUserId || null };
                                });
                            }
                        }
                        loadedStudentInfo.current.add(key);
                    }
                }
            } catch { }
            try {
                if (!selectedStudent.teacher_id && selectedStudent.email) {
                    const cached = localStorage.getItem('student_teacher_' + String(selectedStudent.email));
                    if (cached != null && cached !== String(selectedStudent.teacher_id || '')) {
                        setSelectedStudent(prev => (prev ? { ...prev, teacher_id: cached || null } : prev));
                    }
                }
            } catch { }
            if (targetUserId) {
                let wData = [];
                const { data } = await supabase
                    .from('workouts')
                    .select('*, exercises(*, sets(*))')
                    .eq('user_id', targetUserId)
                    .eq('is_template', true)
                    .order('name');
                wData = data || [];

                wData = (Array.isArray(wData) ? wData : []).filter((w: UnknownRecord) => w && typeof w === 'object' && w.is_template === true);

                const studentDeduped = (wData || []).sort((a: UnknownRecord, b: UnknownRecord) => String(a.name || '').localeCompare(String(b.name || '')));
                const synced = (studentDeduped || []).filter((w: UnknownRecord) => (String(w?.created_by || '') === String(user.id)) && (String(w?.user_id || '') === String(targetUserId)));
                const syncedIds = new Set((synced || []).map((w: UnknownRecord) => w?.id).filter(Boolean));
                const others = (studentDeduped || []).filter((w: UnknownRecord) => !syncedIds.has(w?.id));
                setStudentWorkouts(others || []);
                setSyncedWorkouts(synced || []);
            } else {
                setStudentWorkouts([]);
                setSyncedWorkouts([]);
                setAssessments([]);
            }

            // Load "Meus Treinos" for assignment list
            const { data: { user: me } } = await supabase.auth.getUser();
            if (me) {
                let my = [];
                try {
                    const authHeaders = await getAdminAuthHeaders();
                    const resMine = await fetch('/api/admin/workouts/mine', { headers: authHeaders });
                    const jsonMine = await resMine.json();
                    if (jsonMine.ok) my = jsonMine.rows || [];
                    else {
                        const { data } = await supabase
                            .from('workouts')
                            .select('*, exercises(*, sets(*))')
                            .or(`created_by.eq.${me.id},user_id.eq.${me.id}`)
                            .order('name');
                        my = data || [];
                    }
                } catch {
                    const { data } = await supabase
                        .from('workouts')
                        .select('*, exercises(*, sets(*))')
                        .or(`created_by.eq.${me.id},user_id.eq.${me.id},is_template.eq.true`)
                        .order('name');
                    my = data || [];
                }

                my = (my || []).filter((w: UnknownRecord) => (w?.user_id === me.id) && (w?.is_template === true));

                // Helper reintroduzido para deduplicação de TEMPLATES (Meus Treinos)
                const tMap = new Map();
                for (const w of (my || [])) {
                    const key = workoutTitleKey(w.name);
                    const prev = tMap.get(key);
                    const exs = Array.isArray(w.exercises) ? w.exercises : [];
                    const prevExs = Array.isArray(prev?.exercises) ? prev.exercises : [];
                    const score = (x: unknown) => (Array.isArray(x) ? x.length : 0);
                    const curHasPrefix = /^[A-Z]\s-\s/.test(normalizeWorkoutTitle(w?.name || ''));
                    const prevHasPrefix = /^[A-Z]\s-\s/.test(normalizeWorkoutTitle(prev?.name || ''));
                    if (
                        !prev
                        || score(exs) > score(prevExs)
                        || (score(exs) === score(prevExs) && curHasPrefix && !prevHasPrefix)
                        || (score(exs) === score(prevExs) && !!w.is_template && !prev?.is_template)
                    ) {
                        tMap.set(key, w);
                    }
                }
                try {
                    const resLegacy = await fetch('/api/workouts/list');
                    const jsonLegacy = await resLegacy.json();
                    if (jsonLegacy.ok) {
                        for (const r of (jsonLegacy.rows || [])) {
                            const key = workoutTitleKey(r.name);
                            const prev = tMap.get(key);
                            const candidate = { id: r.id || r.uuid, name: normalizeWorkoutTitle(r.name), exercises: [] as Exercise[] };
                            const prevExs = Array.isArray(prev?.exercises) ? prev.exercises : [];
                            if (!prev || prevExs.length < 1) tMap.set(key, candidate);
                        }
                    }
                } catch { }
                const dedupTemplates = Array.from(tMap.values())
                    .map((w) => ({ ...w, name: normalizeWorkoutTitle(w?.name || '') }))
                    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                setTemplates(dedupTemplates || []);
            }
            if (targetUserId) {
                const assessmentOrParts: unknown[] = [];
                if (selectedStudent?.id) assessmentOrParts.push(`student_id.eq.${selectedStudent.id}`);
                if (targetUserId) assessmentOrParts.push(`user_id.eq.${targetUserId}`);
                if (assessmentOrParts.length > 0) {
                    const { data: aData } = await supabase
                        .from('assessments')
                        .select('*')
                        .or(assessmentOrParts.join(','))
                        .order('date', { ascending: false });
                    setAssessments(aData || []);
                } else {
                    setAssessments([]);
                }
            }
            setLoading(false);
        };
        fetchDetails();
    }, [selectedStudent, supabase, user?.id, isAdmin, isTeacher, getAdminAuthHeaders, loadedStudentInfo, setAssessments, setLoading, setSelectedStudent, setStudentWorkouts, setSyncedWorkouts, setTemplates]);

    useEffect(() => {
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
        return () => {
            cancelled = true;
        };
    }, [executionVideoEnabled, selectedStudent, subTab, setExecutionVideos, setExecutionVideosError, setExecutionVideosLoading]);

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
        return () => {
            cancelled = true;
        };
    }, [selectedStudent, subTab, studentCheckinsFilter, studentCheckinsRange, supabase, setStudentCheckinsError, setStudentCheckinsLoading, setStudentCheckinsRows]);

    // Ensure teachers list available when viewing a student (for assignment)
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

    // handleRegisterStudent — from ctrl

    // Assign template workout to selected student (clone workout and exercises)
    const handleAddTemplateToStudent = async (template: UnknownRecord) => {
        if (!selectedStudent) return;
        const targetUserId = selectedStudent.user_id || '';
        if (!targetUserId) { await alert('Aluno sem conta (user_id).'); return; }
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
            let newExs = [];
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
                        exercise_id: dstEx.id,
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
            let refreshed = [];
            if (!targetUserId) { await alert('Aluno sem conta (user_id).'); return; }
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
    };

    // handleSendBroadcast — from ctrl

    // loadUserActivity* + openUserActivityUser + effect — moved to useAdminPanelController

    const handleEditStudent = () => {
        if (!selectedStudent) return;
        setEditedStudent({ name: String(selectedStudent.name || ''), email: String(selectedStudent.email || '') });
        setEditingStudent(true);
    };

    const handleSaveStudentEdit = async () => {
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
    };

    // handleAddTeacher — from ctrl
    // handleUpdateTeacher — from ctrl

    const handleDangerAction = async (actionName: string, actionFn: () => Promise<UnknownRecord>) => {
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
    };

    const runDangerAction = async (actionKey: string, actionName: string, actionFn: () => Promise<UnknownRecord>, resetInput: () => void) => {
        setDangerActionLoading(actionKey);
        try {
            const ok = await handleDangerAction(actionName, actionFn);
            if (ok) resetInput();
        } finally {
            setDangerActionLoading(null);
        }
    };

    let TAB_LABELS: Record<string, string> = { dashboard: 'VISÃO GERAL', students: 'ALUNOS', templates: 'TREINOS' };
    if (isAdmin) {
        TAB_LABELS = { ...TAB_LABELS, requests: 'SOLICITAÇÕES', teachers: 'PROFESSORES', videos: 'VÍDEOS', errors: 'ERROS', vip_reports: 'RELATÓRIOS VIP', system: 'SISTEMA' };
    }
    if (isTeacher && !isAdmin) {
        TAB_LABELS = { ...TAB_LABELS, priorities: 'PRIORIDADES' };
    }
    if (isAdmin) {
        TAB_LABELS = { ...TAB_LABELS, priorities: 'PRIORIDADES' };
    }

    const tabKeys = Object.keys(TAB_LABELS);
    const currentTabLabel = TAB_LABELS[tab] || 'VISÃO GERAL';

    // totalStudents, studentsWithTeacher, studentsWithoutTeacher, totalTeachers,
    // studentStatusStats, dashboardCharts — all from ctrl (useAdminPanelController)

    if (!isAdmin && !isTeacher) return null;

    const selectedStatus = normalizeText(selectedStudent?.status || '');
    const selectedStatusLabel = String(selectedStudent?.status || 'pendente');
    const selectedStatusTone = selectedStatus === 'pago'
        ? 'bg-green-500/10 text-green-400 border-green-500/30'
        : (selectedStatus === 'atrasado'
            ? 'bg-red-500/10 text-red-400 border-red-500/30'
            : (selectedStatus === 'cancelar'
                ? 'bg-neutral-500/10 text-neutral-300 border-neutral-500/25'
                : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'));

    return (
        <AdminPanelProvider value={ctrl}>
        <div data-tour="adminpanel.root" className="fixed inset-0 z-50 bg-neutral-950 text-white flex flex-col overflow-hidden">
            <AdminPanelHeader
                debugError={debugError}
                tabLabels={TAB_LABELS}
                tabKeys={tabKeys}
                tab={tab}
                currentTabLabel={currentTabLabel}
                moreTabsOpen={moreTabsOpen}
                setMoreTabsOpen={setMoreTabsOpen}
                setTab={setTab}
                setSelectedStudent={(value) => setSelectedStudent(value as AdminUser | null)}
                onClose={onClose}
            />

            <div className="flex-1 min-h-0 overflow-y-auto p-4 pb-20 pb-safe" >
                {tab === 'dashboard' && !selectedStudent && <DashboardTab />}

                {
                    tab === 'priorities' && !selectedStudent && <PrioritiesTab />
                }

                {
                    tab === 'students' && !selectedStudent && <StudentsTab />
                }

                {
                    tab === 'templates' && !selectedStudent && <TemplatesTab />
                }

                {
                    tab === 'requests' && !selectedStudent && isAdmin && (
                        <RequestsTab />
                    )
                }

                {
                    tab === 'videos' && !selectedStudent && isAdmin && <VideosTab />
                }

                {
                    tab === 'errors' && !selectedStudent && isAdmin && <ErrorsTab />
                }

                {
                    tab === 'vip_reports' && !selectedStudent && (
                        <AdminVipReports supabase={supabase} />
                    )
                }

                {
                    tab === 'system' && !selectedStudent && <SystemTab />
                }

                {
                    tab === 'teachers' && isAdmin && !selectedStudent && !selectedTeacher && <TeachersTab />
                }

                {
                    tab === 'teachers' && isAdmin && !selectedStudent && selectedTeacher && <TeachersTab />
                }

                {
                    selectedStudent && (
                        <div className="animate-slide-up" >
                            {
                                editingStudent ? (
                                    <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4 md:p-6 shadow-[0_16px_40px_rgba(0,0,0,0.35)] mb-6" >
                                        <div className="flex items-center justify-between gap-3 mb-4">
                                            <div className="min-w-0" >
                                                <div className="text-[11px] uppercase tracking-widest text-neutral-500 font-bold" > Aluno </div>
                                                < h3 className="text-base md:text-lg font-black text-white truncate" > Editar informações </h3>
                                            </div>
                                            < button
                                                type="button"
                                                onClick={() => setEditingStudent(false)
                                                }
                                                className="w-10 h-10 rounded-full bg-neutral-900/70 border border-neutral-800 hover:bg-neutral-900 text-neutral-300 hover:text-white flex items-center justify-center transition-all duration-300 active:scale-95"
                                                aria-label="Fechar"
                                            >
                                                <X size={18} />
                                            </button>
                                        </div>
                                        < div className="space-y-4" >
                                            <div>
                                                <label className="block text-[11px] font-black uppercase tracking-widest text-neutral-500 mb-2" > Nome </label>
                                                < input type="text" value={editedStudent.name || ''} onChange={(e) => setEditedStudent(prev => ({ ...prev, name: e.target.value }))} className="w-full min-h-[44px] bg-neutral-900/70 border border-neutral-800 rounded-xl px-3 py-2 text-white placeholder:text-neutral-600 focus:border-yellow-500 focus:outline-none" />
                                            </div>
                                            < div >
                                                <label className="block text-[11px] font-black uppercase tracking-widest text-neutral-500 mb-2" > Email </label>
                                                < input type="email" value={editedStudent.email || ''} onChange={(e) => setEditedStudent(prev => ({ ...prev, email: e.target.value }))} className="w-full min-h-[44px] bg-neutral-900/70 border border-neutral-800 rounded-xl px-3 py-2 text-white placeholder:text-neutral-600 focus:border-yellow-500 focus:outline-none" />
                                            </div>
                                            < div className="flex gap-3 pt-4" >
                                                <button onClick={handleSaveStudentEdit} className="flex-1 min-h-[44px] px-4 py-3 bg-yellow-500 hover:bg-yellow-400 text-black rounded-xl font-black transition-all duration-300 shadow-lg shadow-yellow-500/15 active:scale-95" > Salvar </button>
                                                < button onClick={() => setEditingStudent(false)} className="flex-1 min-h-[44px] px-4 py-3 bg-neutral-900/70 border border-neutral-800 hover:bg-neutral-900 text-neutral-200 rounded-xl font-black transition-all duration-300 active:scale-95" > Cancelar </button>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4 md:p-4 shadow-[0_16px_40px_rgba(0,0,0,0.35)] mb-6" >
                                        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center" >
                                            <div className="flex items-start gap-3 md:gap-4 min-w-0" >
                                                <button
                                                    type="button"
                                                    onClick={() => { setSelectedStudent(null); setSubTab('workouts'); }}
                                                    className="w-11 h-11 rounded-2xl bg-neutral-900/70 border border-neutral-800 hover:bg-neutral-900 text-neutral-200 flex items-center justify-center transition-all duration-300 active:scale-95"
                                                    aria-label="Voltar"
                                                >
                                                    <ArrowLeft size={18} />
                                                </button>
                                                < div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center font-black text-lg md:text-xl text-neutral-100 flex-shrink-0" >
                                                    {String(selectedStudent?.name ?? selectedStudent?.email ?? '?').charAt(0)}
                                                </div>
                                                < div className="min-w-0 flex-1" >
                                                    <div className="flex flex-wrap items-center gap-2" >
                                                        <h2 className="text-lg md:text-2xl font-black text-white truncate" > {String(selectedStudent?.name ?? selectedStudent?.email ?? '')}</h2>
                                                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${selectedStatusTone}`}> {selectedStatusLabel} </span>
                                                    </div>
                                                    < p className="text-xs md:text-sm text-neutral-400 font-semibold truncate" > {String(selectedStudent?.email ?? '')}</p>
                                                </div>
                                            </div>

                                            < div className="flex flex-col sm:flex-row md:flex-row items-stretch md:items-center gap-2" >
                                                {isAdmin && (Array.isArray(teachersList) ? teachersList.length : 0) > 0 && (
                                                    <div className="flex items-center gap-2 w-full sm:w-auto" >
                                                        <span className="hidden lg:inline text-[10px] font-black uppercase tracking-widest text-neutral-500" > Professor </span>
                                                        {
                                                            (() => {
                                                                const currentUid = selectedStudent.teacher_id || '';
                                                                const list = Array.isArray(teachersList) ? [...teachersList] : [];
                                                                if (currentUid && !list.some(t => t.user_id === currentUid)) {
                                                                    list.unshift({ id: currentUid, name: 'Professor atribuído', email: '', user_id: currentUid, status: 'active' });
                                                                }
                                                                const currentValue = currentUid ? `uid:${currentUid}` : '';
                                                                return (
                                                                    <select
                                                                        value={currentValue}
                                                                        onChange={async (e) => {
                                                                            const raw = String(e.target.value || '').trim();
                                                                            const teacherUserId = raw.startsWith('uid:') ? raw.slice(4) : '';
                                                                            try {
                                                                                const authHeaders = await getAdminAuthHeaders();
                                                                                const res = await fetch('/api/admin/students/assign-teacher', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ student_id: selectedStudent.id || selectedStudent.user_id, email: selectedStudent.email || '', teacher_user_id: teacherUserId || null }) });
                                                                                const json = await res.json();
                                                                                if (json.ok) {
                                                                                    const nextTid = json.teacher_user_id || teacherUserId || null;
                                                                                    setSelectedStudent(prev => prev ? { ...prev, teacher_id: nextTid } : null);
                                                                                    setUsersList(prev => prev.map(x => (
                                                                                        (x.id === selectedStudent.id)
                                                                                        || (x.user_id === selectedStudent.user_id)
                                                                                        || (String(x.email || '').toLowerCase() === String(selectedStudent.email || '').toLowerCase())
                                                                                    ) ? { ...x, teacher_id: nextTid } : x));
                                                                                    try { if (selectedStudent.email) localStorage.setItem('student_teacher_' + String(selectedStudent.email), nextTid || ''); } catch { }
                                                                                    try {
                                                                                        let js = null;
                                                                                        try {
                                                                                            const resp = await fetch('/api/admin/students/list', { headers: authHeaders });
                                                                                            const raw = await resp.text();
                                                                                            js = raw ? parseJsonWithSchema(raw, z.record(z.unknown())) : null;
                                                                                        } catch { }
                                                                                        if (js?.ok) {
                                                                                            const students = Array.isArray((js as Record<string, unknown>)?.students)
                                                                                                ? ((js as Record<string, unknown>).students as AdminUser[])
                                                                                                : [];
                                                                                            setUsersList(students);
                                                                                        }
                                                                                    } catch { }
                                                                                } else {
                                                                                    await alert('Erro: ' + (json.error || 'Falha ao atualizar professor'));
                                                                                }
                                                                            } catch (e: unknown) {
                                                                                const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
                                                                                await alert('Erro: ' + msg);
                                                                            }
                                                                        }
                                                                        }
                                                                        className="min-h-[44px] bg-neutral-900/70 text-neutral-200 rounded-xl px-3 py-2 text-xs w-full sm:w-64 md:w-72 border border-neutral-800 focus:border-yellow-500 focus:outline-none"
                                                                    >
                                                                        <option value="" > Sem Professor </option>
                                                                        {
                                                                            list.map((t, idx) => (
                                                                                <option
                                                                                    key={String(t.id ?? t.user_id ?? t.email ?? `idx:${idx}`)
                                                                                    }
                                                                                    value={t.user_id ? `uid:${t.user_id}` : ''}
                                                                                    disabled={!t.user_id
                                                                                    }
                                                                                >
                                                                                    {(String(t.name ?? '') || String(t.email ?? '') || (t.user_id ? String(t.user_id).slice(0, 8) : 'Professor')) + (!t.user_id ? ' (sem conta)' : '')}
                                                                                </option>
                                                                            ))}
                                                                    </select>
                                                                );
                                                            })()}
                                                    </div>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => setEditingStudent(true)}
                                                    className="min-h-[44px] px-4 py-3 bg-neutral-900/70 border border-neutral-800 hover:bg-neutral-900 text-neutral-200 rounded-xl font-black flex items-center justify-center gap-2 transition-all duration-300 active:scale-95 shrink-0"
                                                    title="Editar"
                                                >
                                                    <Edit3 size={18} className="text-yellow-500" /> Editar
                                                </button>
                                            </div>
                                        </div>

                                        < div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2" >
                                            <div className="bg-neutral-950/40 border border-neutral-800 rounded-2xl p-3" >
                                                <div className="text-[11px] font-black uppercase tracking-widest text-neutral-500" > Treinos </div>
                                                < div className="mt-1 text-lg font-black text-white" > {(Array.isArray(studentWorkouts) ? studentWorkouts.length : 0) + (Array.isArray(syncedWorkouts) ? syncedWorkouts.length : 0)}</div>
                                            </div>
                                            < div className="bg-neutral-950/40 border border-neutral-800 rounded-2xl p-3" >
                                                <div className="text-[11px] font-black uppercase tracking-widest text-neutral-500" > Avaliações </div>
                                                < div className="mt-1 text-lg font-black text-white" > {Array.isArray(assessments) ? assessments.length : 0} </div>
                                            </div>
                                            < div className="bg-neutral-950/40 border border-neutral-800 rounded-2xl p-3" >
                                                <div className="text-[11px] font-black uppercase tracking-widest text-neutral-500" > Status </div>
                                                < div className="mt-1 text-lg font-black text-white truncate" > {selectedStatusLabel} </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                            <div className="mb-6" >
                                <div className="bg-neutral-900/60 border border-neutral-800 rounded-full p-1 flex items-center gap-1 shadow-[0_10px_30px_rgba(0,0,0,0.35)]" >
                                    <button
                                        type="button"
                                        onClick={() => setSubTab('workouts')}
                                        className={`flex-1 min-h-[44px] px-4 rounded-full font-black text-[11px] uppercase tracking-widest transition-all duration-300 active:scale-95 ${subTab === 'workouts'
                                            ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20'
                                            : 'text-neutral-200'
                                            }`}
                                    >
                                        Treinos
                                    </button>
                                    < button
                                        type="button"
                                        onClick={() => setSubTab('evolution')}
                                        className={`flex-1 min-h-[44px] px-4 rounded-full font-black text-[11px] uppercase tracking-widest transition-all duration-300 active:scale-95 ${subTab === 'evolution'
                                            ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20'
                                            : 'text-neutral-200'
                                            }`}
                                    >
                                        Evolução
                                    </button>
                                    < button
                                        type="button"
                                        onClick={() => setSubTab('checkins')}
                                        className={`flex-1 min-h-[44px] px-4 rounded-full font-black text-[11px] uppercase tracking-widest transition-all duration-300 active:scale-95 ${subTab === 'checkins'
                                            ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20'
                                            : 'text-neutral-200'
                                            }`}
                                    >
                                        Check - ins
                                    </button>
                                    {
                                        executionVideoEnabled ? (
                                            <button
                                                type="button"
                                                onClick={() => setSubTab('videos')
                                                }
                                                className={`flex-1 min-h-[44px] px-4 rounded-full font-black text-[11px] uppercase tracking-widest transition-all duration-300 active:scale-95 ${subTab === 'videos'
                                                    ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20'
                                                    : 'text-neutral-200'
                                                    }`}
                                            >
                                                Vídeos
                                            </button>
                                        ) : null}
                                </div>
                            </div>

                            {loading && <p className="text-center animate-pulse" > Carregando dados...</p>}

                            {
                                !loading && subTab === 'workouts' && (
                                    <div className="space-y-4" >
                                        <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.25)]" >
                                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3" >
                                                <div className="min-w-0" >
                                                    <div className="flex items-center gap-2" >
                                                        <Dumbbell size={18} className="text-yellow-500" />
                                                        <h3 className="text-base font-black text-white tracking-tight" > Treinos do aluno </h3>
                                                    </div>
                                                    < div className="mt-1 text-xs text-neutral-400 font-semibold" >
                                                        {(Array.isArray(studentWorkouts) ? studentWorkouts.length : 0) + (Array.isArray(syncedWorkouts) ? syncedWorkouts.length : 0)} atribuídos
                                                    </div>
                                                </div>
                                                < div className="flex flex-col sm:flex-row gap-2" >
                                                    <button
                                                        type="button"
                                                        data-tour="adminpanel.student.workouts.history"
                                                        onClick={() => setHistoryOpen(true)}
                                                        className="min-h-[44px] px-4 py-3 bg-neutral-900/70 border border-yellow-500/25 text-yellow-400 rounded-xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-yellow-500/10 transition-all duration-300 active:scale-95"
                                                    >
                                                        <History size={16} /> Histórico
                                                    </button>
                                                    < button
                                                        type="button"
                                                        data-tour="adminpanel.student.workouts.create"
                                                        onClick={() => setEditingStudentWorkout({ id: null, title: '', exercises: [] })}
                                                        className="min-h-[44px] px-4 py-3 bg-yellow-500 hover:bg-yellow-400 text-black rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 shadow-lg shadow-yellow-500/15 active:scale-95"
                                                    >
                                                        Criar treino
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                        {
                                            templates.length > 0 && (
                                                <button onClick={
                                                    async () => {
                                                        try {
                                                            const looksLikeUuid = (v: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || '').trim());
                                                            const maybeId = selectedStudent.user_id || selectedStudent.id || null;
                                                            let payloadId = looksLikeUuid(maybeId) ? String(maybeId) : undefined;
                                                            const payloadEmail = String(selectedStudent.email || '').trim();
                                                            if (!payloadId && payloadEmail) {
                                                                try {
                                                                    const { data: profile } = await supabase
                                                                        .from('profiles')
                                                                        .select('id')
                                                                        .ilike('email', payloadEmail)
                                                                        .maybeSingle();
                                                                    if (profile?.id) payloadId = String(profile.id);
                                                                } catch { }
                                                            }
                                                            if (!payloadId && !payloadEmail) {
                                                                await alert('Aluno sem conta (user_id) e sem email; não é possível sincronizar.');
                                                                return;
                                                            }
                                                            if (!payloadId && payloadEmail) {
                                                                await alert('Aluno sem conta (user_id). Não é possível sincronizar.');
                                                                return;
                                                            }
                                                            const normalize = (s: unknown) => String(s || '')
                                                                .toLowerCase()
                                                                .normalize('NFD')
                                                                .replace(/[\u0300-\u036f]/g, '')
                                                                .replace(/\s+/g, ' ')
                                                                .trim();
                                                            const extractLetter = (rawName: unknown) => {
                                                                const nn = normalize(rawName);
                                                                if (!nn) return null;
                                                                const m = nn.match(/^treino\s*\(?([a-z])/);
                                                                if (m && m[1]) return m[1];
                                                                const m2 = nn.match(/\(([a-z])\)/);
                                                                if (m2 && m2[1]) return m2[1];
                                                                return null;
                                                            };
                                                            const authHeaders = await getAdminAuthHeaders();
                                                            const res = await fetch('/api/admin/workouts/sync-templates', {
                                                                method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders },
                                                                body: JSON.stringify({
                                                                    id: payloadId,
                                                                    email: payloadEmail,
                                                                    mode: 'all'
                                                                })
                                                            })
                                                            const json: UnknownRecord = await res.json().catch(() => ({} as UnknownRecord));
                                                            if (json.ok) {
                                                                const debugObj: UnknownRecord | null = json.debug && typeof json.debug === 'object' ? (json.debug as UnknownRecord) : null;
                                                                const selectedUserId = String((selectedStudent as UnknownRecord | null)?.user_id || '').trim();
                                                                const resolvedTargetUserId = String(debugObj?.targetUserId || selectedUserId || '').trim();
                                                                if (!resolvedTargetUserId) {
                                                                    await alert('Não foi possível resolver o user_id do aluno para sincronizar.');
                                                                    return;
                                                                }
                                                                // Se rota retorna vazio, reforçar fetch direto por OR user_id/student_id
                                                                let rows: UnknownRecord[] = Array.isArray(json.rows) ? (json.rows as UnknownRecord[]) : [];
                                                                if (rows.length === 0) {
                                                                    try {
                                                                        const { data: refreshed } = await supabase
                                                                            .from('workouts')
                                                                            .select('*, exercises(*, sets(*))')
                                                                            .eq('user_id', resolvedTargetUserId)
                                                                            .eq('is_template', true)
                                                                            .order('name');
                                                                        rows = Array.isArray(refreshed) ? (refreshed as UnknownRecord[]) : [];
                                                                    } catch { }
                                                                }
                                                                const scoped = rows.filter((w) => String(w?.user_id || '') === resolvedTargetUserId);
                                                                const synced = scoped.filter((w) => (w?.is_template && String(w?.created_by || '') === String(user.id)));
                                                                const syncedIds = new Set(synced.map((w) => w?.id).filter(Boolean));
                                                                const others = scoped.filter((w) => !syncedIds.has(w?.id));
                                                                setStudentWorkouts(others)
                                                                setSyncedWorkouts(synced)
                                                                const createdCount = Number(json.created_count) || 0;
                                                                const updatedCount = Number(json.updated_count) || 0;
                                                                const msg = `Sincronização contínua ativada: ${createdCount} criado(s), ${updatedCount} atualizado(s)`
                                                                if (createdCount + updatedCount === 0 && debugObj) {
                                                                    const pickedNames: unknown[] = Array.isArray(debugObj.picked_names) ? (debugObj.picked_names as unknown[]) : [];
                                                                    const sampleNames: unknown[] = Array.isArray(debugObj.source_sample_names) ? (debugObj.source_sample_names as unknown[]) : [];
                                                                    const extra = `\n\nDiagnóstico:\n- sourceUserId: ${String(debugObj.sourceUserId || '-')}\n- source_mode: ${String(debugObj.source_mode || '-')}\n- owner_raw: ${String(debugObj.owner_raw_count ?? '-')}\n- owner_matched: ${String(debugObj.owner_matched_count ?? '-')}\n- source_count: ${String(debugObj.source_count ?? '-')}\n- picked: ${String(debugObj.picked_count ?? '-')}\n- picked_names: ${pickedNames.slice(0, 3).map(String).join(' | ') || '-'}\n- sample: ${sampleNames.slice(0, 3).map(String).join(' | ') || '-'}`
                                                                    await alert(msg + extra)
                                                                } else {
                                                                    await alert(msg)
                                                                }
                                                            } else {
                                                                const debugObj: UnknownRecord | null = json.debug && typeof json.debug === 'object' ? (json.debug as UnknownRecord) : null;
                                                                if (debugObj) {
                                                                    const ownerSample: unknown[] = Array.isArray(debugObj.owner_sample_names) ? (debugObj.owner_sample_names as unknown[]) : [];
                                                                    const sample = ownerSample.slice(0, 3).map(String).join(' | ') || '-'
                                                                    const extra = `\n\nDiagnóstico:\n- authUserId: ${String(debugObj.authUserId || '-')}\n- sourceUserId: ${String(debugObj.sourceUserId || '-')}\n- syncMode: ${String(debugObj.syncMode || '-')}\n- owner_raw: ${String(debugObj.owner_raw_count ?? '-')}\n- owner_owned: ${String(debugObj.owner_owned_count ?? '-')}\n- owner_matched: ${String(debugObj.owner_matched_count ?? '-')}\n- sample: ${sample}`
                                                                    await alert('Erro: ' + (String(json.error || '') || 'Falha ao sincronizar') + extra)
                                                                } else {
                                                                    await alert('Erro: ' + (String(json.error || '') || 'Falha ao sincronizar'))
                                                                }
                                                            }
                                                        } catch (e: unknown) {
                                                            const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
                                                            await alert('Erro ao sincronizar: ' + msg);
                                                        }
                                                    }
                                                } className="px-3 py-2 bg-neutral-800 border border-neutral-700 text-neutral-200 rounded-lg text-xs font-bold" > Sincronizar com Meus Treinos </button>
                                            )
                                        }
                                        {
                                            syncedWorkouts.length > 0 && (
                                                <div className="mt-4" >
                                                    <h3 className="font-bold text-yellow-500 text-xs uppercase tracking-widest mb-2" > Treinos sincronizados </h3>
                                                    {
                                                        syncedWorkouts.map((w) => (
                                                            <div key={String((w as UnknownRecord)?.id ?? '')
                                                            } className="bg-neutral-800 p-4 rounded-xl border border-neutral-700 flex justify-between items-center cursor-pointer" onClick={() => setViewWorkout(w)
                                                            }>
                                                                <div>
                                                                    <h4 className="font-bold text-white" > {normalizeWorkoutTitle(String((w as UnknownRecord)?.name ?? ''))}</h4>
                                                                    < p className="text-xs text-neutral-500" > {Array.isArray((w as UnknownRecord)?.exercises) ? ((w as UnknownRecord).exercises as unknown[]).length : 0} exercícios </p>
                                                                </div>
                                                                < div className="flex items-center gap-2" >
                                                                    <button onClick={(e) => openEditWorkout(e, w)} className="p-2 bg-neutral-700 hover:bg-yellow-500 text-neutral-300 hover:text-black rounded" > <Edit3 size={16} /></button >
                                                                    <button onClick={async (e) => { e.stopPropagation(); if (!(await confirm('Remover este treino do aluno?'))) return; try { const authHeaders = await getAdminAuthHeaders(); const res = await fetch('/api/admin/workouts/delete', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ id: (w as UnknownRecord)?.id }) }); const json: UnknownRecord = await res.json().catch(() => ({} as UnknownRecord)); if (!json.ok) throw new Error(String(json.error || 'Falha ao remover')); setStudentWorkouts(prev => prev.filter(x => x.id !== (w as UnknownRecord)?.id)); setSyncedWorkouts(prev => prev.filter(x => x.id !== (w as UnknownRecord)?.id)); } catch (e: unknown) { const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e); await alert('Erro ao remover: ' + msg); } }} className="p-2 text-red-500 hover:bg-red-900/20 rounded" > <Trash2 size={18} /></button >
                                                                </div>
                                                            </div>
                                                        ))}
                                                </div>
                                            )}
                                        {studentWorkouts.length === 0 && <p className="text-neutral-500 text-sm" > Nenhum treino atribuído.</p>}
                                        {
                                            studentWorkouts.map((w) => (
                                                <div key={String((w as UnknownRecord)?.id ?? '')
                                                } className="bg-neutral-800 p-4 rounded-xl border border-neutral-700 flex justify-between items-center cursor-pointer" onClick={() => setViewWorkout(w)}>
                                                    <div>
                                                        <h4 className="font-bold text-white" > {normalizeWorkoutTitle(String((w as UnknownRecord)?.name ?? ''))}</h4>
                                                        < p className="text-xs text-neutral-500" > {Array.isArray((w as UnknownRecord)?.exercises) ? ((w as UnknownRecord).exercises as unknown[]).length : 0} exercícios </p>
                                                    </div>
                                                    < div className="flex items-center gap-2" >
                                                        <button onClick={(e) => openEditWorkout(e, w)} className="p-2 bg-neutral-700 hover:bg-yellow-500 text-neutral-300 hover:text-black rounded" > <Edit3 size={16} /></button >
                                                        <button
                                                            onClick={
                                                                async (e) => {
                                                                    e.stopPropagation();
                                                                    if (!(await confirm('Remover este treino do aluno?'))) return;
                                                                    try {
                                                                        const authHeaders = await getAdminAuthHeaders();
                                                                        const workoutId = (w as UnknownRecord)?.id;
                                                                        const res = await fetch('/api/admin/workouts/delete', {
                                                                            method: 'POST',
                                                                            headers: { 'Content-Type': 'application/json', ...authHeaders },
                                                                            body: JSON.stringify({ id: workoutId }),
                                                                        });
                                                                        const json: UnknownRecord = await res.json().catch(() => ({} as UnknownRecord));
                                                                        if (!json.ok) throw new Error(String(json.error || 'Falha ao remover'));
                                                                        setStudentWorkouts((prev) => prev.filter((x) => x.id !== workoutId));
                                                                    } catch (err: unknown) {
                                                                        const msg = err && typeof err === 'object' && 'message' in err && typeof (err as { message?: unknown }).message === 'string' ? (err as { message: string }).message : String(err);
                                                                        await alert('Erro ao remover: ' + msg);
                                                                    }
                                                                }
                                                            }
                                                            className="p-2 text-red-500 hover:bg-red-900/20 rounded"
                                                        >
                                                            <Trash2 size={18} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        <div className="mt-6" >
                                            <h3 className="font-bold text-yellow-500 text-xs uppercase tracking-widest mb-2" > Meus Treinos </h3>
                                            {templates.length === 0 && <p className="text-neutral-500 text-sm" > Nenhum treino seu encontrado.</p>}
                                            {
                                                templates.map((t, idx) => (
                                                    <button key={String(t.id ?? t.name ?? `idx:${idx}`)
                                                    } onClick={() => handleAddTemplateToStudent(t)} className="w-full text-left p-3 bg-neutral-800 hover:bg-neutral-700 rounded-xl border border-neutral-700 flex justify-between group" >
                                                        <span>{String(t.name ?? '')} </span>
                                                        < Plus className="text-neutral-500 group-hover:text-yellow-500" />
                                                    </button>
                                                ))}
                                        </div>
                                    </div>
                                )}

                            {
                                !loading && executionVideoEnabled && subTab === 'videos' && (
                                    <div className="space-y-4" >
                                        <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.25)]" >
                                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3" >
                                                <div className="min-w-0" >
                                                    <div className="flex items-center gap-2" >
                                                        <Video size={18} className="text-yellow-500" />
                                                        <h3 className="text-base font-black text-white tracking-tight" > Vídeos de execução </h3>
                                                    </div>
                                                    < div className="mt-1 text-xs text-neutral-400 font-semibold" >
                                                        {executionVideosLoading ? 'Carregando...' : `${Array.isArray(executionVideos) ? executionVideos.length : 0} enviado(s)`}
                                                    </div>
                                                </div>
                                                < button
                                                    type="button"
                                                    onClick={async () => {
                                                        try {
                                                            if (!selectedStudent?.user_id) return;
                                                            setExecutionVideosLoading(true);
                                                            setExecutionVideosError('');
                                                            const res = await fetch(`/api/teacher/execution-videos/by-student?student_user_id=${encodeURIComponent(String(selectedStudent.user_id))}`, { cache: 'no-store', credentials: 'include' });
                                                            const json = await res.json().catch((): null => null);
                                                            if (!res.ok || !json?.ok) {
                                                                setExecutionVideos([]);
                                                                setExecutionVideosError(String(json?.error || `Falha ao carregar (${res.status})`));
                                                                return;
                                                            }
                                                            setExecutionVideos(Array.isArray(json.items) ? json.items : []);
                                                        } catch (e: unknown) {
                                                            setExecutionVideos([]);
                                                            const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : '';
                                                            setExecutionVideosError(msg || 'Erro ao carregar');
                                                        } finally {
                                                            setExecutionVideosLoading(false);
                                                        }
                                                    }
                                                    }
                                                    disabled={executionVideosLoading}
                                                    className="min-h-[44px] px-4 py-3 bg-neutral-900/70 border border-neutral-800 hover:bg-neutral-900 text-neutral-200 rounded-xl font-black flex items-center justify-center gap-2 transition-all duration-300 active:scale-95 disabled:opacity-60"
                                                >
                                                    Atualizar
                                                </button>
                                            </div>
                                        </div>

                                        {
                                            executionVideosError ? (
                                                <div className="bg-neutral-900/60 border border-red-500/30 rounded-2xl p-4 text-red-200 font-bold text-sm" >
                                                    {executionVideosError}
                                                </div>
                                            ) : null
                                        }

                                        {
                                            executionVideosLoading ? (
                                                <div className="text-center animate-pulse text-neutral-400 font-semibold" > Carregando vídeos...</div>
                                            ) : !Array.isArray(executionVideos) || executionVideos.length === 0 ? (
                                                <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl p-4 text-neutral-400 font-semibold" >
                                                    Nenhum vídeo enviado ainda.
                                                </div>
                                            ) : (
                                                <div className="space-y-3" >
                                                    {
                                                        executionVideos.map((it) => {
                                                            const id = it?.id ? String(it.id) : '';
                                                            const when = it?.created_at ? new Date(String(it.created_at)) : null;
                                                            const title = String(it?.exercise_name || 'Execução').trim();
                                                            const status = String(it?.status || 'pending').toLowerCase();
                                                            const draft = executionVideoFeedbackDraft && typeof executionVideoFeedbackDraft === 'object' ? String((executionVideoFeedbackDraft as UnknownRecord)[id] ?? '') : '';
                                                            const statusLabel = status === 'approved' ? 'Aprovado' : status === 'rejected' ? 'Reprovado' : 'Pendente';
                                                            const statusTone =
                                                                status === 'approved'
                                                                    ? 'border-green-500/30 text-green-300'
                                                                    : status === 'rejected'
                                                                        ? 'border-red-500/30 text-red-300'
                                                                        : 'border-yellow-500/30 text-yellow-300';
                                                            return (
                                                                <div key={id || Math.random().toString(36).slice(2)
                                                                } className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.25)]" >
                                                                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3" >
                                                                        <div className="min-w-0" >
                                                                            <div className="flex flex-wrap items-center gap-2" >
                                                                                <div className="text-base font-black text-white truncate" > {title} </div>
                                                                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${statusTone}`} > {statusLabel} </span>
                                                                            </div>
                                                                            < div className="mt-1 text-xs text-neutral-400 font-semibold" >
                                                                                {when ? when.toLocaleString() : ''}
                                                                            </div>
                                                                        </div>
                                                                        < div className="flex flex-col sm:flex-row gap-2" >
                                                                            <button
                                                                                type="button"
                                                                                onClick={async () => {
                                                                                    try {
                                                                                        const res = await fetch('/api/execution-videos/media', {
                                                                                            method: 'POST',
                                                                                            credentials: 'include',
                                                                                            headers: { 'content-type': 'application/json' },
                                                                                            body: JSON.stringify({ submission_id: id }),
                                                                                        });
                                                                                        const json = await res.json().catch((): null => null);
                                                                                        if (!res.ok || !json?.ok || !json?.url) {
                                                                                            await alert(String(json?.error || `Falha ao abrir (${res.status})`));
                                                                                            return;
                                                                                        }
                                                                                        setExecutionVideoModalUrl(String(json.url));
                                                                                        setExecutionVideoModalOpen(true);
                                                                                    } catch (e: unknown) {
                                                                                        const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
                                                                                        await alert('Erro: ' + msg);
                                                                                    }
                                                                                }
                                                                                }
                                                                                className="min-h-[44px] px-4 py-3 bg-neutral-900/70 border border-neutral-800 hover:bg-neutral-900 text-neutral-200 rounded-xl font-black flex items-center justify-center gap-2 transition-all duration-300 active:scale-95"
                                                                            >
                                                                                Assistir
                                                                            </button>
                                                                            < button
                                                                                type="button"
                                                                                onClick={async () => {
                                                                                    try {
                                                                                        const feedback = String(draft || '').trim();
                                                                                        const res = await fetch('/api/teacher/execution-videos/review', {
                                                                                            method: 'POST',
                                                                                            credentials: 'include',
                                                                                            headers: { 'content-type': 'application/json' },
                                                                                            body: JSON.stringify({ submission_id: id, status: 'approved', feedback, send_message: true }),
                                                                                        });
                                                                                        const json = await res.json().catch((): null => null);
                                                                                        if (!res.ok || !json?.ok) {
                                                                                            await alert(String(json?.error || `Falha ao aprovar (${res.status})`));
                                                                                            return;
                                                                                        }
                                                                                        setExecutionVideos((prev) => (Array.isArray(prev) ? prev.map((x) => (String(x?.id || '') === id ? { ...x, status: 'approved', teacher_feedback: feedback } : x)) : prev));
                                                                                    } catch (e: unknown) {
                                                                                        const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
                                                                                        await alert('Erro: ' + msg);
                                                                                    }
                                                                                }}
                                                                                className="min-h-[44px] px-4 py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl font-black transition-all duration-300 active:scale-95"
                                                                            >
                                                                                Aprovar
                                                                            </button>
                                                                            < button
                                                                                type="button"
                                                                                onClick={async () => {
                                                                                    try {
                                                                                        const feedback = String(draft || '').trim();
                                                                                        const res = await fetch('/api/teacher/execution-videos/review', {
                                                                                            method: 'POST',
                                                                                            credentials: 'include',
                                                                                            headers: { 'content-type': 'application/json' },
                                                                                            body: JSON.stringify({ submission_id: id, status: 'rejected', feedback, send_message: true }),
                                                                                        });
                                                                                        const json = await res.json().catch((): null => null);
                                                                                        if (!res.ok || !json?.ok) {
                                                                                            await alert(String(json?.error || `Falha ao reprovar (${res.status})`));
                                                                                            return;
                                                                                        }
                                                                                        setExecutionVideos((prev) => (Array.isArray(prev) ? prev.map((x) => (String(x?.id || '') === id ? { ...x, status: 'rejected', teacher_feedback: feedback } : x)) : prev));
                                                                                    } catch (e: unknown) {
                                                                                        const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
                                                                                        await alert('Erro: ' + msg);
                                                                                    }
                                                                                }}
                                                                                className="min-h-[44px] px-4 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-black transition-all duration-300 active:scale-95"
                                                                            >
                                                                                Reprovar
                                                                            </button>
                                                                        </div>
                                                                    </div>

                                                                    < div className="mt-3" >
                                                                        <label className="block text-[11px] font-black uppercase tracking-widest text-neutral-500 mb-2" > Mensagem para o aluno </label>
                                                                        < textarea
                                                                            value={String(draft || '')}
                                                                            onChange={(e) => {
                                                                                const v = e?.target?.value ?? '';
                                                                                setExecutionVideoFeedbackDraft((prev) => ({ ...(prev && typeof prev === 'object' ? prev : {}), [id]: v }));
                                                                            }}
                                                                            rows={3}
                                                                            className="w-full bg-neutral-900/70 border border-neutral-800 rounded-xl px-3 py-2 text-white placeholder:text-neutral-600 focus:border-yellow-500 focus:outline-none"
                                                                            placeholder="Escreva seu feedback..."
                                                                        />
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                </div>
                                            )}
                                    </div>
                                )}

                            {
                                !loading && subTab === 'checkins' && (
                                    <div className="space-y-4" >
                                        <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.25)]" >
                                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3" >
                                                <div className="min-w-0" >
                                                    <div className="flex items-center gap-2" >
                                                        <History size={18} className="text-yellow-500" />
                                                        <h3 className="text-base font-black text-white tracking-tight" > Check - ins do aluno </h3>
                                                    </div>
                                                    < div className="mt-1 text-xs text-neutral-400 font-semibold" >
                                                        {studentCheckinsLoading ? 'Carregando...' : `${Array.isArray(studentCheckinsRows) ? studentCheckinsRows.length : 0} item(s)`}
                                                    </div>
                                                </div>
                                                < div className="flex flex-col sm:flex-row gap-2" >
                                                    {
                                                        ['7d', '30d'].map((k) => (
                                                            <button
                                                                key={k}
                                                                type="button"
                                                                onClick={() => setStudentCheckinsRange(k)}
                                                                className={`min-h-[44px] px-4 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 active:scale-95 ${String(studentCheckinsRange || '7d') === k
                                                                    ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/15'
                                                                    : 'bg-neutral-900/70 border border-neutral-800 text-neutral-200 hover:bg-neutral-900'
                                                                    }`
                                                                }
                                                            >
                                                                {k === '7d' ? '7 dias' : '30 dias'}
                                                            </button>
                                                        ))}
                                                    {
                                                        ['all', 'pre', 'post'].map((k) => (
                                                            <button
                                                                key={k}
                                                                type="button"
                                                                onClick={() => setStudentCheckinsFilter(k)}
                                                                className={`min-h-[44px] px-4 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 active:scale-95 ${String(studentCheckinsFilter || 'all') === k
                                                                    ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/15'
                                                                    : 'bg-neutral-900/70 border border-neutral-800 text-neutral-200 hover:bg-neutral-900'
                                                                    }`}
                                                            >
                                                                {k === 'all' ? 'Todos' : k === 'pre' ? 'Pré' : 'Pós'}
                                                            </button>
                                                        ))}
                                                </div>
                                            </div>
                                        </div>

                                        {
                                            studentCheckinsError ? (
                                                <div className="bg-neutral-950/40 border border-yellow-500/20 rounded-2xl p-4 text-sm text-neutral-200" >
                                                    {studentCheckinsError}
                                                </div>
                                            ) : null
                                        }

                                        {
                                            (() => {
                                                const rows = Array.isArray(studentCheckinsRows) ? studentCheckinsRows : [];
                                                const filter = String(studentCheckinsFilter || 'all');
                                                const filtered = filter === 'all' ? rows : rows.filter((r) => String(r?.kind || '').trim() === filter);

                                                const toNumberOrNull = (v: unknown): number | null => {
                                                    const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
                                                    return Number.isFinite(n) ? n : null;
                                                };
                                                const avg = (vals: Array<number | null>): number | null => {
                                                    const list = Array.isArray(vals) ? vals.filter((v): v is number => typeof v === 'number' && Number.isFinite(v)) : [];
                                                    if (!list.length) return null;
                                                    return list.reduce((a, b) => a + b, 0) / list.length;
                                                };

                                                const preRows = rows.filter((r) => String(r?.kind || '').trim() === 'pre');
                                                const postRows = rows.filter((r) => String(r?.kind || '').trim() === 'post');
                                                const preAvgEnergy = avg(preRows.map((r) => toNumberOrNull(r?.energy)));
                                                const preAvgSoreness = avg(preRows.map((r) => toNumberOrNull(r?.soreness)));
                                                const preAvgTime = avg(preRows.map((r) => {
                                                    const answers: UnknownRecord = r?.answers && typeof r.answers === 'object' ? (r.answers as UnknownRecord) : {};
                                                    return toNumberOrNull(answers.time_minutes ?? answers.timeMinutes);
                                                }));
                                                const postAvgSoreness = avg(postRows.map((r) => toNumberOrNull(r?.soreness)));
                                                const postAvgSatisfaction = avg(postRows.map((r) => toNumberOrNull(r?.mood)));
                                                const postAvgRpe = avg(postRows.map((r) => {
                                                    const answers: UnknownRecord = r?.answers && typeof r.answers === 'object' ? (r.answers as UnknownRecord) : {};
                                                    return toNumberOrNull(answers.rpe);
                                                }));

                                                const highSorenessCount = rows.filter((r) => {
                                                    const s = toNumberOrNull(r?.soreness);
                                                    return s != null && s >= 7;
                                                }).length;
                                                const lowEnergyCount = preRows.filter((r) => {
                                                    const e = toNumberOrNull(r?.energy);
                                                    return e != null && e <= 2;
                                                }).length;
                                                const alerts: string[] = [];
                                                if (highSorenessCount >= 3) alerts.push('Dor alta (≥ 7) apareceu 3+ vezes no período.');
                                                if (preAvgSoreness != null && preAvgSoreness >= 7) alerts.push('Média de dor no pré está alta (≥ 7).');
                                                if (lowEnergyCount >= 3) alerts.push('Energia baixa (≤ 2) apareceu 3+ vezes no período.');
                                                if (postAvgSatisfaction != null && postAvgSatisfaction <= 2) alerts.push('Satisfação média no pós está baixa (≤ 2).');

                                                const suggestions: string[] = [];
                                                if (highSorenessCount >= 3 || (preAvgSoreness != null && preAvgSoreness >= 7) || (postAvgSoreness != null && postAvgSoreness >= 7)) {
                                                    suggestions.push('Dor alta: reduzir volume/carga 20–30% e priorizar técnica + mobilidade.');
                                                }
                                                if (lowEnergyCount >= 3 || (preAvgEnergy != null && preAvgEnergy <= 2.2)) {
                                                    suggestions.push('Energia baixa: treino mais curto, sem falha, foco em recuperação (sono/estresse).');
                                                }
                                                if (postAvgRpe != null && postAvgRpe >= 9) {
                                                    suggestions.push('RPE médio alto: reduzir intensidade e aumentar descanso entre séries.');
                                                }
                                                if (postAvgSatisfaction != null && postAvgSatisfaction <= 2) {
                                                    suggestions.push('Satisfação baixa: revisar seleção de exercícios e meta da sessão.');
                                                }
                                                if (preAvgTime != null && preAvgTime > 0 && preAvgTime < 45) {
                                                    suggestions.push('Pouco tempo: usar treino “mínimo efetivo” (menos exercícios e mais foco).');
                                                }

                                                return (
                                                    <div className="space-y-4" >
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3" >
                                                            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4" >
                                                                <div className="text-[11px] font-black uppercase tracking-widest text-yellow-500" > Pré </div>
                                                                < div className="mt-2 grid grid-cols-3 gap-3" >
                                                                    <div>
                                                                        <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500" > Energia </div>
                                                                        < div className="font-black text-white" > {preAvgEnergy == null ? '—' : preAvgEnergy.toFixed(1)
                                                                        }</div>
                                                                    </div>
                                                                    < div >
                                                                        <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500" > Dor </div>
                                                                        < div className="font-black text-white" > {preAvgSoreness == null ? '—' : preAvgSoreness.toFixed(1)
                                                                        } </div>
                                                                    </div>
                                                                    < div >
                                                                        <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500" > Tempo </div>
                                                                        < div className="font-black text-white" > {preAvgTime == null ? '—' : `${Math.round(preAvgTime)}m`}</div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            < div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4" >
                                                                <div className="text-[11px] font-black uppercase tracking-widest text-yellow-500" > Pós </div>
                                                                < div className="mt-2 grid grid-cols-3 gap-3" >
                                                                    <div>
                                                                        <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500" > RPE </div>
                                                                        < div className="font-black text-white" > {postAvgRpe == null ? '—' : postAvgRpe.toFixed(1)}</div>
                                                                    </div>
                                                                    < div >
                                                                        <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500" > Satisf.</div>
                                                                        < div className="font-black text-white" > {postAvgSatisfaction == null ? '—' : postAvgSatisfaction.toFixed(1)}</div>
                                                                    </div>
                                                                    < div >
                                                                        <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500" > Dor </div>
                                                                        < div className="font-black text-white" > {postAvgSoreness == null ? '—' : postAvgSoreness.toFixed(1)}</div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {
                                                            alerts.length ? (
                                                                <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-4" >
                                                                    <div className="text-[11px] font-black uppercase tracking-widest text-yellow-500" > Alertas </div>
                                                                    < div className="mt-2 space-y-1 text-sm text-neutral-200" >
                                                                        {
                                                                            alerts.map((a) => (
                                                                                <div key={a} > {a} </div>
                                                                            ))
                                                                        }
                                                                    </div>
                                                                </div>
                                                            ) : null
                                                        }

                                                        {
                                                            suggestions.length ? (
                                                                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4" >
                                                                    <div className="text-[11px] font-black uppercase tracking-widest text-neutral-200" > Sugestões </div>
                                                                    < div className="mt-2 space-y-1 text-sm text-neutral-200" >
                                                                        {
                                                                            suggestions.map((s) => (
                                                                                <div key={s} > {s} </div>
                                                                            ))
                                                                        }
                                                                    </div>
                                                                </div>
                                                            ) : null
                                                        }

                                                        {
                                                            filtered.length === 0 ? (
                                                                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4 text-sm text-neutral-400" >
                                                                    Nenhum check -in encontrado.
                                                                </div>
                                                            ) : (
                                                                <div className="space-y-2" >
                                                                    {
                                                                        filtered.map((r) => {
                                                                            const kind = String(r?.kind || '').trim();
                                                                            const createdAt = r?.created_at ? new Date(String(r.created_at)) : null;
                                                                            const dateLabel = createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt.toLocaleString('pt-BR') : '—';
                                                                            const energy = r?.energy != null ? String(r.energy) : '—';
                                                                            const soreness = r?.soreness != null ? String(r.soreness) : '—';
                                                                            const mood = r?.mood != null ? String(r.mood) : '—';
                                                                            const answers: UnknownRecord = r?.answers && typeof r.answers === 'object' ? (r.answers as UnknownRecord) : {};
                                                                            const rpe = answers.rpe != null ? String(answers.rpe) : '—';
                                                                            const timeMinutes = answers.time_minutes != null ? String(answers.time_minutes) : answers.timeMinutes != null ? String(answers.timeMinutes) : '—';
                                                                            const notes = r?.notes ? String(r.notes) : '';
                                                                            return (
                                                                                <div key={String(r?.id || dateLabel)
                                                                                } className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4" >
                                                                                    <div className="flex items-start justify-between gap-3" >
                                                                                        <div className="min-w-0" >
                                                                                            <div className="text-[11px] font-black uppercase tracking-widest text-yellow-500" > {kind === 'pre' ? 'Pré' : 'Pós'
                                                                                            } </div>
                                                                                            < div className="text-xs text-neutral-500" > {dateLabel} </div>
                                                                                        </div>
                                                                                        < div className="text-xs text-neutral-300 font-mono" >
                                                                                            {kind === 'pre' ? `E:${energy} D:${soreness} T:${timeMinutes}` : `RPE:${rpe} Sat:${mood} D:${soreness}`}
                                                                                        </div>
                                                                                    </div>
                                                                                    {notes ? <div className="mt-2 text-sm text-neutral-200" > {notes} </div> : null}
                                                                                </div>
                                                                            );
                                                                        })}
                                                                </div>
                                                            )}
                                                    </div>
                                                );
                                            })()}
                                    </div>
                                )}

                            {
                                !loading && subTab === 'evolution' && (
                                    <div className="space-y-4" >
                                        <AssessmentButton studentId={String(selectedStudent.user_id || selectedStudent.id || '')} studentName={String(selectedStudent.name || '')} variant="card" />
                                        {
                                            assessments.length > 0 && (
                                                <div className="bg-neutral-800 p-4 rounded-xl border border-neutral-700">
                                                    <h4 className="font-bold text-white mb-3"> Avaliações Anteriores</ h4 >
                                                    {
                                                        assessments.map((a) => (
                                                            <div key={String((a as UnknownRecord)?.id ?? '')
                                                            } className="flex justify-between items-center py-2 border-b border-neutral-700 last:border-0" >
                                                                <span className="text-neutral-400" > {(a as UnknownRecord)?.date ? new Date(String((a as UnknownRecord).date)).toLocaleDateString() : '—'
                                                                } </span>
                                                                < div className="text-right" >
                                                                    <span className="block font-bold text-white" > {String((a as UnknownRecord)?.bf ?? '')}% Gordura </span>
                                                                    <span className="text-xs text-neutral-500" > {String((a as UnknownRecord)?.weight ?? '')}kg </span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                </div>
                                            )}
                                    </div>
                                )}
                        </div>
                    )}

                {
                    prioritiesComposeOpen ? (
                        <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setPrioritiesComposeOpen(false)
                        }>
                            <div className="bg-neutral-900 w-full max-w-2xl rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                                <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3" >
                                    <div className="font-black text-white" > Enviar mensagem </div>
                                    < button
                                        type="button"
                                        onClick={() => setPrioritiesComposeOpen(false)}
                                        className="w-10 h-10 rounded-full bg-neutral-900/70 border border-neutral-800 hover:bg-neutral-900 text-neutral-300 hover:text-white flex items-center justify-center transition-all duration-300 active:scale-95"
                                        aria-label="Fechar"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                                < div className="p-4 space-y-3" >
                                    <textarea
                                        value={prioritiesComposeText}
                                        onChange={(e) => setPrioritiesComposeText(e.target.value)}
                                        rows={5}
                                        className="w-full bg-neutral-900/70 border border-neutral-800 rounded-xl px-3 py-2 text-white placeholder:text-neutral-600 focus:border-yellow-500 focus:outline-none"
                                        placeholder="Escreva sua mensagem..."
                                    />
                                    <div className="flex flex-col sm:flex-row gap-2" >
                                        <button
                                            type="button"
                                            onClick={() => setPrioritiesComposeOpen(false)}
                                            className="flex-1 min-h-[44px] px-4 py-3 bg-neutral-900/70 border border-neutral-800 hover:bg-neutral-900 text-neutral-200 rounded-xl font-black transition-all duration-300 active:scale-95"
                                        >
                                            Cancelar
                                        </button>
                                        < button
                                            type="button"
                                            onClick={async () => {
                                                try {
                                                    const content = String(prioritiesComposeText || '').trim();
                                                    const studentId = String(prioritiesComposeStudentId || '').trim();
                                                    const kind = String(prioritiesComposeKind || '').trim();
                                                    if (!content || !studentId || !kind) return;
                                                    const res = await fetch('/api/teacher/inbox/send-message', {
                                                        method: 'POST',
                                                        credentials: 'include',
                                                        headers: { 'content-type': 'application/json' },
                                                        body: JSON.stringify({ student_user_id: studentId, content }),
                                                    });
                                                    const json = await res.json().catch((): null => null);
                                                    if (!res.ok || !json?.ok) {
                                                        await alert(String(json?.error || `Falha ao enviar (${res.status})`));
                                                        return;
                                                    }
                                                    try {
                                                        await fetch('/api/teacher/inbox/action', {
                                                            method: 'POST',
                                                            credentials: 'include',
                                                            headers: { 'content-type': 'application/json' },
                                                            body: JSON.stringify({ student_user_id: studentId, kind, action: 'done' }),
                                                        });
                                                    } catch { }
                                                    setPrioritiesComposeOpen(false);
                                                    setPrioritiesComposeStudentId('');
                                                    setPrioritiesComposeKind('');
                                                    setPrioritiesComposeText('');
                                                    fetchPriorities();
                                                } catch (e: unknown) {
                                                    const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
                                                    await alert('Erro: ' + msg);
                                                }
                                            }}
                                            className="flex-1 min-h-[44px] px-4 py-3 bg-yellow-500 hover:bg-yellow-400 text-black rounded-xl font-black transition-all duration-300 active:scale-95"
                                        >
                                            Enviar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : null}

                {
                    prioritiesSettingsOpen ? (
                        <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setPrioritiesSettingsOpen(false)
                        }>
                            <div className="bg-neutral-900 w-full max-w-2xl rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                                <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3" >
                                    <div className="font-black text-white" > Configurar Prioridades </div>
                                    < button
                                        type="button"
                                        onClick={() => setPrioritiesSettingsOpen(false)}
                                        className="w-10 h-10 rounded-full bg-neutral-900/70 border border-neutral-800 hover:bg-neutral-900 text-neutral-300 hover:text-white flex items-center justify-center transition-all duration-300 active:scale-95"
                                        aria-label="Fechar"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                                < div className="p-4 space-y-4" >
                                    {
                                        prioritiesSettingsError ? (
                                            <div className="bg-neutral-900/60 border border-red-500/30 rounded-2xl p-4 text-red-200 font-bold text-sm" >
                                                {prioritiesSettingsError}
                                            </div>
                                        ) : null
                                    }
                                    < div className="grid grid-cols-1 md:grid-cols-2 gap-3" >
                                        <div className="space-y-1" >
                                            <div className="text-[11px] font-black uppercase tracking-widest text-neutral-500" > Churn(dias sem treino) </div>
                                            < input
                                                type="number"
                                                value={String(prioritiesSettings?.churnDays ?? COACH_INBOX_DEFAULTS.churnDays)}
                                                onChange={(e) => {
                                                    const v = e.target.valueAsNumber;
                                                    setPrioritiesSettings((prev) => ({ ...prev, churnDays: Number.isFinite(v) ? v : prev.churnDays }));
                                                }}
                                                className="w-full min-h-[44px] bg-neutral-900/70 border border-neutral-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-yellow-500"
                                            />
                                        </div>
                                        < div className="space-y-1" >
                                            <div className="text-[11px] font-black uppercase tracking-widest text-neutral-500" > Queda de volume(%) </div>
                                            < input
                                                type="number"
                                                value={String(prioritiesSettings?.volumeDropPct ?? COACH_INBOX_DEFAULTS.volumeDropPct)}
                                                onChange={(e) => {
                                                    const v = e.target.valueAsNumber;
                                                    setPrioritiesSettings((prev) => ({ ...prev, volumeDropPct: Number.isFinite(v) ? v : prev.volumeDropPct }));
                                                }}
                                                className="w-full min-h-[44px] bg-neutral-900/70 border border-neutral-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-yellow-500"
                                            />
                                        </div>
                                        < div className="space-y-1" >
                                            <div className="text-[11px] font-black uppercase tracking-widest text-neutral-500" > Aumento de carga(%) </div>
                                            < input
                                                type="number"
                                                value={String(prioritiesSettings?.loadSpikePct ?? COACH_INBOX_DEFAULTS.loadSpikePct)}
                                                onChange={(e) => {
                                                    const v = e.target.valueAsNumber;
                                                    setPrioritiesSettings((prev) => ({ ...prev, loadSpikePct: Number.isFinite(v) ? v : prev.loadSpikePct }));
                                                }}
                                                className="w-full min-h-[44px] bg-neutral-900/70 border border-neutral-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-yellow-500"
                                            />
                                        </div>
                                        < div className="space-y-1" >
                                            <div className="text-[11px] font-black uppercase tracking-widest text-neutral-500" > Volume mínimo(7d anterior) </div>
                                            < input
                                                type="number"
                                                value={String(prioritiesSettings?.minPrev7Volume ?? COACH_INBOX_DEFAULTS.minPrev7Volume)}
                                                onChange={(e) => {
                                                    const v = e.target.valueAsNumber;
                                                    setPrioritiesSettings((prev) => ({ ...prev, minPrev7Volume: Number.isFinite(v) ? v : prev.minPrev7Volume }));
                                                }}
                                                className="w-full min-h-[44px] bg-neutral-900/70 border border-neutral-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-yellow-500"
                                            />
                                        </div>
                                        < div className="space-y-1" >
                                            <div className="text-[11px] font-black uppercase tracking-widest text-neutral-500" > Volume mínimo(7d atual p / spike) </div>
                                            < input
                                                type="number"
                                                value={String(prioritiesSettings?.minCurrent7VolumeSpike ?? COACH_INBOX_DEFAULTS.minCurrent7VolumeSpike)}
                                                onChange={(e) => {
                                                    const v = e.target.valueAsNumber;
                                                    setPrioritiesSettings((prev) => ({ ...prev, minCurrent7VolumeSpike: Number.isFinite(v) ? v : prev.minCurrent7VolumeSpike }));
                                                }}
                                                className="w-full min-h-[44px] bg-neutral-900/70 border border-neutral-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-yellow-500"
                                            />
                                        </div>
                                        < div className="space-y-1" >
                                            <div className="text-[11px] font-black uppercase tracking-widest text-neutral-500" > Soneca padrão(min) </div>
                                            < input
                                                type="number"
                                                value={String(prioritiesSettings?.snoozeDefaultMinutes ?? COACH_INBOX_DEFAULTS.snoozeDefaultMinutes)}
                                                onChange={(e) => {
                                                    const v = e.target.valueAsNumber;
                                                    setPrioritiesSettings((prev) => ({ ...prev, snoozeDefaultMinutes: Number.isFinite(v) ? v : prev.snoozeDefaultMinutes }));
                                                }}
                                                className="w-full min-h-[44px] bg-neutral-900/70 border border-neutral-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-yellow-500"
                                            />
                                        </div>
                                    </div>
                                    < div className="flex flex-col sm:flex-row gap-2" >
                                        <button
                                            type="button"
                                            disabled={prioritiesSettingsLoading}
                                            onClick={() => {
                                                setPrioritiesSettings({ ...COACH_INBOX_DEFAULTS });
                                                setPrioritiesSettingsError('');
                                            }}
                                            className="flex-1 min-h-[44px] px-4 py-3 bg-neutral-900/70 border border-neutral-800 hover:bg-neutral-900 text-neutral-200 rounded-xl font-black transition-all duration-300 active:scale-95 disabled:opacity-60"
                                        >
                                            Resetar
                                        </button>
                                        < button
                                            type="button"
                                            disabled={prioritiesSettingsLoading}
                                            onClick={async () => {
                                                const ok = await savePrioritiesSettings();
                                                if (!ok) return;
                                                setPrioritiesSettingsOpen(false);
                                                fetchPriorities();
                                            }}
                                            className="flex-1 min-h-[44px] px-4 py-3 bg-yellow-500 hover:bg-yellow-400 text-black rounded-xl font-black transition-all duration-300 active:scale-95 disabled:opacity-60"
                                        >
                                            {prioritiesSettingsLoading ? 'Salvando...' : 'Salvar'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : null}

                {
                    executionVideoModalOpen && executionVideoModalUrl ? (
                        <div className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => { setExecutionVideoModalOpen(false); setExecutionVideoModalUrl(''); }
                        }>
                            <div className="bg-neutral-900 w-full max-w-3xl rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                                <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3" >
                                    <div className="font-black text-white" > Vídeo de execução </div>
                                    < button
                                        type="button"
                                        onClick={() => { setExecutionVideoModalOpen(false); setExecutionVideoModalUrl(''); }}
                                        className="w-10 h-10 rounded-full bg-neutral-900/70 border border-neutral-800 hover:bg-neutral-900 text-neutral-300 hover:text-white flex items-center justify-center transition-all duration-300 active:scale-95"
                                        aria-label="Fechar"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                                < div className="p-4" >
                                    <video src={executionVideoModalUrl} controls className="w-full rounded-xl bg-black" />
                                </div>
                            </div>
                        </div>
                    ) : null}

                {
                    editingTemplate && (
                        <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditingTemplate(null)
                        }>
                            <div className="bg-neutral-900 w-full max-w-3xl rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                                <div className="p-4 border-b border-neutral-800 flex justify-between items-center" >
                                    <h3 className="font-bold text-white" > Editar Treino </h3>
                                    < button onClick={() => setEditingTemplate(null)} className="px-3 py-1.5 hover:bg-neutral-800 rounded-full inline-flex items-center gap-2 text-neutral-300" > <ArrowLeft size={16} /><span className="text-xs font-bold">Voltar</span > </button>
                                </div>
                                < div className="p-4 max-h-[75vh] overflow-y-auto" >
                                    <AdminWorkoutEditor
                                        initialData={editingTemplate as unknown as Partial<AdminWorkout>}
                                        onSave={async (data: AdminWorkout) => {
                                            try {
                                                const res = await updateWorkout(String(editingTemplate.id || ''), data);
                                                const sync = (res as UnknownRecord)?.sync || null;
                                                const { data: refreshed } = await supabase
                                                    .from('workouts')
                                                    .select('*, exercises(*, sets(*))')
                                                    .or(`created_by.eq.${user.id},user_id.eq.${user.id}`)
                                                    .order('name');
                                                setTemplates(Array.isArray(refreshed) ? (refreshed as unknown as AdminWorkoutTemplate[]) : []);
                                                setEditingTemplate(null);
                                                if (sync) {
                                                    const syncObj: UnknownRecord | null = sync && typeof sync === 'object' ? (sync as UnknownRecord) : null;
                                                    const created = Number(syncObj?.created || 0);
                                                    const updated = Number(syncObj?.updated || 0);
                                                    const failed = Number(syncObj?.failed || 0);
                                                    const msg = syncObj?.error
                                                        ? `Treino salvo. Sincronização falhou: ${String(syncObj.error)}`
                                                        : `Treino salvo. Sincronizados: ${updated} atualizado(s), ${created} criado(s)${failed ? `, ${failed} falha(s)` : ''}.`;
                                                    await alert(msg, 'Sucesso');
                                                } else {
                                                    await alert('Treino salvo com sucesso!', 'Sucesso');
                                                }
                                            } catch (e: unknown) {
                                                const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
                                                await alert('Erro ao salvar: ' + msg);
                                            }
                                        }}
                                        onCancel={() => setEditingTemplate(null)}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                {
                    historyOpen && selectedStudent && (
                        <div className="fixed inset-0 z-[1500] bg-neutral-900 overflow-y-auto" >
                            <HistoryList
                                user={user}
                                settings={{}
                                }
                                vipLimits={{}}
                                onViewReport={() => { }}
                                onUpgrade={() => { }}
                                targetId={String(selectedStudent?.user_id || selectedStudent?.id || '')}
                                targetEmail={String(selectedStudent?.email || '')}
                                readOnly
                                title={`Histórico - ${String(selectedStudent?.name || selectedStudent?.email || 'Aluno')}`}
                                onBack={() => setHistoryOpen(false)}
                            />
                        </div>
                    )}

                {
                    editingStudentWorkout && (
                        <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditingStudentWorkout(null)
                        }>
                            <div className="bg-neutral-900 w-full max-w-3xl rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                                <div className="p-4 border-b border-neutral-800 flex justify-between items-center" >
                                    <h3 className="font-bold text-white" > Editar Treino do Aluno </h3>
                                    < button onClick={() => setEditingStudentWorkout(null)} className="px-3 py-1.5 hover:bg-neutral-800 rounded-full inline-flex items-center gap-2 text-neutral-300" > <ArrowLeft size={16} /><span className="text-xs font-bold">Voltar</span > </button>
                                </div>
                                < div className="p-4 max-h-[75vh] overflow-y-auto" >
                                    <AdminWorkoutEditor
                                        initialData={editingStudentWorkout as unknown as Partial<AdminWorkout>}
                                        onSave={async (data: AdminWorkout) => {
                                            try {
                                                const targetUserId = selectedStudent?.user_id ? String(selectedStudent.user_id) : '';
                                                if (!targetUserId) { await alert('Aluno sem conta (user_id).'); return; }
                                                if (editingStudentWorkout.id) {
                                                    await updateWorkout(String(editingStudentWorkout.id || ''), data);
                                                } else {
                                                    const { data: nw } = await supabase
                                                        .from('workouts')
                                                        .insert({ user_id: targetUserId, name: data.title || 'Novo Treino', notes: '', created_by: user.id, is_template: true })
                                                        .select()
                                                        .single();
                                                    const toInsert = (Array.isArray(data.exercises) ? data.exercises : []).map((e) => ({
                                                        workout_id: nw.id,
                                                        name: e.name || '',
                                                        sets: getSetsCount(e?.sets) || 4,
                                                        reps: e.reps ?? '10',
                                                        rpe: e.rpe ?? 8,
                                                        cadence: e.cadence || '2020',
                                                        rest_time: e.restTime ?? e.rest_time ?? 60,
                                                        method: e.method || 'Normal',
                                                        video_url: e.videoUrl || e.video_url || '',
                                                        notes: e.notes || ''
                                                    }));
                                                    if (toInsert.length) await supabase.from('exercises').insert(toInsert);
                                                }
                                                const { data: refreshed } = await supabase
                                                    .from('workouts')
                                                    .select('*, exercises(*, sets(*))')
                                                    .eq('user_id', targetUserId)
                                                    .eq('is_template', true)
                                                    .order('name');
                                                const list = refreshed || [];
                                                const synced = (list || []).filter(w => (String(w?.created_by || '') === String(user.id)) && (String(w?.user_id || '') === String(targetUserId)));
                                                const syncedIds = new Set((synced || []).map(w => w?.id).filter(Boolean));
                                                const others = (list || []).filter(w => !syncedIds.has(w?.id));
                                                setStudentWorkouts(others || []);
                                                setSyncedWorkouts(synced || []);
                                                setEditingStudentWorkout(null);
                                            } catch (e: unknown) {
                                                const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
                                                await alert('Erro ao salvar: ' + msg);
                                            }
                                        }}
                                        onCancel={() => setEditingStudentWorkout(null)}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                {
                    viewWorkout && (
                        <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setViewWorkout(null)
                        }>
                            <div className="bg-neutral-900 w-full max-w-3xl rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                                <div className="p-4 border-b border-neutral-800 flex justify-between items-center" >
                                    <h3 className="font-bold text-white" > Treino: {normalizeWorkoutTitle(String((viewWorkout as UnknownRecord)?.name ?? ''))} </h3>
                                    < button onClick={() => setViewWorkout(null)} className="px-3 py-1.5 hover:bg-neutral-800 rounded-full inline-flex items-center gap-2 text-neutral-300" > <ArrowLeft size={16} /><span className="text-xs font-bold">Voltar</span > </button>
                                </div>
                                < div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto" >
                                    <div className="space-y-2" >
                                        {(Array.isArray((viewWorkout as UnknownRecord)?.exercises) ? ((viewWorkout as UnknownRecord).exercises as UnknownRecord[]) : []).map((e: UnknownRecord, i: number) => (
                                            <div key={i} className="bg-neutral-800 p-3 rounded-lg border border-neutral-700" >
                                                <div className="font-bold text-white" > {String(e.name ?? '')}</div>
                                                < div className="text-xs text-neutral-400" > Sets {getSetsCount(e?.sets)} • Reps {String(e.reps ?? '-')} • RPE {String(e.rpe ?? '-')} • Rest {String(e.rest_time ?? e.restTime ?? '-')} s • Cad {String(e.cadence ?? '-')} </div>
                                                {e.notes ? <div className="text-xs text-neutral-300 mt-1" > {String(e.notes)} </div> : null}
                                            </div>
                                        ))}
                                    </div>
                                    < div className="flex gap-2" >
                                        <div className="relative" >
                                            <button onClick={() => setExportOpen(true)} className="px-4 py-2 bg-yellow-500 text-black font-bold rounded-lg inline-flex items-center gap-2" >
                                                <Download size={16} /> Salvar / Exportar
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                {
                    exportOpen && viewWorkout && (
                        <div className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setExportOpen(false)
                        }>
                            <div className="bg-neutral-900 w-full max-w-md rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                                <div className="p-4 border-b border-neutral-800 flex justify-between items-center" >
                                    <h3 className="font-bold text-white" > Como deseja salvar ? </h3>
                                    < button onClick={() => setExportOpen(false)} className="px-3 py-1.5 hover:bg-neutral-800 rounded-full inline-flex items-center gap-2 text-neutral-300" > <ArrowLeft size={16} /><span className="text-xs font-bold">Voltar</span > </button>
                                </div>
                                < div className="p-4 space-y-3" >
                                    <button onClick={handleExportPdf} className="w-full px-4 py-3 bg-yellow-500 text-black font-bold rounded-xl inline-flex items-center justify-center gap-2" >
                                        <FileText size={18} /> Baixar PDF
                                    </button>
                                    < button onClick={handleExportJson} className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold rounded-xl inline-flex items-center justify-center gap-2" >
                                        <Download size={18} /> Baixar JSON
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
            </div>

            {
                showRegisterModal && (
                    <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm" >
                        <div className="bg-neutral-900 p-6 rounded-2xl w-full max-w-sm border border-neutral-800 shadow-2xl" >
                            <h3 className="font-bold text-white text-xl mb-4 flex items-center gap-2" > <UserPlus size={24} className="text-yellow-500" /> Novo Aluno </h3>
                            < div className="space-y-3" >
                                <div>
                                    <label className="text-xs text-neutral-500 uppercase font-bold" > Nome Completo </label>
                                    < input value={newStudent.name} onChange={e => setNewStudent({ ...newStudent, name: e.target.value })
                                    } className="w-full bg-neutral-800 p-3 rounded-lg text-white border border-neutral-700 focus:border-yellow-500 outline-none" />
                                </div>
                                < div >
                                    <label className="text-xs text-neutral-500 uppercase font-bold" > Email </label>
                                    < input value={newStudent.email} onChange={e => setNewStudent({ ...newStudent, email: e.target.value })} className="w-full bg-neutral-800 p-3 rounded-lg text-white border border-neutral-700 focus:border-yellow-500 outline-none" />
                                </div>
                            </div>
                            < div className="flex gap-2 mt-6" >
                                <button onClick={() => setShowRegisterModal(false)} className="flex-1 p-3 bg-neutral-800 text-neutral-400 font-bold rounded-xl hover:bg-neutral-700" > Cancelar </button>
                                < button onClick={handleRegisterStudent} disabled={registering} className="flex-1 p-3 bg-yellow-500 text-black font-bold rounded-xl hover:bg-yellow-400 disabled:opacity-50" > {registering ? 'Cadastrando...' : 'CADASTRAR'} </button>
                            </div>
                        </div>
                    </div>
                )}

            {
                showTeacherModal && (
                    <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm" >
                        <div className="bg-neutral-900 p-6 rounded-2xl w-full max-w-sm border border-neutral-800 shadow-2xl" >
                            <h3 className="font-bold text-white text-xl mb-4 flex items-center gap-2" > <UserPlus size={24} className="text-yellow-500" /> Novo Professor </h3>
                            < div className="space-y-3" >
                                <div>
                                    <label className="text-xs text-neutral-500 uppercase font-bold" > Nome Completo </label>
                                    < input value={newTeacher.name} onChange={e => setNewTeacher({ ...newTeacher, name: e.target.value })
                                    } className="w-full bg-neutral-800 p-3 rounded-lg text-white border border-neutral-700 focus:border-yellow-500 outline-none" />
                                </div>
                                < div >
                                    <label className="text-xs text-neutral-500 uppercase font-bold" > Email </label>
                                    < input value={newTeacher.email} onChange={e => setNewTeacher({ ...newTeacher, email: e.target.value })} className="w-full bg-neutral-800 p-3 rounded-lg text-white border border-neutral-700 focus:border-yellow-500 outline-none" />
                                </div>
                                < div >
                                    <label className="text-xs text-neutral-500 uppercase font-bold" > WhatsApp / Telefone </label>
                                    < input value={newTeacher.phone} onChange={e => setNewTeacher({ ...newTeacher, phone: e.target.value })} className="w-full bg-neutral-800 p-3 rounded-lg text-white border border-neutral-700 focus:border-yellow-500 outline-none" />
                                </div>
                            </div>
                            < div className="flex gap-2 mt-6" >
                                <button onClick={() => setShowTeacherModal(false)} className="flex-1 p-3 bg-neutral-800 text-neutral-400 font-bold rounded-xl hover:bg-neutral-700" > Cancelar </button>
                                < button onClick={handleAddTeacher} disabled={addingTeacher} className="flex-1 p-3 bg-yellow-500 text-black font-bold rounded-xl hover:bg-yellow-400 disabled:opacity-50" > {addingTeacher ? 'Salvando...' : 'ADICIONAR'} </button>
                            </div>
                        </div>
                    </div>
                )}

            {
                editingTeacher && (
                    <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm" >
                        <div className="bg-neutral-900 p-6 rounded-2xl w-full max-w-sm border border-neutral-800 shadow-2xl" >
                            <h3 className="font-bold text-white text-xl mb-4 flex items-center gap-2" > <Edit3 size={24} className="text-yellow-500" /> Editar Professor </h3>
                            < div className="space-y-3" >
                                <div>
                                    <label className="text-xs text-neutral-500 uppercase font-bold" > Nome Completo </label>
                                    < input value={String(editingTeacher.name ?? '')} onChange={e => setEditingTeacher({ ...editingTeacher, name: e.target.value })
                                    } className="w-full bg-neutral-800 p-3 rounded-lg text-white border border-neutral-700 focus:border-yellow-500 outline-none" />
                                </div>
                                < div >
                                    <label className="text-xs text-neutral-500 uppercase font-bold" > Email </label>
                                    < input value={String(editingTeacher.email ?? '')} onChange={e => setEditingTeacher({ ...editingTeacher, email: e.target.value })} className="w-full bg-neutral-800 p-3 rounded-lg text-white border border-neutral-700 focus:border-yellow-500 outline-none" />
                                </div>
                                < div >
                                    <label className="text-xs text-neutral-500 uppercase font-bold" > WhatsApp / Telefone </label>
                                    < input value={String(editingTeacher.phone ?? '')} onChange={e => setEditingTeacher({ ...editingTeacher, phone: e.target.value })} className="w-full bg-neutral-800 p-3 rounded-lg text-white border border-neutral-700 focus:border-yellow-500 outline-none" />
                                </div>
                                < div >
                                    <label className="text-xs text-neutral-500 uppercase font-bold" > Data de Nascimento </label>
                                    < input type="date" value={String(editingTeacher.birth_date ?? '')} onChange={e => setEditingTeacher({ ...editingTeacher, birth_date: e.target.value })} className="w-full bg-neutral-800 p-3 rounded-lg text-white border border-neutral-700 focus:border-yellow-500 outline-none" />
                                </div>
                            </div>
                            < div className="flex gap-2 mt-6" >
                                <button onClick={() => setEditingTeacher(null)} className="flex-1 p-3 bg-neutral-800 text-neutral-400 font-bold rounded-xl hover:bg-neutral-700" > Cancelar </button>
                                < button onClick={handleUpdateTeacher} className="flex-1 p-3 bg-yellow-500 text-black font-bold rounded-xl hover:bg-yellow-400" > SALVAR </button>
                            </div>
                        </div>
                    </div>
                )}
        </div>
        </AdminPanelProvider>
    );
};

export default AdminPanelV2;

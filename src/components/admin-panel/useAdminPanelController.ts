import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
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

type UnknownRecord = Record<string, unknown>;

const COACH_INBOX_INACTIVE_THRESHOLD_DAYS = 7;
const COACH_INBOX_DEFAULTS = {
    churnDays: 7,
    volumeDropPct: 30,
    loadSpikePct: 60,
    minPrev7Volume: 500,
    minCurrent7VolumeSpike: 800,
    snoozeDefaultMinutes: 1440,
};

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

    // Tabs
    const [tab, setTab] = useState<string>('dashboard');
    const [subTab, setSubTab] = useState<string>('workouts');

    // Data
    const [usersList, setUsersList] = useState<AdminUser[]>([]);
    const [teachersList, setTeachersList] = useState<AdminTeacher[]>([]);
    const [templates, setTemplates] = useState<AdminWorkoutTemplate[]>([]);
    const [templatesUserId, setTemplatesUserId] = useState<string>('');
    const [myWorkoutsCount, setMyWorkoutsCount] = useState<number>(0);

    // Selected Items
    const [selectedTeacher, setSelectedTeacher] = useState<AdminTeacher | null>(null);
    const [selectedStudent, setSelectedStudent] = useState<AdminUser | null>(null);
    const [teacherDetailTab, setTeacherDetailTab] = useState<string>('students');

    // Teacher Details
    const [teacherStudents, setTeacherStudents] = useState<AdminUser[]>([]);
    const [teacherStudentsLoading, setTeacherStudentsLoading] = useState<boolean>(false);
    const [teacherTemplatesRows, setTeacherTemplatesRows] = useState<AdminWorkoutTemplate[]>([]);
    const [teacherTemplatesLoading, setTeacherTemplatesLoading] = useState<boolean>(false);
    const [teacherTemplatesCursor, setTeacherTemplatesCursor] = useState<string | null>(null);
    const [teacherHistoryRows, setTeacherHistoryRows] = useState<UnknownRecord[]>([]);
    const [teacherHistoryLoading, setTeacherHistoryLoading] = useState<boolean>(false);
    const [teacherHistoryCursor, setTeacherHistoryCursor] = useState<{ cursor_date?: string; cursor_created_at?: string } | null>(null);
    const [teacherInboxItems, setTeacherInboxItems] = useState<AdminUser[]>([]);
    const [teacherInboxLoading, setTeacherInboxLoading] = useState<boolean>(false);

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

    // Filters
    const [studentQuery, setStudentQuery] = useState('');
    const [studentStatusFilter, setStudentStatusFilter] = useState('all');
    const [teacherQuery, setTeacherQuery] = useState('');
    const [teacherStatusFilter, setTeacherStatusFilter] = useState('all');
    const [templateQuery, setTemplateQuery] = useState('');

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
    const [prioritiesItems, setPrioritiesItems] = useState<UnknownRecord[]>([]);
    const [prioritiesLoading, setPrioritiesLoading] = useState<boolean>(false);
    const [prioritiesError, setPrioritiesError] = useState<string>('');
    const [prioritiesSettingsOpen, setPrioritiesSettingsOpen] = useState<boolean>(false);
    const [prioritiesSettings, setPrioritiesSettings] = useState(() => ({ ...COACH_INBOX_DEFAULTS }));
    const [prioritiesSettingsLoading, setPrioritiesSettingsLoading] = useState<boolean>(false);
    const [prioritiesSettingsError, setPrioritiesSettingsError] = useState<string>('');
    const prioritiesSettingsPrefRef = useRef<UnknownRecord | null>(null);
    const [prioritiesComposeOpen, setPrioritiesComposeOpen] = useState<boolean>(false);
    const [prioritiesComposeStudentId, setPrioritiesComposeStudentId] = useState<string>('');
    const [prioritiesComposeKind, setPrioritiesComposeKind] = useState<string>('');
    const [prioritiesComposeText, setPrioritiesComposeText] = useState<string>('');

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

    // User Activity
    const [userActivityQuery, setUserActivityQuery] = useState<string>('');
    const [userActivityRole, setUserActivityRole] = useState<string>('all');
    const [userActivityUsers, setUserActivityUsers] = useState<AdminUser[]>([]);
    const [userActivityLoading, setUserActivityLoading] = useState<boolean>(false);
    const [userActivityError, setUserActivityError] = useState<string>('');
    const [userActivitySelected, setUserActivitySelected] = useState<AdminUser | null>(null);
    const [userActivityDays, setUserActivityDays] = useState<number>(7);
    const [userActivitySummary, setUserActivitySummary] = useState<UnknownRecord | null>(null);
    const [userActivitySummaryLoading, setUserActivitySummaryLoading] = useState<boolean>(false);
    const [userActivityEvents, setUserActivityEvents] = useState<UnknownRecord[]>([]);
    const [userActivityEventsLoading, setUserActivityEventsLoading] = useState<boolean>(false);
    const [userActivityEventsBefore, setUserActivityEventsBefore] = useState<string | null>(null);
    const [userActivityErrors, setUserActivityErrors] = useState<UnknownRecord[]>([]);
    const [userActivityErrorsLoading, setUserActivityErrorsLoading] = useState<boolean>(false);
    const userActivityQueryDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // System
    const [systemExporting, setSystemExporting] = useState<boolean>(false);
    const [systemImporting, setSystemImporting] = useState<boolean>(false);
    const systemFileInputRef = useRef<HTMLInputElement | null>(null);

    // Debug / Diagnostic
    const [debugError, setDebugError] = useState<string | null>(null);

    // Loading State (Global)
    const [loading, setLoading] = useState<boolean>(false);

    useEffect(() => {
        if (unauthorized) onClose && onClose();
    }, [unauthorized, onClose]);

    // Initial Load
    useEffect(() => {
        const loadInitial = async () => {
            if (!isAdmin && !isTeacher) return;
            try {
                const authHeaders = await getAdminAuthHeaders();
                // Load users
                const resUsers = await fetch('/api/admin/students/list', { headers: authHeaders });
                const jsonUsers = await resUsers.json();
                if (jsonUsers.ok) setUsersList(jsonUsers.students || []);

                // Load teachers
                if (isAdmin) {
                    const resTeachers = await fetch('/api/admin/teachers/list', { headers: authHeaders });
                    const jsonTeachers = await resTeachers.json();
                    if (jsonTeachers.ok) setTeachersList(jsonTeachers.teachers || []);
                }
            } catch (e) {
                logError('error', 'Initial load error', e);
            }
        };
        loadInitial();
    }, [isAdmin, isTeacher, getAdminAuthHeaders]);

    // --- Helpers ---
    const normalizeText = useCallback((value: unknown) => String(value || '').toLowerCase(), []);

    const statusMatches = useCallback((rowStatus: unknown, selected: unknown) => {
        if (!selected || selected === 'all') return true;
        return normalizeText(rowStatus) === normalizeText(selected);
    }, [normalizeText]);

    const studentMatchesQuery = useCallback((s: AdminUser) => {
        const q = normalizeText(studentQuery).trim();
        if (!q) return true;
        return normalizeText(s?.name).includes(q) || normalizeText(s?.email).includes(q);
    }, [normalizeText, studentQuery]);

    const teacherMatchesQuery = useCallback((t: AdminTeacher) => {
        const q = normalizeText(teacherQuery).trim();
        if (!q) return true;
        return normalizeText(t?.name).includes(q) || normalizeText(t?.email).includes(q);
    }, [normalizeText, teacherQuery]);

    const templateMatchesQuery = useCallback((t: AdminWorkoutTemplate) => {
        const q = normalizeText(templateQuery).trim();
        if (!q) return true;
        return normalizeText(t?.title).includes(q);
    }, [normalizeText, templateQuery]);

    // --- Derived State ---
    const studentStatusStats = useMemo(() => {
        const list = Array.isArray(usersList) ? usersList : [];
        const stats = { pago: 0, pendente: 0, atrasado: 0, cancelar: 0, outros: 0 };
        for (const s of list) {
            try {
                const rawStatus = s && typeof s === 'object' ? s.status : null;
                const key = String(rawStatus || 'pendente').toLowerCase().trim();
                if (Object.prototype.hasOwnProperty.call(stats, key)) {
                    (stats as Record<string, number>)[key] += 1;
                } else {
                    stats.outros += 1;
                }
            } catch { }
        }
        return stats;
    }, [usersList]);

    const totalStudents = Array.isArray(usersList) ? usersList.length : 0;
    const studentsWithTeacher = Array.isArray(usersList) ? usersList.filter(s => !!s.teacher_id).length : 0;
    const studentsWithoutTeacher = Array.isArray(usersList) ? usersList.filter(s => !s.teacher_id).length : 0;
    const totalTeachers = Array.isArray(teachersList) ? teachersList.length : 0;

    const dashboardCharts = useMemo(() => {
        const baseTotalStudents = typeof totalStudents === 'number' && Number.isFinite(totalStudents) && totalStudents > 0 ? totalStudents : 0;
        const baseWith = typeof studentsWithTeacher === 'number' && Number.isFinite(studentsWithTeacher) && studentsWithTeacher > 0 ? studentsWithTeacher : 0;
        const baseWithout = typeof studentsWithoutTeacher === 'number' && Number.isFinite(studentsWithoutTeacher) && studentsWithoutTeacher > 0 ? studentsWithoutTeacher : 0;

        const teacherData = {
            labels: ['Com professor', 'Sem professor'],
            datasets: [
                {
                    label: 'Alunos',
                    data: [baseWith, baseWithout],
                    backgroundColor: ['rgba(250, 204, 21, 0.9)', 'rgba(82, 82, 82, 0.9)'],
                    borderRadius: 999,
                    maxBarThickness: 40
                }
            ]
        };

        const totalStatus =
            studentStatusStats.pago +
            studentStatusStats.pendente +
            studentStatusStats.atrasado +
            studentStatusStats.cancelar +
            studentStatusStats.outros;

        const statusValues =
            totalStatus > 0
                ? [
                    studentStatusStats.pago,
                    studentStatusStats.pendente,
                    studentStatusStats.atrasado,
                    studentStatusStats.cancelar,
                    studentStatusStats.outros
                ]
                : [0, 0, 0, 0, 0];

        const statusData = {
            labels: ['Pago', 'Pendente', 'Atrasado', 'Cancelar', 'Outros'],
            datasets: [
                {
                    label: 'Alunos',
                    data: statusValues,
                    backgroundColor: [
                        'rgba(34, 197, 94, 0.9)',
                        'rgba(234, 179, 8, 0.9)',
                        'rgba(248, 113, 113, 0.9)',
                        'rgba(148, 163, 184, 0.9)',
                        'rgba(82, 82, 82, 0.9)'
                    ],
                    borderRadius: 12,
                    maxBarThickness: 32
                }
            ]
        };

        return {
            teacherDistribution: {
                data: teacherData
            },
            statusDistribution: {
                data: statusData
            },
            statusTotal: totalStatus,
            totalStudents: baseTotalStudents
        };
    }, [totalStudents, studentsWithTeacher, studentsWithoutTeacher, studentStatusStats]);

    const coachInboxItems = useMemo<UnknownRecord[]>(() => {
        if (!isTeacher) return [];
        const list = Array.isArray(usersList) ? usersList : [];
        const today = new Date();
        const todayMs = today.getTime();
        if (!Number.isFinite(todayMs)) return [];

        const safeDays = (value: unknown) => {
            const n = Number(value);
            if (!Number.isFinite(n) || n < 0) return 0;
            return n;
        };

        const items = list
            .filter((s) => s && typeof s === 'object' && s.teacher_id === user?.id)
            .map((s) => {
                const workouts = Array.isArray(s.workouts) ? s.workouts : [];
                const nonTemplate = workouts.filter((w) => w && typeof w === 'object' && w.is_template !== true);

                if (!nonTemplate.length) {
                    return {
                        id: s.id,
                        name: s.name || s.email || '',
                        email: s.email || '',
                        status: s.status || 'pendente',
                        hasWorkouts: false,
                        daysSinceLastWorkout: null,
                    };
                }

                let lastWorkoutMs = 0;
                nonTemplate.forEach((w) => {
                    try {
                        const raw: unknown = (w as Record<string, unknown>).date || (w as Record<string, unknown>).completed_at || (w as Record<string, unknown>).created_at;
                        if (!raw) return;
                        const rawR = raw as { toDate?: () => Date } | string | number | null; const d = rawR && typeof rawR === 'object' && 'toDate' in rawR && typeof rawR.toDate === 'function' ? rawR.toDate() : new Date(raw as string | number);
                        const t = d?.getTime ? d.getTime() : NaN;
                        if (!Number.isFinite(t)) return;
                        if (t > lastWorkoutMs) lastWorkoutMs = t;
                    } catch { }
                });

                if (!lastWorkoutMs) {
                    return {
                        id: s.id,
                        name: s.name || s.email || '',
                        email: s.email || '',
                        status: s.status || 'pendente',
                        hasWorkouts: false,
                        daysSinceLastWorkout: null,
                    };
                }

                const diffMs = todayMs - lastWorkoutMs;
                const days = diffMs > 0 ? Math.floor(diffMs / (1000 * 60 * 60 * 24)) : 0;

                return {
                    id: s.id,
                    name: s.name || s.email || '',
                    email: s.email || '',
                    status: s.status || 'pendente',
                    hasWorkouts: true,
                    daysSinceLastWorkout: days,
                };
            })
            .filter((item) => item && typeof item === 'object')
            .filter((item) => {
                if (!item.hasWorkouts) return true;
                const days = safeDays(item.daysSinceLastWorkout);
                return days >= COACH_INBOX_INACTIVE_THRESHOLD_DAYS;
            });

        items.sort((a, b) => {
            const aDays = a.hasWorkouts ? safeDays(a.daysSinceLastWorkout) : Number.MAX_SAFE_INTEGER;
            const bDays = b.hasWorkouts ? safeDays(b.daysSinceLastWorkout) : Number.MAX_SAFE_INTEGER;
            return bDays - aDays;
        });

        return items.slice(0, 5);
    }, [isTeacher, usersList, user?.id]);

    const studentsWithTeacherFiltered = useMemo<AdminUser[]>(() => {
        const list = Array.isArray(usersList) ? usersList : [];
        return list
            .filter((s) => !!s?.teacher_id)
            .filter(studentMatchesQuery)
            .filter((s) => statusMatches(s?.status || 'pendente', studentStatusFilter));
    }, [studentStatusFilter, studentMatchesQuery, statusMatches, usersList]);

    const studentsWithoutTeacherFiltered = useMemo<AdminUser[]>(() => {
        const list = Array.isArray(usersList) ? usersList : [];
        return list
            .filter((s) => !s?.teacher_id)
            .filter(studentMatchesQuery)
            .filter((s) => statusMatches(s?.status || 'pendente', studentStatusFilter));
    }, [studentStatusFilter, studentMatchesQuery, statusMatches, usersList]);

    const teachersFiltered = useMemo<AdminTeacher[]>(() => {
        const list = Array.isArray(teachersList) ? teachersList : [];
        return list
            .filter(teacherMatchesQuery)
            .filter((t) => statusMatches(t?.status || 'pendente', teacherStatusFilter));
    }, [statusMatches, teacherMatchesQuery, teacherStatusFilter, teachersList]);

    const templatesFiltered = useMemo<AdminWorkoutTemplate[]>(() => {
        const list = Array.isArray(templates) ? templates : [];
        return list.filter(templateMatchesQuery);
    }, [templateMatchesQuery, templates]);

    // --- Actions ---
    const handleRegisterStudent = async () => {
        if (!newStudent.name || !newStudent.email) return await alert('Preencha nome e email.');
        setRegistering(true);
        try {
            const { data, error } = await supabase
                .from('students')
                .insert({ name: newStudent.name, email: newStudent.email, teacher_id: user.id })
                .select();
            if (error) throw error;
            setUsersList(prev => (data?.[0] ? [data[0], ...prev] : prev));
            setShowRegisterModal(false);
            setNewStudent({ name: '', email: '' });
            await alert('Aluno cadastrado com sucesso!', 'Sucesso');
        } catch (e: unknown) {
            const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
            await alert('Erro ao cadastrar: ' + msg);
        } finally {
            setRegistering(false);
        }
    };

    const handleAddTeacher = async () => {
        if (!newTeacher.name || !newTeacher.email) return await alert('Preencha nome e email.');
        setAddingTeacher(true);
        try {
            const res = await addTeacher(newTeacher.name, newTeacher.email, newTeacher.phone, newTeacher.birth_date);
            if (res.error) throw new Error(String(res.error));

            await alert('Professor adicionado com sucesso!');
            setShowTeacherModal(false);
            setNewTeacher({ name: '', email: '', phone: '', birth_date: '' });
            // Refresh logic should be handled by refetching or optimistic update
            // For now, simple reload triggers via state change could be implemented or manual refetch
        } catch (e: unknown) {
            const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
            await alert('Erro ao adicionar professor: ' + msg);
        } finally {
            setAddingTeacher(false);
        }
    };

    const handleUpdateTeacher = async () => {
        if (!editingTeacher || !editingTeacher.name || !editingTeacher.email) return await alert('Preencha nome e email.');
        try {
            const res = await updateTeacher(editingTeacher.id, {
                name: editingTeacher.name,
                email: editingTeacher.email,
                phone: editingTeacher.phone,
                birth_date: editingTeacher.birth_date
            });
            if (res.error) throw new Error(String(res.error));
            await alert('Professor atualizado com sucesso!');
            setEditingTeacher(null);
        } catch (e: unknown) {
            const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
            await alert('Erro ao atualizar professor: ' + msg);
        }
    };

    const handleSendBroadcast = async () => {
        if (!broadcastTitle || !broadcastMsg) return await alert('Preencha título e mensagem.');
        setSendingBroadcast(true);
        try {
            const res = await sendBroadcastMessage(broadcastTitle, broadcastMsg);
            if (res.error) throw new Error(String(res.error));
            await alert('Aviso enviado!', 'Sucesso');
            setBroadcastTitle('');
            setBroadcastMsg('');
        } catch (e: unknown) {
            const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
            await alert('Erro ao enviar: ' + msg);
        } finally {
            setSendingBroadcast(false);
        }
    };

    const handleUpdateStudentTeacher = async (studentId: string, teacherId: string | null) => {
        try {
            const { error } = await supabase
                .from('students')
                .update({ teacher_id: teacherId })
                .eq('id', studentId);
            if (error) throw error;

            setUsersList((prev) =>
                prev.map((u) => (u.id === studentId ? { ...u, teacher_id: teacherId } : u))
            );
        } catch (e: unknown) {
            const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
            await alert('Erro ao atualizar professor: ' + msg);
        }
    };

    const handleToggleStudentStatus = async (student: AdminUser) => {
        const newStatus = student.status === 'pago' ? 'pendente' : 'pago';
        if (!(await confirm(`Mudar status de ${student.name} para ${newStatus}?`))) return;
        try {
            const { error } = await supabase
                .from('students')
                .update({ status: newStatus })
                .eq('id', student.id);
            if (error) throw error;
            setUsersList((prev) =>
                prev.map((u) => (u.id === student.id ? { ...u, status: newStatus } : u))
            );
        } catch (e: unknown) {
            const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
            await alert('Erro ao atualizar status: ' + msg);
        }
    };

    const handleDeleteStudent = async (studentId: string) => {
        if (!(await confirm('Tem certeza que deseja excluir este aluno? Essa ação é irreversível.'))) return;
        try {
            const { error } = await supabase.from('students').delete().eq('id', studentId);
            if (error) throw error;
            setUsersList((prev) => prev.filter((u) => u.id !== studentId));
            await alert('Aluno excluído com sucesso!');
        } catch (e: unknown) {
            const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
            await alert('Erro ao excluir: ' + msg);
        }
    };

    // ── Teacher detail loaders ─────────────────────────────────────────────────

    const loadTeacherStudents = useCallback(async (teacher: UnknownRecord) => {
        const uid = String(teacher?.user_id || '').trim();
        if (!uid) { setTeacherStudents([]); return; }
        setTeacherStudentsLoading(true);
        try {
            const authHeaders = await getAdminAuthHeaders();
            const res = await fetch(`/api/admin/teachers/students?teacher_user_id=${encodeURIComponent(uid)}`, { headers: authHeaders });
            const json = await res.json().catch(() => ({}));
            if (!json?.ok) { setTeacherStudents([]); return; }
            setTeacherStudents(Array.isArray(json.students) ? json.students : []);
        } finally {
            setTeacherStudentsLoading(false);
        }
    }, [getAdminAuthHeaders]);

    const loadTeacherTemplates = useCallback(async (teacher: UnknownRecord, reset: boolean = false) => {
        const uid = String(teacher?.user_id || '').trim();
        if (!uid) { setTeacherTemplatesRows([]); setTeacherTemplatesCursor(null); return; }
        if (reset) { setTeacherTemplatesRows([]); setTeacherTemplatesCursor(null); }
        setTeacherTemplatesLoading(true);
        try {
            const cursor = reset ? '' : String(teacherTemplatesCursor || '');
            const qs = new URLSearchParams({ teacher_user_id: uid, limit: '80' });
            if (cursor) qs.set('cursor', cursor);
            const authHeaders = await getAdminAuthHeaders();
            const res = await fetch(`/api/admin/teachers/workouts/templates?${qs.toString()}`, { headers: authHeaders });
            const json = await res.json().catch(() => ({}));
            if (!json?.ok) return;
            const rows = Array.isArray(json.rows) ? json.rows : [];
            setTeacherTemplatesRows((prev) => reset ? rows : [...(Array.isArray(prev) ? prev : []), ...rows]);
            setTeacherTemplatesCursor(json.next_cursor || null);
        } finally {
            setTeacherTemplatesLoading(false);
        }
    }, [teacherTemplatesCursor, getAdminAuthHeaders]);

    const loadTeacherHistory = useCallback(async (teacher: UnknownRecord, reset: boolean = false) => {
        const uid = String(teacher?.user_id || '').trim();
        if (!uid) { setTeacherHistoryRows([]); setTeacherHistoryCursor(null); return; }
        if (reset) { setTeacherHistoryRows([]); setTeacherHistoryCursor(null); }
        setTeacherHistoryLoading(true);
        try {
            const qs = new URLSearchParams({ teacher_user_id: uid, limit: '80' });
            const cur = reset ? null : teacherHistoryCursor;
            if (cur?.cursor_date) qs.set('cursor_date', String(cur.cursor_date));
            if (cur?.cursor_created_at) qs.set('cursor_created_at', String(cur.cursor_created_at));
            const authHeaders = await getAdminAuthHeaders();
            const res = await fetch(`/api/admin/teachers/workouts/history?${qs.toString()}`, { headers: authHeaders });
            const json = await res.json().catch(() => ({}));
            if (!json?.ok) return;
            const rows = Array.isArray(json.rows) ? json.rows : [];
            setTeacherHistoryRows((prev) => reset ? rows : [...(Array.isArray(prev) ? prev : []), ...rows]);
            setTeacherHistoryCursor(json.next_cursor || null);
        } finally {
            setTeacherHistoryLoading(false);
        }
    }, [teacherHistoryCursor, getAdminAuthHeaders]);

    const loadTeacherInbox = useCallback(async (teacher: UnknownRecord) => {
        const uid = String(teacher?.user_id || '').trim();
        if (!uid) { setTeacherInboxItems([]); return; }
        setTeacherInboxLoading(true);
        try {
            const authHeaders = await getAdminAuthHeaders();
            const res = await fetch(`/api/admin/teachers/inbox?teacher_user_id=${encodeURIComponent(uid)}&limit=80`, { headers: authHeaders });
            const json = await res.json().catch(() => ({}));
            if (!json?.ok) { setTeacherInboxItems([]); return; }
            setTeacherInboxItems(Array.isArray(json.items) ? json.items : []);
        } finally {
            setTeacherInboxLoading(false);
        }
    }, [getAdminAuthHeaders]);

    useEffect(() => {
        if (!selectedTeacher || !isAdmin) return;
        setTeacherDetailTab('students');
        setTeacherTemplatesRows([]);
        setTeacherTemplatesCursor(null);
        setTeacherHistoryRows([]);
        setTeacherHistoryCursor(null);
        setTeacherInboxItems([]);
        loadTeacherStudents(selectedTeacher as unknown as UnknownRecord).catch(() => { });
    }, [isAdmin, loadTeacherStudents, selectedTeacher]);

    useEffect(() => {
        if (!selectedTeacher || !isAdmin) return;
        if (teacherDetailTab === 'templates' && teacherTemplatesRows.length === 0) loadTeacherTemplates(selectedTeacher as unknown as UnknownRecord, true).catch(() => { });
        if (teacherDetailTab === 'history' && teacherHistoryRows.length === 0) loadTeacherHistory(selectedTeacher as unknown as UnknownRecord, true).catch(() => { });
        if (teacherDetailTab === 'inbox' && teacherInboxItems.length === 0) loadTeacherInbox(selectedTeacher as unknown as UnknownRecord).catch(() => { });
    }, [isAdmin, loadTeacherHistory, loadTeacherInbox, loadTeacherTemplates, selectedTeacher, teacherDetailTab, teacherHistoryRows.length, teacherInboxItems.length, teacherTemplatesRows.length]);

    // ── Priorities ─────────────────────────────────────────────────────────────

    const fetchPriorities = useCallback(async () => {
        try {
            setPrioritiesLoading(true);
            setPrioritiesError('');
            const res = await fetch('/api/teacher/inbox/feed?limit=80', { cache: 'no-store', credentials: 'include' });
            const json = await res.json().catch((): null => null);
            if (!res.ok || !json?.ok) {
                setPrioritiesItems([]);
                setPrioritiesError(String(json?.error || `Falha ao carregar (${res.status})`));
                return;
            }
            setPrioritiesItems(Array.isArray(json.items) ? json.items : []);
        } catch (e: unknown) {
            setPrioritiesItems([]);
            const msg = getErrorMessage(e);
            setPrioritiesError(msg || 'Erro ao carregar');
        } finally {
            setPrioritiesLoading(false);
        }
    }, []);

    const normalizeCoachInboxSettings = useCallback((raw: unknown) => {
        const s: UnknownRecord = raw && typeof raw === 'object' ? (raw as UnknownRecord) : {};
        const toInt = (v: unknown, min: number, max: number, fallback: number) => {
            const n = Number(v);
            if (!Number.isFinite(n)) return fallback;
            const x = Math.floor(n);
            return Math.max(min, Math.min(max, x));
        };
        return {
            churnDays: toInt(s.churnDays, 1, 60, COACH_INBOX_DEFAULTS.churnDays),
            volumeDropPct: toInt(s.volumeDropPct, 5, 90, COACH_INBOX_DEFAULTS.volumeDropPct),
            loadSpikePct: toInt(s.loadSpikePct, 10, 300, COACH_INBOX_DEFAULTS.loadSpikePct),
            minPrev7Volume: toInt(s.minPrev7Volume, 0, 1000000, COACH_INBOX_DEFAULTS.minPrev7Volume),
            minCurrent7VolumeSpike: toInt(s.minCurrent7VolumeSpike, 0, 1000000, COACH_INBOX_DEFAULTS.minCurrent7VolumeSpike),
            snoozeDefaultMinutes: toInt(s.snoozeDefaultMinutes, 5, 10080, COACH_INBOX_DEFAULTS.snoozeDefaultMinutes),
        };
    }, []);

    const loadPrioritiesSettings = useCallback(async () => {
        try {
            setPrioritiesSettingsLoading(true);
            setPrioritiesSettingsError('');
            const uid = user?.id ? String(user.id) : '';
            if (!uid) return;
            const { data, error } = await supabase
                .from('user_settings')
                .select('preferences')
                .eq('user_id', uid)
                .maybeSingle();
            if (error) {
                const msg = String(getErrorMessage(error) || '');
                const code = String((error as unknown as Record<string, unknown>)?.code || '');
                const missing = code === '42P01' || /does not exist/i.test(msg) || /not found/i.test(msg);
                if (missing) {
                    prioritiesSettingsPrefRef.current = null;
                    setPrioritiesSettings({ ...COACH_INBOX_DEFAULTS });
                    setPrioritiesSettingsError('Tabela user_settings não disponível (migrations pendentes).');
                    return;
                }
                setPrioritiesSettingsError(msg || 'Falha ao carregar configurações.');
                return;
            }
            const prefs: UnknownRecord = data?.preferences && typeof data.preferences === 'object' ? (data.preferences as UnknownRecord) : {};
            prioritiesSettingsPrefRef.current = prefs;
            const next = normalizeCoachInboxSettings(prefs.coachInbox);
            setPrioritiesSettings(next);
        } catch (e: unknown) {
            const msg = getErrorMessage(e);
            setPrioritiesSettingsError(msg || 'Falha ao carregar configurações.');
        } finally {
            setPrioritiesSettingsLoading(false);
        }
    }, [normalizeCoachInboxSettings, supabase, user?.id]);

    const savePrioritiesSettings = useCallback(async () => {
        try {
            const uid = user?.id ? String(user.id) : '';
            if (!uid) return false;
            setPrioritiesSettingsLoading(true);
            setPrioritiesSettingsError('');
            const basePrefs = prioritiesSettingsPrefRef.current && typeof prioritiesSettingsPrefRef.current === 'object'
                ? prioritiesSettingsPrefRef.current
                : {};
            const payload = {
                user_id: uid,
                preferences: { ...basePrefs, coachInbox: normalizeCoachInboxSettings(prioritiesSettings) },
                updated_at: new Date().toISOString(),
            };
            const { error } = await supabase.from('user_settings').upsert(payload, { onConflict: 'user_id' });
            if (error) {
                setPrioritiesSettingsError(String(getErrorMessage(error) || 'Falha ao salvar.'));
                return false;
            }
            prioritiesSettingsPrefRef.current = payload.preferences;
            return true;
        } catch (e: unknown) {
            const msg = getErrorMessage(e);
            setPrioritiesSettingsError(msg || 'Falha ao salvar.');
            return false;
        } finally {
            setPrioritiesSettingsLoading(false);
        }
    }, [normalizeCoachInboxSettings, prioritiesSettings, supabase, user?.id]);

    useEffect(() => {
        if (tab !== 'priorities') return;
        fetchPriorities();
    }, [tab, fetchPriorities]);

    // ── User Activity ──────────────────────────────────────────────────────────

    const loadUserActivityUsers = useCallback(async ({ q, role }: { q?: unknown; role?: unknown } = {}) => {
        if (!isAdmin) return;
        setUserActivityLoading(true);
        setUserActivityError('');
        try {
            const qs = new URLSearchParams();
            const qq = String(q ?? '').trim();
            const rr = String(role ?? '').trim();
            if (qq) qs.set('q', qq);
            if (rr && rr !== 'all') qs.set('role', rr);
            qs.set('limit', '200');
            const authHeaders = await getAdminAuthHeaders();
            const res = await fetch(`/api/admin/user-activity/users?${qs.toString()}`, { headers: authHeaders });
            const json = await res.json().catch((): null => null);
            if (!res.ok || !json?.ok) {
                setUserActivityUsers([]);
                setUserActivityError(String(json?.error || `Falha ao carregar usuários (${res.status})`));
                return;
            }
            setUserActivityUsers(Array.isArray(json?.users) ? json.users : []);
        } catch (e: unknown) {
            setUserActivityUsers([]);
            setUserActivityError(getErrorMessage(e) || String(e));
        } finally {
            setUserActivityLoading(false);
        }
    }, [isAdmin, getAdminAuthHeaders]);

    const loadUserActivitySummary = useCallback(async ({ userId, days }: { userId?: unknown; days?: unknown } = {}) => {
        if (!isAdmin) return;
        const uid = String(userId || '').trim();
        if (!uid) return;
        const d = Math.min(90, Math.max(1, Number(days) || 7));
        setUserActivitySummaryLoading(true);
        try {
            const qs = new URLSearchParams({ user_id: uid, days: String(d) });
            const authHeaders = await getAdminAuthHeaders();
            const res = await fetch(`/api/admin/user-activity/summary?${qs.toString()}`, { headers: authHeaders });
            const json = await res.json().catch((): null => null);
            if (!res.ok || !json?.ok) { setUserActivitySummary(null); return; }
            setUserActivitySummary(json);
        } catch {
            setUserActivitySummary(null);
        } finally {
            setUserActivitySummaryLoading(false);
        }
    }, [isAdmin, getAdminAuthHeaders]);

    const loadUserActivityEvents = useCallback(async ({ userId, before, reset = false }: { userId?: unknown; before?: unknown; reset?: boolean } = {}) => {
        if (!isAdmin) return;
        const uid = String(userId || '').trim();
        if (!uid) return;
        setUserActivityEventsLoading(true);
        try {
            const qs = new URLSearchParams({ user_id: uid, limit: '80' });
            if (before) qs.set('before', String(before));
            const authHeaders = await getAdminAuthHeaders();
            const res = await fetch(`/api/admin/user-activity/events?${qs.toString()}`, { headers: authHeaders });
            const json = await res.json().catch((): null => null);
            if (!res.ok || !json?.ok) { if (reset) setUserActivityEvents([]); return; }
            const list = Array.isArray(json?.events) ? json.events : [];
            setUserActivityEventsBefore(json?.nextBefore ?? null);
            setUserActivityEvents((prev) => (reset ? list : [...prev, ...list]));
        } catch {
            if (reset) setUserActivityEvents([]);
        } finally {
            setUserActivityEventsLoading(false);
        }
    }, [isAdmin, getAdminAuthHeaders]);

    const loadUserActivityErrors = useCallback(async ({ userId }: { userId?: unknown } = {}) => {
        if (!isAdmin) return;
        const uid = String(userId || '').trim();
        if (!uid) return;
        setUserActivityErrorsLoading(true);
        try {
            const { data, error } = await supabase
                .from('error_reports')
                .select('id, created_at, message, pathname, url, status, app_version, source')
                .eq('user_id', uid)
                .order('created_at', { ascending: false })
                .limit(10);
            if (error) { setUserActivityErrors([]); return; }
            setUserActivityErrors(Array.isArray(data) ? data : []);
        } catch {
            setUserActivityErrors([]);
        } finally {
            setUserActivityErrorsLoading(false);
        }
    }, [isAdmin, supabase]);

    const openUserActivityUser = useCallback(async (u: UnknownRecord) => {
        const id = String(u?.id || u?.userId || '').trim();
        if (!id) return;
        setUserActivitySelected(u as unknown as AdminUser);
        setUserActivityEvents([]);
        setUserActivityEventsBefore(null);
        setUserActivitySummary(null);
        setUserActivityErrors([]);
        try { await loadUserActivitySummary({ userId: id, days: userActivityDays }); } catch { }
        try { await loadUserActivityEvents({ userId: id, reset: true }); } catch { }
        try { await loadUserActivityErrors({ userId: id }); } catch { }
    }, [loadUserActivitySummary, loadUserActivityEvents, loadUserActivityErrors, userActivityDays]);

    useEffect(() => {
        if (!isAdmin) return;
        if (tab !== 'system') return;
        try { if (userActivityQueryDebounceRef.current) clearTimeout(userActivityQueryDebounceRef.current); } catch { }
        userActivityQueryDebounceRef.current = setTimeout(() => {
            loadUserActivityUsers({ q: userActivityQuery, role: userActivityRole });
        }, 400);
        return () => {
            try { if (userActivityQueryDebounceRef.current) clearTimeout(userActivityQueryDebounceRef.current); } catch { }
        };
    }, [isAdmin, tab, userActivityQuery, userActivityRole, loadUserActivityUsers]);

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

    const handleAddTemplateToStudent = useCallback(async (template: UnknownRecord) => {
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

    // ─── useEffects moved from AdminPanelV2 ────────────────────────────────────

    // testConnection
    useEffect(() => {
        const testConnection = async () => {
            try {
                if (!supabase) return;
                const { data, error } = await supabase.from('workouts').select('*').limit(1);
                if (error) {
                    logError('error', "ERRO CRÍTICO SUPABASE:", error);
                    setDebugError("Erro Supabase: " + error.message + " | Detalhes: " + JSON.stringify(error));
                } else {
                    void data; // connection OK
                }
            } catch (e: unknown) {
                logError('error', "ERRO DE CONEXÃO/FETCH:", e);
                const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
                setDebugError("Erro Catch: " + msg);
            }
        };
        testConnection();
    }, [supabase]);

    // fetchStudents
    useEffect(() => {
        const fetchStudents = async () => {
            setLoading(true);
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            if (!currentUser) { setLoading(false); return; }
            try {
                let list: UnknownRecord[] = [];
                if (isAdmin) {
                    await getAdminAuthHeaders();
                    const json = await adminFetchJson(supabase, '/api/admin/students/list') as UnknownRecord;
                    if (json?.ok) list = (json.students as UnknownRecord[]) || [];

                    const legacyJson = await adminFetchJson(supabase, '/api/admin/legacy-students') as UnknownRecord;
                    if (legacyJson?.ok && legacyJson.students) {
                        const existingIds = new Set(list.map((s: UnknownRecord) => s.user_id || s.id));
                        const newLegacy = ((legacyJson.students as unknown) as UnknownRecord[]).filter((s: UnknownRecord) => !existingIds.has(s.id));
                        list = [...list, ...newLegacy];
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
                        let teacherEmails = new Set<string>();
                        try {
                            const tJson = await adminFetchJson(supabase, '/api/admin/teachers/list') as UnknownRecord;
                            if (tJson?.ok) teacherEmails = new Set(((tJson.teachers as UnknownRecord[]) || []).map((t: UnknownRecord) => String(t.email || '').toLowerCase()));
                        } catch { }
                        list = (profiles || [])
                            .filter((p: UnknownRecord) => !p.email || !teacherEmails.has(String(p.email).toLowerCase()))
                            .map((p: UnknownRecord) => ({ id: p.id, name: p.display_name, email: p.email, teacher_id: null as string | null, user_id: p.id }));
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
                    const { data: tList } = await supabase.from('teachers').select('id, name, email, user_id');
                    const tEmails = new Set((tList || []).map((t: UnknownRecord) => String(t.email || '').toLowerCase()));
                    const filtered = (list || []).filter((s: UnknownRecord) => {
                        const email = String(s.email || '').toLowerCase();
                        if (email && tEmails.has(email)) return false;
                        return true;
                    });
                    try {
                        list = (filtered || []).map((s: UnknownRecord) => {
                            const key = 'student_teacher_' + (s.email || '');
                            let tid = null;
                            try { tid = localStorage.getItem(key) || null; } catch { }
                            return tid && !s.teacher_id ? { ...s, teacher_id: tid } : s;
                        });
                    } catch { list = filtered; }
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
                                    if (selectedStudent?.teacher_id && !enriched.some((t: UnknownRecord) => t.user_id === selectedStudent.teacher_id)) {
                                        const { data: curProfile } = await supabase
                                            .from('profiles')
                                            .select('id, display_name, email')
                                            .eq('id', selectedStudent.teacher_id)
                                            .maybeSingle();
                                        if (curProfile) enriched.unshift({ id: String(curProfile.id || ''), name: curProfile.display_name, email: curProfile.email, user_id: curProfile.id, status: 'active' } as unknown as UnknownRecord);
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

    // fetchTeachers
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
                    const seen = new Set<string>();
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

    // URL persistence
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const sp = new URLSearchParams(window.location.search);
        const t = sp.get('tab');
        if (t && ['dashboard', 'students', 'teachers', 'templates', 'videos', 'broadcast', 'system'].includes(t)) {
            setTab(t);
        }
    }, [setTab]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const sp = new URLSearchParams(window.location.search);
        if (sp.get('tab') !== tab) {
            sp.set('tab', tab);
            const url = `${window.location.pathname}?${sp.toString()}`;
            window.history.replaceState(null, '', url);
        }
        try {
            sessionStorage.setItem('irontracks_admin_panel_open', '1');
            sessionStorage.setItem('irontracks_admin_panel_tab', String(tab || 'dashboard'));
        } catch { }
    }, [tab]);

    // fetchTemplates
    useEffect(() => {
        if (tab !== 'templates') return;
        const fetchTemplates = async () => {
            try {
                const { data: { user: currentUser } } = await supabase.auth.getUser();
                if (!currentUser) return;
                let list: UnknownRecord[] = [];
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
                const score = (w: UnknownRecord) => {
                    const exs = Array.isArray(w.exercises) ? w.exercises : [];
                    return exs.length;
                };
                const byTitle = new Map<string, UnknownRecord>();
                for (const w of (list || [])) {
                    if (!w || !w.name) continue;
                    try {
                        const key = workoutTitleKey(w.name as string);
                        const prev = byTitle.get(key);
                        const curHasPrefix = /^[A-Z]\s-\s/.test(normalizeWorkoutTitle(w?.name as string || ''));
                        const prevHasPrefix = /^[A-Z]\s-\s/.test(normalizeWorkoutTitle(prev?.name as string || ''));
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
                    .map((w) => ({ ...w, name: normalizeWorkoutTitle(w?.name as string || '') }))
                    .sort((a, b) => (a.name as string || '').localeCompare(b.name as string || ''));
                setTemplates((deduped || []) as AdminWorkoutTemplate[]);
            } catch (err) {
                logError('error', "Critical error fetching templates", err);
            }
        };
        fetchTemplates();
    }, [tab, isAdmin, isTeacher, supabase, getAdminAuthHeaders, setTemplates]);

    // fetchMissing + fetchVideos
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

    // fetchErrors
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
        return () => { cancelled = true; };
    }, [tab, isAdmin, supabase, setErrorReports, setErrorsLoading]);

    // fetchAliases
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
        return () => { cancelled = true; };
    }, [tab, isAdmin, supabase, setExerciseAliasesError, setExerciseAliasesLoading, setExerciseAliasesReview]);

    // fetchDetails
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
                let wData: UnknownRecord[] = [];
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
            const { data: { user: me } } = await supabase.auth.getUser();
            if (me) {
                let my: UnknownRecord[] = [];
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
                const tMap = new Map<string, UnknownRecord>();
                for (const w of (my || [])) {
                    const key = workoutTitleKey(w.name as string);
                    const prev = tMap.get(key);
                    const exs = Array.isArray(w.exercises) ? w.exercises : [];
                    const prevExs = Array.isArray(prev?.exercises) ? prev.exercises : [];
                    const score = (x: unknown) => (Array.isArray(x) ? x.length : 0);
                    const curHasPrefix = /^[A-Z]\s-\s/.test(normalizeWorkoutTitle(w?.name as string || ''));
                    const prevHasPrefix = /^[A-Z]\s-\s/.test(normalizeWorkoutTitle(prev?.name as string || ''));
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
                    .map((w) => ({ ...w, name: normalizeWorkoutTitle(w?.name as string || '') }))
                    .sort((a, b) => (a.name as string || '').localeCompare(b.name as string || ''));
                setTemplates((dedupTemplates || []) as AdminWorkoutTemplate[]);
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
        
        // Actions
        handleRegisterStudent,
        handleAddTeacher,
        handleUpdateTeacher,
        handleSendBroadcast,
        handleUpdateStudentTeacher,
        handleToggleStudentStatus,
        handleDeleteStudent,
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
        handleDangerAction,
        runDangerAction,
    };
};

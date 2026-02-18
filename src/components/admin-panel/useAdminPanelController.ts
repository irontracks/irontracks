import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { AdminUser, AdminTeacher, ErrorReport, ExecutionVideo, AdminWorkoutTemplate } from '@/types/admin';
import { useStableSupabaseClient } from '@/hooks/useStableSupabaseClient';
import { useDialog } from '@/contexts/DialogContext';
import { sendBroadcastMessage, addTeacher, updateTeacher } from '@/actions/admin-actions';
import { workoutTitleKey, normalizeWorkoutTitle } from '@/utils/workoutTitle';

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
                console.error('Initial load error', e);
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
                        const raw: any = (w as any).date || (w as any).completed_at || w.created_at;
                        if (!raw) return;
                        const d = raw?.toDate ? raw.toDate() : new Date(raw);
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
        
        // Refs (if needed directly)
        supabase
    };
};

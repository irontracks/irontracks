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
import { sendBroadcastMessage, clearAllStudents, clearAllTeachers, clearAllWorkouts, deleteTeacher, updateTeacher, addTeacher, exportAllData, importAllData } from '@/actions/admin-actions';
import { updateWorkout, deleteWorkout } from '@/actions/workout-actions';
import AssessmentButton from '@/components/assessment/AssessmentButton';
import HistoryList from '@/components/HistoryList';
import { normalizeWorkoutTitle, workoutTitleKey } from '@/utils/workoutTitle';
import { normalizeExerciseName } from '@/utils/normalizeExerciseName';
import { adminFetchJson } from '@/utils/admin/adminFetch';

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
    const supabase = useStableSupabaseClient();
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

    // Permission Logic
    const isAdmin = user?.role === 'admin';
    const isTeacher = user?.role === 'teacher';
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

    const [tab, setTab] = useState<string>('dashboard');
    const [usersList, setUsersList] = useState<AdminUser[]>([]);
    const [teachersList, setTeachersList] = useState<AdminTeacher[]>([]);
    const [selectedTeacher, setSelectedTeacher] = useState<AdminTeacher | null>(null);
    const [teacherDetailTab, setTeacherDetailTab] = useState<string>('students');
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
    const [templates, setTemplates] = useState<AdminWorkoutTemplate[]>([]);
    const [templatesUserId, setTemplatesUserId] = useState<string>('');
    const [myWorkoutsCount, setMyWorkoutsCount] = useState<number>(0);
    const [selectedStudent, setSelectedStudent] = useState<AdminUser | null>(null);
    const [subTab, setSubTab] = useState<string>('workouts');
    const [studentWorkouts, setStudentWorkouts] = useState<UnknownRecord[]>([]);
    const [syncedWorkouts, setSyncedWorkouts] = useState<UnknownRecord[]>([]);
    const [assessments, setAssessments] = useState<UnknownRecord[]>([]);
    const [editingStudent, setEditingStudent] = useState<boolean>(false);
    const [editedStudent, setEditedStudent] = useState<{ name: string; email: string }>({ name: '', email: '' });
    const [editingTemplate, setEditingTemplate] = useState<AdminWorkoutTemplate | null>(null);
    const [editingStudentWorkout, setEditingStudentWorkout] = useState<UnknownRecord | null>(null);
    const [viewWorkout, setViewWorkout] = useState<UnknownRecord | null>(null);
    const [exportOpen, setExportOpen] = useState<boolean>(false);
    const [historyOpen, setHistoryOpen] = useState<boolean>(false);
    const [executionVideos, setExecutionVideos] = useState<ExecutionVideo[]>([]);
    const [executionVideosLoading, setExecutionVideosLoading] = useState<boolean>(false);
    const [executionVideosError, setExecutionVideosError] = useState<string>('');
    const [executionVideoModalOpen, setExecutionVideoModalOpen] = useState<boolean>(false);
    const [executionVideoModalUrl, setExecutionVideoModalUrl] = useState<string>('');
    const [executionVideoFeedbackDraft, setExecutionVideoFeedbackDraft] = useState<UnknownRecord>({});
    const [studentCheckinsRange, setStudentCheckinsRange] = useState<string>('7d');
    const [studentCheckinsFilter, setStudentCheckinsFilter] = useState<string>('all');
    const [studentCheckinsLoading, setStudentCheckinsLoading] = useState<boolean>(false);
    const [studentCheckinsError, setStudentCheckinsError] = useState<string>('');
    const [studentCheckinsRows, setStudentCheckinsRows] = useState<UnknownRecord[]>([]);
    const loadedStudentInfo = useRef<Set<string>>(new Set<string>());
    const [systemExporting, setSystemExporting] = useState<boolean>(false);
    const [systemImporting, setSystemImporting] = useState<boolean>(false);
    const systemFileInputRef = useRef<HTMLInputElement | null>(null);
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
    const [dangerOpen, setDangerOpen] = useState<boolean>(false);
    const [moreTabsOpen, setMoreTabsOpen] = useState<boolean>(false);
    const [dangerStudentsConfirm, setDangerStudentsConfirm] = useState<string>('');
    const [dangerTeachersConfirm, setDangerTeachersConfirm] = useState<string>('');
    const [dangerWorkoutsConfirm, setDangerWorkoutsConfirm] = useState<string>('');
    const [dangerActionLoading, setDangerActionLoading] = useState<string | null>(null);

    const [studentQuery, setStudentQuery] = useState('');
    const [studentStatusFilter, setStudentStatusFilter] = useState('all');
    const [teacherQuery, setTeacherQuery] = useState('');
    const [teacherStatusFilter, setTeacherStatusFilter] = useState('all');
    const [templateQuery, setTemplateQuery] = useState('');

    const [videoExerciseName, setVideoExerciseName] = useState<string>('');
    const [videoQueue, setVideoQueue] = useState<UnknownRecord[]>([]);
    const [videoLoading, setVideoLoading] = useState<boolean>(false);

    const [prioritiesItems, setPrioritiesItems] = useState<UnknownRecord[]>([]);
    const [prioritiesLoading, setPrioritiesLoading] = useState<boolean>(false);
    const [prioritiesError, setPrioritiesError] = useState<string>('');
    const [prioritiesSettingsOpen, setPrioritiesSettingsOpen] = useState<boolean>(false);
    const [prioritiesSettingsLoading, setPrioritiesSettingsLoading] = useState<boolean>(false);
    const [prioritiesSettingsError, setPrioritiesSettingsError] = useState<string>('');
    const [prioritiesSettings, setPrioritiesSettings] = useState(() => ({ ...COACH_INBOX_DEFAULTS }));
    const prioritiesSettingsPrefRef = useRef<UnknownRecord | null>(null);
    const [prioritiesComposeOpen, setPrioritiesComposeOpen] = useState<boolean>(false);
    const [prioritiesComposeStudentId, setPrioritiesComposeStudentId] = useState<string>('');
    const [prioritiesComposeKind, setPrioritiesComposeKind] = useState<string>('');
    const [prioritiesComposeText, setPrioritiesComposeText] = useState<string>('');
    const [videoBackfillLimit, setVideoBackfillLimit] = useState<string>('20');
    const [videoMissingCount, setVideoMissingCount] = useState<number | null>(null);
    const [videoMissingLoading, setVideoMissingLoading] = useState<boolean>(false);
    const [videoCycleRunning, setVideoCycleRunning] = useState<boolean>(false);
    const [videoCycleStats, setVideoCycleStats] = useState<{ processed: number; created: number; skipped: number }>({ processed: 0, created: 0, skipped: 0 });
    const videoCycleStopRef = useRef<boolean>(false);

    const [errorReports, setErrorReports] = useState<ErrorReport[]>([]);
    const [errorsLoading, setErrorsLoading] = useState<boolean>(false);
    const [errorsQuery, setErrorsQuery] = useState<string>('');
    const [errorsStatusFilter, setErrorsStatusFilter] = useState<string>('all');

    const [exerciseAliasesReview, setExerciseAliasesReview] = useState<UnknownRecord[]>([]);
    const [exerciseAliasesLoading, setExerciseAliasesLoading] = useState<boolean>(false);
    const [exerciseAliasesError, setExerciseAliasesError] = useState<string>('');
    const [exerciseAliasesBackfillLoading, setExerciseAliasesBackfillLoading] = useState<boolean>(false);
    const [exerciseAliasesNotice, setExerciseAliasesNotice] = useState<string>('');

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
    }, [moreTabsOpen]);

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
        return normalizeText(t?.title).includes(q); // Template uses title, not name
    }, [normalizeText, templateQuery]);

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
                        const raw = w.date || w.completed_at || w.created_at;
                        if (!raw) return;
                        const rawUnknown = raw as unknown;
                        const d = rawUnknown && typeof rawUnknown === 'object' && typeof (rawUnknown as { toDate?: unknown }).toDate === 'function'
                            ? (rawUnknown as { toDate: () => Date }).toDate()
                            : new Date(raw);
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

    useEffect(() => {
        if (!selectedStudent) setHistoryOpen(false);
    }, [selectedStudent]);

    useEffect(() => {
        if (selectedStudent) setSelectedTeacher(null);
    }, [selectedStudent]);

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
            const data = JSON.parse(text);
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

    const openEditWorkout = (e: React.MouseEvent, w: any) => {
        try {
            e?.stopPropagation?.();
        } catch { }
        setEditingStudentWorkout({
            id: w.id,
            title: w.name || w.title,
            exercises: (Array.isArray(w.exercises) ? w.exercises : []).map((ex: any) => ({
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
    const [loading, setLoading] = useState<boolean>(false);

    const [showRegisterModal, setShowRegisterModal] = useState<boolean>(false);
    const [newStudent, setNewStudent] = useState<{ name: string; email: string }>({ name: '', email: '' });
    const [registering, setRegistering] = useState<boolean>(false);

    const [broadcastMsg, setBroadcastMsg] = useState<string>('');
    const [broadcastTitle, setBroadcastTitle] = useState<string>('');
    const [sendingBroadcast, setSendingBroadcast] = useState<boolean>(false);

    const [showTeacherModal, setShowTeacherModal] = useState<boolean>(false);
    const [newTeacher, setNewTeacher] = useState<{ name: string; email: string; phone: string; birth_date: string }>({ name: '', email: '', phone: '', birth_date: '' });
    const [addingTeacher, setAddingTeacher] = useState<boolean>(false);
    const [editingTeacher, setEditingTeacher] = useState<UnknownRecord | null>(null);

    // DIAGNOSTIC MODE: Connection Test
    const [debugError, setDebugError] = useState<string | null>(null);

    useEffect(() => {
        const testConnection = async () => {
            try {
                // AÇÃO 2: Teste agressivo sem filtros
                if (!supabase) return;
                const { data, error } = await supabase.from('workouts').select('*').limit(1);

                if (error) {
                    console.error("ERRO CRÍTICO SUPABASE:", error);
                    setDebugError("Erro Supabase: " + error.message + " | Detalhes: " + JSON.stringify(error));
                } else if (!data || data.length === 0) {
                    // Se não retornar nada, pode ser RLS ou tabela vazia, mas a conexão funcionou
                    // setDebugError("Conexão OK, mas tabela vazia ou bloqueada por RLS.");
                    console.log("Conexão OK (tabela vazia ou RLS)");
                } else {
                    console.log("Conexão OK (dados encontrados)");
                }
            } catch (e: unknown) {
                console.error("ERRO DE CONEXÃO/FETCH:", e);
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
                    const json = await adminFetchJson(supabase, '/api/admin/students/list');
                    if (json?.ok) list = json.students || [];

                    const legacyJson = await adminFetchJson(supabase, '/api/admin/legacy-students');
                    if (legacyJson?.ok && legacyJson.students) {
                        const existingIds = new Set(list.map((s: UnknownRecord) => s.user_id || s.id));
                        const newLegacy = (legacyJson.students as UnknownRecord[]).filter((s: UnknownRecord) => !existingIds.has(s.id));
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
                            const tJson = await adminFetchJson(supabase, '/api/admin/teachers/list');
                            if (tJson?.ok) teacherEmails = new Set((tJson.teachers || []).map((t: UnknownRecord) => String(t.email || '').toLowerCase()));
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
                            jsonT = await adminFetchJson(supabase, '/api/admin/teachers/list');
                        } catch { }
                        if (jsonT?.ok) {
                            const base = jsonT.teachers || [];
                            try {
                                const emails = base.map((t: UnknownRecord) => t.email).filter(Boolean);
                                if (emails.length > 0) {
                                    const { data: profilesMap } = await supabase
                                        .from('profiles')
                                        .select('id, email')
                                        .in('email', emails);
                                    const idByEmail = new Map((profilesMap || []).map((p: UnknownRecord) => [String(p.email || ''), p.id]));
                                    const enriched = base.map((t: UnknownRecord) => ({ ...t, user_id: idByEmail.get(String(t.email || '')) || null }));
                                    // Ensure currently assigned teacher appears in dropdown
                                    if (selectedStudent?.teacher_id && !enriched.some((t: UnknownRecord) => t.user_id === selectedStudent.teacher_id)) {
                                        const { data: curProfile } = await supabase
                                            .from('profiles')
                                            .select('id, display_name, email')
                                            .eq('id', selectedStudent.teacher_id)
                                            .maybeSingle();
                                        if (curProfile) enriched.unshift({ id: curProfile.id, name: curProfile.display_name, email: curProfile.email, user_id: curProfile.id, status: 'active' })
                                    }
                                    setTeachersList(enriched);
                                } else {
                                    setTeachersList(base);
                                }
                            } catch { setTeachersList(base); }
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
    }, [registering, isAdmin, supabase, selectedStudent?.teacher_id, teachersList.length, getAdminAuthHeaders]);

    useEffect(() => {
        if (tab === 'teachers' && isAdmin) {
            const fetchTeachers = async () => {
                const authHeaders = await getAdminAuthHeaders();
                let json = null;
                try {
                    const res = await fetch('/api/admin/teachers/list', { headers: authHeaders });
                    const raw = await res.text();
                    json = raw ? JSON.parse(raw) : null;
                } catch { }
                if (json?.ok) {
                    const list = json.teachers || [];
                    const dedup: AdminTeacher[] = [];
                    const seen = new Set();
                    for (const t of list) {
                        const key = (t.email || '').toLowerCase();
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
    }, [tab, isAdmin, addingTeacher, editingTeacher, supabase, getAdminAuthHeaders]);

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
        loadTeacherStudents(selectedTeacher).catch(() => { });
    }, [isAdmin, loadTeacherStudents, selectedTeacher]);

    useEffect(() => {
        if (!selectedTeacher || !isAdmin) return;
        if (teacherDetailTab === 'templates' && teacherTemplatesRows.length === 0) loadTeacherTemplates(selectedTeacher, true).catch(() => { });
        if (teacherDetailTab === 'history' && teacherHistoryRows.length === 0) loadTeacherHistory(selectedTeacher, true).catch(() => { });
        if (teacherDetailTab === 'inbox' && teacherInboxItems.length === 0) loadTeacherInbox(selectedTeacher).catch(() => { });
    }, [isAdmin, loadTeacherHistory, loadTeacherInbox, loadTeacherTemplates, selectedTeacher, teacherDetailTab, teacherHistoryRows.length, teacherInboxItems.length, teacherTemplatesRows.length]);

    // URL Persistence for Tabs (Fixed)
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const sp = new URLSearchParams(window.location.search);
        const t = sp.get('tab');
        // Only restore if valid tab, otherwise default to dashboard
        if (t && ['dashboard', 'students', 'teachers', 'templates', 'videos', 'broadcast', 'system'].includes(t)) {
            setTab(t);
        }
    }, []);

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
                setTemplatesUserId(currentUser.id || '');
                let list = [];
                if (isAdmin || isTeacher) {
                    try {
                        const authHeaders = await getAdminAuthHeaders();
                        const res = await fetch('/api/admin/workouts/mine', { headers: authHeaders });
                        const json = await res.json();
                        if (json.ok) {
                            list = (json.rows || []).filter((w: UnknownRecord) => w?.is_template === true && w?.user_id === currentUser.id);
                        }
                    } catch (e) { console.error("API fetch error", e); }

                    if ((list || []).length === 0) {
                        try {
                            const { data } = await supabase
                                .from('workouts')
                                .select('*, exercises(*, sets(*))')
                                .eq('is_template', true)
                                .eq('user_id', currentUser.id)
                                .order('name');
                            list = (data || []).filter((w: UnknownRecord) => w?.is_template === true && w?.user_id === currentUser.id);
                        } catch (e) { console.error("Supabase fetch error", e); }
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
                    } catch (e) { console.error("Supabase fetch error", e); }
                }
                try {
                    const resLegacy = await fetch('/api/workouts/list');
                    const jsonLegacy = await resLegacy.json();
                    if (jsonLegacy.ok) {
                        const legacy = (jsonLegacy.rows || []).map((w: UnknownRecord) => ({ id: w.id || w.uuid, name: w.name, exercises: [] as any[] }));
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
                    } catch (e) { console.error("Error processing workout", w, e); }
                }
                const deduped = Array.from(byTitle.values())
                    .map((w) => ({ ...w, name: normalizeWorkoutTitle(w?.name || '') }))
                    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                setTemplates(deduped || []);
            } catch (err) {
                console.error("Critical error fetching templates", err);
            }
        };
        fetchTemplates();
    }, [tab, isAdmin, isTeacher, supabase, getAdminAuthHeaders]);

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
    }, [tab, isAdmin, supabase]);

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
    }, [tab, isAdmin, supabase]);

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
                    const msg = String(error?.message || '');
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
    }, [tab, isAdmin, supabase]);

    useEffect(() => {
        const fetchMyWorkoutsCount = async () => {
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            if (!currentUser) { setMyWorkoutsCount(0); return; }
            try {
                if (isAdmin) {
                    const authHeaders = await getAdminAuthHeaders();
                    const res = await fetch('/api/admin/workouts/mine', { headers: authHeaders });
                    const json = await res.json();
                    if (json.ok) {
                        const byTitle = new Map();
                        for (const w of (json.rows || [])) {
                            const key = workoutTitleKey(w.name);
                            if (!byTitle.has(key)) byTitle.set(key, w);
                        }
                        const count = byTitle.size;
                        if (count > 0) setMyWorkoutsCount(count);
                        else {
                            const { data } = await supabase
                                .from('workouts')
                                .select('id, name, is_template, created_by, user_id')
                                .or(`created_by.eq.${currentUser.id},user_id.eq.${currentUser.id},is_template.eq.true`)
                                .order('name');
                            const list = (data || []).filter(w => (w.is_template === true || w.created_by === currentUser.id || w.user_id === currentUser.id));
                            setMyWorkoutsCount(list.length);
                        }
                    } else {
                        const { data } = await supabase
                            .from('workouts')
                            .select('id, name, is_template, created_by, user_id')
                            .or(`created_by.eq.${currentUser.id},user_id.eq.${currentUser.id},is_template.eq.true`)
                            .order('name');
                        const list = (data || []).filter(w => (w.is_template === true || w.created_by === currentUser.id || w.user_id === currentUser.id));
                        setMyWorkoutsCount(list.length);
                    }
                } else {
                    const { data } = await supabase
                        .from('workouts')
                        .select('id, name, is_template, created_by, user_id')
                        .or(`created_by.eq.${currentUser.id},user_id.eq.${currentUser.id}`)
                        .order('name');
                    const list = (data || []).filter(w => (w.is_template === true || w.created_by === currentUser.id || w.user_id === currentUser.id));
                    setMyWorkoutsCount(list.length);
                }
            } catch {
                setMyWorkoutsCount(0);
            }
        };
        if (tab === 'dashboard') fetchMyWorkoutsCount();
    }, [tab, isAdmin, supabase, getAdminAuthHeaders]);

    const fetchPriorities = useCallback(async () => {
        try {
            setPrioritiesLoading(true);
            setPrioritiesError('');
            const res = await fetch('/api/teacher/inbox/feed?limit=80', { cache: 'no-store', credentials: 'include' });
            const json = await res.json().catch((): any => null);
            if (!res.ok || !json?.ok) {
                setPrioritiesItems([]);
                setPrioritiesError(String(json?.error || `Falha ao carregar (${res.status})`));
                return;
            }
            setPrioritiesItems(Array.isArray(json.items) ? json.items : []);
        } catch (e: unknown) {
            setPrioritiesItems([]);
            const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : '';
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
                const msg = String(error?.message || '');
                const code = String(error?.code || '');
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
            const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : '';
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
                setPrioritiesSettingsError(String(error?.message || 'Falha ao salvar.'));
                return false;
            }
            prioritiesSettingsPrefRef.current = payload.preferences;
            return true;
        } catch (e: unknown) {
            const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : '';
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
                        js = raw ? JSON.parse(raw) : null;
                    } catch { }
                    if (js?.ok) {
                        const row = (js.students || []).find((s: UnknownRecord) => (s.id === selectedStudent.id) || (s.user_id && s.user_id === (selectedStudent.user_id || targetUserId)) || (String(s.email || '').toLowerCase() === String(selectedStudent.email || '').toLowerCase()));
                        if (row) {
                            const nextTeacher = row.teacher_id || null;
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
                            const candidate = { id: r.id || r.uuid, name: normalizeWorkoutTitle(r.name), exercises: [] as any[] };
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
    }, [selectedStudent, supabase, user?.id, isAdmin, isTeacher, getAdminAuthHeaders]);

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
                const json = await res.json().catch((): any => null);
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
    }, [executionVideoEnabled, selectedStudent, subTab]);

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
    }, [selectedStudent, subTab, studentCheckinsFilter, studentCheckinsRange, supabase]);

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
    }, [selectedStudent, isAdmin, supabase, getAdminAuthHeaders]);

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
            const json = await res.json().catch((): any => null);
            if (!res.ok || !json?.ok) {
                setUserActivityUsers([]);
                setUserActivityError(String(json?.error || `Falha ao carregar usuários (${res.status})`));
                return;
            }
            setUserActivityUsers(Array.isArray(json?.users) ? json.users : []);
        } catch (e: unknown) {
            setUserActivityUsers([]);
            const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
            setUserActivityError(msg);
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
            const json = await res.json().catch((): any => null);
            if (!res.ok || !json?.ok) {
                setUserActivitySummary(null);
                return;
            }
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
            const json = await res.json().catch((): any => null);
            if (!res.ok || !json?.ok) {
                if (reset) setUserActivityEvents([]);
                return;
            }
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
            if (error) {
                setUserActivityErrors([]);
                return;
            }
            setUserActivityErrors(Array.isArray(data) ? data : []);
        } catch {
            setUserActivityErrors([]);
        } finally {
            setUserActivityErrorsLoading(false);
        }
    }, [isAdmin, supabase]);

    useEffect(() => {
        if (!isAdmin) return;
        if (tab !== 'system') return;
        try {
            if (userActivityQueryDebounceRef.current) clearTimeout(userActivityQueryDebounceRef.current);
        } catch { }
        userActivityQueryDebounceRef.current = setTimeout(() => {
            loadUserActivityUsers({ q: userActivityQuery, role: userActivityRole });
        }, 400);
        return () => {
            try {
                if (userActivityQueryDebounceRef.current) clearTimeout(userActivityQueryDebounceRef.current);
            } catch { }
        };
    }, [isAdmin, tab, userActivityQuery, userActivityRole, loadUserActivityUsers]);

    const openUserActivityUser = useCallback(async (u: UnknownRecord) => {
        const id = String(u?.id || u?.userId || '').trim();
        if (!id) return;
        setUserActivitySelected(u as unknown as AdminUser);
        setUserActivityEvents([]);
        setUserActivityEventsBefore(null);
        setUserActivitySummary(null);
        setUserActivityErrors([]);
        try {
            await loadUserActivitySummary({ userId: id, days: userActivityDays });
        } catch { }
        try {
            await loadUserActivityEvents({ userId: id, reset: true });
        } catch { }
        try {
            await loadUserActivityErrors({ userId: id });
        } catch { }
    }, [loadUserActivityErrors, loadUserActivityEvents, loadUserActivitySummary, userActivityDays]);

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

    const handleAddTeacher = async () => {
        if (!newTeacher.name || !newTeacher.email) return await alert('Preencha nome e email.');
        setAddingTeacher(true);
        try {
            const res = await addTeacher(newTeacher.name, newTeacher.email, newTeacher.phone, newTeacher.birth_date);
            if (res.error) throw new Error(String(res.error));

            await alert('Professor adicionado com sucesso!');
            setShowTeacherModal(false);
            setNewTeacher({ name: '', email: '', phone: '', birth_date: '' });
            // Trigger refresh (simple way)
            setTab('dashboard'); setTimeout(() => setTab('teachers'), 100);
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
            // Trigger refresh
            setTab('dashboard'); setTimeout(() => setTab('teachers'), 100);
        } catch (e: unknown) {
            const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
            await alert('Erro ao atualizar professor: ' + msg);
        }
    };

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

    const totalStudents = Array.isArray(usersList) ? usersList.length : 0;
    const studentsWithTeacher = Array.isArray(usersList) ? usersList.filter(s => !!s.teacher_id).length : 0;
    const studentsWithoutTeacher = Array.isArray(usersList) ? usersList.filter(s => !s.teacher_id).length : 0;
    const totalTeachers = Array.isArray(teachersList) ? teachersList.length : 0;

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

        const baseOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false,
                    labels: {
                        color: '#a3a3a3',
                        font: { size: 10, weight: 600 }
                    }
                },
                tooltip: {
                    enabled: true,
                    backgroundColor: 'rgba(10,10,10,0.9)',
                    borderColor: '#404040',
                    borderWidth: 1,
                    titleColor: '#fafafa',
                    bodyColor: '#e5e5e5',
                    padding: 8,
                    displayColors: false
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false,
                        drawBorder: false
                    },
                    ticks: {
                        color: '#a3a3a3',
                        font: { size: 10, weight: 600 }
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(64,64,64,0.6)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#737373',
                        font: { size: 9, weight: 500 },
                        precision: 0,
                        stepSize: 1
                    }
                }
            }
        };

        const teacherOptions = {
            ...baseOptions,
            onClick: () => {
                try {
                    setTab('students');
                    setSelectedStudent(null);
                } catch { }
            }
        };

        const statusOptions = {
            ...baseOptions,
            onClick: (evt: unknown, elements: unknown) => {
                try {
                    const list: unknown[] = Array.isArray(elements) ? elements : [];
                    if (list.length === 0) return;
                    const first = list[0] as UnknownRecord;
                    const index = typeof first?.index === 'number' ? first.index : null;
                    if (index == null || !Number.isFinite(index)) return;
                    const mapping = ['pago', 'pendente', 'atrasado', 'cancelar', 'outros'];
                    const key = mapping[index];
                    if (!key) return;
                    setStudentStatusFilter(key);
                    setTab('students');
                    setSelectedStudent(null);
                } catch { }
            }
        };

        return {
            teacherDistribution: {
                data: teacherData,
                options: teacherOptions
            },
            statusDistribution: {
                data: statusData,
                options: statusOptions
            },
            statusTotal: totalStatus,
            totalStudents: baseTotalStudents
        };
    }, [totalStudents, studentsWithTeacher, studentsWithoutTeacher, studentStatusStats, setStudentStatusFilter, setTab, setSelectedStudent]);

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
        <div data-tour="adminpanel.root" className="fixed inset-0 z-50 bg-neutral-950 text-white flex flex-col overflow-hidden" >
            <div className="sticky top-0 z-50 bg-neutral-950/90 backdrop-blur-xl border-b border-neutral-800 shadow-[0_16px_40px_rgba(0,0,0,0.55)] pt-safe flex-shrink-0" >
                {debugError && (
                    <div className="bg-red-600 text-white font-bold p-4 text-center text-xs break-all mb-2 rounded-xl" >
                        DIAGNOSTIC MODE: {debugError}
                    </div>
                )}
                <div className="px-4 md:px-8 py-2" >
                    <div className="w-full flex flex-col md:flex-row md:items-center md:justify-between gap-1 md:gap-4" >
                        <div className="flex items-center justify-between gap-3" >
                            <div className="flex items-center gap-3" >
                                <button
                                    type="button"
                                    onClick={() => { setSelectedStudent(null); setTab('dashboard'); }}
                                    className="flex items-center gap-3 cursor-pointer group active:scale-[0.99] transition-transform"
                                >
                                    <div className="w-10 h-10 rounded-2xl bg-yellow-500 flex items-center justify-center shadow-lg shadow-yellow-500/20 border border-yellow-400/40" >
                                        <Crown size={20} className="text-black" />
                                    </div>
                                    < div className="flex flex-col items-start" >
                                        <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-yellow-500/80" > IronTracks </span>
                                        <span className="text-sm md:text-base font-black text-white leading-tight" > Painel de Controle </span>
                                    </div>
                                </button>
                                < div className="hidden md:block text-[11px] uppercase tracking-widest text-neutral-500 font-bold" > Operações do seu negócio </div>
                            </div>
                            < button
                                onClick={() => onClose && onClose()}
                                className="md:hidden flex-shrink-0 w-10 h-10 rounded-full bg-neutral-900/70 hover:bg-neutral-800 text-neutral-300 hover:text-white flex items-center justify-center transition-all border border-neutral-800 active:scale-95"
                            >
                                <X size={18} className="font-bold" />
                            </button>
                        </div>

                        < div className="flex items-center gap-2 min-w-0 mt-1 md:mt-0" >
                            <div className="flex-1 min-w-0" >
                                <div data-tour="adminpanel.tabs" className="hidden md:flex items-center gap-2 justify-end flex-wrap" >
                                    {
                                        Object.entries(TAB_LABELS).map(([key, label]) => (
                                            <button
                                                key={key}
                                                onClick={() => { setTab(key); setSelectedStudent(null); setMoreTabsOpen(false); }}
                                                className={`min-h-[40px] px-3.5 md:px-4 py-2 rounded-full font-black text-[11px] uppercase tracking-wide whitespace-nowrap transition-all duration-300 border active:scale-95 ${tab === key
                                                    ? 'bg-yellow-500 text-black border-yellow-400 shadow-lg shadow-yellow-500/20'
                                                    : 'bg-neutral-900/70 text-neutral-200 border-neutral-800 hover:bg-neutral-900'
                                                    }`}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    <button
                                        onClick={() => onClose && onClose()}
                                        className="hidden md:inline-flex items-center justify-center w-10 h-10 rounded-full bg-neutral-900/70 hover:bg-neutral-800 text-neutral-300 hover:text-white transition-all border border-neutral-800 active:scale-95 ml-1"
                                    >
                                        <X size={18} className="font-bold" />
                                    </button>
                                </div>

                                < div className="md:hidden flex items-center gap-2" >
                                    <button
                                        type="button"
                                        data-tour="adminpanel.tabs"
                                        onClick={() => setMoreTabsOpen(true)}
                                        className="flex-1 min-h-[44px] px-4 rounded-2xl bg-neutral-900/80 border border-neutral-800 flex items-center justify-between gap-3 shadow-[0_10px_30px_rgba(0,0,0,0.35)] active:scale-95 transition-all duration-300"
                                    >
                                        <span className="text-[11px] font-black uppercase tracking-widest text-neutral-100 truncate" > {currentTabLabel} </span>
                                        < ChevronDown size={18} className="text-neutral-300" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {
                moreTabsOpen && (
                    <div
                        className="md:hidden fixed inset-0 z-[60]"
                        role="dialog"
                        aria-modal="true"
                        onClick={() => setMoreTabsOpen(false)
                        }
                    >
                        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
                        <div className="absolute inset-x-0 bottom-0 pb-safe" onClick={(e) => e.stopPropagation()}>
                            <div className="mx-auto w-full max-w-md rounded-t-3xl bg-neutral-950 border border-neutral-800 shadow-[0_-20px_60px_rgba(0,0,0,0.65)] overflow-hidden" >
                                <div className="px-4 pt-3 pb-2 border-b border-neutral-800 flex items-center justify-between gap-3" >
                                    <div className="min-w-0" >
                                        <div className="text-[11px] uppercase tracking-widest text-neutral-500 font-bold" > Mais </div>
                                        < div className="text-base font-black text-white" > Navegação </div>
                                    </div>
                                    < button
                                        type="button"
                                        onClick={() => setMoreTabsOpen(false)}
                                        className="w-10 h-10 rounded-full bg-neutral-900/70 border border-neutral-800 hover:bg-neutral-900 text-neutral-300 hover:text-white flex items-center justify-center transition-all duration-300 active:scale-95"
                                        aria-label="Fechar"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                                < div className="p-3 grid gap-2" >
                                    {(Array.isArray(tabKeys) ? tabKeys : []).map((key) => {
                                        const isActive = tab === key;
                                        const label = TAB_LABELS[key] || key;
                                        let subtitle = '';
                                        if (key === 'dashboard') subtitle = 'Visão geral do negócio';
                                        else if (key === 'students') subtitle = 'Gestão de alunos e status';
                                        else if (key === 'templates') subtitle = 'Biblioteca de treinos-base';
                                        else if (key === 'teachers') subtitle = 'Gestão de professores e convites';
                                        else if (key === 'videos') subtitle = 'Fila de vídeos por exercício';
                                        else if (key === 'priorities') subtitle = 'Triagem inteligente do coach';
                                        else if (key === 'errors') subtitle = 'Erros reportados pelos usuários';
                                        else if (key === 'system') subtitle = 'Backup, broadcasts e operações críticas';

                                        let iconColor = isActive ? 'text-yellow-400' : 'text-neutral-400';
                                        let badgeClass = isActive
                                            ? 'bg-yellow-500/15 border-yellow-500/40'
                                            : 'bg-neutral-900 border-neutral-800';

                                        if (key === 'system') {
                                            iconColor = isActive ? 'text-red-400' : 'text-red-300';
                                            badgeClass = isActive
                                                ? 'bg-red-900/60 border-red-500/60'
                                                : 'bg-red-950/70 border-red-700/70';
                                        }

                                        return (
                                            <button
                                                key={key}
                                                type="button"
                                                onClick={() => { setTab(key); setSelectedStudent(null); setMoreTabsOpen(false); }
                                                }
                                                className={`w-full min-h-[56px] px-4 rounded-2xl border flex items-center justify-between gap-3 transition-all duration-300 active:scale-[0.99] ${isActive
                                                    ? key === 'system'
                                                        ? 'bg-red-900/20 text-red-300 border-red-500/40 shadow-lg shadow-red-500/20'
                                                        : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30 shadow-lg shadow-yellow-500/10'
                                                    : key === 'system'
                                                        ? 'bg-neutral-900/80 text-red-300 border-red-800 hover:bg-neutral-900'
                                                        : 'bg-neutral-900/60 text-neutral-200 border-neutral-800 hover:bg-neutral-900'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-3 min-w-0" >
                                                    <div className={`w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0 border ${badgeClass}`}>
                                                        {key === 'dashboard' && <Crown size={16} className={iconColor} />}
                                                        {key === 'students' && <UserPlus size={16} className={iconColor} />}
                                                        {key === 'templates' && <Dumbbell size={16} className={iconColor} />}
                                                        {key === 'teachers' && <UserCog size={16} className={iconColor} />}
                                                        {key === 'videos' && <Play size={16} className={iconColor} />}
                                                        {key === 'priorities' && <AlertCircle size={16} className={iconColor} />}
                                                        {key === 'errors' && <AlertTriangle size={16} className={iconColor} />}
                                                        {key === 'system' && <ShieldAlert size={16} className={iconColor} />}
                                                    </div>
                                                    < div className="min-w-0 text-left" >
                                                        <div className="font-black text-[12px] uppercase tracking-widest truncate" > {label} </div>
                                                        {subtitle && (
                                                            <div className="text-[11px] text-neutral-400 truncate" >
                                                                {subtitle}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                < ChevronDown
                                                    size={16}
                                                    className={`transition-transform text-neutral-500 ${isActive ? 'rotate-90' : '-rotate-90'}`}
                                                />
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

            <div className="flex-1 min-h-0 overflow-y-auto p-4 pb-20 pb-safe" >
                {tab === 'dashboard' && !selectedStudent && (
                    <div className="w-full" >
                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4" >
                            <div
                                className="bg-neutral-900 p-4 rounded-2xl border border-neutral-800 cursor-pointer hover:border-yellow-500/50 hover:shadow-lg hover:shadow-black/30 transition-all duration-300"
                                onClick={() => { setTab('students'); setSelectedStudent(null); }}
                            >
                                <h3 className="text-neutral-400 text-[11px] font-bold uppercase tracking-widest" > Total Alunos </h3>
                                < p className="text-3xl font-black text-white mt-1" > {totalStudents} </p>
                                < p className="mt-2 text-[11px] text-neutral-500" > Clique para ir direto à aba Alunos.</p>
                            </div>
                            < div className="bg-neutral-900 p-4 rounded-2xl border border-neutral-800" >
                                <h3 className="text-neutral-400 text-[11px] font-bold uppercase tracking-widest" > Com Professor </h3>
                                < p className="text-3xl font-black text-green-400 mt-1" > {studentsWithTeacher} </p>
                                < p className="mt-2 text-[11px] text-neutral-500" > Alunos vinculados a pelo menos um professor.</p>
                            </div>
                            < div
                                className="bg-neutral-900 p-4 rounded-2xl border border-neutral-800 cursor-pointer hover:border-yellow-500/50 hover:shadow-lg hover:shadow-black/30 transition-all duration-300"
                                onClick={() => { setTab('students'); setSelectedStudent(null); }}
                            >
                                <h3 className="text-neutral-400 text-[11px] font-bold uppercase tracking-widest" > Sem Professor </h3>
                                < p className="text-3xl font-black text-yellow-500 mt-1" > {studentsWithoutTeacher} </p>
                                < p className="mt-2 text-[11px] text-neutral-500" > Alunos aguardando vínculo ou triagem.</p>
                            </div>
                            < div
                                className="bg-neutral-900 p-4 rounded-2xl border border-neutral-800 cursor-pointer hover:border-yellow-500/50 hover:shadow-lg hover:shadow-black/30 transition-all duration-300"
                                onClick={() => { setTab('templates'); setSelectedStudent(null); }}
                            >
                                <h3 className="text-neutral-400 text-[11px] font-bold uppercase tracking-widest" > Treinos Criados </h3>
                                < p className="text-3xl font-black text-white mt-1" > {myWorkoutsCount ?? '-'}</p>
                                < p className="mt-2 text-[11px] text-neutral-500" > Modelos de treino disponíveis para uso imediato.</p>
                            </div>
                            {
                                isAdmin && (
                                    <div
                                        className="bg-neutral-900 p-4 rounded-2xl border border-neutral-800 cursor-pointer hover:border-yellow-500/50 hover:shadow-lg hover:shadow-black/30 transition-all duration-300"
                                        onClick={() => { setTab('teachers'); setSelectedStudent(null); }
                                        }
                                    >
                                        <h3 className="text-neutral-400 text-[11px] font-bold uppercase tracking-widest" > Professores Ativos </h3>
                                        < p className="text-3xl font-black text-white mt-1" > {totalTeachers} </p>
                                        < p className="mt-2 text-[11px] text-neutral-500" > Gestão completa na aba Professores.</p>
                                    </div>
                                )}
                        </div>

                        < div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4" >
                            <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.35)] h-64" >
                                <div className="flex items-center justify-between gap-3 mb-3" >
                                    <div>
                                        <h3 className="text-[11px] font-black uppercase tracking-widest text-neutral-400" > Distribuição Alunos </h3>
                                        < p className="text-[11px] text-neutral-500 mt-1" > Com professor vs sem professor.</p>
                                    </div>
                                    < div className="text-[11px] text-neutral-500 font-semibold" >
                                        {dashboardCharts.totalStudents} total
                                    </div>
                                </div>
                                < div className="h-[180px]" >
                                    {dashboardCharts?.teacherDistribution && (
                                        <Bar data={dashboardCharts.teacherDistribution.data} options={dashboardCharts.teacherDistribution.options} />
                                    )}
                                </div>
                            </div>
                            < div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.35)] h-64" >
                                <div className="flex items-center justify-between gap-3 mb-3" >
                                    <div>
                                        <h3 className="text-[11px] font-black uppercase tracking-widest text-neutral-400" > Status de Pagamento </h3>
                                        < p className="text-[11px] text-neutral-500 mt-1" > Distribuição rápida por status financeiro.</p>
                                    </div>
                                    < div className="text-[11px] text-neutral-500 font-semibold" >
                                        {dashboardCharts.statusTotal} registros
                                    </div>
                                </div>
                                < div className="h-[180px]" >
                                    {dashboardCharts?.statusDistribution && (
                                        <Bar data={dashboardCharts.statusDistribution.data} options={dashboardCharts.statusDistribution.options} />
                                    )}
                                </div>
                            </div>
                        </div>

                        {
                            isTeacher && coachInboxItems.length > 0 && (
                                <div data-tour="adminpanel.dashboard.coachInbox" className="mt-6 bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.35)]" >
                                    <div className="flex items-center justify-between gap-3 mb-3" >
                                        <div className="min-w-0" >
                                            <div className="text-[11px] font-black uppercase tracking-widest text-yellow-500" > Coach Inbox </div>
                                            < div className="text-xs text-neutral-400 mt-1" >
                                                Alunos que mais precisam de atenção com base na atividade recente.
                                            </div>
                                        </div>
                                        < div className="text-[11px] font-bold text-neutral-400" >
                                            {coachInboxItems.length} prioridade{coachInboxItems.length > 1 ? 's' : ''}
                                        </div>
                                    </div>

                                    < div className="space-y-2" >
                                        {
                                            coachInboxItems.map((item) => (
                                                <button
                                                    key={String(item.id ?? item.email ?? item.name ?? '')
                                                    }
                                                    type="button"
                                                    onClick={() => {
                                                        const list = Array.isArray(usersList) ? usersList : [];
                                                        const targetId = String(item.id ?? '');
                                                        const target = list.find((s) => s && String(s.id ?? '') === targetId);
                                                        if (target) setSelectedStudent(target);
                                                    }
                                                    }
                                                    className="w-full text-left bg-neutral-900 border border-neutral-800 hover:border-yellow-500/50 hover:shadow-lg hover:shadow-black/30 rounded-2xl px-3 py-3 flex items-center justify-between gap-3 transition-all duration-300 active:scale-[0.99]"
                                                >
                                                    <div className="flex items-center gap-3 min-w-0" >
                                                        <div className="w-9 h-9 rounded-full bg-neutral-950 border border-neutral-700 flex items-center justify-center text-xs font-black text-neutral-200 flex-shrink-0" >
                                                            {String(item.name ?? item.email ?? '?').slice(0, 2).toUpperCase()}
                                                        </div>
                                                        < div className="min-w-0" >
                                                            <div className="text-sm font-semibold text-white truncate" > {String(item.name ?? item.email ?? '')} </div>
                                                            < div className="text-[11px] text-neutral-500 truncate" > {String(item.email ?? '')} </div>
                                                        </div>
                                                    </div>
                                                    < div className="flex flex-col items-end gap-1 flex-shrink-0" >
                                                        <div
                                                            className={
                                                                item.hasWorkouts
                                                                    ? 'px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-yellow-500/10 text-yellow-400 border border-yellow-500/40'
                                                                    : 'px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-red-500/10 text-red-400 border border-red-500/40'
                                                            }
                                                        >
                                                            {
                                                                item.hasWorkouts
                                                                    ? `${item.daysSinceLastWorkout ?? 0}d sem treino`
                                                                    : 'Nenhum treino registrado'
                                                            }
                                                        </div>
                                                        < div className="text-[10px] text-neutral-500 font-semibold capitalize truncate" >
                                                            Status: {String(item.status || 'pendente')}
                                                        </div>
                                                    </div>
                                                </button>
                                            ))}
                                    </div>
                                </div>
                            )}
                    </div>
                )}

                {
                    tab === 'priorities' && !selectedStudent && (
                        <div className="w-full space-y-4" >
                            <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.35)]" >
                                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3" >
                                    <div className="min-w-0" >
                                        <div className="flex items-center gap-2" >
                                            <AlertCircle size={18} className="text-yellow-500" />
                                            <h2 className="text-base md:text-lg font-black tracking-tight" > Prioridades </h2>
                                        </div>
                                        < div className="mt-1 text-xs text-neutral-400 font-semibold" >
                                            {prioritiesLoading ? 'Carregando...' : `${Array.isArray(prioritiesItems) ? prioritiesItems.length : 0} item(ns)`}
                                        </div>
                                    </div>
                                    < div className="flex flex-col sm:flex-row gap-2" >
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                try {
                                                    setPrioritiesSettingsOpen(true);
                                                    await loadPrioritiesSettings();
                                                } catch { }
                                            }
                                            }
                                            className="min-h-[44px] px-4 py-3 bg-neutral-900/70 border border-neutral-800 hover:bg-neutral-900 text-neutral-200 rounded-xl font-black flex items-center justify-center gap-2 transition-all duration-300 active:scale-95"
                                        >
                                            Configurar
                                        </button>
                                        < button
                                            type="button"
                                            onClick={() => fetchPriorities()}
                                            disabled={prioritiesLoading}
                                            className="min-h-[44px] px-4 py-3 bg-neutral-900/70 border border-neutral-800 hover:bg-neutral-900 text-neutral-200 rounded-xl font-black flex items-center justify-center gap-2 transition-all duration-300 active:scale-95 disabled:opacity-60"
                                        >
                                            Atualizar
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {
                                prioritiesError ? (
                                    <div className="bg-neutral-900/60 border border-red-500/30 rounded-2xl p-4 text-red-200 font-bold text-sm" >
                                        {prioritiesError}
                                    </div>
                                ) : null
                            }

                            {
                                prioritiesLoading ? (
                                    <div className="text-center animate-pulse text-neutral-400 font-semibold" > Carregando prioridades...</div>
                                ) : !Array.isArray(prioritiesItems) || prioritiesItems.length === 0 ? (
                                    <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl p-4 text-neutral-400 font-semibold" >
                                        Nenhuma prioridade no momento.
                                    </div>
                                ) : (
                                    <div className="space-y-3" >
                                        {
                                            prioritiesItems.map((it) => {
                                                const itemId = String(it?.id || '').trim();
                                                const studentId = String(it?.student_user_id || '').trim();
                                                const studentName = String(it?.student_name || '').trim();
                                                const kind = String(it?.kind || '').trim();
                                                const title = String(it?.title || '').trim();
                                                const reason = String(it?.reason || '').trim();
                                                const msg = String(it?.suggested_message || '').trim();
                                                const badgeTone =
                                                    kind === 'load_spike'
                                                        ? 'border-red-500/30 text-red-300'
                                                        : kind === 'checkins_alert'
                                                            ? 'border-red-500/30 text-red-300'
                                                            : kind === 'volume_drop'
                                                                ? 'border-yellow-500/30 text-yellow-300'
                                                                : 'border-neutral-500/30 text-neutral-200';
                                                return (
                                                    <div key={itemId || `${studentId}:${kind}`
                                                    } className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.25)]" >
                                                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3" >
                                                            <div className="min-w-0" >
                                                                <div className="flex flex-wrap items-center gap-2" >
                                                                    <div className="text-base font-black text-white truncate" > {studentName || 'Aluno'} </div>
                                                                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${badgeTone}`
                                                                    }> {title || kind}</span>
                                                                </div>
                                                                {
                                                                    reason ? (
                                                                        <div className="mt-1 text-xs text-neutral-400 font-semibold" > {reason} </div>
                                                                    ) : null
                                                                }
                                                            </div>
                                                            < div className="flex flex-col sm:flex-row gap-2" >
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        try {
                                                                            const found = (Array.isArray(usersList) ? usersList : []).find((s) => String(s?.user_id || '').trim() === studentId);
                                                                            setTab('students');
                                                                            setSelectedStudent(found || null);
                                                                            if (!found) setStudentQuery(studentName || '');
                                                                        } catch { }
                                                                    }}
                                                                    className="min-h-[44px] px-4 py-3 bg-neutral-900/70 border border-neutral-800 hover:bg-neutral-900 text-neutral-200 rounded-xl font-black transition-all duration-300 active:scale-95"
                                                                >
                                                                    Ver aluno
                                                                </button>
                                                                < button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setPrioritiesComposeStudentId(studentId);
                                                                        setPrioritiesComposeKind(kind);
                                                                        setPrioritiesComposeText(msg);
                                                                        setPrioritiesComposeOpen(true);
                                                                    }}
                                                                    className="min-h-[44px] px-4 py-3 bg-yellow-500 hover:bg-yellow-400 text-black rounded-xl font-black transition-all duration-300 active:scale-95"
                                                                >
                                                                    Enviar mensagem
                                                                </button>
                                                                < button
                                                                    type="button"
                                                                    onClick={async () => {
                                                                        try {
                                                                            const v = await prompt('Sonecar (minutos)', String(prioritiesSettings?.snoozeDefaultMinutes ?? COACH_INBOX_DEFAULTS.snoozeDefaultMinutes));
                                                                            const minutes = Number(String(v || '').trim());
                                                                            if (!Number.isFinite(minutes) || minutes <= 0) return;
                                                                            const res = await fetch('/api/teacher/inbox/action', {
                                                                                method: 'POST',
                                                                                credentials: 'include',
                                                                                headers: { 'content-type': 'application/json' },
                                                                                body: JSON.stringify({ student_user_id: studentId, kind, action: 'snooze', snooze_minutes: minutes }),
                                                                            });
                                                                            const json = await res.json().catch((): any => null);
                                                                            if (!res.ok || !json?.ok) {
                                                                                await alert(String(json?.error || `Falha ao sonecar (${res.status})`));
                                                                                return;
                                                                            }
                                                                            setPrioritiesItems((prev) => (Array.isArray(prev) ? prev.filter((x) => String(x?.id || '') !== itemId) : prev));
                                                                        } catch (e: unknown) {
                                                                            const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
                                                                            await alert('Erro: ' + msg);
                                                                        }
                                                                    }}
                                                                    className="min-h-[44px] px-4 py-3 bg-neutral-900/70 border border-neutral-800 hover:bg-neutral-900 text-neutral-200 rounded-xl font-black transition-all duration-300 active:scale-95"
                                                                >
                                                                    Sonecar
                                                                </button>
                                                                < button
                                                                    type="button"
                                                                    onClick={async () => {
                                                                        try {
                                                                            const ok = await confirm('Concluir este item?', 'Prioridades');
                                                                            if (!ok) return;
                                                                            const res = await fetch('/api/teacher/inbox/action', {
                                                                                method: 'POST',
                                                                                credentials: 'include',
                                                                                headers: { 'content-type': 'application/json' },
                                                                                body: JSON.stringify({ student_user_id: studentId, kind, action: 'done' }),
                                                                            });
                                                                            const json = await res.json().catch((): any => null);
                                                                            if (!res.ok || !json?.ok) {
                                                                                await alert(String(json?.error || `Falha ao concluir (${res.status})`));
                                                                                return;
                                                                            }
                                                                            setPrioritiesItems((prev) => (Array.isArray(prev) ? prev.filter((x) => String(x?.id || '') !== itemId) : prev));
                                                                        } catch (e: unknown) {
                                                                            const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
                                                                            await alert('Erro: ' + msg);
                                                                        }
                                                                    }}
                                                                    className="min-h-[44px] px-4 py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl font-black transition-all duration-300 active:scale-95"
                                                                >
                                                                    Concluir
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                )}
                        </div>
                    )}

                {
                    tab === 'students' && !selectedStudent && (
                        <div className="w-full space-y-4" >
                            <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.35)]" >
                                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3" >
                                    <div className="min-w-0" >
                                        <div className="flex items-center gap-2" >
                                            <UserCog size={18} className="text-yellow-500" />
                                            <h2 className="text-base md:text-lg font-black tracking-tight" > Alunos </h2>
                                        </div>
                                        < div className="mt-1 text-xs text-neutral-400 font-semibold" >
                                            {totalStudents} no total • {studentsWithTeacher} com professor • {studentsWithoutTeacher} sem professor
                                        </div>
                                    </div>
                                    < div className="flex flex-col sm:flex-row gap-2" >
                                        <button
                                            data-tour="adminpanel.students.create"
                                            onClick={() => setShowRegisterModal(true)
                                            }
                                            className="min-h-[44px] px-4 py-3 bg-yellow-500 hover:bg-yellow-400 text-black rounded-xl font-black flex items-center justify-center gap-2 transition-all duration-300 shadow-lg shadow-yellow-500/15 active:scale-95"
                                        >
                                            <UserPlus size={18} /> CADASTRAR
                                        </button>
                                    </div>
                                </div>
                                < div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-2" >
                                    <div className="relative lg:col-span-2" >
                                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                                        <input
                                            data-tour="adminpanel.students.search"
                                            value={studentQuery}
                                            onChange={(e) => setStudentQuery(e.target.value)}
                                            placeholder="Buscar aluno por nome ou email"
                                            className="w-full min-h-[44px] bg-neutral-900/70 border border-neutral-800 rounded-xl pl-10 pr-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-yellow-500"
                                        />
                                    </div>
                                    < div data-tour="adminpanel.students.statusFilter" className="flex items-center gap-2 overflow-x-auto no-scrollbar" >
                                        {
                                            [
                                                { key: 'all', label: 'Todos' },
                                                { key: 'pago', label: 'Pago' },
                                                { key: 'pendente', label: 'Pendente' },
                                                { key: 'atrasado', label: 'Atrasado' },
                                                { key: 'cancelar', label: 'Cancelar' }
                                            ].map((opt) => (
                                                <button
                                                    key={opt.key}
                                                    type="button"
                                                    onClick={() => setStudentStatusFilter(opt.key)}
                                                    className={`whitespace-nowrap min-h-[40px] px-3 py-2 rounded-full text-[11px] font-black uppercase tracking-wide border transition-all duration-300 active:scale-95 ${studentStatusFilter === opt.key
                                                        ? 'bg-yellow-500 text-black border-yellow-400 shadow-lg shadow-yellow-500/15'
                                                        : 'bg-neutral-900/60 text-neutral-200 border-neutral-800 hover:bg-neutral-900'
                                                        }`}
                                                >
                                                    {opt.label}
                                                </button>
                                            ))}
                                    </div>
                                </div>
                            </div>

                            < div className="grid grid-cols-1 lg:grid-cols-2 gap-4" >
                                <div className="space-y-3" >
                                    <div className="flex items-center justify-between gap-3" >
                                        <h3 className="text-xs font-black uppercase tracking-widest text-neutral-500" > Com Professor </h3>
                                        <span className="text-[11px] font-bold text-neutral-400" > {studentsWithTeacherFiltered.length} </span>
                                    </div>
                                    {
                                        studentsWithTeacherFiltered.length === 0 ? (
                                            <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-4" >
                                                <p className="text-neutral-500 text-sm" > Nenhum aluno encontrado.</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-3" >
                                                {
                                                    studentsWithTeacherFiltered.map((s) => (
                                                        <div key={String(s.id ?? s.user_id ?? s.email ?? '')
                                                        } onClick={() => setSelectedStudent(s)
                                                        } className="bg-neutral-800 p-4 rounded-2xl border border-neutral-700 hover:border-yellow-500/50 hover:shadow-lg hover:shadow-black/30 transition-all duration-300 cursor-pointer w-full max-w-[100vw] overflow-hidden" >
                                                            <div className="flex items-center gap-4" >
                                                                <div className="w-12 h-12 rounded-full bg-neutral-900 border border-neutral-700 flex items-center justify-center font-black text-lg text-neutral-200 flex-shrink-0" > {String(s.name ?? s.email ?? '?').charAt(0)} </div>
                                                                < div className="min-w-0 flex-1" >
                                                                    <h3 className="font-black text-white truncate" > {String(s.name ?? s.email ?? '')} </h3>
                                                                    < p className="text-xs text-neutral-400 truncate" > {String(s.email ?? '')} </p>
                                                                </div>
                                                            </div>

                                                            < div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2" >
                                                                <span className="px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wide bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 w-fit" >
                                                                    {isTeacher && s.teacher_id === user.id ? 'Seu aluno' : 'Vinculado'}
                                                                </span>
                                                                {
                                                                    (isAdmin || (isTeacher && s.teacher_id === user.id)) && (
                                                                        <select
                                                                            value={String(s.status ?? 'pendente')}
                                                                            onClick={(e) => e.stopPropagation()
                                                                            }
                                                                            onPointerDown={(e) => e.stopPropagation()}
                                                                            onMouseDown={(e) => e.stopPropagation()}
                                                                            onChange={async (e) => {
                                                                                const newStatus = e.target.value;
                                                                                try {
                                                                                    const authHeaders = await getAdminAuthHeaders();
                                                                                    const res = await fetch('/api/admin/students/status', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ id: s.id, status: newStatus }) });
                                                                                    const json = await res.json();
                                                                                    if (json.ok) setUsersList(prev => prev.map(x => x.id === s.id ? { ...x, status: newStatus } : x));
                                                                                } catch { }
                                                                            }}
                                                                            className="min-h-[40px] bg-neutral-900/70 text-neutral-200 rounded-xl px-3 py-2 text-xs w-full sm:w-auto max-w-full border border-neutral-700 focus:border-yellow-500 focus:outline-none"
                                                                        >
                                                                            <option value="pago" > pago </option>
                                                                            < option value="pendente" > pendente </option>
                                                                            < option value="atrasado" > atrasado </option>
                                                                            < option value="cancelar" > cancelar </option>
                                                                        </select>
                                                                    )}
                                                            </div>
                                                        </div>
                                                    ))}
                                            </div>
                                        )}
                                </div>

                                < div className="space-y-3" >
                                    <div className="flex items-center justify-between gap-3" >
                                        <h3 className="text-xs font-black uppercase tracking-widest text-neutral-500" > Sem Professor </h3>
                                        <span className="text-[11px] font-bold text-neutral-400" > {studentsWithoutTeacherFiltered.length} </span>
                                    </div>
                                    {
                                        studentsWithoutTeacherFiltered.length === 0 ? (
                                            <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-4" >
                                                <p className="text-neutral-500 text-sm" > Nenhum aluno encontrado.</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-3" >
                                                {
                                                    studentsWithoutTeacherFiltered.map((s) => (
                                                        <div key={String(s.id ?? s.user_id ?? s.email ?? '')
                                                        } onClick={() => setSelectedStudent(s)
                                                        } className="bg-neutral-800 p-4 rounded-2xl border border-neutral-700 hover:border-yellow-500/50 hover:shadow-lg hover:shadow-black/30 transition-all duration-300 cursor-pointer w-full max-w-[100vw] overflow-hidden" >
                                                            <div className="flex items-center gap-4" >
                                                                <div className="w-12 h-12 rounded-full bg-neutral-900 border border-neutral-700 flex items-center justify-center font-black text-lg text-neutral-200 flex-shrink-0" > {String(s.name ?? s.email ?? '?').charAt(0)} </div>
                                                                < div className="min-w-0 flex-1" >
                                                                    <h3 className="font-black text-white truncate" > {String(s.name ?? s.email ?? '')} </h3>
                                                                    < p className="text-xs text-neutral-400 truncate" > {String(s.email ?? '')} </p>
                                                                </div>
                                                            </div>

                                                            < div className="mt-3 flex flex-wrap items-center gap-2" >
                                                                <span className="px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wide bg-neutral-900 text-neutral-300 border border-neutral-700 w-fit" > Sem professor </span>
                                                            </div>
                                                        </div>
                                                    ))}
                                            </div>
                                        )}
                                </div>
                            </div>
                        </div>
                    )}

                {
                    tab === 'templates' && !selectedStudent && (
                        <div className="w-full space-y-4" >
                            <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.35)]" >
                                <div className="flex items-center justify-between gap-3" >
                                    <div className="min-w-0" >
                                        <div className="flex items-center gap-2" >
                                            <Dumbbell size={18} className="text-yellow-500" />
                                            <h2 className="text-base md:text-lg font-black tracking-tight" > Treinos </h2>
                                        </div>
                                        < div className="mt-1 text-xs text-neutral-400 font-semibold" > {(Array.isArray(templates) ? templates.length : 0)
                                        } no total </div>
                                    </div>
                                    < div className="text-[11px] font-bold text-neutral-400" > {templatesFiltered.length} visíveis </div>
                                </div>
                                < div className="mt-4 relative" >
                                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                                    <input
                                        value={templateQuery}
                                        onChange={(e) => setTemplateQuery(e.target.value)}
                                        placeholder="Buscar treino por nome"
                                        className="w-full min-h-[44px] bg-neutral-900/70 border border-neutral-800 rounded-xl pl-10 pr-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-yellow-500"
                                    />
                                </div>
                            </div>

                            {
                                templatesFiltered.length === 0 ? (
                                    <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 text-center" >
                                        <p className="text-neutral-500" > Nenhum treino encontrado.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3" >
                                        {
                                            templatesFiltered.map((t) => (
                                                <div
                                                    key={String(t.id ?? t.name ?? '')
                                                    }
                                                    className="bg-neutral-800 p-4 rounded-2xl border border-neutral-700 flex justify-between items-center cursor-pointer hover:border-yellow-500/50 hover:shadow-lg hover:shadow-black/30 transition-all duration-300"
                                                    onClick={() => openEditTemplate(t)
                                                    }
                                                >
                                                    <div className="min-w-0" >
                                                        <h3 className="font-black text-white truncate" > {normalizeWorkoutTitle(t.name)} </h3>
                                                        < p className="text-xs text-neutral-500" > {Array.isArray(t.exercises) ? t.exercises.length : 0} exercícios </p>
                                                    </div>
                                                    < div className="flex items-center gap-2 flex-shrink-0" >
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); openEditTemplate(t); }}
                                                            className="w-9 h-9 rounded-full bg-neutral-900 border border-neutral-700 hover:border-yellow-500/40 hover:bg-yellow-500/10 text-neutral-300 hover:text-yellow-400 flex items-center justify-center transition-all duration-300 active:scale-95"
                                                        >
                                                            <Edit3 size={16} />
                                                        </button>
                                                        < button
                                                            onClick={async (e) => {
                                                                e.stopPropagation();
                                                                if (!(await confirm('Excluir este treino?', 'Apagar Treino'))) return;
                                                                try {
                                                                    if (templatesUserId && t?.user_id && String(t.user_id) !== String(templatesUserId)) {
                                                                        await alert('Esse treino pertence a um aluno. Para não apagar o treino dele, a exclusão aqui é bloqueada.');
                                                                        return;
                                                                    }
                                                                    const res = await deleteWorkout(String(t.id || ''));
                                                                    if (!res?.ok) {
                                                                        await alert('Erro ao excluir: ' + (String(res?.error || '') || 'Falha ao excluir treino'));
                                                                        return;
                                                                    }
                                                                    setTemplates(prev => prev.filter(x => x.id !== t.id));
                                                                } catch (err: unknown) {
                                                                    const msg = err && typeof err === 'object' && 'message' in err && typeof (err as { message?: unknown }).message === 'string' ? (err as { message: string }).message : String(err);
                                                                    await alert('Erro ao excluir: ' + msg);
                                                                }
                                                            }}
                                                            className="w-9 h-9 rounded-full bg-neutral-900 border border-neutral-700 hover:border-red-500/40 hover:bg-red-900/20 text-neutral-300 hover:text-red-400 flex items-center justify-center transition-all duration-300 active:scale-95"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                    </div>
                                )}
                        </div>
                    )}

                {
                    tab === 'requests' && !selectedStudent && isAdmin && (
                        <RequestsTab />
                    )
                }

                {
                    tab === 'videos' && !selectedStudent && isAdmin && (
                        <div className="w-full space-y-4" >
                            <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.35)]" >
                                <div className="flex items-center justify-between gap-3" >
                                    <div className="min-w-0" >
                                        <div className="flex items-center gap-2" >
                                            <Play size={18} className="text-yellow-500" />
                                            <h2 className="text-base md:text-lg font-black tracking-tight" > Vídeos(Fila) </h2>
                                        </div>
                                        < div className="mt-1 text-xs text-neutral-400 font-semibold" > {videoQueue.length} pendentes </div>
                                    </div>
                                </div>

                                < div className="mt-3 rounded-2xl bg-neutral-950/60 border border-neutral-800 p-3 flex items-center justify-between gap-3" >
                                    <div className="min-w-0" >
                                        <div className="text-[11px] uppercase tracking-widest text-neutral-500 font-bold" > Diagnóstico </div>
                                        < div className="text-xs text-neutral-300 font-semibold" >
                                            {
                                                videoMissingLoading
                                                    ? 'Calculando exercícios sem vídeo...'
                                                    : (typeof videoMissingCount === 'number'
                                                        ? `${videoMissingCount} exercícios sem vídeo (estimativa)`
                                                        : 'Não foi possível calcular agora')
                                            }
                                        </div>
                                        {
                                            videoCycleRunning ? (
                                                <div className="mt-1 text-[11px] text-neutral-500 font-semibold" >
                                                    Ciclo : processados {videoCycleStats.processed} • criados {videoCycleStats.created} • pulados {videoCycleStats.skipped}
                                                </div>
                                            ) : null
                                        }
                                    </div>
                                    < div className="flex items-center gap-2 flex-shrink-0" >
                                        {
                                            typeof videoMissingCount === 'number' && videoMissingCount > 0 ? (
                                                <button
                                                    type="button"
                                                    disabled={videoLoading || videoCycleRunning
                                                    }
                                                    onClick={async () => {
                                                        const limit = Math.max(1, Math.min(50, Math.min(videoMissingCount, Number(videoBackfillLimit) || 20)));
                                                        if (!(await confirm(`Gerar sugestões para até ${limit} exercícios sem vídeo?`, 'Gerar Sugestões (lote)'))) return;
                                                        setVideoLoading(true);
                                                        try {
                                                            const authHeaders = await getAdminAuthHeaders();
                                                            const res = await fetch('/api/admin/exercise-videos/backfill', {
                                                                method: 'POST',
                                                                headers: { 'Content-Type': 'application/json', ...authHeaders },
                                                                body: JSON.stringify({ limit }),
                                                            });
                                                            const json: UnknownRecord = await res.json().catch(() => ({} as UnknownRecord));
                                                            if (!json?.ok) throw new Error(String(json?.error || 'Falha no backfill'));
                                                            const { data, error } = await supabase
                                                                .from('exercise_videos')
                                                                .select('id, url, title, channel_title, created_at, exercise_library_id, exercise_library:exercise_library_id(display_name_pt)')
                                                                .eq('status', 'pending')
                                                                .order('created_at', { ascending: false })
                                                                .limit(60);
                                                            if (!error) setVideoQueue(data || []);
                                                            await alert(`Criados: ${json.created ?? 0} | Processados: ${json.processed ?? 0} | Pulados: ${json.skipped ?? 0}`);
                                                        } catch (e: unknown) {
                                                            const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
                                                            await alert('Erro: ' + msg);
                                                        } finally {
                                                            setVideoLoading(false);
                                                        }
                                                    }
                                                    }
                                                    className="min-h-[40px] px-4 py-2 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black font-black text-[11px] uppercase tracking-widest border border-yellow-400/60 active:scale-95 transition-all disabled:opacity-50"
                                                >
                                                    Gerar Lote
                                                </button>
                                            ) : null}

                                        {
                                            !videoCycleRunning && typeof videoMissingCount === 'number' && videoMissingCount > 0 ? (
                                                <button
                                                    type="button"
                                                    disabled={videoLoading}
                                                    onClick={async () => {
                                                        const perCycle = Math.max(1, Math.min(50, Number(videoBackfillLimit) || 20));
                                                        if (!(await confirm(`Rodar backfill em ciclos de ${perCycle} até acabar?`, 'Backfill contínuo'))) return;
                                                        videoCycleStopRef.current = false;
                                                        setVideoCycleRunning(true);
                                                        setVideoCycleStats({ processed: 0, created: 0, skipped: 0 });
                                                        try {
                                                            while (!videoCycleStopRef.current) {
                                                                const authHeaders = await getAdminAuthHeaders();
                                                                const res = await fetch('/api/admin/exercise-videos/backfill', {
                                                                    method: 'POST',
                                                                    headers: { 'Content-Type': 'application/json', ...authHeaders },
                                                                    body: JSON.stringify({ limit: perCycle }),
                                                                });
                                                                const json: UnknownRecord = await res.json().catch(() => ({} as UnknownRecord));
                                                                if (!json?.ok) throw new Error(String(json?.error || 'Falha no backfill'));

                                                                setVideoCycleStats((prev) => ({
                                                                    processed: prev.processed + (Number(json.processed) || 0),
                                                                    created: prev.created + (Number(json.created) || 0),
                                                                    skipped: prev.skipped + (Number(json.skipped) || 0),
                                                                }));

                                                                if ((Number(json.processed) || 0) <= 0 || (Number(json.created) || 0) <= 0) break;
                                                            }
                                                            const { data, error } = await supabase
                                                                .from('exercise_videos')
                                                                .select('id, url, title, channel_title, created_at, exercise_library_id, exercise_library:exercise_library_id(display_name_pt)')
                                                                .eq('status', 'pending')
                                                                .order('created_at', { ascending: false })
                                                                .limit(60);
                                                            if (!error) setVideoQueue(data || []);
                                                        } catch (e: unknown) {
                                                            const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
                                                            await alert('Erro: ' + msg);
                                                        } finally {
                                                            setVideoCycleRunning(false);
                                                        }
                                                    }
                                                    }
                                                    className="min-h-[40px] px-4 py-2 rounded-xl bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-neutral-200 font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50"
                                                >
                                                    Rodar contínuo
                                                </button>
                                            ) : null}

                                        {
                                            videoCycleRunning ? (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        videoCycleStopRef.current = true;
                                                    }
                                                    }
                                                    className="min-h-[40px] px-4 py-2 rounded-xl bg-red-900/30 border border-red-700 hover:bg-red-900/40 text-red-200 font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all"
                                                >
                                                    Pausar
                                                </button>
                                            ) : null}
                                    </div>
                                </div>

                                < div className="mt-4 flex flex-col sm:flex-row gap-2" >
                                    <input
                                        value={videoExerciseName}
                                        onChange={(e) => setVideoExerciseName(e.target.value)}
                                        placeholder="Ex.: Supino reto com barra"
                                        className="flex-1 min-h-[44px] bg-neutral-900/70 border border-neutral-800 rounded-xl px-4 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-yellow-500"
                                    />
                                    <button
                                        type="button"
                                        disabled={videoLoading || !String(videoExerciseName || '').trim()}
                                        onClick={async () => {
                                            const name = String(videoExerciseName || '').trim();
                                            if (!name) return;
                                            setVideoLoading(true);
                                            try {
                                                const authHeaders = await getAdminAuthHeaders();
                                                const res = await fetch('/api/admin/exercise-videos/suggest', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json', ...authHeaders },
                                                    body: JSON.stringify({ name }),
                                                });
                                                const json: UnknownRecord = await res.json().catch(() => ({} as UnknownRecord));
                                                if (!json?.ok) throw new Error(String(json?.error || 'Falha ao gerar sugestões'));
                                                setVideoExerciseName('');
                                                const { data, error } = await supabase
                                                    .from('exercise_videos')
                                                    .select('id, url, title, channel_title, created_at, exercise_library_id, exercise_library:exercise_library_id(display_name_pt)')
                                                    .eq('status', 'pending')
                                                    .order('created_at', { ascending: false })
                                                    .limit(60);
                                                if (!error) setVideoQueue(data || []);
                                                await alert(`Sugestões criadas: ${json?.created ?? 0}`);
                                            } catch (e: unknown) {
                                                const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
                                                await alert('Erro: ' + msg);
                                            } finally {
                                                setVideoLoading(false);
                                            }
                                        }}
                                        className="w-full sm:w-auto min-h-[44px] px-5 py-2 rounded-xl font-black text-[11px] uppercase tracking-widest bg-yellow-500 hover:bg-yellow-400 text-black border border-yellow-400/60 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all"
                                    >
                                        {videoLoading ? 'Gerando...' : 'Gerar Sugestões'}
                                    </button>
                                </div>

                                < div className="mt-3 flex flex-col sm:flex-row gap-2" >
                                    <input
                                        value={videoBackfillLimit}
                                        onChange={(e) => setVideoBackfillLimit(e.target.value)}
                                        inputMode="numeric"
                                        placeholder="20"
                                        className="w-full sm:w-28 min-h-[44px] bg-neutral-900/70 border border-neutral-800 rounded-xl px-4 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-yellow-500"
                                    />
                                    <button
                                        type="button"
                                        disabled={videoLoading}
                                        onClick={async () => {
                                            const limit = Math.max(1, Math.min(50, Number(videoBackfillLimit) || 20));
                                            if (!(await confirm(`Gerar sugestões em lote para até ${limit} exercícios sem vídeo?`, 'Backfill de Vídeos'))) return;
                                            setVideoLoading(true);
                                            try {
                                                const authHeaders = await getAdminAuthHeaders();
                                                const res = await fetch('/api/admin/exercise-videos/backfill', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json', ...authHeaders },
                                                    body: JSON.stringify({ limit }),
                                                });
                                                const json: UnknownRecord = await res.json().catch(() => ({} as UnknownRecord));
                                                if (!json?.ok) throw new Error(String(json?.error || 'Falha no backfill'));
                                                const { data, error } = await supabase
                                                    .from('exercise_videos')
                                                    .select('id, url, title, channel_title, created_at, exercise_library_id, exercise_library:exercise_library_id(display_name_pt)')
                                                    .eq('status', 'pending')
                                                    .order('created_at', { ascending: false })
                                                    .limit(60);
                                                if (!error) setVideoQueue(data || []);
                                                await alert(`Backfill concluído. Processados: ${Number(json.processed) || 0} | Criados: ${Number(json.created) || 0} | Pulados: ${Number(json.skipped) || 0}`);
                                            } catch (e: unknown) {
                                                const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
                                                await alert('Erro no backfill: ' + msg);
                                            } finally {
                                                setVideoLoading(false);
                                            }
                                        }}
                                        className="w-full sm:w-auto min-h-[44px] px-5 py-2 rounded-xl font-black text-[11px] uppercase tracking-widest bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all"
                                    >
                                        {videoLoading ? 'Executando...' : 'Backfill (lote)'}
                                    </button>
                                    < div className="text-[11px] text-neutral-500 font-semibold flex items-center px-1" >
                                        Limite por execução(1–50)
                                    </div>
                                </div>
                            </div>

                            {
                                videoLoading && videoQueue.length === 0 ? (
                                    <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 text-center" >
                                        <p className="text-neutral-500" > Carregando fila...</p>
                                    </div>
                                ) : videoQueue.length === 0 ? (
                                    <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 text-center" >
                                        <p className="text-neutral-500" > Nenhuma sugestão pendente.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3" >
                                        {(videoQueue || []).map((row) => {
                                            const r: UnknownRecord = row && typeof row === 'object' ? (row as UnknownRecord) : ({} as UnknownRecord);
                                            const exLib: UnknownRecord | null = r.exercise_library && typeof r.exercise_library === 'object' ? (r.exercise_library as UnknownRecord) : null;
                                            const exName = String(exLib?.display_name_pt || r?.normalized_name || '').trim() || 'Exercício';
                                            const title = String(r?.title || '').trim() || 'Vídeo';
                                            const channel = String(r?.channel_title || '').trim();
                                            const url = String(r?.url || '').trim();
                                            const exerciseLibraryId = r?.exercise_library_id || null;
                                            return (
                                                <div
                                                    key={String(r.id ?? r.exercise_library_id ?? r.url ?? '')
                                                    }
                                                    className="bg-neutral-800 p-4 rounded-2xl border border-neutral-700 flex flex-col gap-3"
                                                >
                                                    <div className="flex items-start justify-between gap-3" >
                                                        <div className="min-w-0" >
                                                            <div className="text-[11px] uppercase tracking-widest text-neutral-500 font-bold" > Exercício </div>
                                                            < div className="font-black text-white truncate" > {exName} </div>
                                                            < div className="mt-2 text-[11px] uppercase tracking-widest text-neutral-500 font-bold" > Sugestão </div>
                                                            < div className="text-sm text-neutral-200 truncate" > {title} </div>
                                                            {channel ? <div className="text-xs text-neutral-500 truncate" > {channel} </div> : null}
                                                            {
                                                                url ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            try {
                                                                                e.preventDefault();
                                                                                e.stopPropagation();
                                                                            } catch { }
                                                                            try {
                                                                                window.open(url, '_blank', 'noopener,noreferrer');
                                                                            } catch { }
                                                                        }
                                                                        }
                                                                        className="mt-2 inline-flex items-center gap-2 text-yellow-400 hover:text-yellow-300 text-xs font-bold"
                                                                    >
                                                                        <Play size={14} />
                                                                        Abrir no YouTube
                                                                    </button>
                                                                ) : null}
                                                        </div>
                                                        < div className="flex items-center gap-2 flex-shrink-0" >
                                                            <button
                                                                type="button"
                                                                onClick={async () => {
                                                                    if (!exerciseLibraryId) return;
                                                                    setVideoLoading(true);
                                                                    try {
                                                                        await supabase
                                                                            .from('exercise_videos')
                                                                            .update({ is_primary: false })
                                                                            .eq('exercise_library_id', exerciseLibraryId);
                                                                        const { error } = await supabase
                                                                            .from('exercise_videos')
                                                                            .update({ status: 'approved', is_primary: true, approved_at: new Date().toISOString() })
                                                                            .eq('id', r.id);
                                                                        if (error) throw error;
                                                                        await supabase
                                                                            .from('exercise_library')
                                                                            .update({ video_url: url })
                                                                            .eq('id', exerciseLibraryId);
                                                                        const { data, error: refreshErr } = await supabase
                                                                            .from('exercise_videos')
                                                                            .select('id, url, title, channel_title, created_at, exercise_library_id, exercise_library:exercise_library_id(display_name_pt)')
                                                                            .eq('status', 'pending')
                                                                            .order('created_at', { ascending: false })
                                                                            .limit(60);
                                                                        if (!refreshErr) setVideoQueue(data || []);
                                                                        await alert('Vídeo aprovado e definido como padrão.');
                                                                    } catch (e: unknown) {
                                                                        const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
                                                                        await alert('Erro ao aprovar: ' + msg);
                                                                    } finally {
                                                                        setVideoLoading(false);
                                                                    }
                                                                }}
                                                                className="min-h-[40px] px-4 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white font-black text-[11px] uppercase tracking-widest border border-green-400/40 active:scale-95 transition-all disabled:opacity-50"
                                                                disabled={videoLoading}
                                                            >
                                                                Aprovar
                                                            </button>
                                                            < button
                                                                type="button"
                                                                onClick={async () => {
                                                                    setVideoLoading(true);
                                                                    try {
                                                                        const { error } = await supabase
                                                                            .from('exercise_videos')
                                                                            .update({ status: 'rejected', is_primary: false })
                                                                            .eq('id', r.id);
                                                                        if (error) throw error;
                                                                        const { data, error: refreshErr } = await supabase
                                                                            .from('exercise_videos')
                                                                            .select('id, url, title, channel_title, created_at, exercise_library_id, exercise_library:exercise_library_id(display_name_pt)')
                                                                            .eq('status', 'pending')
                                                                            .order('created_at', { ascending: false })
                                                                            .limit(60);
                                                                        if (!refreshErr) setVideoQueue(data || []);
                                                                    } catch (e: unknown) {
                                                                        const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
                                                                        await alert('Erro ao rejeitar: ' + msg);
                                                                    } finally {
                                                                        setVideoLoading(false);
                                                                    }
                                                                }}
                                                                className="min-h-[40px] px-4 py-2 rounded-xl bg-neutral-900 border border-neutral-700 hover:bg-neutral-800 text-neutral-200 font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50"
                                                                disabled={videoLoading}
                                                            >
                                                                Rejeitar
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                        </div>
                    )}

                {
                    tab === 'errors' && !selectedStudent && isAdmin && (
                        <div className="w-full space-y-4" >
                            <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.35)]" >
                                <div className="flex items-center justify-between gap-3" >
                                    <div className="min-w-0" >
                                        <div className="flex items-center gap-2" >
                                            <AlertTriangle size={18} className="text-yellow-500" />
                                            <h2 className="text-base md:text-lg font-black tracking-tight" > Erros reportados </h2>
                                        </div>
                                        < div className="mt-1 text-xs text-neutral-400 font-semibold" > {errorsFiltered.length} visíveis </div>
                                    </div>
                                    < button
                                        type="button"
                                        onClick={async () => {
                                            setErrorsLoading(true);
                                            try {
                                                const { data, error } = await supabase
                                                    .from('error_reports')
                                                    .select('id, user_id, user_email, message, stack, pathname, url, user_agent, app_version, source, meta, status, created_at, updated_at, resolved_at, resolved_by')
                                                    .order('created_at', { ascending: false })
                                                    .limit(200);
                                                if (!error) setErrorReports(Array.isArray(data) ? data : []);
                                            } catch { } finally {
                                                setErrorsLoading(false);
                                            }
                                        }
                                        }
                                        disabled={errorsLoading}
                                        className="min-h-[40px] px-4 py-2 rounded-xl bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-neutral-200 font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50"
                                    >
                                        {errorsLoading ? 'Atualizando...' : 'Atualizar'}
                                    </button>
                                </div>

                                < div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3" >
                                    <div className="md:col-span-2 relative" >
                                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                                        <input
                                            value={errorsQuery}
                                            onChange={(e) => setErrorsQuery(e.target.value)}
                                            placeholder="Buscar por mensagem, usuário ou rota"
                                            className="w-full min-h-[44px] bg-neutral-900/70 border border-neutral-800 rounded-xl pl-10 pr-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-yellow-500"
                                        />
                                    </div>
                                    < select
                                        value={errorsStatusFilter}
                                        onChange={(e) => setErrorsStatusFilter(e.target.value)}
                                        className="min-h-[44px] bg-neutral-900/70 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500"
                                    >
                                        <option value="all" > Todos </option>
                                        < option value="new" > Novos </option>
                                        < option value="triaged" > Triados </option>
                                        < option value="resolved" > Resolvidos </option>
                                        < option value="ignored" > Ignorados </option>
                                    </select>
                                </div>
                            </div>

                            {
                                errorsLoading ? (
                                    <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 text-center text-neutral-400 font-semibold" >
                                        Carregando erros...
                                    </div>
                                ) : errorsFiltered.length === 0 ? (
                                    <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 text-center" >
                                        <p className="text-neutral-500" > Nenhum erro reportado encontrado.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3" >
                                        {
                                            errorsFiltered.map((r) => {
                                                const status = String(r?.status || 'new');
                                                const statusTone =
                                                    status === 'resolved'
                                                        ? 'bg-green-500/10 text-green-400 border-green-500/30'
                                                        : status === 'ignored'
                                                            ? 'bg-neutral-500/10 text-neutral-300 border-neutral-500/25'
                                                            : status === 'triaged'
                                                                ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                                                                : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30';
                                                const createdAt = (() => {
                                                    try {
                                                        const raw = (r as UnknownRecord)?.created_at ?? (r as UnknownRecord)?.createdAt;
                                                        if (!raw) return '';
                                                        const rawObj: UnknownRecord | null = raw && typeof raw === 'object' ? (raw as UnknownRecord) : null;
                                                        const d = rawObj && typeof rawObj.toDate === 'function' ? (rawObj.toDate as () => Date)() : new Date(String(raw));
                                                        const t = d && typeof (d as Date).toLocaleString === 'function' ? (d as Date).toLocaleString('pt-BR') : String(raw);
                                                        return t || '';
                                                    } catch {
                                                        return '';
                                                    }
                                                })();
                                                const email = String(r?.user_email || r?.userEmail || '').trim();
                                                const message = String(r?.message || '').trim();
                                                const pathname = String(r?.pathname || '').trim();
                                                const stack = String(r?.stack || '').trim();

                                                return (
                                                    <div key={String((r as UnknownRecord)?.id ?? '')
                                                    } className="bg-neutral-800 border border-neutral-700 rounded-2xl p-4" >
                                                        <div className="flex items-start justify-between gap-3" >
                                                            <div className="min-w-0 flex-1" >
                                                                <div className="flex items-center gap-2 flex-wrap" >
                                                                    <div className={`px-2 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest ${statusTone}`}>
                                                                        {status}
                                                                    </div>
                                                                    {
                                                                        createdAt ? (
                                                                            <div className="text-[11px] text-neutral-500 font-semibold" > {createdAt} </div>
                                                                        ) : null
                                                                    }
                                                                    {
                                                                        email ? (
                                                                            <div className="text-[11px] text-neutral-400 font-semibold truncate max-w-[150px]" title={email} >• {email} </div>
                                                                        ) : null
                                                                    }
                                                                    {
                                                                        pathname ? (
                                                                            <div className="text-[11px] text-neutral-500 font-semibold truncate max-w-[150px]" title={pathname} >• {pathname} </div>
                                                                        ) : null
                                                                    }
                                                                </div>
                                                                < div className="mt-2 text-sm text-neutral-100 font-semibold whitespace-pre-wrap break-words pr-2" >
                                                                    {message || '—'
                                                                    }
                                                                </div>
                                                            </div>
                                                            < div className="flex items-center gap-2 flex-shrink-0" >
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const content = `Erro: ${message}\nUser: ${email}\nPath: ${pathname}\nStack:\n${stack || 'N/A'}`;
                                                                        navigator.clipboard.writeText(content);
                                                                        // Feedback visual rápido seria ideal, mas alert serve por enquanto
                                                                    }}
                                                                    title="Copiar detalhes"
                                                                    className="w-10 h-10 rounded-xl bg-neutral-900 border border-neutral-700 hover:bg-neutral-800 text-neutral-400 hover:text-white flex items-center justify-center active:scale-95 transition-all"
                                                                >
                                                                    <Copy size={16} />
                                                                </button>
                                                                < button
                                                                    type="button"
                                                                    onClick={async () => {
                                                                        try {
                                                                            const nextStatus = status === 'resolved' ? 'new' : 'resolved';
                                                                            const patch = nextStatus === 'resolved'
                                                                                ? { status: nextStatus, resolved_at: new Date().toISOString(), resolved_by: user?.id ?? null }
                                                                                : { status: nextStatus, resolved_at: null, resolved_by: null };
                                                                            const { error } = await supabase.from('error_reports').update(patch).eq('id', r.id);
                                                                            if (error) throw error;
                                                                            setErrorReports((prev) => {
                                                                                const list = Array.isArray(prev) ? prev : [];
                                                                                return list.map((x) => (x?.id === r.id ? { ...x, ...patch } : x));
                                                                            });
                                                                        } catch (e: unknown) {
                                                                            const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
                                                                            await alert('Erro ao atualizar status: ' + msg);
                                                                        }
                                                                    }}
                                                                    className={`min-h-[40px] px-3 py-2 rounded-xl border font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all ${status === 'resolved'
                                                                        ? 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:bg-neutral-800'
                                                                        : 'bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20'
                                                                        }`}
                                                                >
                                                                    {status === 'resolved' ? 'Reabrir' : 'Resolver'}
                                                                </button>
                                                                {
                                                                    status !== 'ignored' && status !== 'resolved' && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={async () => {
                                                                                try {
                                                                                    const { error } = await supabase.from('error_reports').update({ status: 'ignored' }).eq('id', r.id);
                                                                                    if (error) throw error;
                                                                                    setErrorReports((prev) => {
                                                                                        const list = Array.isArray(prev) ? prev : [];
                                                                                        return list.map((x) => (x?.id === r.id ? { ...x, status: 'ignored' } : x));
                                                                                    });
                                                                                } catch (e: unknown) {
                                                                                    const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
                                                                                    await alert('Erro ao ignorar: ' + msg);
                                                                                }
                                                                            }
                                                                            }
                                                                            className="min-h-[40px] px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 hover:bg-neutral-800 text-neutral-400 hover:text-white font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all"
                                                                        >
                                                                            Ignorar
                                                                        </button>
                                                                    )}
                                                                <button
                                                                    type="button"
                                                                    onClick={async () => {
                                                                        if (!confirm('Tem certeza que deseja apagar este erro permanentemente?')) return;
                                                                        try {
                                                                            const { error } = await supabase.from('error_reports').delete().eq('id', r.id);
                                                                            if (error) throw error;
                                                                            setErrorReports((prev) => {
                                                                                const list = Array.isArray(prev) ? prev : [];
                                                                                return list.filter((x) => x?.id !== r.id);
                                                                            });
                                                                        } catch (e: unknown) {
                                                                            const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
                                                                            await alert('Erro ao apagar: ' + msg);
                                                                        }
                                                                    }}
                                                                    title="Apagar erro"
                                                                    className="w-10 h-10 rounded-xl bg-neutral-900 border border-neutral-700 hover:bg-red-900/20 hover:border-red-500/30 text-neutral-500 hover:text-red-400 flex items-center justify-center active:scale-95 transition-all"
                                                                >
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {
                                                            (stack || r?.url) ? (
                                                                <details className="mt-3 group/details" >
                                                                    <summary className="cursor-pointer text-[11px] font-black uppercase tracking-widest text-neutral-500 hover:text-white flex items-center gap-2 select-none" >
                                                                        <ChevronDown size={14} className="group-open/details:rotate-180 transition-transform" />
                                                                        Detalhes Técnicos
                                                                    </summary>
                                                                    < div className="mt-3 grid gap-3 pl-2 border-l-2 border-neutral-800" >
                                                                        {String(r?.url || '').trim() ? (
                                                                            <div className="text-[11px] text-neutral-400 break-all" >
                                                                                <span className="font-black text-neutral-300" > URL: </span> {String(r.url)}
                                                                            </div>
                                                                        ) : null
                                                                        }
                                                                        {
                                                                            String(r?.source || '').trim() ? (
                                                                                <div className="text-[11px] text-neutral-400 break-all" >
                                                                                    <span className="font-black text-neutral-300" > Fonte: </span> {String(r.source)}
                                                                                </div>
                                                                            ) : null
                                                                        }
                                                                        {
                                                                            String(r?.app_version || r?.appVersion || '').trim() ? (
                                                                                <div className="text-[11px] text-neutral-400 break-all" >
                                                                                    <span className="font-black text-neutral-300" > Versão: </span> {String(r.app_version || r.appVersion)}
                                                                                </div>
                                                                            ) : null
                                                                        }
                                                                        {
                                                                            stack ? (
                                                                                <div className="relative group/stack" >
                                                                                    <pre className="text-[10px] leading-relaxed font-mono text-neutral-400 whitespace-pre-wrap break-words bg-black/40 border border-neutral-800 rounded-lg p-3 overflow-auto max-h-[300px] custom-scrollbar select-text" >
                                                                                        {stack}
                                                                                    </pre>
                                                                                    < button
                                                                                        onClick={() => navigator.clipboard.writeText(stack)
                                                                                        }
                                                                                        className="absolute top-2 right-2 p-1.5 rounded-md bg-neutral-800 text-neutral-400 hover:text-white opacity-0 group-hover/stack:opacity-100 transition-opacity"
                                                                                        title="Copiar Stack Trace"
                                                                                    >
                                                                                        <Copy size={12} />
                                                                                    </button>
                                                                                </div>
                                                                            ) : null}
                                                                    </div>
                                                                </details>
                                                            ) : null}
                                                    </div>
                                                );
                                            })}
                                    </div>
                                )}
                        </div>
                    )}

                {
                    tab === 'vip_reports' && !selectedStudent && (
                        <AdminVipReports supabase={supabase} />
                    )
                }

                {
                    tab === 'system' && !selectedStudent && (
                        <div className="space-y-8" >
                            <div className="bg-neutral-800 p-4 rounded-xl border border-neutral-700 space-y-4" >
                                <div className="flex items-start justify-between gap-3" >
                                    <div className="min-w-0" >
                                        <h3 className="font-bold text-white flex items-center gap-2" >
                                            <FileText size={20} className="text-yellow-500" /> RELATÓRIO DE USUÁRIOS
                                        </h3>
                                        < div className="mt-1 text-xs text-neutral-400 font-semibold" >
                                            {userActivitySelected ? `Selecionado: ${String(userActivitySelected?.displayName || userActivitySelected?.email || userActivitySelected?.id || '').trim() || 'Usuário'}` : 'Selecione um usuário para ver o histórico.'
                                            }
                                        </div>
                                    </div>
                                    < button
                                        type="button"
                                        onClick={() => loadUserActivityUsers({ q: userActivityQuery, role: userActivityRole })}
                                        disabled={userActivityLoading}
                                        className="min-h-[40px] px-4 py-2 rounded-xl font-black text-[11px] uppercase tracking-widest bg-neutral-900 border border-neutral-700 text-neutral-200 hover:bg-neutral-800 disabled:opacity-50 inline-flex items-center gap-2"
                                    >
                                        <RefreshCw size={14} />
                                        {userActivityLoading ? 'Atualizando...' : 'Atualizar'}
                                    </button>
                                </div>

                                < div className="grid grid-cols-1 lg:grid-cols-2 gap-4" >
                                    <div className="space-y-3" >
                                        <div className="flex flex-col sm:flex-row gap-2" >
                                            <div className="flex-1 relative" >
                                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" >
                                                    <Search size={16} />
                                                </div>
                                                < input
                                                    value={userActivityQuery}
                                                    onChange={(e) => setUserActivityQuery(e.target.value)}
                                                    placeholder="Buscar por nome ou email"
                                                    className="w-full pl-10 pr-3 py-3 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-bold outline-none focus:border-yellow-500"
                                                />
                                            </div>
                                            < select
                                                value={userActivityRole}
                                                onChange={(e) => setUserActivityRole(e.target.value)}
                                                className="min-h-[44px] px-3 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-bold outline-none focus:border-yellow-500"
                                            >
                                                <option value="all" > Todos </option>
                                                < option value="user" > Aluno </option>
                                                < option value="teacher" > Professor </option>
                                                < option value="admin" > Admin </option>
                                            </select>
                                        </div>

                                        {
                                            userActivityError ? (
                                                <div className="bg-neutral-900 border border-red-500/30 rounded-xl p-3 text-sm text-red-300" >
                                                    {userActivityError}
                                                </div>
                                            ) : null
                                        }

                                        <div className="space-y-2 max-h-[50vh] overflow-y-auto custom-scrollbar pr-1" >
                                            {(Array.isArray(userActivityUsers) ? userActivityUsers : []).map((u) => {
                                                const id = String(u?.id || '').trim();
                                                const isSel = userActivitySelected && String(userActivitySelected?.id || '').trim() === id;
                                                const name = String(u?.displayName || u?.display_name || u?.email || '').trim() || `Usuário ${id.slice(0, 6)}`;
                                                const role = String(u?.role || '').trim();
                                                return (
                                                    <button
                                                        key={id}
                                                        type="button"
                                                        onClick={() => openUserActivityUser(u)
                                                        }
                                                        className={`w-full text-left rounded-xl border p-3 flex items-center gap-3 hover:bg-neutral-900/60 ${isSel ? 'border-yellow-500/40 bg-neutral-900/70' : 'border-neutral-700 bg-neutral-900/30'
                                                            }`}
                                                    >
                                                        <div className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 overflow-hidden flex items-center justify-center shrink-0" >
                                                            {String(u?.photoUrl || u?.photo_url || '').trim() ? (
                                                                <Image src={String(u.photoUrl || u.photo_url)} alt={name} width={40} height={40} className="w-10 h-10 object-cover" />
                                                            ) : (
                                                                <UserCog size={18} className="text-neutral-400" />
                                                            )}
                                                        </div>
                                                        < div className="min-w-0 flex-1" >
                                                            <div className="text-sm font-black text-white truncate" > {name} </div>
                                                            < div className="text-[11px] text-neutral-400 font-bold truncate" >
                                                                {role ? role.toUpperCase() : '—'} {String(u?.email || '').trim() ? `· ${String(u.email)}` : ''}
                                                            </div>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                            {
                                                !userActivityLoading && (!userActivityUsers || userActivityUsers.length === 0) ? (
                                                    <div className="text-sm text-neutral-400 font-semibold" > Nenhum usuário encontrado.</div>
                                                ) : null
                                            }
                                        </div>
                                    </div>

                                    < div className="space-y-4" >
                                        {!userActivitySelected ? (
                                            <div className="bg-neutral-900/30 border border-neutral-700 rounded-xl p-4 text-sm text-neutral-400 font-semibold" >
                                                Selecione um usuário para ver o relatório.
                                            </div>
                                        ) : (
                                            <>
                                                <div className="bg-neutral-900/30 border border-neutral-700 rounded-xl p-4 space-y-3" >
                                                    <div className="flex items-center justify-between gap-2" >
                                                        <div className="text-xs font-black uppercase tracking-widest text-neutral-400" > Resumo </div>
                                                        < div className="flex items-center gap-2" >
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setUserActivityDays(7);
                                                                    loadUserActivitySummary({ userId: userActivitySelected?.id, days: 7 });
                                                                }}
                                                                className={`min-h-[34px] px-3 rounded-xl text-[11px] font-black uppercase tracking-widest border ${userActivityDays === 7 ? 'bg-yellow-500 text-black border-yellow-400' : 'bg-neutral-900 text-neutral-200 border-neutral-700 hover:bg-neutral-800'
                                                                    }`}
                                                            >
                                                                7d
                                                            </button>
                                                            < button
                                                                type="button"
                                                                onClick={() => {
                                                                    setUserActivityDays(30);
                                                                    loadUserActivitySummary({ userId: userActivitySelected?.id, days: 30 });
                                                                }}
                                                                className={`min-h-[34px] px-3 rounded-xl text-[11px] font-black uppercase tracking-widest border ${userActivityDays === 30 ? 'bg-yellow-500 text-black border-yellow-400' : 'bg-neutral-900 text-neutral-200 border-neutral-700 hover:bg-neutral-800'
                                                                    }`}
                                                            >
                                                                30d
                                                            </button>
                                                            < button
                                                                type="button"
                                                                onClick={() => {
                                                                    loadUserActivitySummary({ userId: userActivitySelected?.id, days: userActivityDays });
                                                                    loadUserActivityEvents({ userId: userActivitySelected?.id, reset: true });
                                                                    loadUserActivityErrors({ userId: userActivitySelected?.id });
                                                                }}
                                                                className="min-h-[34px] px-3 rounded-xl text-[11px] font-black uppercase tracking-widest bg-neutral-900 border border-neutral-700 text-neutral-200 hover:bg-neutral-800 inline-flex items-center gap-2"
                                                            >
                                                                <RefreshCw size={14} />
                                                                Recarregar
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {
                                                        userActivitySummaryLoading ? (
                                                            <div className="text-sm text-neutral-400 font-semibold" > Carregando resumo...</div>
                                                        ) : userActivitySummary?.ok ? (
                                                            <div className="space-y-2" >
                                                                <div className="text-[11px] text-neutral-500 font-bold" >
                                                                    Eventos no período: <span className="text-neutral-200" > {Number(userActivitySummary?.total || 0)
                                                                    } </span>
                                                                </div>
                                                                < div className="space-y-1" >
                                                                    {(Array.isArray(userActivitySummary?.topEvents) ? userActivitySummary.topEvents : []).slice(0, 10).map((it) => (
                                                                        <div key={it.name} className="flex items-center justify-between gap-3 text-[11px]" >
                                                                            <div className="text-neutral-300 font-bold truncate" > {it.name} </div>
                                                                            < div className="text-neutral-400 font-black tabular-nums" > {it.count} </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="text-sm text-neutral-400 font-semibold" > Sem dados no período.</div>
                                                        )}
                                                </div>

                                                < div className="bg-neutral-900/30 border border-neutral-700 rounded-xl p-4 space-y-3" >
                                                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400" > Timeline </div>
                                                    {
                                                        userActivityEventsLoading && (!userActivityEvents || userActivityEvents.length === 0) ? (
                                                            <div className="text-sm text-neutral-400 font-semibold" > Carregando eventos...</div>
                                                        ) : (
                                                            <div className="space-y-2 max-h-[45vh] overflow-y-auto custom-scrollbar pr-1" >
                                                                {(Array.isArray(userActivityEvents) ? userActivityEvents : []).map((ev) => (
                                                                    <div key={String((ev as UnknownRecord)?.id ?? '')
                                                                    } className="rounded-xl border border-neutral-800 bg-black/30 p-3" >
                                                                        <div className="flex items-center justify-between gap-3" >
                                                                            <div className="min-w-0" >
                                                                                <div className="text-sm font-black text-white truncate" > {String(ev?.name || '')}</div>
                                                                                < div className="text-[11px] text-neutral-400 font-bold truncate" >
                                                                                    {String(ev?.type || '').trim() ? String(ev.type) : 'evento'} {String(ev?.screen || '').trim() ? `· ${String(ev.screen)}` : ''} {String(ev?.path || '').trim() ? `· ${String(ev.path)}` : ''}
                                                                                </div>
                                                                            </div>
                                                                            < div className="text-[11px] text-neutral-500 font-bold tabular-nums whitespace-nowrap" >
                                                                                {String(ev?.createdAt || '').trim() ? new Date(String(ev.createdAt)).toLocaleString('pt-BR') : ''}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                                {
                                                                    !userActivityEventsLoading && (!userActivityEvents || userActivityEvents.length === 0) ? (
                                                                        <div className="text-sm text-neutral-400 font-semibold" > Sem eventos registrados.</div>
                                                                    ) : null
                                                                }
                                                            </div>
                                                        )}
                                                    {
                                                        userActivityEventsBefore ? (
                                                            <button
                                                                type="button"
                                                                disabled={userActivityEventsLoading}
                                                                onClick={() => loadUserActivityEvents({ userId: userActivitySelected?.id, before: userActivityEventsBefore })
                                                                }
                                                                className="w-full min-h-[40px] rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black text-[11px] uppercase tracking-widest hover:bg-neutral-800 disabled:opacity-50"
                                                            >
                                                                {userActivityEventsLoading ? 'Carregando...' : 'Carregar mais'}
                                                            </button>
                                                        ) : null}
                                                </div>

                                                < div className="bg-neutral-900/30 border border-neutral-700 rounded-xl p-4 space-y-3" >
                                                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400" > Erros recentes </div>
                                                    {
                                                        userActivityErrorsLoading ? (
                                                            <div className="text-sm text-neutral-400 font-semibold" > Carregando erros...</div>
                                                        ) : (
                                                            <div className="space-y-2" >
                                                                {(Array.isArray(userActivityErrors) ? userActivityErrors : []).slice(0, 8).map((er) => (
                                                                    <div key={String((er as UnknownRecord)?.id ?? '')
                                                                    } className="rounded-xl border border-neutral-800 bg-black/30 p-3" >
                                                                        <div className="text-sm font-black text-white truncate" > {String(er?.message || '').trim() || 'Erro'}</div>
                                                                        < div className="text-[11px] text-neutral-400 font-bold truncate" >
                                                                            {String(er?.status || '').trim() ? String(er.status) : ''} {String(er?.pathname || '').trim() ? `· ${String(er.pathname)}` : ''} {String(er?.created_at || '').trim() ? `· ${new Date(String(er.created_at)).toLocaleString('pt-BR')}` : ''}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                                {
                                                                    !userActivityErrorsLoading && (!userActivityErrors || userActivityErrors.length === 0) ? (
                                                                        <div className="text-sm text-neutral-400 font-semibold" > Nenhum erro reportado.</div>
                                                                    ) : null
                                                                }
                                                            </div>
                                                        )}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                            < div className="bg-neutral-800 p-4 rounded-xl border border-neutral-700 space-y-4" >
                                <h3 className="font-bold text-white flex items-center gap-2" > <Download size={20} className="text-yellow-500" /> BACKUP DO SISTEMA </h3>
                                < div className="flex gap-2" >
                                    <button onClick={handleExportSystem} disabled={systemExporting} className="flex-1 min-h-[44px] py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-black rounded-xl disabled:opacity-50" > Exportar JSON </button>
                                    < button onClick={handleImportSystemClick} disabled={systemImporting} className="flex-1 min-h-[44px] py-3 bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold rounded-xl hover:bg-neutral-700 disabled:opacity-50" > Importar JSON </button>
                                    < input ref={systemFileInputRef} type="file" accept=".json" className="hidden" onChange={handleImportSystem} />
                                </div>
                            </div>
                            {/* Broadcast Section */}
                            <div className="bg-neutral-800 p-4 rounded-xl border border-neutral-700 space-y-4" >
                                <h3 className="font-bold text-white flex items-center gap-2" > <Megaphone size={20} className="text-yellow-500" /> ENVIAR COMUNICADO </h3>
                                < div >
                                    <label className="text-xs font-bold text-neutral-500 uppercase" > Título do Aviso </label>
                                    < input value={broadcastTitle} onChange={e => setBroadcastTitle(e.target.value)} className="w-full bg-neutral-900 p-3 rounded-lg text-white font-bold mt-1 border border-neutral-700 focus:border-yellow-500 outline-none" />
                                </div>
                                < div >
                                    <label className="text-xs font-bold text-neutral-500 uppercase" > Mensagem </label>
                                    < textarea value={broadcastMsg} onChange={e => setBroadcastMsg(e.target.value)} className="w-full bg-neutral-900 p-3 rounded-lg text-white mt-1 border border-neutral-700 focus:border-yellow-500 outline-none h-32" />
                                </div>
                                < button onClick={handleSendBroadcast} disabled={sendingBroadcast} className="w-full py-4 bg-yellow-500 hover:bg-yellow-400 text-black font-black rounded-xl flex items-center justify-center gap-2 disabled:opacity-50" >
                                    {sendingBroadcast ? 'Enviando...' : 'ENVIAR AVISO'}
                                </button>
                            </div>

                            < div className="bg-neutral-800 p-4 rounded-xl border border-neutral-700 space-y-4" >
                                <div className="flex items-start justify-between gap-3" >
                                    <div className="min-w-0" >
                                        <h3 className="font-bold text-white flex items-center gap-2" > <Dumbbell size={20} className="text-yellow-500" /> REVISAR EXERCÍCIOS(ALIASES) </h3>
                                        < div className="mt-1 text-xs text-neutral-400 font-semibold" >
                                            {exerciseAliasesLoading ? 'Carregando...' : `${Array.isArray(exerciseAliasesReview) ? exerciseAliasesReview.length : 0} pendentes`}
                                        </div>
                                    </div>
                                    < div className="flex flex-col sm:flex-row gap-2" >
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                if (!isAdmin) return;
                                                if (exerciseAliasesBackfillLoading) return;
                                                setExerciseAliasesBackfillLoading(true);
                                                setExerciseAliasesNotice('');
                                                try {
                                                    const authHeaders = await getAdminAuthHeaders();
                                                    const res = await fetch('/api/admin/exercises/canonicalize/backfill', {
                                                        method: 'POST',
                                                        headers: { 'content-type': 'application/json', ...authHeaders },
                                                        body: JSON.stringify({ limit: 30 }),
                                                    });
                                                    const json = await res.json().catch((): any => null);
                                                    if (!res.ok || !json?.ok) {
                                                        const msg = String(json?.error || `Falha ao processar (${res.status})`);
                                                        setExerciseAliasesNotice(msg);
                                                        return;
                                                    }
                                                    const msg = `Processados: ${json.processed || 0} · Atualizados: ${json.updated || 0} · Falhas: ${json.failed || 0}`;
                                                    setExerciseAliasesNotice(msg);
                                                } catch (e: unknown) {
                                                    const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : '';
                                                    if (msg) setExerciseAliasesNotice(msg);
                                                } finally {
                                                    setExerciseAliasesBackfillLoading(false);
                                                }
                                            }}
                                            disabled={exerciseAliasesBackfillLoading}
                                            className="min-h-[40px] px-4 py-2 rounded-xl font-black text-[11px] uppercase tracking-widest bg-yellow-500 hover:bg-yellow-400 text-black disabled:opacity-50"
                                        >
                                            {exerciseAliasesBackfillLoading ? 'Processando...' : 'Processar (Gemini)'}
                                        </button>
                                        < button
                                            type="button"
                                            onClick={async () => {
                                                if (!isAdmin) return;
                                                setExerciseAliasesLoading(true);
                                                setExerciseAliasesError('');
                                                setExerciseAliasesNotice('');
                                                try {
                                                    const { data, error } = await supabase
                                                        .from('exercise_aliases')
                                                        .select('id, user_id, canonical_id, alias, normalized_alias, confidence, source, needs_review, created_at, updated_at')
                                                        .eq('needs_review', true)
                                                        .order('created_at', { ascending: false })
                                                        .limit(200);
                                                    if (error) {
                                                        setExerciseAliasesReview([]);
                                                        const msg = String(error?.message || '');
                                                        if (msg) setExerciseAliasesError(msg);
                                                        return;
                                                    }
                                                    setExerciseAliasesReview(Array.isArray(data) ? data : []);
                                                } catch (e: unknown) {
                                                    setExerciseAliasesReview([]);
                                                    const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : '';
                                                    if (msg) setExerciseAliasesError(msg);
                                                } finally {
                                                    setExerciseAliasesLoading(false);
                                                }
                                            }}
                                            disabled={exerciseAliasesLoading}
                                            className="min-h-[40px] px-4 py-2 rounded-xl font-black text-[11px] uppercase tracking-widest bg-neutral-900 border border-neutral-700 text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
                                        >
                                            {exerciseAliasesLoading ? 'Atualizando...' : 'Atualizar'}
                                        </button>
                                    </div>
                                </div>

                                {
                                    exerciseAliasesNotice ? (
                                        <div className="text-xs text-neutral-200 font-bold bg-neutral-900 border border-neutral-700 rounded-xl p-3" >
                                            {exerciseAliasesNotice}
                                        </div>
                                    ) : null
                                }

                                {
                                    exerciseAliasesError ? (
                                        <div className="text-xs text-red-300 font-bold bg-neutral-900 border border-neutral-700 rounded-xl p-3" >
                                            {exerciseAliasesError}
                                        </div>
                                    ) : null
                                }

                                {
                                    exerciseAliasesLoading ? (
                                        <div className="text-xs text-neutral-400 font-semibold" > Carregando aliases pendentes...</div>
                                    ) : !Array.isArray(exerciseAliasesReview) || exerciseAliasesReview.length === 0 ? (
                                        <div className="text-xs text-neutral-400 font-semibold" > Nenhum alias pendente de revisão.</div>
                                    ) : (
                                        <div className="space-y-2" >
                                            {
                                                exerciseAliasesReview.slice(0, 30).map((row) => {
                                                    const id = row?.id ? String(row.id) : '';
                                                    const userId = row?.user_id ? String(row.user_id) : '';
                                                    const alias = row?.alias ? String(row.alias) : '';
                                                    const conf = Number(row?.confidence);
                                                    const src = row?.source ? String(row.source) : '';
                                                    return (
                                                        <div key={id || `${userId}-${alias}`
                                                        } className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3" >
                                                            <div className="min-w-0" >
                                                                <div className="text-sm font-black text-white truncate" > {alias || '—'} </div>
                                                                < div className="text-[11px] text-neutral-400 break-all" >
                                                                    <span className="font-black text-neutral-300" > User: </span> {userId ? `${userId.slice(0, 8)}...` : '—'
                                                                    } {' '}
                                                                    <span className="mx-2" >·</span>
                                                                    <span className="font-black text-neutral-300" > Fonte: </span> {src || '—'}{' '}
                                                                    <span className="mx-2" >·</span>
                                                                    <span className="font-black text-neutral-300" > Conf: </span> {Number.isFinite(conf) ? conf.toFixed(2) : '—'}
                                                                </div>
                                                            </div>
                                                            < div className="flex flex-col sm:flex-row gap-2" >
                                                                <button
                                                                    type="button"
                                                                    onClick={async () => {
                                                                        try {
                                                                            const name = await prompt('Defina o nome canônico', 'Resolver alias', alias);
                                                                            const canon = String(name || '').trim();
                                                                            if (!canon) return;
                                                                            const norm = normalizeExerciseName(canon);
                                                                            if (!norm) return;
                                                                            const { data: canonRow, error: canonErr } = await supabase
                                                                                .from('exercise_canonical')
                                                                                .upsert(
                                                                                    { user_id: userId, display_name: canon, normalized_name: norm },
                                                                                    { onConflict: 'user_id,normalized_name' }
                                                                                )
                                                                                .select('id')
                                                                                .maybeSingle();
                                                                            if (canonErr || !canonRow?.id) {
                                                                                await alert('Falha ao salvar canônico: ' + String(canonErr?.message || ''));
                                                                                return;
                                                                            }
                                                                            const canonicalId = String(canonRow.id);
                                                                            const { error: upErr } = await supabase
                                                                                .from('exercise_aliases')
                                                                                .update({ canonical_id: canonicalId, confidence: 1, source: 'human', needs_review: false })
                                                                                .eq('id', id);
                                                                            if (upErr) {
                                                                                await alert('Falha ao atualizar alias: ' + String(upErr?.message || ''));
                                                                                return;
                                                                            }
                                                                            setExerciseAliasesReview((prev) => (Array.isArray(prev) ? prev.filter((x) => String(x?.id || '') !== id) : prev));
                                                                        } catch (e: unknown) {
                                                                            const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
                                                                            await alert('Falha ao resolver: ' + msg);
                                                                        }
                                                                    }}
                                                                    className="min-h-[40px] px-4 py-2 rounded-xl font-black text-[11px] uppercase tracking-widest bg-yellow-500 hover:bg-yellow-400 text-black active:scale-95 transition-transform"
                                                                >
                                                                    Resolver
                                                                </button>
                                                                < button
                                                                    type="button"
                                                                    onClick={async () => {
                                                                        try {
                                                                            if (!(await confirm('Ignorar este alias? (não aparecerá mais para revisão)', 'Ignorar'))) return;
                                                                            const { error: upErr } = await supabase.from('exercise_aliases').update({ needs_review: false }).eq('id', id);
                                                                            if (upErr) {
                                                                                await alert('Falha ao ignorar: ' + String(upErr?.message || ''));
                                                                                return;
                                                                            }
                                                                            setExerciseAliasesReview((prev) => (Array.isArray(prev) ? prev.filter((x) => String(x?.id || '') !== id) : prev));
                                                                        } catch (e: unknown) {
                                                                            const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
                                                                            await alert('Falha ao ignorar: ' + msg);
                                                                        }
                                                                    }}
                                                                    className="min-h-[40px] px-4 py-2 rounded-xl font-black text-[11px] uppercase tracking-widest bg-neutral-900 border border-neutral-700 text-neutral-200 hover:bg-neutral-800 active:scale-95 transition-transform"
                                                                >
                                                                    Ignorar
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                        </div>
                                    )}
                            </div>

                            < div className="bg-red-950/40 p-4 rounded-2xl border border-red-500/40 shadow-[0_16px_40px_rgba(0,0,0,0.75)]" >
                                <button
                                    type="button"
                                    onClick={() => setDangerOpen(v => !v)}
                                    className="w-full flex items-center justify-between gap-3 active:scale-[0.99] transition-transform"
                                >
                                    <div className="flex items-center gap-3 min-w-0" >
                                        <div className="w-10 h-10 rounded-2xl bg-red-900/70 border border-red-500/60 flex items-center justify-center flex-shrink-0 shadow-[0_0_25px_rgba(248,113,113,0.35)]" >
                                            <ShieldAlert size={18} className="text-red-300" />
                                        </div>
                                        < div className="min-w-0 text-left" >
                                            <div className="font-black text-red-400 tracking-[0.18em] text-[11px] uppercase" > Danger Zone </div>
                                            < div className="text-xs text-neutral-300 font-semibold" > Ações irreversíveis com confirmação dupla.Não há como desfazer.</div>
                                        </div>
                                    </div>
                                    < div className={`w-9 h-9 rounded-full bg-neutral-900 border border-red-700 flex items-center justify-center transition-all duration-300 ${dangerOpen ? 'rotate-180' : ''}`}>
                                        <ChevronDown size={16} className="text-red-300" />
                                    </div>
                                </button>

                                {
                                    dangerOpen && (
                                        <div className="mt-4 space-y-3" >
                                            <div className="bg-red-900/20 border border-red-500/40 rounded-2xl p-3 space-y-3" >
                                                <div className="flex items-start justify-between gap-3" >
                                                    <div className="flex items-center gap-3 min-w-0" >
                                                        <div className="w-9 h-9 rounded-2xl bg-red-950/60 border border-red-500/60 flex items-center justify-center flex-shrink-0" >
                                                            <Trash2 size={16} className="text-red-300" />
                                                        </div>
                                                        < div className="min-w-0" >
                                                            <div className="text-[12px] font-black uppercase tracking-widest text-red-300 truncate" > Zerar todos os alunos </div>
                                                            < div className="text-[11px] text-neutral-300" > Remove definitivamente todos os cadastros de alunos e seus vínculos.</div>
                                                        </div>
                                                    </div>
                                                    <span className="px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-red-950/80 border border-red-500/60 text-red-300" > Irreversível </span>
                                                </div>
                                                < div className="space-y-2" >
                                                    <div className="text-[11px] text-neutral-300 font-semibold" > Para confirmar, digite <span className="font-black text-red-300" > APAGAR </span> no campo abaixo.</div >
                                                    <div className="flex flex-col sm:flex-row gap-2" >
                                                        <input
                                                            value={dangerStudentsConfirm}
                                                            onChange={(e) => setDangerStudentsConfirm(e.target.value)
                                                            }
                                                            placeholder="Digite APAGAR para confirmar"
                                                            className="flex-1 min-h-[40px] bg-neutral-950/80 border border-red-800 rounded-xl px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-red-500"
                                                        />
                                                        <button
                                                            type="button"
                                                            disabled={
                                                                dangerActionLoading === 'students' ||
                                                                String(dangerStudentsConfirm || '').trim().toUpperCase() !== 'APAGAR'
                                                            }
                                                            onClick={() =>
                                                                runDangerAction('students', 'ZERAR TODOS OS ALUNOS', clearAllStudents, () =>
                                                                    setDangerStudentsConfirm('')
                                                                )
                                                            }
                                                            className="w-full sm:w-auto min-h-[40px] px-4 py-2 rounded-xl font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all duration-300 active:scale-95 bg-red-600 hover:bg-red-500 text-white border border-red-400 shadow-[0_0_25px_rgba(248,113,113,0.35)] disabled:opacity-40 disabled:cursor-not-allowed"
                                                        >
                                                            {dangerActionLoading === 'students' ? 'Executando...' : 'Apagar tudo'}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            < div className="bg-red-900/20 border border-red-500/40 rounded-2xl p-3 space-y-3" >
                                                <div className="flex items-start justify-between gap-3" >
                                                    <div className="flex items-center gap-3 min-w-0" >
                                                        <div className="w-9 h-9 rounded-2xl bg-red-950/60 border border-red-500/60 flex items-center justify-center flex-shrink-0" >
                                                            <Trash2 size={16} className="text-red-300" />
                                                        </div>
                                                        < div className="min-w-0" >
                                                            <div className="text-[12px] font-black uppercase tracking-widest text-red-300 truncate" > Zerar todos os professores </div>
                                                            < div className="text-[11px] text-neutral-300" > Exclui todos os professores cadastrados e seus acessos à plataforma.</div>
                                                        </div>
                                                    </div>
                                                    <span className="px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-red-950/80 border border-red-500/60 text-red-300" > Irreversível </span>
                                                </div>
                                                < div className="space-y-2" >
                                                    <div className="text-[11px] text-neutral-300 font-semibold" > Para confirmar, digite <span className="font-black text-red-300" > APAGAR </span> no campo abaixo.</div >
                                                    <div className="flex flex-col sm:flex-row gap-2" >
                                                        <input
                                                            value={dangerTeachersConfirm}
                                                            onChange={(e) => setDangerTeachersConfirm(e.target.value)}
                                                            placeholder="Digite APAGAR para confirmar"
                                                            className="flex-1 min-h-[40px] bg-neutral-950/80 border border-red-800 rounded-xl px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-red-500"
                                                        />
                                                        <button
                                                            type="button"
                                                            disabled={
                                                                dangerActionLoading === 'teachers' ||
                                                                String(dangerTeachersConfirm || '').trim().toUpperCase() !== 'APAGAR'
                                                            }
                                                            onClick={() =>
                                                                runDangerAction('teachers', 'ZERAR TODOS OS PROFESSORES', clearAllTeachers, () =>
                                                                    setDangerTeachersConfirm('')
                                                                )
                                                            }
                                                            className="w-full sm:w-auto min-h-[40px] px-4 py-2 rounded-xl font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all duration-300 active:scale-95 bg-red-600 hover:bg-red-500 text-white border border-red-400 shadow-[0_0_25px_rgba(248,113,113,0.35)] disabled:opacity-40 disabled:cursor-not-allowed"
                                                        >
                                                            {dangerActionLoading === 'teachers' ? 'Executando...' : 'Apagar tudo'}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            < div className="bg-red-900/20 border border-red-500/40 rounded-2xl p-3 space-y-3" >
                                                <div className="flex items-start justify-between gap-3" >
                                                    <div className="flex items-center gap-3 min-w-0" >
                                                        <div className="w-9 h-9 rounded-2xl bg-red-950/60 border border-red-500/60 flex items-center justify-center flex-shrink-0" >
                                                            <Trash2 size={16} className="text-red-300" />
                                                        </div>
                                                        < div className="min-w-0" >
                                                            <div className="text-[12px] font-black uppercase tracking-widest text-red-300 truncate" > Zerar todos os treinos </div>
                                                            < div className="text-[11px] text-neutral-300" > Remove todos os treinos cadastrados, incluindo templates e históricos associados.</div>
                                                        </div>
                                                    </div>
                                                    <span className="px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-red-950/80 border border-red-500/60 text-red-300" > Irreversível </span>
                                                </div>
                                                < div className="space-y-2" >
                                                    <div className="text-[11px] text-neutral-300 font-semibold" > Para confirmar, digite <span className="font-black text-red-300" > APAGAR </span> no campo abaixo.</div >
                                                    <div className="flex flex-col sm:flex-row gap-2" >
                                                        <input
                                                            value={dangerWorkoutsConfirm}
                                                            onChange={(e) => setDangerWorkoutsConfirm(e.target.value)}
                                                            placeholder="Digite APAGAR para confirmar"
                                                            className="flex-1 min-h-[40px] bg-neutral-950/80 border border-red-800 rounded-xl px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-red-500"
                                                        />
                                                        <button
                                                            type="button"
                                                            disabled={
                                                                dangerActionLoading === 'workouts' ||
                                                                String(dangerWorkoutsConfirm || '').trim().toUpperCase() !== 'APAGAR'
                                                            }
                                                            onClick={() =>
                                                                runDangerAction('workouts', 'ZERAR TODOS OS TREINOS', clearAllWorkouts, () =>
                                                                    setDangerWorkoutsConfirm('')
                                                                )
                                                            }
                                                            className="w-full sm:w-auto min-h-[40px] px-4 py-2 rounded-xl font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all duration-300 active:scale-95 bg-red-600 hover:bg-red-500 text-white border border-red-400 shadow-[0_0_25px_rgba(248,113,113,0.35)] disabled:opacity-40 disabled:cursor-not-allowed"
                                                        >
                                                            {dangerActionLoading === 'workouts' ? 'Executando...' : 'Apagar tudo'}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                            </div>
                        </div>
                    )}

                {
                    tab === 'teachers' && isAdmin && !selectedStudent && !selectedTeacher && (
                        <div className="w-full space-y-4" >
                            <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.35)]" >
                                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3" >
                                    <div className="min-w-0" >
                                        <div className="flex items-center gap-2" >
                                            <UserCog size={18} className="text-yellow-500" />
                                            <h2 className="text-base md:text-lg font-black tracking-tight" > Professores </h2>
                                        </div>
                                        < div className="mt-1 text-xs text-neutral-400 font-semibold" > {(Array.isArray(teachersList) ? teachersList.length : 0)
                                        } cadastrados </div>
                                    </div>
                                    < div className="flex flex-col sm:flex-row gap-2" >
                                        <button
                                            onClick={() => setShowTeacherModal(true)}
                                            className="min-h-[44px] px-4 py-3 bg-yellow-500 hover:bg-yellow-400 text-black rounded-xl font-black flex items-center justify-center gap-2 transition-all duration-300 shadow-lg shadow-yellow-500/15 active:scale-95"
                                        >
                                            <Plus size={18} /> ADICIONAR
                                        </button>
                                    </div>
                                </div>
                                < div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-2" >
                                    <div className="relative lg:col-span-2" >
                                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                                        <input
                                            value={teacherQuery}
                                            onChange={(e) => setTeacherQuery(e.target.value)}
                                            placeholder="Buscar professor por nome ou email"
                                            className="w-full min-h-[44px] bg-neutral-900/70 border border-neutral-800 rounded-xl pl-10 pr-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-yellow-500"
                                        />
                                    </div>
                                    < div className="flex items-center gap-2 overflow-x-auto no-scrollbar" >
                                        {
                                            [
                                                { key: 'all', label: 'Todos' },
                                                { key: 'pago', label: 'Pago' },
                                                { key: 'pendente', label: 'Pendente' },
                                                { key: 'atrasado', label: 'Atrasado' },
                                                { key: 'cancelar', label: 'Cancelar' }
                                            ].map((opt) => (
                                                <button
                                                    key={opt.key}
                                                    type="button"
                                                    onClick={() => setTeacherStatusFilter(opt.key)}
                                                    className={`whitespace-nowrap min-h-[40px] px-3 py-2 rounded-full text-[11px] font-black uppercase tracking-wide border transition-all duration-300 active:scale-95 ${teacherStatusFilter === opt.key
                                                        ? 'bg-yellow-500 text-black border-yellow-400 shadow-lg shadow-yellow-500/15'
                                                        : 'bg-neutral-900/60 text-neutral-200 border-neutral-800 hover:bg-neutral-900'
                                                        }`}
                                                >
                                                    {opt.label}
                                                </button>
                                            ))}
                                    </div>
                                </div>
                            </div>

                            {
                                teachersFiltered.length === 0 ? (
                                    <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 text-center" >
                                        <p className="text-neutral-500" > Nenhum professor encontrado.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3" >
                                        {
                                            teachersFiltered.map((t) => (
                                                <div
                                                    key={String(t.id ?? t.user_id ?? t.email ?? '')
                                                    }
                                                    className="bg-neutral-800 p-4 rounded-2xl flex justify-between items-center border border-neutral-700 cursor-pointer hover:border-yellow-500/50 hover:shadow-lg hover:shadow-black/30 transition-all duration-300"
                                                    onClick={() => { setSelectedTeacher(t); }
                                                    }
                                                >
                                                    <div className="min-w-0" >
                                                        <h3 className="font-black text-white truncate" > {normalizeWorkoutTitle(String(t.name ?? ''))}</h3>
                                                        < p className="text-xs text-neutral-400 truncate" > {String(t.email ?? '')} </p>
                                                        < div className="mt-2 flex flex-wrap items-center gap-2" >
                                                            <span className="px-3 py-1.5 rounded-full bg-neutral-900 border border-neutral-700 text-[11px] font-black uppercase tracking-wide text-neutral-200" >
                                                                {String(t.status ?? 'pendente')}
                                                            </span>
                                                            <span className="text-[11px] font-semibold text-neutral-500" > {String(t.phone ?? '') || 'Sem telefone'}</span>
                                                            <span className="text-[11px] font-semibold text-neutral-500" > Nascimento: {t.birth_date ? new Date(String(t.birth_date)).toLocaleDateString() : '-'} </span>
                                                        </div>
                                                    </div>
                                                    < div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                                        <button
                                                            onClick={() => setEditingTeacher(t)}
                                                            className="w-9 h-9 rounded-full bg-neutral-900 border border-neutral-700 hover:border-yellow-500/40 hover:bg-yellow-500/10 text-neutral-300 hover:text-yellow-400 flex items-center justify-center transition-all duration-300 active:scale-95"
                                                        >
                                                            <Edit3 size={16} />
                                                        </button>
                                                        < select
                                                            value={String(t.status ?? 'pendente')}
                                                            onChange={async (e) => {
                                                                const newStatus = e.target.value;
                                                                const authHeaders = await getAdminAuthHeaders();
                                                                const res = await fetch('/api/admin/teachers/status', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ id: t.id, status: newStatus }) });
                                                                const json = await res.json();
                                                                if (json.ok) setTeachersList(prev => prev.map(x => x.id === t.id ? { ...x, status: newStatus } : x));
                                                            }}
                                                            className="min-h-[40px] bg-neutral-900/70 text-neutral-200 rounded-xl px-3 py-2 text-xs border border-neutral-700 focus:border-yellow-500 focus:outline-none"
                                                        >
                                                            <option value="pago" > pago </option>
                                                            < option value="pendente" > pendente </option>
                                                            < option value="atrasado" > atrasado </option>
                                                            < option value="cancelar" > cancelar </option>
                                                        </select>
                                                        < button
                                                            onClick={async () => {
                                                                if (await confirm(`Excluir professor ${t.name}?`)) {
                                                                    try {
                                                                        const { data: sessionData } = await supabase.auth.getSession();
                                                                        const token = sessionData?.session?.access_token || '';
                                                                        if (!token) {
                                                                            await alert('Sessão expirada. Faça login novamente.');
                                                                            return;
                                                                        }
                                                                        const res = await fetch('/api/admin/teachers/delete', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ id: t.id }) });
                                                                        let payload = null;
                                                                        try {
                                                                            const raw = await res.text();
                                                                            payload = raw ? JSON.parse(raw) : null;
                                                                        } catch (parseErr) {
                                                                            payload = null;
                                                                        }
                                                                        if (!payload || typeof payload !== 'object') {
                                                                            throw new Error(`Resposta inválida do servidor (${res.status})`);
                                                                        }
                                                                        const payloadObj = payload as UnknownRecord;
                                                                        if (!res.ok || !payloadObj.ok) throw new Error(String(payloadObj.error || `Falha ao excluir (${res.status})`));
                                                                        setTeachersList(prev => prev.filter(x => x.id !== t.id));
                                                                    } catch (err: unknown) {
                                                                        const msg = err && typeof err === 'object' && 'message' in err && typeof (err as { message?: unknown }).message === 'string' ? (err as { message: string }).message : String(err);
                                                                        await alert('Erro: ' + msg);
                                                                    }
                                                                }
                                                            }}
                                                            className="w-9 h-9 rounded-full bg-neutral-900 border border-neutral-700 hover:border-red-500/40 hover:bg-red-900/20 text-neutral-300 hover:text-red-400 flex items-center justify-center transition-all duration-300 active:scale-95"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                        {
                                                            isAdmin && (t.status === 'pending' || t.status === 'pendente') && (
                                                                <button
                                                                    onClick={
                                                                        async () => {
                                                                            try {
                                                                                const authHeaders = await getAdminAuthHeaders();
                                                                                const res = await fetch('/api/admin/teachers/status', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ id: t.id, status: 'active' }) });
                                                                                const json = await res.json();
                                                                                if (!json.ok) throw new Error(json.error || '');
                                                                                setTeachersList(prev => prev.map(x => x.id === t.id ? { ...x, status: 'active' } : x));
                                                                            } catch (err: unknown) {
                                                                                const msg = err && typeof err === 'object' && 'message' in err && typeof (err as { message?: unknown }).message === 'string' ? (err as { message: string }).message : String(err);
                                                                                await alert('Erro ao aprovar: ' + msg);
                                                                            }
                                                                        }
                                                                    }
                                                                    className="min-h-[40px] px-3 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white text-xs font-black uppercase tracking-wide transition-all duration-300 active:scale-95"
                                                                >
                                                                    Aprovar
                                                                </button>
                                                            )
                                                        }
                                                    </div>
                                                </div>
                                            ))}
                                    </div>
                                )}
                        </div>
                    )}

                {
                    tab === 'teachers' && isAdmin && !selectedStudent && selectedTeacher && (
                        <div className="w-full space-y-4" >
                            <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4 md:p-6 shadow-[0_16px_40px_rgba(0,0,0,0.35)]" >
                                <div className="flex items-start justify-between gap-3" >
                                    <div className="min-w-0" >
                                        <div className="text-[11px] uppercase tracking-widest text-neutral-500 font-bold" > Professor </div>
                                        < h2 className="text-base md:text-lg font-black text-white truncate" > {normalizeWorkoutTitle(String(selectedTeacher?.name ?? '')) || 'Professor'
                                        } </h2>
                                        < div className="mt-1 text-xs text-neutral-400 font-semibold truncate" > {String(selectedTeacher?.email ?? '')}</div>
                                    </div>
                                    < button
                                        type="button"
                                        onClick={() => { setSelectedTeacher(null); }}
                                        className="w-11 h-11 rounded-2xl bg-neutral-900/70 border border-neutral-800 hover:bg-neutral-900 text-neutral-200 flex items-center justify-center transition-all duration-300 active:scale-95"
                                        aria-label="Voltar"
                                    >
                                        <ArrowLeft size={18} />
                                    </button>
                                </div>

                                < div className="mt-4 flex items-center gap-2 overflow-x-auto no-scrollbar" >
                                    {
                                        [
                                            { key: 'students', label: 'Alunos' },
                                            { key: 'templates', label: 'Treinos' },
                                            { key: 'history', label: 'Histórico' },
                                            { key: 'inbox', label: 'Interações' },
                                        ].map((opt) => (
                                            <button
                                                key={opt.key}
                                                type="button"
                                                onClick={() => setTeacherDetailTab(opt.key)}
                                                className={`whitespace-nowrap min-h-[40px] px-3 py-2 rounded-full text-[11px] font-black uppercase tracking-wide border transition-all duration-300 active:scale-95 ${teacherDetailTab === opt.key
                                                    ? 'bg-yellow-500 text-black border-yellow-400 shadow-lg shadow-yellow-500/15'
                                                    : 'bg-neutral-900/60 text-neutral-200 border-neutral-800 hover:bg-neutral-900'
                                                    }`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                </div>
                            </div>

                            {
                                teacherDetailTab === 'students' && (
                                    <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.35)]" >
                                        <div className="flex items-center justify-between gap-3" >
                                            <div className="min-w-0" >
                                                <div className="text-[11px] uppercase tracking-widest text-neutral-500 font-bold" > Alunos </div>
                                                < div className="text-xs text-neutral-400 font-semibold" > {teacherStudentsLoading ? 'Carregando…' : `${(Array.isArray(teacherStudents) ? teacherStudents.length : 0)} alunos`} </div>
                                            </div>
                                            < button
                                                type="button"
                                                onClick={() => loadTeacherStudents(selectedTeacher)
                                                }
                                                className="min-h-[40px] px-3 py-2 rounded-xl bg-neutral-900/70 border border-neutral-800 hover:bg-neutral-900 text-neutral-200 text-xs font-black uppercase tracking-wide transition-all duration-300 active:scale-95"
                                            >
                                                Atualizar
                                            </button>
                                        </div>
                                        < div className="mt-4 space-y-2" >
                                            {(Array.isArray(teacherStudents) ? teacherStudents : []).length === 0 && !teacherStudentsLoading ? (
                                                <div className="text-sm text-neutral-500" > Nenhum aluno atribuído.</div>
                                            ) : null}
                                            {
                                                (Array.isArray(teacherStudents) ? teacherStudents : []).map((s) => (
                                                    <div
                                                        key={String((s as UnknownRecord)?.id ?? (s as UnknownRecord)?.user_id ?? (s as UnknownRecord)?.email ?? '')
                                                        }
                                                        className="bg-neutral-800 p-4 rounded-2xl flex justify-between items-center border border-neutral-700 hover:border-yellow-500/40 hover:shadow-lg hover:shadow-black/30 transition-all duration-300"
                                                    >
                                                        <div className="min-w-0" >
                                                            <div className="font-black text-white truncate" > {normalizeWorkoutTitle(String((s as UnknownRecord)?.name ?? '')) || String((s as UnknownRecord)?.email ?? '')}</div>
                                                            < div className="text-xs text-neutral-400 truncate" > {String((s as UnknownRecord)?.email ?? '')}</div>
                                                        </div>
                                                        < button
                                                            type="button"
                                                            onClick={() => { setSelectedStudent(s); setSubTab('workouts'); }}
                                                            className="min-h-[40px] px-3 py-2 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black text-xs font-black uppercase tracking-wide transition-all duration-300 active:scale-95"
                                                        >
                                                            Ver aluno
                                                        </button>
                                                    </div>
                                                ))}
                                        </div>
                                    </div>
                                )}

                            {
                                teacherDetailTab === 'templates' && (
                                    <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.35)]" >
                                        <div className="flex items-center justify-between gap-3" >
                                            <div className="min-w-0" >
                                                <div className="text-[11px] uppercase tracking-widest text-neutral-500 font-bold" > Treinos(Templates) </div>
                                                < div className="text-xs text-neutral-400 font-semibold" > {teacherTemplatesLoading ? 'Carregando…' : `${(Array.isArray(teacherTemplatesRows) ? teacherTemplatesRows.length : 0)} itens`} </div>
                                            </div>
                                            < div className="flex items-center gap-2" >
                                                <button
                                                    type="button"
                                                    onClick={() => loadTeacherTemplates(selectedTeacher, true)
                                                    }
                                                    className="min-h-[40px] px-3 py-2 rounded-xl bg-neutral-900/70 border border-neutral-800 hover:bg-neutral-900 text-neutral-200 text-xs font-black uppercase tracking-wide transition-all duration-300 active:scale-95"
                                                >
                                                    Atualizar
                                                </button>
                                                < button
                                                    type="button"
                                                    disabled={!teacherTemplatesCursor || teacherTemplatesLoading}
                                                    onClick={() => loadTeacherTemplates(selectedTeacher, false)}
                                                    className="min-h-[40px] px-3 py-2 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black text-xs font-black uppercase tracking-wide transition-all duration-300 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                                                >
                                                    Mais
                                                </button>
                                            </div>
                                        </div>
                                        < div className="mt-4 space-y-2" >
                                            {(Array.isArray(teacherTemplatesRows) ? teacherTemplatesRows : []).length === 0 && !teacherTemplatesLoading ? (
                                                <div className="text-sm text-neutral-500" > Nenhum treino encontrado.</div>
                                            ) : null}
                                            {
                                                (Array.isArray(teacherTemplatesRows) ? teacherTemplatesRows : []).map((w) => (
                                                    <div key={String((w as UnknownRecord)?.id ?? '')
                                                    } className="bg-neutral-800 p-4 rounded-2xl border border-neutral-700" >
                                                        <div className="flex items-center justify-between gap-3" >
                                                            <div className="min-w-0" >
                                                                <div className="font-black text-white truncate" > {normalizeWorkoutTitle(String((w as UnknownRecord)?.name ?? '')) || 'Treino'}</div>
                                                                < div className="text-xs text-neutral-400 truncate" > {String((w as UnknownRecord)?.student_name ?? '')}</div>
                                                            </div>
                                                            < button
                                                                type="button"
                                                                onClick={() => { setSelectedStudent({ id: String((w as UnknownRecord)?.user_id || ''), user_id: String((w as UnknownRecord)?.user_id), name: String((w as UnknownRecord)?.student_name ?? ''), email: '', status: 'active' } as AdminUser); setSubTab('workouts'); }}
                                                                className="min-h-[40px] px-3 py-2 rounded-xl bg-neutral-900/70 border border-neutral-800 hover:bg-neutral-900 text-neutral-200 text-xs font-black uppercase tracking-wide transition-all duration-300 active:scale-95"
                                                            >
                                                                Abrir
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                        </div>
                                    </div>
                                )}

                            {
                                teacherDetailTab === 'history' && (
                                    <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.35)]" >
                                        <div className="flex items-center justify-between gap-3" >
                                            <div className="min-w-0" >
                                                <div className="text-[11px] uppercase tracking-widest text-neutral-500 font-bold" > Histórico de Treinos </div>
                                                < div className="text-xs text-neutral-400 font-semibold" > {teacherHistoryLoading ? 'Carregando…' : `${(Array.isArray(teacherHistoryRows) ? teacherHistoryRows.length : 0)} itens`} </div>
                                            </div>
                                            < div className="flex items-center gap-2" >
                                                <button
                                                    type="button"
                                                    onClick={() => loadTeacherHistory(selectedTeacher, true)
                                                    }
                                                    className="min-h-[40px] px-3 py-2 rounded-xl bg-neutral-900/70 border border-neutral-800 hover:bg-neutral-900 text-neutral-200 text-xs font-black uppercase tracking-wide transition-all duration-300 active:scale-95"
                                                >
                                                    Atualizar
                                                </button>
                                                < button
                                                    type="button"
                                                    disabled={!teacherHistoryCursor || teacherHistoryLoading}
                                                    onClick={() => loadTeacherHistory(selectedTeacher, false)}
                                                    className="min-h-[40px] px-3 py-2 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black text-xs font-black uppercase tracking-wide transition-all duration-300 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                                                >
                                                    Mais
                                                </button>
                                            </div>
                                        </div>
                                        < div className="mt-4 space-y-2" >
                                            {(Array.isArray(teacherHistoryRows) ? teacherHistoryRows : []).length === 0 && !teacherHistoryLoading ? (
                                                <div className="text-sm text-neutral-500" > Nenhum treino executado encontrado.</div>
                                            ) : null}
                                            {
                                                (Array.isArray(teacherHistoryRows) ? teacherHistoryRows : []).map((w) => (
                                                    <div key={String((w as UnknownRecord)?.id ?? '')
                                                    } className="bg-neutral-800 p-4 rounded-2xl border border-neutral-700" >
                                                        <div className="flex items-center justify-between gap-3" >
                                                            <div className="min-w-0" >
                                                                <div className="font-black text-white truncate" > {normalizeWorkoutTitle(String((w as UnknownRecord)?.name ?? '')) || 'Treino'}</div>
                                                                < div className="text-xs text-neutral-400 truncate" > {String((w as UnknownRecord)?.student_name ?? '')}{(w as UnknownRecord)?.date ? ` • ${new Date(String((w as UnknownRecord).date)).toLocaleDateString()}` : ''} </div>
                                                            </div>
                                                            < button
                                                                type="button"
                                                                onClick={() => { setSelectedStudent({ id: String((w as UnknownRecord)?.user_id || ''), user_id: String((w as UnknownRecord)?.user_id), name: String((w as UnknownRecord)?.student_name ?? ''), email: '', status: 'active' } as AdminUser); setSubTab('workouts'); }}
                                                                className="min-h-[40px] px-3 py-2 rounded-xl bg-neutral-900/70 border border-neutral-800 hover:bg-neutral-900 text-neutral-200 text-xs font-black uppercase tracking-wide transition-all duration-300 active:scale-95"
                                                            >
                                                                Abrir
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                        </div>
                                    </div>
                                )}

                            {
                                teacherDetailTab === 'inbox' && (
                                    <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.35)]" >
                                        <div className="flex items-center justify-between gap-3" >
                                            <div className="min-w-0" >
                                                <div className="text-[11px] uppercase tracking-widest text-neutral-500 font-bold" > Interações(Inbox) </div>
                                                < div className="text-xs text-neutral-400 font-semibold" > {teacherInboxLoading ? 'Carregando…' : `${(Array.isArray(teacherInboxItems) ? teacherInboxItems.length : 0)} itens`} </div>
                                            </div>
                                            < button
                                                type="button"
                                                onClick={() => loadTeacherInbox(selectedTeacher)
                                                }
                                                className="min-h-[40px] px-3 py-2 rounded-xl bg-neutral-900/70 border border-neutral-800 hover:bg-neutral-900 text-neutral-200 text-xs font-black uppercase tracking-wide transition-all duration-300 active:scale-95"
                                            >
                                                Atualizar
                                            </button>
                                        </div>
                                        < div className="mt-4 space-y-2" >
                                            {(Array.isArray(teacherInboxItems) ? teacherInboxItems : []).length === 0 && !teacherInboxLoading ? (
                                                <div className="text-sm text-neutral-500" > Nenhuma interação sugerida.</div>
                                            ) : null}
                                            {
                                                (Array.isArray(teacherInboxItems) ? teacherInboxItems : []).map((it) => (
                                                    <div key={String((it as UnknownRecord)?.id ?? '')
                                                    } className="bg-neutral-800 p-4 rounded-2xl border border-neutral-700" >
                                                        <div className="flex items-start justify-between gap-3" >
                                                            <div className="min-w-0" >
                                                                <div className="font-black text-white truncate" > {String((it as UnknownRecord)?.title ?? '') || 'Alerta'}</div>
                                                                < div className="text-xs text-neutral-400 truncate" > {String((it as UnknownRecord)?.student_name ?? '')}</div>
                                                                < div className="mt-2 text-xs text-neutral-300" > {String((it as UnknownRecord)?.reason ?? '')}</div>
                                                            </div>
                                                            < button
                                                                type="button"
                                                                onClick={() => { setSelectedStudent({ id: String((it as UnknownRecord)?.student_user_id || ''), user_id: String((it as UnknownRecord)?.student_user_id), name: String((it as UnknownRecord)?.student_name ?? ''), email: '', status: 'active' } as AdminUser); setSubTab('workouts'); }}
                                                                className="min-h-[40px] px-3 py-2 rounded-xl bg-neutral-900/70 border border-neutral-800 hover:bg-neutral-900 text-neutral-200 text-xs font-black uppercase tracking-wide transition-all duration-300 active:scale-95"
                                                            >
                                                                Abrir
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                        </div>
                                    </div>
                                )}
                        </div>
                    )}

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
                                                                                    setSelectedStudent(prev => ({ ...prev, teacher_id: nextTid }));
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
                                                                                            js = raw ? JSON.parse(raw) : null;
                                                                                        } catch { }
                                                                                        if (js?.ok) setUsersList(js.students || []);
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
                                                                const resolvedTargetUserId = String(debugObj?.targetUserId || selectedStudent.user_id || '').trim();
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
                                                            const json = await res.json().catch((): any => null);
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
                                                                                        const json = await res.json().catch((): any => null);
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
                                                                                        const json = await res.json().catch((): any => null);
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
                                                                                        const json = await res.json().catch((): any => null);
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
                                                    const json = await res.json().catch((): any => null);
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
                                        initialData={editingTemplate}
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
                                        initialData={editingStudentWorkout}
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
    );
};

export default AdminPanelV2;

import { useState, useEffect, useCallback, useRef } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminUser, ExecutionVideo } from '@/types/admin';
import type { UnknownRecord } from '@/types/app';
import { useDialog } from '@/contexts/DialogContext';
import { apiAdmin } from '@/lib/api';

export type UseAdminStudentOpsParams = {
    selectedStudent: AdminUser | null;
    subTab: string;
    isAdmin: boolean;
    supabase: SupabaseClient;
    user: AdminUser;
    getAdminAuthHeaders: () => Promise<Record<string, string>>;
    setTeachersList: React.Dispatch<React.SetStateAction<AdminUser[]>>;
    setUsersList: React.Dispatch<React.SetStateAction<AdminUser[]>>;
    setPendingProfiles: React.Dispatch<React.SetStateAction<UnknownRecord[]>>;
};

export const useAdminStudentOps = ({
    selectedStudent,
    subTab,
    isAdmin,
    supabase,
    user,
    getAdminAuthHeaders,
    setTeachersList,
    setUsersList,
    setPendingProfiles,
}: UseAdminStudentOpsParams) => {
    const { alert } = useDialog();

    // ─── Student Detail State ─────────────────────────────────────────────────
    const [studentWorkouts, setStudentWorkouts] = useState<UnknownRecord[]>([]);
    const [syncedWorkouts, setSyncedWorkouts] = useState<UnknownRecord[]>([]);
    const [assessments, setAssessments] = useState<UnknownRecord[]>([]);
    const [studentCheckinsRows, setStudentCheckinsRows] = useState<UnknownRecord[]>([]);
    const [studentCheckinsLoading, setStudentCheckinsLoading] = useState<boolean>(false);
    const [studentCheckinsError, setStudentCheckinsError] = useState<string>('');
    const [studentCheckinsRange, setStudentCheckinsRange] = useState<string>('7d');
    const [studentCheckinsFilter, setStudentCheckinsFilter] = useState<string>('all');
    const loadedStudentInfo = useRef<Set<string>>(new Set<string>());

    // Pending self-registered users
    const [pendingProfiles, setPendingProfilesLocal] = useState<UnknownRecord[]>([]);

    // ─── Execution Videos ─────────────────────────────────────────────────────
    const [executionVideos, setExecutionVideos] = useState<ExecutionVideo[]>([]);
    const [executionVideosLoading, setExecutionVideosLoading] = useState<boolean>(false);
    const [executionVideosError, setExecutionVideosError] = useState<string>('');
    const [executionVideoModalOpen, setExecutionVideoModalOpen] = useState<boolean>(false);
    const [executionVideoModalUrl, setExecutionVideoModalUrl] = useState<string>('');
    const [executionVideoFeedbackDraft, setExecutionVideoFeedbackDraft] = useState<UnknownRecord>({});

    // ─── Edit Student ─────────────────────────────────────────────────────────
    const [editingStudent, setEditingStudent] = useState<boolean>(false);
    const [editedStudent, setEditedStudent] = useState<{ name: string; email: string }>({ name: '', email: '' });

    // ─── Execution Videos Effect ──────────────────────────────────────────────
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
    }, [selectedStudent, subTab]);

    // ─── Checkins Effect ──────────────────────────────────────────────────────
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
    }, [selectedStudent, subTab, studentCheckinsFilter, studentCheckinsRange, supabase]);

    // ─── Teacher list for selected student ────────────────────────────────────
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

    // ─── Edit Student Handlers ────────────────────────────────────────────────
    const handleEditStudent = useCallback(() => {
        if (!selectedStudent) return;
        setEditedStudent({ name: String(selectedStudent.name || ''), email: String(selectedStudent.email || '') });
        setEditingStudent(true);
    }, [selectedStudent]);

    const handleSaveStudentEdit = useCallback(async (setSelectedStudent: React.Dispatch<React.SetStateAction<AdminUser | null>>) => {
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
    }, [alert, selectedStudent, editedStudent, supabase, setUsersList]);

    // ─── Approve Pending Profile ──────────────────────────────────────────────
    const approvePendingProfile = useCallback(async (profile: UnknownRecord) => {
        try {
            const authHeaders = await getAdminAuthHeaders();
            const json = await apiAdmin.assignTeacher(
                String(profile.user_id || ''),
                null,
                authHeaders
            ).catch((e: unknown) => { throw e }) as Record<string, unknown>;
            if (!json?.ok) throw new Error(String(json?.error || 'Falha'));
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
            setPendingProfilesLocal(prev => prev.filter(p => p.user_id !== profile.user_id));
            setPendingProfiles(prev => prev.filter(p => p.user_id !== profile.user_id));
        } catch (e: unknown) {
            const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
            await alert('Erro ao aprovar membro: ' + msg);
        }
    }, [alert, getAdminAuthHeaders, setUsersList, setPendingProfiles]);

    return {
        // Student Detail
        studentWorkouts, setStudentWorkouts,
        syncedWorkouts, setSyncedWorkouts,
        assessments, setAssessments,
        studentCheckinsRows, setStudentCheckinsRows,
        studentCheckinsLoading, setStudentCheckinsLoading,
        studentCheckinsError, setStudentCheckinsError,
        studentCheckinsRange, setStudentCheckinsRange,
        studentCheckinsFilter, setStudentCheckinsFilter,
        loadedStudentInfo,
        pendingProfiles, setPendingProfiles: setPendingProfilesLocal,
        // Execution Videos
        executionVideos, setExecutionVideos,
        executionVideosLoading, setExecutionVideosLoading,
        executionVideosError, setExecutionVideosError,
        executionVideoModalOpen, setExecutionVideoModalOpen,
        executionVideoModalUrl, setExecutionVideoModalUrl,
        executionVideoFeedbackDraft, setExecutionVideoFeedbackDraft,
        // Edit Student
        editingStudent, setEditingStudent,
        editedStudent, setEditedStudent,
        handleEditStudent,
        handleSaveStudentEdit,
        approvePendingProfile,
    };
};

/**
 * useAdminActions.ts
 *
 * Admin CRUD action handlers extracted from useAdminPanelController.
 * These are the student/teacher registration and management operations.
 */

import { AdminUser, AdminTeacher } from '@/types/admin';
import { sendBroadcastMessage, addTeacher, updateTeacher } from '@/actions/admin-actions';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UnknownRecord } from '@/types/app'
import { apiAdmin } from '@/lib/api'
import { logError } from '@/lib/logger'

type AlertFn = (msg: string, title?: string) => Promise<unknown>;
type ConfirmFn = (msg: string, title?: string) => Promise<boolean>;

interface UseAdminActionsParams {
    supabase: SupabaseClient;
    user: AdminUser;
    alert: AlertFn;
    confirm: ConfirmFn;
    getAdminAuthHeaders: () => Promise<Record<string, string>>;
    setUsersList: React.Dispatch<React.SetStateAction<AdminUser[]>>;
    setTeachersList: React.Dispatch<React.SetStateAction<AdminTeacher[]>>;
    // Registration
    newStudent: { name: string; email: string };
    setNewStudent: (v: { name: string; email: string }) => void;
    setShowRegisterModal: (v: boolean) => void;
    setRegistering: (v: boolean) => void;
    // Teacher
    newTeacher: { name: string; email: string; phone: string; birth_date: string };
    setNewTeacher: (v: { name: string; email: string; phone: string; birth_date: string }) => void;
    setShowTeacherModal: (v: boolean) => void;
    setAddingTeacher: (v: boolean) => void;
    editingTeacher: AdminTeacher | null;
    setEditingTeacher: (v: AdminTeacher | null) => void;
    // Broadcast
    broadcastTitle: string;
    broadcastMsg: string;
    setBroadcastTitle: (v: string) => void;
    setBroadcastMsg: (v: string) => void;
    setSendingBroadcast: (v: boolean) => void;
}

export function useAdminActions({
    supabase, user, alert, confirm, getAdminAuthHeaders,
    setUsersList, setTeachersList,
    newStudent, setNewStudent, setShowRegisterModal, setRegistering,
    newTeacher, setNewTeacher, setShowTeacherModal, setAddingTeacher,
    editingTeacher, setEditingTeacher,
    broadcastTitle, broadcastMsg, setBroadcastTitle, setBroadcastMsg, setSendingBroadcast,
}: UseAdminActionsParams) {

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
                birth_date: editingTeacher.birth_date,
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

    const handleUpdateStudentTeacher = async (studentId: string, teacherUserId: string | null) => {
        try {
            // Route through the API which validates teacher_user_id against profiles before
            // updating students.teacher_id, avoiding the students_teacher_id_fkey FK violation
            // that occurred when passing teachers.id (PK) instead of teachers.user_id (profiles FK).
            const authHeaders = await getAdminAuthHeaders();
            const json = await apiAdmin.assignTeacher(
                studentId,
                teacherUserId || null,
                authHeaders
            ).catch(() => ({ ok: false, error: 'Falha na requisição' })) as Record<string, unknown>;
            if (!json?.ok) throw new Error(String(json?.error || 'Falha ao atribuir professor'));
            const nextTid = (json.teacher_user_id as string | null) ?? teacherUserId ?? null;
            setUsersList((prev) =>
                prev.map((u) => (u.id === studentId ? { ...u, teacher_id: nextTid } : u))
            );
            await alert(nextTid ? 'Professor atribuído com sucesso! ✅' : 'Professor removido com sucesso.');
        } catch (e: unknown) {
            const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
            await alert('Erro ao atualizar professor: ' + msg);
        }
    };

    const handleUpdateStudentStatus = async (student: AdminUser, newStatus: string) => {
        if (!newStatus || newStatus === (student.status || 'pendente')) return;
        const statusLabels: Record<string, string> = {
            pago: 'Pago ✅',
            pendente: 'Pendente ⏳',
            atrasado: 'Atrasado ⚠️',
            cancelar: 'Cancelado ❌',
        };
        const label = statusLabels[newStatus] || newStatus;
        if (!(await confirm(`Mudar status de "${student.name || student.email}" para ${label}?`))) return;
        try {
            const authHeaders = await getAdminAuthHeaders();
            const json = await apiAdmin.updateStudentStatus(student.id, newStatus, authHeaders)
                .catch(() => ({ ok: false, error: 'Falha na requisição' })) as Record<string, unknown>;
            if (!json?.ok) throw new Error(String(json?.error || 'Falha ao atualizar status'));
            setUsersList((prev) =>
                prev.map((u) => (u.id === student.id ? { ...u, status: newStatus } : u))
            );
            await alert(`Status de "${student.name || student.email}" atualizado para ${label}. Caso o aluno tenha saído da lista, use o filtro "Todos" para vê-lo.`, 'Status atualizado ✅');
        } catch (e: unknown) {
            const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
            await alert('Erro ao atualizar status: ' + msg);
        }
    };

    const handleToggleStudentStatus = async (student: AdminUser) => {
        const newStatus = student.status === 'pago' ? 'pendente' : 'pago';
        return handleUpdateStudentStatus(student, newStatus);
    };

    const handleDeleteStudent = async (studentId: string, onSuccess?: () => void) => {
        if (!(await confirm(
            'Tem certeza que deseja EXCLUIR este aluno?\n\nIsso irá apagar permanentemente:\n• Todos os treinos e histórico\n• Avaliações e check-ins\n• Notificações e mensagens\n\nEssa ação é irreversível.',
            'Excluir Aluno'
        ))) return;
        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const token = sessionData?.session?.access_token || '';
            const authHeaders = await getAdminAuthHeaders();
            const json = await apiAdmin.deleteStudent(studentId, token, authHeaders)
                .catch(() => ({ ok: false, error: 'Falha na requisição' })) as Record<string, unknown>;
            if (!json?.ok) throw new Error(String(json?.error || 'Falha ao excluir aluno'));
            setUsersList((prev) => prev.filter((u) => u.id !== studentId && u.user_id !== studentId));
            await alert('Aluno excluído com sucesso!', 'Concluído');
            onSuccess?.();
        } catch (e: unknown) {
            const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
            await alert('Erro ao excluir aluno: ' + msg);
        }
    };

    const handleDeleteTeacher = async (teacherId: string, onSuccess?: () => void) => {
        if (!(await confirm(
            'Tem certeza que deseja EXCLUIR este professor?\n\nIsso irá apagar permanentemente:\n• Todos os dados do professor\n• Todos os alunos vinculados\n• Treinos, histórico e assessments\n\nEssa ação é irreversível.',
            'Excluir Professor'
        ))) return;
        try {
            // Resolve teacher record
            let teacherRow: { id: string; user_id: string | null; email: string | null } | null = null;
            try {
                const { data } = await supabase.from('teachers').select('id, user_id, email').eq('id', teacherId).maybeSingle();
                if (data?.id) teacherRow = { id: String(data.id), user_id: data.user_id ? String(data.user_id) : null, email: data.email ? String(data.email) : null };
            } catch (e) { logError('useAdminActions.resolveTeacherById', e) }
            if (!teacherRow) {
                try {
                    const { data } = await supabase.from('teachers').select('id, user_id, email').eq('user_id', teacherId).maybeSingle();
                    if (data?.id) teacherRow = { id: String(data.id), user_id: data.user_id ? String(data.user_id) : null, email: data.email ? String(data.email) : null };
                } catch (e) { logError('useAdminActions.resolveTeacherByUserId', e) }
            }
            if (!teacherRow) throw new Error('Professor não encontrado');

            const tUserId = teacherRow.user_id;

            // Resolve students of this teacher
            let studentUserIds: string[] = [];
            let studentIds: string[] = [];
            if (tUserId) {
                try {
                    const { data: students } = await supabase.from('students').select('id, user_id').eq('teacher_id', tUserId);
                    if (Array.isArray(students)) {
                        studentIds = students.map((s: { id: string }) => String(s.id));
                        studentUserIds = students.filter((s: { user_id?: string | null }) => s.user_id).map((s: { user_id: string }) => String(s.user_id));
                    }
                } catch (e) { logError('useAdminActions.fetchTeacherStudents', e) }
            }

            // Cascade delete student data (each wrapped in try/catch for missing tables)
            if (studentUserIds.length > 0) {
                for (const uid of studentUserIds) {
                    try { await supabase.from('workout_checkins').delete().eq('user_id', uid); } catch (e) { logError('useAdminActions.deleteCheckins', e) }
                    try { await supabase.from('exercise_execution_submissions').delete().eq('student_user_id', uid); } catch (e) { logError('useAdminActions.deleteSubmissions', e) }
                }

                // Assessments (assessment_photos may not exist)
                try {
                    const { data: assessments } = await supabase.from('assessments').select('id').in('student_id', studentUserIds);
                    if (Array.isArray(assessments) && assessments.length > 0) {
                        const aIds = assessments.map((a: { id: string }) => a.id);
                        try { await supabase.from('assessment_photos').delete().in('assessment_id', aIds); } catch (e) { logError('useAdminActions.deleteAssessmentPhotos', e) }
                    }
                } catch (e) { logError('useAdminActions.fetchStudentAssessments', e) }
                try { await supabase.from('assessments').delete().in('student_id', studentUserIds); } catch (e) { logError('useAdminActions.deleteStudentAssessments', e) }
            }

            // Teacher's own assessments
            if (tUserId) {
                try {
                    const { data: tAssessments } = await supabase.from('assessments').select('id').eq('trainer_id', tUserId);
                    if (Array.isArray(tAssessments) && tAssessments.length > 0) {
                        const aIds = tAssessments.map((a: { id: string }) => a.id);
                        try { await supabase.from('assessment_photos').delete().in('assessment_id', aIds); } catch (e) { logError('useAdminActions.deleteTrainerAssessmentPhotos', e) }
                    }
                } catch (e) { logError('useAdminActions.fetchTrainerAssessments', e) }
                try { await supabase.from('assessments').delete().eq('trainer_id', tUserId); } catch (e) { logError('useAdminActions.deleteTrainerAssessments', e) }
            }

            // Appointments
            if (tUserId) {
                try { await supabase.from('appointments').delete().eq('coach_id', tUserId); } catch (e) { logError('useAdminActions.deleteCoachAppointments', e) }
            }
            if (studentIds.length > 0) {
                try { await supabase.from('appointments').delete().in('student_id', studentIds); } catch (e) { logError('useAdminActions.deleteStudentAppointments', e) }
            }

            // Workouts → exercises → sets (teacher + students)
            const allUserIds = [...studentUserIds, ...(tUserId ? [tUserId] : [])];
            if (allUserIds.length > 0) {
                const workoutIds: string[] = [];
                for (const uid of allUserIds) {
                    try {
                        const { data: wks } = await supabase.from('workouts').select('id').eq('user_id', uid);
                        if (Array.isArray(wks)) workoutIds.push(...wks.map((w: { id: string }) => w.id));
                    } catch (e) { logError('useAdminActions.fetchWorkoutsByUser', e) }
                }
                // Also workouts created by teacher
                if (tUserId) {
                    try {
                        const { data: createdWks } = await supabase.from('workouts').select('id').eq('created_by', tUserId);
                        if (Array.isArray(createdWks)) {
                            for (const w of createdWks) { if (!workoutIds.includes(w.id)) workoutIds.push(w.id); }
                        }
                    } catch (e) { logError('useAdminActions.fetchCreatedWorkouts', e) }
                }

                if (workoutIds.length > 0) {
                    const exerciseIds: string[] = [];
                    try {
                        const { data: exs } = await supabase.from('exercises').select('id').in('workout_id', workoutIds);
                        if (Array.isArray(exs)) exerciseIds.push(...exs.map((e: { id: string }) => e.id));
                    } catch (e) { logError('useAdminActions.fetchExercises', e) }
                    if (exerciseIds.length > 0) {
                        try { await supabase.from('sets').delete().in('exercise_id', exerciseIds); } catch (e) { logError('useAdminActions.deleteSets', e) }
                        try { await supabase.from('exercises').delete().in('id', exerciseIds); } catch (e) { logError('useAdminActions.deleteExercises', e) }
                    }
                    try { await supabase.from('workouts').delete().in('id', workoutIds); } catch (e) { logError('useAdminActions.deleteWorkouts', e) }
                }
            }

            // Teacher's own data
            if (tUserId) {
                try { await supabase.from('active_workout_sessions').delete().eq('user_id', tUserId); } catch (e) { logError('useAdminActions.deleteActiveSessions', e) }
                try { await supabase.from('user_settings').delete().eq('user_id', tUserId); } catch (e) { logError('useAdminActions.deleteUserSettings', e) }
                try { await supabase.from('notifications').delete().eq('user_id', tUserId); } catch (e) { logError('useAdminActions.deleteNotifications', e) }
                try { await supabase.from('messages').delete().eq('user_id', tUserId); } catch (e) { logError('useAdminActions.deleteMessages', e) }
                try { await supabase.from('invites').delete().or(`from_uid.eq.${tUserId},to_uid.eq.${tUserId}`); } catch (e) { logError('useAdminActions.deleteInvites', e) }

                // DMs
                try {
                    const { data: channels } = await supabase.from('direct_channels').select('id').or(`user1_id.eq.${tUserId},user2_id.eq.${tUserId}`);
                    if (Array.isArray(channels) && channels.length > 0) {
                        const cIds = channels.map((c: { id: string }) => c.id);
                        try { await supabase.from('direct_messages').delete().in('channel_id', cIds); } catch (e) { logError('useAdminActions.deleteDirectMessages', e) }
                        try { await supabase.from('direct_channels').delete().in('id', cIds); } catch (e) { logError('useAdminActions.deleteDirectChannels', e) }
                    }
                } catch (e) { logError('useAdminActions.fetchDirectChannels', e) }

                try { await supabase.from('marketplace_subscriptions').delete().eq('teacher_user_id', tUserId); } catch (e) { logError('useAdminActions.deleteSubscriptions', e) }
                try { await supabase.from('teacher_plans').delete().eq('teacher_user_id', tUserId); } catch (e) { logError('useAdminActions.deleteTeacherPlans', e) }
                try { await supabase.from('asaas_customers').delete().eq('user_id', tUserId); } catch (e) { logError('useAdminActions.deleteAsaasCustomers', e) }
            }

            // Delete students
            if (studentIds.length > 0) {
                try { await supabase.from('students').delete().in('id', studentIds); } catch (e) { logError('useAdminActions.deleteStudents', e) }
            }

            // Delete teacher row
            const { error: teacherDelErr } = await supabase.from('teachers').delete().eq('id', teacherRow.id);
            if (teacherDelErr) throw new Error(String(teacherDelErr.message || 'Falha ao excluir professor'));

            // Update profile role
            if (tUserId) {
                try { await supabase.from('profiles').update({ role: 'user' }).eq('id', tUserId).eq('role', 'teacher'); } catch (e) { logError('useAdminActions.updateProfileRole', e) }
            }

            if (tUserId) {
                try {
                    const { data: sessionData } = await supabase.auth.getSession();
                    const token = sessionData?.session?.access_token || '';
                    if (token) await apiAdmin.deleteAuthUserWithToken(tUserId, token).catch(() => null);
                } catch (e) { logError('useAdminActions.deleteTeacherAuthUser', e) }
            }

            // Also delete auth.users for students
            for (const suid of studentUserIds) {
                try {
                    const { data: sessionData } = await supabase.auth.getSession();
                    const token = sessionData?.session?.access_token || '';
                    if (token) await apiAdmin.deleteAuthUserWithToken(suid, token).catch(() => null);
                } catch (e) { logError('useAdminActions.deleteStudentAuthUser', e) }
            }

            setTeachersList((prev) => prev.filter((t) => t.id !== teacherId && t.user_id !== teacherId));
            await alert('Professor excluído com sucesso!', 'Concluído');
            onSuccess?.();
        } catch (e: unknown) {
            const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
            await alert('Erro ao excluir professor: ' + msg);
        }
    };

    return {
        handleRegisterStudent,
        handleAddTeacher,
        handleUpdateTeacher,
        handleSendBroadcast,
        handleUpdateStudentTeacher,
        handleUpdateStudentStatus,
        handleToggleStudentStatus,
        handleDeleteStudent,
        handleDeleteTeacher,
    };
}

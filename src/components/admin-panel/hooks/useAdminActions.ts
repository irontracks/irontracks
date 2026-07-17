/**
 * useAdminActions.ts
 *
 * Admin CRUD action handlers extracted from useAdminPanelController.
 * These are the student/teacher registration and management operations.
 */

import { AdminUser, AdminTeacher } from '@/types/admin';
import { sendBroadcastMessage, addTeacher, updateTeacher } from '@/actions/admin-actions';
import type { SupabaseClient } from '@supabase/supabase-js';
import { apiAdmin } from '@/lib/api'

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

    const handleUpdateStudentTeacher = async (
        studentId: string,
        teacherUserId: string | null,
        extras?: { email?: string | null }
    ) => {
        try {
            // Route through the API which validates teacher_user_id against profiles before
            // updating students.teacher_id, avoiding the students_teacher_id_fkey FK violation
            // that occurred when passing teachers.id (PK) instead of teachers.user_id (profiles FK).
            //
            // Passing `email` as a fallback identifier is critical: when the AdminUser row
            // was built from the profiles fallback (no real `students` row yet), `studentId`
            // is the profile UUID — `eq('students.id', profileId)` won't find anything, and
            // without an email the server returns 404 "student not found" and the panel
            // would surface a meaningless "Falha na requisição".
            const authHeaders = await getAdminAuthHeaders();
            // Let apiAdmin.assignTeacher's thrown ApiError bubble up with the server's real
            // message (e.g. "student not found", "teacher profile not found", "Limite de alunos
            // atingido") so the user sees WHY it failed instead of a generic network message.
            const json = (await apiAdmin.assignTeacher(
                studentId,
                teacherUserId || null,
                authHeaders,
                extras?.email || undefined,
            )) as Record<string, unknown>;
            if (!json?.ok) {
                if (json?.upgrade_required) {
                    await alert('⚠️ Limite de alunos atingido!\n\nFaça upgrade do seu plano no painel para adicionar mais alunos. Use o botão "Upgrade" no cabeçalho ou na aba Visão Geral.', 'Plano Limitado')
                    return
                }
                throw new Error(String(json?.error || 'Falha ao atribuir professor'))
            }
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
            // Same shape bug as handleUpdateStudentTeacher: the previous `.catch()`
            // replaced the server's real error with "Falha na requisição" and the
            // route only resolves by students.id. When `student.id` is actually a
            // profile UUID (AdminUser built from the profiles fallback), the update
            // matched 0 rows and the user had no idea why. Now we (a) let apiPost's
            // real ApiError bubble up and (b) pass the email as a fallback identifier
            // so the endpoint can find the row either way.
            const json = (await apiAdmin.updateStudentStatus(
                student.id,
                newStatus,
                authHeaders,
                student.email ?? null,
            )) as Record<string, unknown>;
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
            // Let apiPost's ApiError bubble up with the real server message.
            // Swallowing it into a generic "Falha na requisição" has burned us
            // twice in a row (teacher assignment + status update) — same anti-
            // pattern, same invisible root cause.
            const json = (await apiAdmin.deleteStudent(studentId, token, authHeaders)) as Record<string, unknown>;
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
            const { data: sessionData } = await supabase.auth.getSession();
            const token = sessionData?.session?.access_token || '';
            if (!token) throw new Error('Sessão expirada. Faça login novamente.');

            // Toda a exclusão roda no SERVIDOR: a rota chama a RPC atômica
            // delete_teacher_cascade via service-role. A escrita direta em `teachers`
            // foi revogada pro client (hardening 2026-07-11), então o antigo caminho
            // — ~20 .delete() diretos do client — estourava "permission denied for
            // table teachers" e deixava a exclusão pela METADE (os deletes anteriores
            // eram silenciados por try/catch). A RPC faz tudo numa transação e grava
            // audit_events; a rota ainda apaga o auth.users do professor.
            const res = await apiAdmin.deleteTeacher(teacherId, token);
            if (!res?.ok) throw new Error(String((res as { error?: string })?.error || 'Falha ao excluir professor'));

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

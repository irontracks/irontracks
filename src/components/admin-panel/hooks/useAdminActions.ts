/**
 * useAdminActions.ts
 *
 * Admin CRUD action handlers extracted from useAdminPanelController.
 * These are the student/teacher registration and management operations.
 */

import { AdminUser, AdminTeacher } from '@/types/admin';
import { sendBroadcastMessage, addTeacher, updateTeacher } from '@/actions/admin-actions';
import type { SupabaseClient } from '@supabase/supabase-js';

type UnknownRecord = Record<string, unknown>;
type AlertFn = (msg: string, title?: string) => Promise<unknown>;
type ConfirmFn = (msg: string, title?: string) => Promise<boolean>;

interface UseAdminActionsParams {
    supabase: SupabaseClient;
    user: AdminUser;
    alert: AlertFn;
    confirm: ConfirmFn;
    getAdminAuthHeaders: () => Promise<Record<string, string>>;
    setUsersList: React.Dispatch<React.SetStateAction<AdminUser[]>>;
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
    setUsersList,
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

    const handleUpdateStudentStatus = async (student: AdminUser, newStatus: string) => {
        if (!newStatus || newStatus === student.status) return;
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
            const res = await fetch('/api/admin/students/status', {
                method: 'POST',
                headers: { ...authHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: student.id, status: newStatus }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json?.ok) throw new Error(String(json?.error || `HTTP ${res.status}`));
            setUsersList((prev) =>
                prev.map((u) => (u.id === student.id ? { ...u, status: newStatus } : u))
            );
        } catch (e: unknown) {
            const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
            await alert('Erro ao atualizar status: ' + msg);
        }
    };

    const handleToggleStudentStatus = async (student: AdminUser) => {
        const newStatus = student.status === 'pago' ? 'pendente' : 'pago';
        return handleUpdateStudentStatus(student, newStatus);
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
        handleRegisterStudent,
        handleAddTeacher,
        handleUpdateTeacher,
        handleSendBroadcast,
        handleUpdateStudentTeacher,
        handleUpdateStudentStatus,
        handleToggleStudentStatus,
        handleDeleteStudent,
    };
}

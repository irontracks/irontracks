'use client';

import React, { useCallback } from 'react';
import {
    X, ArrowLeft, Edit3, Dumbbell, History, Plus, Trash2, Video, Download,
    FileText
} from 'lucide-react';
import AssessmentButton from '@/components/assessment/AssessmentButton';
import HistoryList from '@/components/HistoryList';
import AdminWorkoutEditor, { AdminWorkout } from '@/components/AdminWorkoutEditor';
import { workoutPlanHtml } from '@/utils/report/templates';
import { updateWorkout } from '@/actions/workout-actions';
import { normalizeWorkoutTitle } from '@/utils/workoutTitle';
import { escapeHtml } from '@/utils/escapeHtml';
import { parseJsonWithSchema } from '@/utils/zod';
import { z } from 'zod';
import type { AdminUser, AdminWorkoutTemplate } from '@/types/admin';
import { useAdminPanel } from './AdminPanelContext';
import { useDialog } from '@/contexts/DialogContext';

type UnknownRecord = Record<string, unknown>;

export const StudentDetailPanel: React.FC = () => {
    const { alert, confirm } = useDialog();

    const {
        selectedStudent,
        setSelectedStudent,
        editingStudent,
        setEditingStudent,
        editedStudent,
        setEditedStudent,
        subTab,
        setSubTab,
        studentWorkouts,
        setStudentWorkouts,
        setSyncedWorkouts,
        syncedWorkouts,
        assessments,
        studentCheckinsRows,
        studentCheckinsLoading,
        studentCheckinsError,
        studentCheckinsRange,
        setStudentCheckinsRange,
        studentCheckinsFilter,
        setStudentCheckinsFilter,
        executionVideos,
        setExecutionVideos,
        executionVideosLoading,
        setExecutionVideosLoading,
        executionVideosError,
        setExecutionVideosError,
        executionVideoFeedbackDraft,
        setExecutionVideoFeedbackDraft,
        executionVideoModalOpen,
        setExecutionVideoModalOpen,
        executionVideoModalUrl,
        setExecutionVideoModalUrl,
        editingStudentWorkout,
        setEditingStudentWorkout,
        viewWorkout,
        setViewWorkout,
        exportOpen,
        setExportOpen,
        historyOpen,
        setHistoryOpen,
        templates,
        teachersList,
        isAdmin,
        user,
        loading,
        supabase,
        getAdminAuthHeaders,
        setUsersList,
        handleUpdateStudentTeacher, // will be added to controller
        handleToggleStudentStatus, // will be added to controller
        handleDeleteStudent, // will be added to controller
    } = useAdminPanel();

    const normalizeText = useCallback((value: unknown) => String(value || '').toLowerCase(), []);

    if (!selectedStudent) return null;

    // Local computations for selected student status
    const selectedStatus = normalizeText(selectedStudent?.status || '');
    const selectedStatusLabel = String(selectedStudent?.status || 'pendente');
    const selectedStatusTone = selectedStatus === 'pago'
        ? 'bg-green-500/10 text-green-400 border-green-500/30'
        : (selectedStatus === 'atrasado'
            ? 'bg-red-500/10 text-red-400 border-red-500/30'
            : (selectedStatus === 'cancelar'
                ? 'bg-neutral-500/10 text-neutral-300 border-neutral-500/25'
                : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'));

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

    const getSetsCount = (value: unknown): number => {
        if (Array.isArray(value)) return value.length;
        if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
        if (typeof value === 'string') {
            const n = Number(value);
            return Number.isFinite(n) ? n : 0;
        }
        return 0;
    };

    // Handlers defined inline in AdminPanelV2.tsx (will be added to controller)
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

    const handleAddTemplateToStudent = async (template: UnknownRecord) => { // will be added to controller
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

    const handleExportPdf = async () => { // will be added to controller
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

    const handleExportJson = () => { // will be added to controller
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

    const openEditWorkout = (e: React.MouseEvent, w: Record<string, unknown>) => { // will be added to controller
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

    return (
        <>
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
                                                void extractLetter; // used in normalize logic above
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
                                        suggestions.push('Pouco tempo: usar treino "mínimo efetivo" (menos exercícios e mais foco).');
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

            {/* History Modal */}
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

            {/* Edit Student Workout Modal */}
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

            {/* View Workout Modal */}
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

            {/* Export Modal */}
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

            {/* Execution Video Modal */}
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
        </>
    );
};

export default StudentDetailPanel;

'use client';

import React, { useCallback, useState } from 'react';
import {
    X, ArrowLeft, Edit3, Dumbbell, History, Plus, Trash2, Video, Download,
    FileText, Loader2
} from 'lucide-react';
import HistoryList from '@/components/HistoryList';
import AdminWorkoutEditor, { AdminWorkout } from '@/components/AdminWorkoutEditor';
import { escapeHtml } from '@/utils/escapeHtml';
import { parseJsonWithSchema } from '@/utils/zod';
import { z } from 'zod';
import { normalizeWorkoutTitle } from '@/utils/workoutTitle';
import { updateWorkout } from '@/actions/workout-actions';

import type { AdminUser, AdminWorkoutTemplate } from '@/types/admin';
import { useAdminPanel } from './AdminPanelContext';
import { useDialog } from '@/contexts/DialogContext';
import type { UnknownRecord } from '@/types/app'
import { StudentCheckinsTab } from './StudentCheckinsTab';
import { StudentEvolutionTab } from './StudentEvolutionTab';
import { StudentWorkoutsTab } from './StudentWorkoutsTab';
import { StudentVideosTab } from './StudentVideosTab';
import { StudentProfileTab } from './StudentProfileTab';


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
        handleUpdateStudentTeacher,
        handleToggleStudentStatus,
        handleDeleteStudent,
        // Bug #4 fix: using memoized versions from controller instead of inline re-definitions
        handleEditStudent,
        handleSaveStudentEdit,
        handleExportPdf,
        handleExportJson,
        getSetsCount,
    } = useAdminPanel();

    const [deletingStudent, setDeletingStudent] = useState(false);
    const [deleteStudentConfirm, setDeleteStudentConfirm] = useState(false);

    const normalizeText = useCallback((value: unknown) => String(value || '').toLowerCase(), []);

    if (!selectedStudent) return null;

    // Local computed vars (derived from context state — belong in render body)
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
        } catch { return true; }
    })();



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
                                    < div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center font-black text-lg md:text-xl text-neutral-100 flex-shrink-0" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }} >
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

                                <div className="flex flex-wrap items-center gap-2 w-full">
                                    {isAdmin && (Array.isArray(teachersList) ? teachersList.length : 0) > 0 && (
                                        <div className="flex items-center gap-2 w-full">
                                            <span className="hidden lg:inline text-[10px] font-black uppercase tracking-widest text-neutral-500"> Professor </span>
                                            {(() => {
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
                                                        className="min-h-[44px] bg-neutral-900/70 text-neutral-200 rounded-xl px-3 py-2 text-xs flex-1 border border-neutral-800 focus:border-yellow-500 focus:outline-none"
                                                    >
                                                        <option value=""> Sem Professor </option>
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
                                    <div className="flex items-center gap-2 w-full">
                                        <button
                                            type="button"
                                            onClick={() => setEditingStudent(true)}
                                            className="flex-1 min-h-[44px] px-4 py-3 bg-neutral-900/70 border border-neutral-800 hover:bg-neutral-900 text-neutral-200 rounded-xl font-black flex items-center justify-center gap-2 transition-all duration-300 active:scale-95"
                                            title="Editar"
                                        >
                                            <Edit3 size={18} className="text-yellow-500" /> Editar
                                        </button>
                                        {deleteStudentConfirm ? (
                                            <button
                                                type="button"
                                                disabled={deletingStudent}
                                                onClick={async () => {
                                                    setDeletingStudent(true);
                                                    try {
                                                        const sid = String(selectedStudent?.id || selectedStudent?.user_id || '');
                                                        await handleDeleteStudent(sid, () => setSelectedStudent(null));
                                                    } finally {
                                                        setDeletingStudent(false);
                                                        setDeleteStudentConfirm(false);
                                                    }
                                                }}
                                                className="flex-1 min-h-[44px] px-4 py-3 bg-red-600 hover:bg-red-500 border border-red-500 text-white rounded-xl font-black flex items-center justify-center gap-2 transition-all duration-300 active:scale-95 disabled:opacity-60"
                                            >
                                                {deletingStudent ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                                                Confirmar?
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => setDeleteStudentConfirm(true)}
                                                className="flex-1 min-h-[44px] px-4 py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-red-400 rounded-xl font-black flex items-center justify-center gap-2 transition-all duration-300 active:scale-95"
                                                title="Excluir aluno"
                                            >
                                                <Trash2 size={18} /> Excluir
                                            </button>
                                        )}
                                    </div>
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
                                         <button
                            type="button"
                            onClick={() => setSubTab('checkins')}
                            className={`flex-1 min-h-[44px] px-4 rounded-full font-black text-[11px] uppercase tracking-widest transition-all duration-300 active:scale-95 ${subTab === 'checkins'
                                ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20'
                                : 'text-neutral-200'
                                }`}
                        >
                            Check - ins
                        </button>
                        <button
                            type="button"
                            onClick={() => setSubTab('profile')}
                            className={`flex-1 min-h-[44px] px-4 rounded-full font-black text-[11px] uppercase tracking-widest transition-all duration-300 active:scale-95 ${subTab === 'profile'
                                ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20'
                                : 'text-neutral-200'
                                }`}
                        >
                            Perfil
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
                        <StudentWorkoutsTab />
                    )}

                {
                    !loading && executionVideoEnabled && subTab === 'videos' && (
                        <StudentVideosTab />
                    )}

                {
                    !loading && subTab === 'checkins' && (
                        <StudentCheckinsTab />
                    )}

                {
                    !loading && subTab === 'evolution' && (
                        <StudentEvolutionTab />
                    )}

                {
                    !loading && subTab === 'profile' && (
                        <StudentProfileTab />
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
                                            if (!targetUserId) { await alert('Este aluno ainda não possui acesso ao app.'); return; }
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

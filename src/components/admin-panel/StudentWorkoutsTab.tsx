'use client';

import React from 'react';
import { Dumbbell, History, Edit3, Trash2, Plus } from 'lucide-react';
import { normalizeWorkoutTitle } from '@/utils/workoutTitle';
import { useAdminPanel } from './AdminPanelContext';
import { useDialog } from '@/contexts/DialogContext';
import type { UnknownRecord } from '@/types/app';
import { apiAdmin } from '@/lib/api';

export const StudentWorkoutsTab: React.FC = () => {
    const { alert, confirm } = useDialog();
    const {
        selectedStudent,
        studentWorkouts,
        setStudentWorkouts,
        syncedWorkouts,
        setSyncedWorkouts,
        templates,
        user,
        supabase,
        getAdminAuthHeaders,
        setHistoryOpen,
        setEditingStudentWorkout,
        setViewWorkout,
        openEditWorkout,
        handleAddTemplateToStudent,
    } = useAdminPanel();

    if (!selectedStudent) return null;

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.25)]">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <Dumbbell size={18} className="text-yellow-500" />
                            <h3 className="text-base font-black text-white tracking-tight">Treinos do aluno</h3>
                        </div>
                        <div className="mt-1 text-xs text-neutral-400 font-semibold">
                            {(Array.isArray(studentWorkouts) ? studentWorkouts.length : 0) + (Array.isArray(syncedWorkouts) ? syncedWorkouts.length : 0)} atribuídos
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <button
                            type="button"
                            data-tour="adminpanel.student.workouts.history"
                            onClick={() => setHistoryOpen(true)}
                            className="min-h-[44px] px-4 py-3 bg-neutral-900/70 border border-yellow-500/25 text-yellow-400 rounded-xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-yellow-500/10 transition-all duration-300 active:scale-95"
                        >
                            <History size={16} /> Histórico
                        </button>
                        <button
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

            {/* Sync button */}
            {templates.length > 0 && (
                <button
                    onClick={async () => {
                        try {
                            const looksLikeUuid = (v: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || '').trim());
                            const maybeId = selectedStudent.user_id || selectedStudent.id || null;
                            let payloadId = looksLikeUuid(maybeId) ? String(maybeId) : undefined;
                            const payloadEmail = String(selectedStudent.email || '').trim();
                            if (!payloadId && payloadEmail) {
                                try {
                                    const { data: profile } = await supabase.from('profiles').select('id').ilike('email', payloadEmail).maybeSingle();
                                    if (profile?.id) payloadId = String(profile.id);
                                } catch { }
                            }
                            if (!payloadId && !payloadEmail) {
                                await alert('Este aluno ainda não possui acesso ao app. Solicite que ele faça o cadastro primeiro.');
                                return;
                            }
                            if (!payloadId && payloadEmail) {
                                await alert('Este aluno ainda não possui acesso ao app. Solicite que ele faça o cadastro primeiro.');
                                return;
                            }
                            const authHeaders = await getAdminAuthHeaders();
                            const json: UnknownRecord = await apiAdmin.syncWorkoutTemplates(
                                { id: payloadId, email: payloadEmail, mode: 'all' },
                                authHeaders
                            ).then(r => r as UnknownRecord).catch(() => ({} as UnknownRecord));
                            if (json.ok) {
                                const debugObj: UnknownRecord | null = json.debug && typeof json.debug === 'object' ? (json.debug as UnknownRecord) : null;
                                const selectedUserId = String((selectedStudent as UnknownRecord | null)?.user_id || '').trim();
                                const resolvedTargetUserId = String(debugObj?.targetUserId || selectedUserId || '').trim();
                                if (!resolvedTargetUserId) {
                                    await alert('Não foi possível identificar o aluno. Tente recarregar a página.');
                                    return;
                                }
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
                                setStudentWorkouts(others);
                                setSyncedWorkouts(synced);
                                const createdCount = Number(json.created_count) || 0;
                                const updatedCount = Number(json.updated_count) || 0;
                                const msg = `Sincronização contínua ativada: ${createdCount} criado(s), ${updatedCount} atualizado(s)`;
                                if (createdCount + updatedCount === 0 && debugObj) {
                                    const pickedNames: unknown[] = Array.isArray(debugObj.picked_names) ? (debugObj.picked_names as unknown[]) : [];
                                    const sampleNames: unknown[] = Array.isArray(debugObj.source_sample_names) ? (debugObj.source_sample_names as unknown[]) : [];
                                    const extra = `\n\nDiagnóstico:\n- sourceUserId: ${String(debugObj.sourceUserId || '-')}\n- source_mode: ${String(debugObj.source_mode || '-')}\n- owner_raw: ${String(debugObj.owner_raw_count ?? '-')}\n- owner_matched: ${String(debugObj.owner_matched_count ?? '-')}\n- source_count: ${String(debugObj.source_count ?? '-')}\n- picked: ${String(debugObj.picked_count ?? '-')}\n- picked_names: ${pickedNames.slice(0, 3).map(String).join(' | ') || '-'}\n- sample: ${sampleNames.slice(0, 3).map(String).join(' | ') || '-'}`;
                                    await alert(msg + extra);
                                } else {
                                    await alert(msg);
                                }
                            } else {
                                const debugObj: UnknownRecord | null = json.debug && typeof json.debug === 'object' ? (json.debug as UnknownRecord) : null;
                                if (debugObj) {
                                    const ownerSample: unknown[] = Array.isArray(debugObj.owner_sample_names) ? (debugObj.owner_sample_names as unknown[]) : [];
                                    const sample = ownerSample.slice(0, 3).map(String).join(' | ') || '-';
                                    const extra = `\n\nDiagnóstico:\n- authUserId: ${String(debugObj.authUserId || '-')}\n- sourceUserId: ${String(debugObj.sourceUserId || '-')}\n- syncMode: ${String(debugObj.syncMode || '-')}\n- owner_raw: ${String(debugObj.owner_raw_count ?? '-')}\n- owner_owned: ${String(debugObj.owner_owned_count ?? '-')}\n- owner_matched: ${String(debugObj.owner_matched_count ?? '-')}\n- sample: ${sample}`;
                                    await alert('Erro: ' + (String(json.error || '') || 'Falha ao sincronizar') + extra);
                                } else {
                                    await alert('Erro: ' + (String(json.error || '') || 'Falha ao sincronizar'));
                                }
                            }
                        } catch (e: unknown) {
                            const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
                            await alert('Erro ao sincronizar: ' + msg);
                        }
                    }}
                    className="px-3 py-2 bg-neutral-800 border border-neutral-700 text-neutral-200 rounded-lg text-xs font-bold"
                >
                    Sincronizar com Meus Treinos
                </button>
            )}

            {/* Synced workouts */}
            {syncedWorkouts.length > 0 && (
                <div className="mt-4">
                    <h3 className="font-bold text-yellow-500 text-xs uppercase tracking-widest mb-2">Treinos sincronizados</h3>
                    {syncedWorkouts.map((w) => (
                        <div
                            key={String((w as UnknownRecord)?.id ?? '')}
                            className="bg-neutral-800 p-4 rounded-xl border border-neutral-700 flex justify-between items-center cursor-pointer"
                            onClick={() => setViewWorkout(w)}
                        >
                            <div>
                                <h4 className="font-bold text-white">{normalizeWorkoutTitle(String((w as UnknownRecord)?.name ?? ''))}</h4>
                                <p className="text-xs text-neutral-500">{Array.isArray((w as UnknownRecord)?.exercises) ? ((w as UnknownRecord).exercises as unknown[]).length : 0} exercícios</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={(e) => openEditWorkout(e, w)} className="p-2 bg-neutral-700 hover:bg-yellow-500 text-neutral-300 hover:text-black rounded"><Edit3 size={16} /></button>
                                <button
                                    onClick={async (e) => {
                                        e.stopPropagation();
                                        if (!(await confirm('Remover este treino do aluno?'))) return;
                                        try {
                                            const authHeaders = await getAdminAuthHeaders();
                                            const res = await fetch('/api/admin/workouts/delete', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ id: (w as UnknownRecord)?.id }) });
                                            const json: UnknownRecord = await res.json().catch(() => ({} as UnknownRecord));
                                            if (!json.ok) throw new Error(String(json.error || 'Falha ao remover'));
                                            setStudentWorkouts(prev => prev.filter(x => x.id !== (w as UnknownRecord)?.id));
                                            setSyncedWorkouts(prev => prev.filter(x => x.id !== (w as UnknownRecord)?.id));
                                        } catch (e: unknown) {
                                            const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
                                            await alert('Erro ao remover: ' + msg);
                                        }
                                    }}
                                    className="p-2 text-red-500 hover:bg-red-900/20 rounded"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Student workouts */}
            {studentWorkouts.length === 0 && <p className="text-neutral-500 text-sm">Nenhum treino atribuído.</p>}
            {studentWorkouts.map((w) => (
                <div
                    key={String((w as UnknownRecord)?.id ?? '')}
                    className="bg-neutral-800 p-4 rounded-xl border border-neutral-700 flex justify-between items-center cursor-pointer"
                    onClick={() => setViewWorkout(w)}
                >
                    <div>
                        <h4 className="font-bold text-white">{normalizeWorkoutTitle(String((w as UnknownRecord)?.name ?? ''))}</h4>
                        <p className="text-xs text-neutral-500">{Array.isArray((w as UnknownRecord)?.exercises) ? ((w as UnknownRecord).exercises as unknown[]).length : 0} exercícios</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={(e) => openEditWorkout(e, w)} className="p-2 bg-neutral-700 hover:bg-yellow-500 text-neutral-300 hover:text-black rounded"><Edit3 size={16} /></button>
                        <button
                            onClick={async (e) => {
                                e.stopPropagation();
                                if (!(await confirm('Remover este treino do aluno?'))) return;
                                try {
                                    const authHeaders = await getAdminAuthHeaders();
                                    const workoutId = (w as UnknownRecord)?.id;
                                    const res = await fetch('/api/admin/workouts/delete', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ id: workoutId }) });
                                    const json: UnknownRecord = await res.json().catch(() => ({} as UnknownRecord));
                                    if (!json.ok) throw new Error(String(json.error || 'Falha ao remover'));
                                    setStudentWorkouts((prev) => prev.filter((x) => x.id !== workoutId));
                                } catch (err: unknown) {
                                    const msg = err && typeof err === 'object' && 'message' in err && typeof (err as { message?: unknown }).message === 'string' ? (err as { message: string }).message : String(err);
                                    await alert('Erro ao remover: ' + msg);
                                }
                            }}
                            className="p-2 text-red-500 hover:bg-red-900/20 rounded"
                        >
                            <Trash2 size={18} />
                        </button>
                    </div>
                </div>
            ))}

            {/* My templates */}
            <div className="mt-6">
                <h3 className="font-bold text-yellow-500 text-xs uppercase tracking-widest mb-2">Meus Treinos</h3>
                {templates.length === 0 && <p className="text-neutral-500 text-sm">Nenhum treino seu encontrado.</p>}
                {templates.map((t, idx) => (
                    <button
                        key={String(t.id ?? t.name ?? `idx:${idx}`)}
                        onClick={() => handleAddTemplateToStudent(t)}
                        className="w-full text-left p-3 bg-neutral-800 hover:bg-neutral-700 rounded-xl border border-neutral-700 flex justify-between group"
                    >
                        <span>{String(t.name ?? '')}</span>
                        <Plus className="text-neutral-500 group-hover:text-yellow-500" />
                    </button>
                ))}
            </div>
        </div>
    );
};

'use client';

import React from 'react';
import { Video } from 'lucide-react';
import { useAdminPanel } from './AdminPanelContext';
import { useDialog } from '@/contexts/DialogContext';
import type { UnknownRecord } from '@/types/app';
import { apiAdmin } from '@/lib/api';

export const StudentVideosTab: React.FC = () => {
    const { alert } = useDialog();
    const {
        selectedStudent,
        executionVideos,
        setExecutionVideos,
        executionVideosLoading,
        setExecutionVideosLoading,
        executionVideosError,
        setExecutionVideosError,
        executionVideoFeedbackDraft,
        setExecutionVideoFeedbackDraft,
        setExecutionVideoModalUrl,
        setExecutionVideoModalOpen,
    } = useAdminPanel();

    if (!selectedStudent) return null;

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.25)]">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <Video size={18} className="text-yellow-500" />
                            <h3 className="text-base font-black text-white tracking-tight">Vídeos de execução</h3>
                        </div>
                        <div className="mt-1 text-xs text-neutral-400 font-semibold">
                            {executionVideosLoading ? 'Carregando...' : `${Array.isArray(executionVideos) ? executionVideos.length : 0} enviado(s)`}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={async () => {
                            try {
                                if (!selectedStudent?.user_id) return;
                                setExecutionVideosLoading(true);
                                setExecutionVideosError('');
                                const json = await apiAdmin.getExecutionVideosByStudent(String(selectedStudent.user_id))
                                    .catch((): null => null) as Record<string, unknown> | null;
                                if (!json?.ok) {
                                    setExecutionVideos([]);
                                    setExecutionVideosError(String((json?.error as string | undefined) || 'Falha ao carregar'));
                                    return;
                                }
                                setExecutionVideos(Array.isArray(json.items) ? json.items as unknown as import('@/types/admin').ExecutionVideo[] : []);
                            } catch (e: unknown) {
                                setExecutionVideos([]);
                                const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : '';
                                setExecutionVideosError(msg || 'Erro ao carregar');
                            } finally {
                                setExecutionVideosLoading(false);
                            }
                        }}
                        disabled={executionVideosLoading}
                        className="min-h-[44px] px-4 py-3 bg-neutral-900/70 border border-neutral-800 hover:bg-neutral-900 text-neutral-200 rounded-xl font-black flex items-center justify-center gap-2 transition-all duration-300 active:scale-95 disabled:opacity-60"
                    >
                        Atualizar
                    </button>
                </div>
            </div>

            {/* Error */}
            {executionVideosError ? (
                <div className="bg-neutral-900/60 border border-red-500/30 rounded-2xl p-4 text-red-200 font-bold text-sm">
                    {executionVideosError}
                </div>
            ) : null}

            {/* List */}
            {executionVideosLoading ? (
                <div className="text-center animate-pulse text-neutral-400 font-semibold">Carregando vídeos...</div>
            ) : !Array.isArray(executionVideos) || executionVideos.length === 0 ? (
                <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl p-4 text-neutral-400 font-semibold">
                    Nenhum vídeo enviado ainda.
                </div>
            ) : (
                <div className="space-y-3">
                    {executionVideos.map((it) => {
                        const id = it?.id ? String(it.id) : '';
                        const when = it?.created_at ? new Date(String(it.created_at)) : null;
                        const title = String(it?.exercise_name || 'Execução').trim();
                        const status = String(it?.status || 'pending').toLowerCase();
                        const draft = executionVideoFeedbackDraft && typeof executionVideoFeedbackDraft === 'object' ? String((executionVideoFeedbackDraft as UnknownRecord)[id] ?? '') : '';
                        const statusLabel = status === 'approved' ? 'Aprovado' : status === 'rejected' ? 'Reprovado' : 'Pendente';
                        const statusTone = status === 'approved'
                            ? 'border-green-500/30 text-green-300'
                            : status === 'rejected'
                                ? 'border-red-500/30 text-red-300'
                                : 'border-yellow-500/30 text-yellow-300';
                        return (
                            <div key={id || Math.random().toString(36).slice(2)} className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.25)]">
                                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <div className="text-base font-black text-white truncate">{title}</div>
                                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${statusTone}`}>{statusLabel}</span>
                                        </div>
                                        <div className="mt-1 text-xs text-neutral-400 font-semibold">{when ? when.toLocaleString() : ''}</div>
                                    </div>
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        {/* Watch */}
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                try {
                                                    const json = await apiAdmin.getExecutionVideoMedia(id)
                                                        .catch((): null => null) as Record<string, unknown> | null;
                                                    if (!json?.ok || !json?.url) { await alert(String((json?.error as string | undefined) || 'Falha ao abrir')); return; }
                                                    setExecutionVideoModalUrl(String(json.url));
                                                    setExecutionVideoModalOpen(true);
                                                } catch (e: unknown) {
                                                    const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
                                                    await alert('Erro: ' + msg);
                                                }
                                            }}
                                            className="min-h-[44px] px-4 py-3 bg-neutral-900/70 border border-neutral-800 hover:bg-neutral-900 text-neutral-200 rounded-xl font-black flex items-center justify-center gap-2 transition-all duration-300 active:scale-95"
                                        >
                                            Assistir
                                        </button>
                                        {/* Approve */}
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                try {
                                                    const feedback = String(draft || '').trim();
                                                    const json = await apiAdmin.reviewExecutionVideo({ video_id: id, status: 'reviewed', feedback })
                                                        .catch((): null => null) as Record<string, unknown> | null;
                                                    if (!json?.ok) { await alert(String((json?.error as string | undefined) || 'Falha ao aprovar')); return; }
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
                                        {/* Reject */}
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                try {
                                                    const feedback = String(draft || '').trim();
                                                    const json = await apiAdmin.reviewExecutionVideo({ video_id: id, status: 'rejected', feedback })
                                                        .catch((): null => null) as Record<string, unknown> | null;
                                                    if (!json?.ok) { await alert(String((json?.error as string | undefined) || 'Falha ao reprovar')); return; }
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
                                {/* Feedback textarea */}
                                <div className="mt-3">
                                    <label className="block text-[11px] font-black uppercase tracking-widest text-neutral-500 mb-2">Mensagem para o aluno</label>
                                    <textarea
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
    );
};

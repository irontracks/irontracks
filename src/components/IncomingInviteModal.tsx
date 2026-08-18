"use client";

import React, { useState, useEffect } from 'react';
import { Users, Dumbbell } from 'lucide-react';
import Image from 'next/image';
import { useTeamWorkout } from '@/contexts/TeamWorkoutContext';
import { useDialog } from '@/contexts/DialogContext';
import type { Workout } from '@/types/app';
import { getErrorMessage } from '@/utils/errorMessage'
import { createWorkout } from '@/actions/workout-crud-actions';
import { isInviteWorkoutAlreadySaved } from '@/utils/inviteWorkoutSave';
import { logError } from '@/lib/logger';

interface IncomingInviteModalProps {
    onStartSession: (workout: Workout, opts?: { skipConfirm?: boolean }) => void;
    /** Treinos já salvos do usuário — pra não oferecer salvar um que ele já tem. */
    savedWorkouts?: unknown[];
    /** Chamado após salvar com sucesso (o shell reidrata a lista de treinos). */
    onWorkoutSaved?: () => void;
}

const IncomingInviteModal = ({ onStartSession, savedWorkouts, onWorkoutSaved }: IncomingInviteModalProps) => {
    const { alert } = useDialog();
    const { incomingInvites, acceptInvite, rejectInvite } = useTeamWorkout();

    const [nowMs, setNowMs] = useState(() => Date.now());
    const [submitting, setSubmitting] = useState(false);
    const [saveWorkout, setSaveWorkout] = useState(true);

    useEffect(() => {
        const tick = () => setNowMs(Date.now());
        const t = setTimeout(tick, 0);
        const id = setInterval(tick, 60_000);
        return () => {
            clearTimeout(t);
            clearInterval(id);
        };
    }, []);

    const latestInvite = Array.isArray(incomingInvites) ? incomingInvites[0] : null;
    const latestInviteCreatedAtMs = (() => {
        const raw = latestInvite?.created_at ?? latestInvite?.createdAt ?? null;
        if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
        if (typeof raw === 'string') {
            const ms = Date.parse(raw);
            return Number.isFinite(ms) ? ms : 0;
        }
        return 0;
    })();
    const shouldShow = Boolean(latestInvite && nowMs && (latestInviteCreatedAtMs ? (nowMs - latestInviteCreatedAtMs) < 7 * 24 * 60 * 60 * 1000 : true));

    // Treino do convite + dedup ("já tenho salvo?") — computados antes do accept.
    const workoutData = (latestInvite?.workout_data ?? latestInvite?.workout ?? null) as Record<string, unknown> | null;
    const workoutTitle = workoutData && typeof workoutData === 'object'
        ? String((workoutData as Record<string, unknown>).title || (workoutData as Record<string, unknown>).name || '')
        : '';
    const workoutExercises = workoutData && typeof workoutData === 'object'
        ? (workoutData as Record<string, unknown>).exercises
        : null;
    const exerciseCount = Array.isArray(workoutExercises) ? workoutExercises.length : 0;
    const hasWorkoutToSave = Boolean(workoutData) && (Boolean(workoutTitle) || exerciseCount > 0);
    const alreadySaved = hasWorkoutToSave && isInviteWorkoutAlreadySaved(workoutData, savedWorkouts);
    // A pergunta de salvar só aparece quando há treino E o usuário ainda não o tem.
    const canOfferSave = hasWorkoutToSave && !alreadySaved;

    const handleAccept = async () => {
        if (!latestInvite || submitting) return;
        setSubmitting(true);
        try {
            if (typeof acceptInvite !== 'function') return;
            const workout = await acceptInvite(latestInvite);
            // Salva o treino na lista do usuário, se ele optou (fire-and-forget — não
            // atrasa o início da sessão; o start é a ação principal).
            if (canOfferSave && saveWorkout && workoutData) {
                void createWorkout(workoutData)
                    .then((res) => { if (res?.ok && typeof onWorkoutSaved === 'function') onWorkoutSaved(); })
                    .catch((e) => logError('IncomingInviteModal.saveWorkout', e));
            }
            // O modal já foi a confirmação ("BORA!") — pula o 2º confirm no start.
            if (workout && typeof onStartSession === 'function') onStartSession(workout as Workout, { skipConfirm: true });
        } catch (e: unknown) {
            await alert("Erro: " + (getErrorMessage(e)));
        } finally {
            setSubmitting(false);
        }
    };

    const handleReject = async () => {
        if (!latestInvite || submitting) return;
        setSubmitting(true);
        try {
            if (typeof rejectInvite !== 'function') return;
            await rejectInvite(latestInvite.id);
        } catch (e: unknown) {
            await alert("Erro: " + (getErrorMessage(e)));
        } finally {
            setSubmitting(false);
        }
    };

    if (!shouldShow) return null;

    const hostName = String(
        latestInvite?.from?.displayName || latestInvite?.from?.display_name ||
        latestInvite?.profiles?.display_name || 'Alguém'
    ).trim()
    const hostPhoto = latestInvite?.from?.photoURL || latestInvite?.from?.photo_url || latestInvite?.profiles?.photo_url || null

    return (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-6 pt-safe pb-safe animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="incoming-invite-title">
            <div className="bg-neutral-900 p-6 rounded-3xl border border-yellow-500 shadow-2xl max-w-sm w-full text-center">
                {/* Host avatar */}
                <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 overflow-hidden border-2 border-yellow-500 animate-bounce">
                    {hostPhoto ? (
                        <Image src={String(hostPhoto)} alt={hostName} width={80} height={80} className="object-cover w-full h-full" unoptimized />
                    ) : (
                        <div className="w-full h-full bg-yellow-500 flex items-center justify-center">
                            <Users size={32} className="text-black" />
                        </div>
                    )}
                </div>

                <h3 id="incoming-invite-title" className="text-2xl font-black text-white mb-1">Bora treinar junto?</h3>
                <p className="text-neutral-400 text-sm mb-4">
                    <span className="text-yellow-400 font-bold">{hostName}</span> te chamou para encarar esse treino lado a lado.
                </p>

                {/* Workout info card */}
                {(workoutTitle || exerciseCount > 0) && (
                    <div className="flex items-center gap-3 bg-neutral-800 rounded-xl px-4 py-3 mb-4 text-left">
                        <Dumbbell size={18} className="text-yellow-400 shrink-0" />
                        <div className="min-w-0">
                            {workoutTitle && <p className="text-sm font-bold text-white truncate">{workoutTitle}</p>}
                            {exerciseCount > 0 && (
                                <p className="text-[11px] text-neutral-400">{exerciseCount} exercício{exerciseCount !== 1 ? 's' : ''}</p>
                            )}
                        </div>
                    </div>
                )}

                {/* Pergunta: salvar este treino? (some se ele já tiver salvo) */}
                {canOfferSave && (
                    <label className="flex items-center gap-3 bg-neutral-800/60 rounded-xl px-4 py-3 mb-5 text-left cursor-pointer select-none">
                        <input
                            type="checkbox"
                            aria-label="Salvar este treino nos meus treinos"
                            checked={saveWorkout}
                            onChange={(e) => setSaveWorkout(e.target.checked)}
                            disabled={submitting}
                            className="size-4 accent-yellow-500 shrink-0"
                        />
                        <span className="text-sm text-neutral-200">Salvar este treino nos meus treinos</span>
                    </label>
                )}

                <div className="grid grid-cols-2 gap-3">
                    <button
                        onClick={handleReject}
                        disabled={submitting}
                        className="py-3 rounded-xl bg-neutral-700 text-white font-bold hover:bg-neutral-600 transition-colors disabled:opacity-60"
                    >
                        Agora não
                    </button>
                    <button
                        onClick={handleAccept}
                        disabled={submitting}
                        className="py-3 rounded-xl bg-yellow-500 text-black font-bold shadow-lg shadow-yellow-900/20 hover:bg-yellow-400 transition-colors disabled:opacity-60"
                    >
                        BORA! 💪
                    </button>
                </div>
            </div>
        </div>
    );
};

export default IncomingInviteModal;

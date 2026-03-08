"use client";

import { useFocusTrap } from '@/hooks/useFocusTrap'
import React, { useState, useEffect } from 'react';
import { Users, Dumbbell } from 'lucide-react';
import Image from 'next/image';
import { useTeamWorkout } from '@/contexts/TeamWorkoutContext';
import { useDialog } from '@/contexts/DialogContext';
import type { Workout } from '@/types/app';
import { getErrorMessage } from '@/utils/errorMessage'

interface IncomingInviteModalProps {
    onStartSession: (workout: Workout) => void;
}

const IncomingInviteModal = ({ onStartSession }: IncomingInviteModalProps) => {
    const { alert } = useDialog();
    const { incomingInvites, acceptInvite, rejectInvite } = useTeamWorkout();

    const [nowMs, setNowMs] = useState(() => Date.now());

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

    const handleAccept = async () => {
        if (!latestInvite) return;
        try {
            if (typeof acceptInvite !== 'function') return;
            const workout = await acceptInvite(latestInvite);
            if (workout && typeof onStartSession === 'function') onStartSession(workout);
        } catch (e: unknown) {
            await alert("Erro: " + (getErrorMessage(e)));
        }
    };

    const handleReject = async () => {
        if (!latestInvite) return;
        try {
            if (typeof rejectInvite !== 'function') return;
            await rejectInvite(latestInvite.id);
        } catch (e: unknown) {
            await alert("Erro: " + (getErrorMessage(e)));
        }
    };

    if (!shouldShow) return null;

    // Workout metadata from invite
    const workoutData = latestInvite?.workout_data ?? latestInvite?.workout ?? null
    const workoutTitle = workoutData && typeof workoutData === 'object'
        ? String((workoutData as Record<string, unknown>).title || (workoutData as Record<string, unknown>).name || '')
        : ''
    const workoutExercises = workoutData && typeof workoutData === 'object'
        ? (workoutData as Record<string, unknown>).exercises
        : null
    const exerciseCount = Array.isArray(workoutExercises) ? workoutExercises.length : 0

    const hostName = String(
        latestInvite?.from?.displayName || latestInvite?.from?.display_name ||
        latestInvite?.profiles?.display_name || 'Alguém'
    ).trim()
    const hostPhoto = latestInvite?.from?.photoURL || latestInvite?.from?.photo_url || latestInvite?.profiles?.photo_url || null

    return (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-6 pt-safe pb-safe animate-fade-in" role="dialog" aria-modal="true" aria-label="IncomingInvite">
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

                <h3 className="text-2xl font-black text-white mb-1">Bora treinar junto?</h3>
                <p className="text-neutral-400 text-sm mb-4">
                    <span className="text-yellow-400 font-bold">{hostName}</span> te chamou para encarar esse treino lado a lado.
                </p>

                {/* Workout info card */}
                {(workoutTitle || exerciseCount > 0) && (
                    <div className="flex items-center gap-3 bg-neutral-800 rounded-xl px-4 py-3 mb-5 text-left">
                        <Dumbbell size={18} className="text-yellow-400 shrink-0" />
                        <div className="min-w-0">
                            {workoutTitle && <p className="text-sm font-bold text-white truncate">{workoutTitle}</p>}
                            {exerciseCount > 0 && (
                                <p className="text-[11px] text-neutral-400">{exerciseCount} exercício{exerciseCount !== 1 ? 's' : ''}</p>
                            )}
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                    <button
                        onClick={handleReject}
                        className="py-3 rounded-xl bg-neutral-700 text-white font-bold hover:bg-neutral-600 transition-colors"
                    >
                        Agora não
                    </button>
                    <button
                        onClick={handleAccept}
                        className="py-3 rounded-xl bg-yellow-500 text-black font-bold shadow-lg shadow-yellow-900/20 hover:bg-yellow-400 transition-colors"
                    >
                        BORA! 💪
                    </button>
                </div>
            </div>
        </div>
    );
};

export default IncomingInviteModal;

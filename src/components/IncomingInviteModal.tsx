"use client";

import React, { useState, useEffect } from 'react';
import { Users } from 'lucide-react';
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

    return (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-6 pt-safe pb-safe animate-fade-in">
            <div className="bg-neutral-800 p-6 rounded-3xl border border-yellow-500 shadow-2xl max-w-sm w-full text-center">
                <div className="w-20 h-20 bg-yellow-500 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                    <Users size={32} className="text-black" />
                </div>
                <h3 className="text-2xl font-black text-white mb-2">Bora treinar junto?</h3>
                <p className="text-neutral-300 mb-6">
                    <span className="text-yellow-500 font-bold">{latestInvite?.from?.displayName || 'Alguém'}</span> te chamou para encarar esse treino lado a lado.
                </p>
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
                        BORA!
                    </button>
                </div>
            </div>
        </div>
    );
};

export default IncomingInviteModal;

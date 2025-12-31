import React, { useState, useEffect } from 'react';
import { Users } from 'lucide-react';
import { useTeamWorkout } from '@/contexts/TeamWorkoutContext';
import { useDialog } from '@/contexts/DialogContext';

const IncomingInviteModal = ({ onStartSession }) => {
    const { alert } = useDialog();
    const { incomingInvites, acceptInvite, rejectInvite } = useTeamWorkout();

    const [nowMs, setNowMs] = useState(0);

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
    const latestInviteCreatedAtMs = typeof latestInvite?.createdAt?.seconds === 'number' ? latestInvite.createdAt.seconds * 1000 : 0;
    const shouldShow = Boolean(latestInvite && nowMs && latestInviteCreatedAtMs && (nowMs - latestInviteCreatedAtMs) < 300000);

    const handleAccept = async () => {
        if (!latestInvite) return;
        try {
            const workout = await acceptInvite(latestInvite);
            if (workout && onStartSession) {
                onStartSession(workout);
            }
        } catch (e) {
            await alert("Erro: " + (e?.message ?? String(e)));
        }
    };

    const handleReject = async () => {
        if (!latestInvite) return;
        await rejectInvite(latestInvite.id);
    };

    if (!shouldShow) return null;

    return (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in">
            <div className="bg-neutral-800 p-6 rounded-3xl border border-yellow-500 shadow-2xl max-w-sm w-full text-center">
                <div className="w-20 h-20 bg-yellow-500 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                    <Users size={32} className="text-black" />
                </div>
                <h3 className="text-2xl font-black text-white mb-2">Convite de Treino!</h3>
                <p className="text-neutral-300 mb-6">
                    <span className="text-yellow-500 font-bold">{latestInvite?.fromName}</span> convidou você para treinar agora.
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

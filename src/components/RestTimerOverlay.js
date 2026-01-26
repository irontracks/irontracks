"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Timer, ArrowLeft } from 'lucide-react';
import { playTimerFinishSound, playTick } from '@/lib/sounds';

const RestTimerOverlay = ({ targetTime, context, onFinish, onClose, settings }) => {
    const [timeLeft, setTimeLeft] = useState(0);
    const [isFinished, setIsFinished] = useState(false);
    const warnedRef = useRef(false);
    const safeSettings = settings && typeof settings === 'object' ? settings : null;
    const soundsEnabled = safeSettings ? safeSettings.enableSounds !== false : true;
    const soundVolume = (() => {
        const raw = Number(safeSettings?.soundVolume ?? 100);
        if (!Number.isFinite(raw)) return 1;
        return Math.max(0, Math.min(1, raw / 100));
    })();
    const allowNotify = safeSettings ? safeSettings.restTimerNotify !== false : true;
    const allowVibrate = safeSettings ? safeSettings.restTimerVibrate !== false : true;
    const repeatAlarm = safeSettings ? safeSettings.restTimerRepeatAlarm !== false : true;
    const repeatIntervalMs = (() => {
        const raw = Number(safeSettings?.restTimerRepeatIntervalMs ?? 1500);
        if (!Number.isFinite(raw)) return 1500;
        return Math.max(600, Math.min(6000, Math.round(raw)));
    })();
    const allowTickCountdown = safeSettings ? safeSettings.restTimerTickCountdown !== false : true;

    const formatDuration = (s) => {
        const mins = Math.floor(s / 60);
        const secs = Math.floor(s % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    useEffect(() => {
        try {
            warnedRef.current = false;
        } catch {}
    }, [targetTime]);

    useEffect(() => {
        try {
            const kind = String(context?.kind ?? '');
            if (kind !== 'cluster') return;
            if (isFinished) return;
            if (warnedRef.current) return;
            if (timeLeft !== 5) return;
            if (!allowTickCountdown) return;
            if (!soundsEnabled) return;
            try {
                playTick({ volume: soundVolume, enabled: soundsEnabled });
            } catch {}
            warnedRef.current = true;
        } catch {}
    }, [allowTickCountdown, context?.kind, isFinished, soundVolume, soundsEnabled, timeLeft]);

    useEffect(() => {
        let soundInterval;
        let vibrateInterval;

        if (isFinished) {
            if (soundsEnabled) {
                playTimerFinishSound({ volume: soundVolume, enabled: soundsEnabled });
                if (repeatAlarm) {
                    soundInterval = setInterval(() => {
                        playTimerFinishSound({ volume: soundVolume, enabled: soundsEnabled });
                    }, repeatIntervalMs);
                }
            }

            try {
                if (allowVibrate && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
                    navigator.vibrate([220, 90, 220]);
                    if (repeatAlarm) {
                        vibrateInterval = setInterval(() => {
                            try {
                                navigator.vibrate([220, 90, 220]);
                            } catch {}
                        }, repeatIntervalMs);
                    }
                }
            } catch {}
        }

        return () => {
            if (soundInterval) clearInterval(soundInterval);
            if (vibrateInterval) clearInterval(vibrateInterval);
        };
    }, [allowVibrate, isFinished, repeatAlarm, repeatIntervalMs, soundVolume, soundsEnabled]);

    useEffect(() => {
        if (!targetTime) return;
        let hasNotified = false;

        const updateTimer = () => {
            const now = Date.now();
            const remaining = Math.ceil((targetTime - now) / 1000);
            if (remaining <= 0) {
                setTimeLeft(0);
                setIsFinished(true);
                if (!hasNotified) {
                    hasNotified = true;
                    if (allowNotify && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                        new Notification("⏰ Tempo Esgotado!", {
                            body: "Hora de voltar para o treino!",
                            icon: 'icone.png',
                            tag: 'timer_finished'
                        });
                    }
                }
            } else {
                setTimeLeft(remaining);
                setIsFinished(false);
            }
        };

        updateTimer();
        const interval = setInterval(updateTimer, 100);
        return () => clearInterval(interval);
    }, [allowNotify, targetTime]);

    if (!targetTime) return null;

    if (isFinished) {
        return (
            <div
                className="fixed inset-0 z-[100] bg-green-500 flex flex-col items-center justify-center animate-pulse-fast cursor-pointer"
                onClick={() => {
                    try {
                        if (typeof onFinish === 'function') onFinish(context);
                    } catch {
                        try {
                            if (typeof onFinish === 'function') onFinish();
                        } catch {}
                    }
                }}
            >
                <Timer size={120} className="text-black mb-8 animate-bounce"/>
                <h1 className="text-6xl font-black text-black uppercase tracking-tighter">BORA!</h1>
                <p className="text-black font-bold mt-4 text-xl">TOQUE PARA VOLTAR</p>
            </div>
        );
    }

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-neutral-900/95 backdrop-blur-xl border-t border-yellow-500/30 p-6 shadow-2xl z-50 animate-slide-up pb-safe">
            <div className="flex items-center justify-between max-w-md mx-auto">
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <div className="absolute inset-0 bg-yellow-500 blur-lg opacity-20 animate-pulse"></div>
                        <Timer className="text-yellow-500 relative z-10" size={36}/>
                    </div>
                    <div>
                        <p className="text-[10px] text-yellow-500 uppercase font-bold tracking-widest">Recuperação</p>
                        <p className="text-4xl font-mono font-black text-white tabular-nums leading-none">{formatDuration(timeLeft)}</p>
                    </div>
                </div>
                    <div className="flex gap-2">
                    <button
                        onClick={() => {
                            try {
                                if (typeof onClose === 'function') onClose();
                            } catch {}
                        }}
                        className="px-3 py-2 bg-neutral-800 rounded-xl text-neutral-300 border border-neutral-700 hover:text-white hover:bg-neutral-700 inline-flex items-center gap-2"
                    >
                        <ArrowLeft size={16}/> <span className="text-xs font-bold">Voltar</span>
                    </button>
                    </div>
            </div>
        </div>
    );
};

export default RestTimerOverlay;

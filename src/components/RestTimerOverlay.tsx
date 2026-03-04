
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Timer, ArrowLeft } from 'lucide-react';
import { playTimerFinishSound, playTick } from '@/lib/sounds';
import { isIosNative } from '@/utils/platform';
import { cancelRestNotification, endRestLiveActivity, requestNativeNotifications, scheduleRestNotification, setIdleTimerDisabled, startRestLiveActivity } from '@/utils/native/irontracksNative';

interface RestTimerContext {
    kind?: string;
    exerciseId?: string;
    setId?: string;
}

interface RestTimerSettings {
    enableSounds?: boolean;
    soundVolume?: number;
    restTimerNotify?: boolean;
    restTimerVibrate?: boolean;
    restTimerRepeatAlarm?: boolean;
    restTimerRepeatIntervalMs?: number;
    restTimerRepeatMaxSeconds?: number;
    restTimerRepeatMaxCount?: number;
    restTimerContinuousAlarm?: boolean;
    restTimerTickCountdown?: boolean;
}

interface RestTimerOverlayProps {
    targetTime: number | null;
    context: RestTimerContext | null;
    onFinish: (context?: RestTimerContext | null) => void;
    onClose: () => void;
    settings: RestTimerSettings | null;
}

const RestTimerOverlay: React.FC<RestTimerOverlayProps> = ({ targetTime, context, onFinish, onClose, settings }) => {
    const [timeLeft, setTimeLeft] = useState(0);
    const [isFinished, setIsFinished] = useState(false);
    const totalDurationRef = useRef(60); // for SVG ring — total seconds when timer started
    const warnedRef = useRef(false);
    const notifyIdRef = useRef('');
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
    const repeatMaxSeconds = (() => {
        const raw = Number(safeSettings?.restTimerRepeatMaxSeconds ?? 180);
        if (!Number.isFinite(raw)) return 180;
        return Math.max(10, Math.min(900, Math.round(raw)));
    })();
    const repeatMaxCount = (() => {
        const raw = Number(safeSettings?.restTimerRepeatMaxCount ?? 60);
        if (!Number.isFinite(raw)) return 60;
        return Math.max(1, Math.min(120, Math.round(raw)));
    })();
    const continuousAlarm = safeSettings ? safeSettings.restTimerContinuousAlarm === true : false;
    const allowTickCountdown = safeSettings ? safeSettings.restTimerTickCountdown !== false : true;

    const formatDuration = (s: number) => {
        const mins = Math.floor(s / 60);
        const secs = Math.floor(s % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    useEffect(() => {
        try {
            warnedRef.current = false;
        } catch { }
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
            } catch { }
            warnedRef.current = true;
        } catch { }
    }, [allowTickCountdown, context?.kind, isFinished, soundVolume, soundsEnabled, timeLeft]);

    useEffect(() => {
        let soundInterval: NodeJS.Timeout | undefined;
        let vibrateInterval: NodeJS.Timeout | undefined;

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
                            } catch { }
                        }, repeatIntervalMs);
                    }
                }
            } catch { }
        }

        return () => {
            if (soundInterval) clearInterval(soundInterval);
            if (vibrateInterval) clearInterval(vibrateInterval);
        };
    }, [allowVibrate, isFinished, repeatAlarm, repeatIntervalMs, soundVolume, soundsEnabled]);

    useEffect(() => {
        if (!targetTime) {
            setIdleTimerDisabled(false);
            if (notifyIdRef.current) {
                cancelRestNotification(notifyIdRef.current);
            }
            return;
        }
        let hasNotified = false;
        const id = `${context?.kind || 'rest'}-${context?.exerciseId || ''}-${context?.setId || ''}-${targetTime}`;
        notifyIdRef.current = id;

        try {
            const seconds = Math.max(1, Math.ceil((targetTime - Date.now()) / 1000));
            const shouldNotify = (allowNotify || (isIosNative() && soundsEnabled)) && seconds > 0;
            if (shouldNotify) {
                requestNativeNotifications().then((res) => {
                    if (!res?.granted) return;
                    const notifyEverySeconds = Math.max(3, Math.min(30, Math.round(repeatIntervalMs / 1000) || 5));
                    const maxSeconds = continuousAlarm ? 900 : repeatMaxSeconds;
                    const maxCount = continuousAlarm ? 120 : repeatMaxCount;
                    const byDuration = Math.ceil(maxSeconds / notifyEverySeconds);
                    const notifyCount = repeatAlarm ? Math.max(0, Math.min(maxCount, byDuration)) : 0;
                    scheduleRestNotification(id, seconds, '⏰ Tempo Esgotado!', 'Hora de voltar para o treino!', notifyCount, notifyEverySeconds);
                }).catch(() => { });
            }
            startRestLiveActivity(id, seconds, 'Descanso');
            setIdleTimerDisabled(true);
        } catch { }

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

        // Capture total duration for SVG ring progress
        const initialRemaining = Math.max(1, Math.ceil((targetTime - Date.now()) / 1000));
        totalDurationRef.current = initialRemaining;

        updateTimer();
        const interval = setInterval(updateTimer, 100);
        return () => {
            clearInterval(interval);
            if (notifyIdRef.current) {
                cancelRestNotification(notifyIdRef.current);
                endRestLiveActivity(notifyIdRef.current);
            }
            setIdleTimerDisabled(false);
        };
    }, [allowNotify, repeatAlarm, repeatIntervalMs, repeatMaxCount, repeatMaxSeconds, soundsEnabled, targetTime, context?.exerciseId, context?.kind, context?.setId]);


    useEffect(() => {
        if (!isFinished) return;
        setIdleTimerDisabled(false);
        if (notifyIdRef.current) {
            cancelRestNotification(notifyIdRef.current);
            endRestLiveActivity(notifyIdRef.current);
        }
    }, [isFinished]);

    if (!targetTime) return null;

    // SVG ring progress
    // eslint-disable-next-line react-hooks/refs
    const totalSeconds = totalDurationRef.current;
    const progress = Math.max(0, Math.min(1, timeLeft / totalSeconds));
    const radius = 44;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference * (1 - progress);
    const isUrgent = timeLeft > 0 && timeLeft <= 3;

    // Extract exercise context from timerContext key (format: exIdx-setIdx)
    const ctxKey = String((context as Record<string, unknown> | null)?.key ?? '');
    const exerciseName = String((context as Record<string, unknown> | null)?.exerciseName ?? '');

    if (isFinished) {
        return (
            <div
                className="fixed inset-0 z-[2200] bg-black/70 backdrop-blur-sm flex flex-col items-end justify-end pb-safe cursor-pointer"
                onClick={() => {
                    try {
                        if (typeof onFinish === 'function') onFinish(context);
                    } catch {
                        try {
                            if (typeof onFinish === 'function') onFinish();
                        } catch { }
                    }
                }}
            >
                {/* Elegant toast instead of full-screen flash */}
                <div className="w-full px-4 pb-6 animate-slide-up">
                    <div className="flex items-center gap-4 bg-emerald-950 border border-emerald-500/40 shadow-[0_0_40px_-4px_rgba(52,211,153,0.3)] rounded-2xl p-5">
                        <div className="relative flex-shrink-0">
                            <div className="absolute inset-0 bg-emerald-400 blur-xl opacity-30 animate-pulse rounded-full" />
                            <Timer size={36} className="text-emerald-400 relative z-10" />
                        </div>
                        <div className="flex-1">
                            <p className="text-emerald-300 font-black text-base uppercase tracking-wider">Descanso Finalizado!</p>
                            <p className="text-emerald-400/70 text-sm font-bold mt-0.5">Toque em qualquer lugar para continuar 💪</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={[
            'fixed bottom-0 left-0 right-0 backdrop-blur-xl border-t shadow-2xl z-[2100] animate-slide-up pb-safe transition-colors duration-500',
            isUrgent
                ? 'bg-red-950/95 border-red-500/50'
                : 'bg-neutral-900/95 border-yellow-500/30',
        ].join(' ')}>
            <div className="flex items-center gap-4 max-w-md mx-auto p-4">
                {/* SVG circular ring */}
                <div className="relative flex-shrink-0 w-[100px] h-[100px]">
                    <svg width="100" height="100" viewBox="0 0 100 100" className="-rotate-90">
                        {/* Background ring */}
                        <circle
                            cx="50" cy="50" r={radius}
                            fill="none"
                            stroke={isUrgent ? 'rgba(239,68,68,0.15)' : 'rgba(234,179,8,0.12)'}
                            strokeWidth="6"
                        />
                        {/* Progress ring */}
                        <circle
                            cx="50" cy="50" r={radius}
                            fill="none"
                            stroke={isUrgent ? '#ef4444' : '#eab308'}
                            strokeWidth="6"
                            strokeLinecap="round"
                            strokeDasharray={circumference}
                            strokeDashoffset={strokeDashoffset}
                            className="transition-[stroke-dashoffset] duration-300"
                        />
                    </svg>
                    {/* Countdown inside ring */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <p className={['text-2xl font-mono font-black tabular-nums leading-none transition-colors', isUrgent ? 'text-red-400' : 'text-white'].join(' ')}>
                            {formatDuration(timeLeft)}
                        </p>
                        <p className={['text-[9px] uppercase font-bold tracking-widest mt-0.5 transition-colors', isUrgent ? 'text-red-400/70' : 'text-yellow-500'].join(' ')}>
                            {isUrgent ? 'BORA!' : 'Descanso'}
                        </p>
                    </div>
                </div>

                {/* Context + actions */}
                <div className="flex-1 min-w-0">
                    {exerciseName ? (
                        <p className="text-xs text-neutral-400 font-bold uppercase tracking-widest truncate mb-0.5">{exerciseName}</p>
                    ) : (
                        <p className="text-[10px] text-yellow-500 uppercase font-bold tracking-widest mb-0.5">Recuperação</p>
                    )}
                    {ctxKey ? (
                        <p className="text-[10px] text-neutral-500 font-mono mb-3">
                            Série {(ctxKey.split('-')[1] ? Number(ctxKey.split('-')[1]) + 1 : 1)}
                        </p>
                    ) : null}
                    <div className="flex gap-2">
                        <button
                            onClick={() => {
                                try {
                                    if (typeof onFinish === 'function') onFinish(context);
                                } catch { }
                            }}
                            className="flex-1 min-h-[48px] bg-yellow-500 rounded-xl text-black font-black border border-yellow-400 hover:bg-yellow-400 inline-flex items-center justify-center gap-2 active:scale-95 transition-transform text-sm"
                        >
                            START
                        </button>
                        <button
                            onClick={() => {
                                try {
                                    if (typeof onClose === 'function') onClose();
                                } catch { }
                            }}
                            className="min-h-[48px] px-3 bg-neutral-800 rounded-xl text-neutral-300 border border-neutral-700 hover:text-white hover:bg-neutral-700 inline-flex items-center gap-1.5 active:scale-95 transition-transform"
                        >
                            <ArrowLeft size={14} /> <span className="text-xs font-bold">Ocultar</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RestTimerOverlay;

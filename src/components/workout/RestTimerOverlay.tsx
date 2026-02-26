
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Timer, ArrowLeft } from 'lucide-react';
import { playTimerFinishSound, playTick } from '@/lib/sounds';
import { isIosNative } from '@/utils/platform';
import { cancelRestNotification, endRestLiveActivity, requestNativeNotifications, scheduleRestNotification, setIdleTimerDisabled, startRestLiveActivity, triggerHaptic, updateRestLiveActivity } from '@/utils/native/irontracksNative';

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
    onStart?: (context?: RestTimerContext | null) => void;
    onClose: () => void;
    settings: RestTimerSettings | null;
}

const RestTimerOverlay: React.FC<RestTimerOverlayProps> = ({ targetTime, context, onFinish, onStart, onClose, settings }) => {
    const [timeLeft, setTimeLeft] = useState(0);
    const [isFinished, setIsFinished] = useState(false);
    const warnedRef = useRef(false);
    const notifyIdRef = useRef('');
    const soundIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const vibrateIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const alarmActiveRef = useRef(false);
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

    const stopAlarm = (cancelNative: boolean) => {
        alarmActiveRef.current = false;
        if (soundIntervalRef.current) {
            clearInterval(soundIntervalRef.current);
            soundIntervalRef.current = null;
        }
        if (vibrateIntervalRef.current) {
            clearInterval(vibrateIntervalRef.current);
            vibrateIntervalRef.current = null;
        }
        if (cancelNative && notifyIdRef.current) {
            cancelRestNotification(notifyIdRef.current);
        }
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
        if (isFinished) {
            alarmActiveRef.current = true;
            if (soundsEnabled) {
                playTimerFinishSound({ volume: soundVolume, enabled: soundsEnabled });
                if (repeatAlarm) {
                    if (soundIntervalRef.current) clearInterval(soundIntervalRef.current);
                    soundIntervalRef.current = setInterval(() => {
                        if (!alarmActiveRef.current) return;
                        playTimerFinishSound({ volume: soundVolume, enabled: soundsEnabled });
                    }, repeatIntervalMs);
                }
            }

            try {
                if (allowVibrate) {
                    triggerHaptic('success');
                    if (repeatAlarm) {
                        if (vibrateIntervalRef.current) clearInterval(vibrateIntervalRef.current);
                        vibrateIntervalRef.current = setInterval(() => {
                            if (!alarmActiveRef.current) return;
                            try {
                                triggerHaptic('warning');
                            } catch { }
                        }, repeatIntervalMs);
                    }
                }
            } catch { }
        }

        return () => {
            if (!isFinished) return;
            stopAlarm(false);
        };
    }, [allowVibrate, isFinished, repeatAlarm, repeatIntervalMs, soundVolume, soundsEnabled]);

    useEffect(() => {
        if (!isFinished) return;
        const onVisible = () => {
            if (document.visibilityState === 'visible') {
                stopAlarm(true);
            }
        };
        document.addEventListener('visibilitychange', onVisible);
        let handle: { remove: () => void } | null = null;
        try {
            const appMod = require('@capacitor/app');
            const App = appMod?.App;
            if (App?.addListener) {
                App.addListener('appStateChange', (state: { isActive?: boolean }) => {
                    if (state?.isActive) stopAlarm(true);
                }).then((h: { remove: () => void }) => {
                    handle = h;
                }).catch(() => {});
            }
        } catch { }
        return () => {
            document.removeEventListener('visibilitychange', onVisible);
            if (handle) {
                try { handle.remove(); } catch { }
            }
        };
    }, [isFinished]);

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
                }).catch(() => {});
            }
            startRestLiveActivity(id, seconds, 'Descanso');
            setIdleTimerDisabled(true);
        } catch { }

        const updateTimer = () => {
            const now = Date.now();
            const remaining = Math.ceil((targetTime - now) / 1000);
            if (remaining <= 0) {
                setTimeLeft(remaining);
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
        const interval = setInterval(updateTimer, 250);
        return () => {
            clearInterval(interval);
            if (notifyIdRef.current) {
                cancelRestNotification(notifyIdRef.current);
                endRestLiveActivity(notifyIdRef.current);
            }
            stopAlarm(false);
            setIdleTimerDisabled(false);
        };
    }, [allowNotify, repeatAlarm, repeatIntervalMs, repeatMaxCount, repeatMaxSeconds, continuousAlarm, soundsEnabled, targetTime, context?.exerciseId, context?.kind, context?.setId]);

    useEffect(() => {
        if (!isFinished) return;
        if (notifyIdRef.current) {
            cancelRestNotification(notifyIdRef.current);
            // Update Live Activity to finished state (green "BORAAAA" + count up)
            updateRestLiveActivity(notifyIdRef.current, true);
        }
    }, [isFinished]);

    if (!targetTime) return null;

    const handleStart = () => {
        try {
            // End the Live Activity when user starts next set
            if (notifyIdRef.current) {
                endRestLiveActivity(notifyIdRef.current);
            }
            stopAlarm(true);
            if (typeof onStart === 'function') onStart(context);
            else if (typeof onFinish === 'function') onFinish(context);
        } catch {
            try {
                if (typeof onFinish === 'function') onFinish(context);
            } catch { }
        }
    };

    const baseSeconds = Math.max(0, timeLeft);
    const extraSeconds = Math.max(0, -timeLeft);

    return (
        <>
            {isFinished ? (
                <div className="fixed inset-0 z-[2000] bg-green-500 flex flex-col items-center justify-center animate-pulse-fast pointer-events-none">
                    <Timer size={120} className="text-black mb-8 animate-bounce" />
                    <h1 className="text-6xl font-black text-black uppercase tracking-tighter">BORA!</h1>
                    <p className="text-black font-bold mt-4 text-xl">DESCANSO FINALIZADO</p>
                </div>
            ) : null}

            <div className="fixed bottom-0 left-0 right-0 bg-neutral-900/95 backdrop-blur-xl border-t border-yellow-500/30 p-6 shadow-2xl z-[2100] animate-slide-up pb-safe">
                <div className="flex items-center justify-between max-w-md mx-auto">
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <div className="absolute inset-0 bg-yellow-500 blur-lg opacity-20 animate-pulse"></div>
                            <Timer className="text-yellow-500 relative z-10" size={36} />
                        </div>
                        <div>
                            <p className="text-[10px] text-yellow-500 uppercase font-bold tracking-widest">Recuperação</p>
                            <p className="text-4xl font-mono font-black text-white tabular-nums leading-none">
                                {formatDuration(baseSeconds)}
                                {extraSeconds > 0 ? (
                                    <span className="ml-2 text-sm font-black text-green-400">{`(+${formatDuration(extraSeconds)})`}</span>
                                ) : null}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleStart}
                            className="px-4 py-2 bg-yellow-500 rounded-xl text-black font-black border border-yellow-400 hover:bg-yellow-400 inline-flex items-center gap-2"
                        >
                            <span className="text-xs font-black">START</span>
                        </button>
                        <button
                            onClick={() => {
                                try {
                                    stopAlarm(true);
                                    if (typeof onClose === 'function') onClose();
                                } catch { }
                            }}
                            className="px-3 py-2 bg-neutral-800 rounded-xl text-neutral-300 border border-neutral-700 hover:text-white hover:bg-neutral-700 inline-flex items-center gap-2"
                        >
                            <ArrowLeft size={16} /> <span className="text-xs font-bold">Voltar</span>
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};

export default RestTimerOverlay;

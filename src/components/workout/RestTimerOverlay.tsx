
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { playTimerFinishSound, playTick } from '@/lib/sounds';
import { isNativePlatform } from '@/utils/platform';
import { cancelRestNotification, endRestLiveActivity, requestNativeNotifications, scheduleRestNotification, startRestLiveActivity, stopAlarmSound, triggerHaptic, updateRestLiveActivity } from '@/utils/native/irontracksNative';

interface RestTimerContext {
    kind?: string;
    exerciseId?: string;
    exerciseName?: string;
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
    restTimerAutoStart?: boolean;
}

interface RestTimerOverlayProps {
    targetTime: number | null;
    context: RestTimerContext | null;
    onFinish: (context?: RestTimerContext | null) => void;
    onStart?: (context?: RestTimerContext | null) => void;
    onClose: () => void;
    settings: RestTimerSettings | null;
    autoStartEnabled?: boolean;
    onToggleAutoStart?: () => void;
}

const RestTimerOverlay: React.FC<RestTimerOverlayProps> = ({ targetTime, context, onFinish, onStart, onClose: _onClose, settings, autoStartEnabled, onToggleAutoStart }) => {
    const [timeLeft, setTimeLeft] = useState(0);
    const [isFinished, setIsFinished] = useState(false);
    const [autoStartLocal, setAutoStartLocal] = useState(Boolean(autoStartEnabled));
    const warnedRef = useRef(false);
    const notifyIdRef = useRef('');
    const soundIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const vibrateIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const alarmActiveRef = useRef(false);
    const autoStartFiredRef = useRef(false);
    const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
    const hasNotifiedRef = useRef(false);
    // Capture total rest seconds on mount so the ring can compute % remaining
    const totalSecondsRef = useRef<number>(0);
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
        // Stop native background alarm sound
        stopAlarmSound();
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

            if (allowVibrate) {
                triggerHaptic('success').catch(() => {});
                if (repeatAlarm) {
                    if (vibrateIntervalRef.current) clearInterval(vibrateIntervalRef.current);
                    vibrateIntervalRef.current = setInterval(() => {
                        if (!alarmActiveRef.current) return;
                        triggerHaptic('warning').catch(() => {});
                    }, repeatIntervalMs);
                }
            }
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
                }).catch(() => { });
            }
        } catch { }
        return () => {
            document.removeEventListener('visibilitychange', onVisible);
            if (handle) {
                try { handle.remove(); } catch { }
            }
        };
    }, [isFinished]);

    // ── Capture settings in refs so the main timer effect doesn't re-run ──
    const allowNotifyRef = useRef(allowNotify);
    allowNotifyRef.current = allowNotify;
    const repeatAlarmRef = useRef(repeatAlarm);
    repeatAlarmRef.current = repeatAlarm;
    const repeatIntervalMsRef = useRef(repeatIntervalMs);
    repeatIntervalMsRef.current = repeatIntervalMs;
    const repeatMaxCountRef = useRef(repeatMaxCount);
    repeatMaxCountRef.current = repeatMaxCount;
    const repeatMaxSecondsRef = useRef(repeatMaxSeconds);
    repeatMaxSecondsRef.current = repeatMaxSeconds;
    const continuousAlarmRef = useRef(continuousAlarm);
    continuousAlarmRef.current = continuousAlarm;
    const soundsEnabledRef = useRef(soundsEnabled);
    soundsEnabledRef.current = soundsEnabled;

    useEffect(() => {
        if (!targetTime) {
            if (notifyIdRef.current) {
                cancelRestNotification(notifyIdRef.current);
            }
            return;
        }
        hasNotifiedRef.current = false;
        const id = `${context?.kind || 'rest'}-${context?.exerciseId || ''}-${context?.setId || ''}-${targetTime}`;

        // ★ CANCEL any previous notification before scheduling new one
        if (notifyIdRef.current && notifyIdRef.current !== id) {
            cancelRestNotification(notifyIdRef.current);
        }
        notifyIdRef.current = id;

        try {
            const seconds = Math.max(1, Math.ceil((targetTime - Date.now()) / 1000));
            const exerciseName = String(context?.exerciseName || '').trim();
            const liveTitle = exerciseName ? exerciseName : 'Descanso';
            const notifyTitle = exerciseName ? `⏰ Próximo: ${exerciseName}` : '⏰ Tempo Esgotado!';
            const notifyBody = exerciseName ? 'Hora de iniciar a próxima série!' : 'Hora de voltar para o treino!';
            const shouldNotify = (allowNotifyRef.current || (isNativePlatform() && soundsEnabledRef.current)) && seconds > 0;
            if (shouldNotify) {
                // ★ Cancel ALL pending before scheduling to prevent duplicates
                cancelRestNotification(id).then(() => {
                    requestNativeNotifications().then((res) => {
                        if (!res?.granted) return;
                        // Only 1 push notification — repeat alerting is handled in-app
                        // (sound/vibration loop). Scheduling multiple notifications causes
                        // repeated banners when the app is backgrounded and JS can't cancel them.
                        scheduleRestNotification(id, seconds, notifyTitle, notifyBody, 0, 0);
                    }).catch(() => { });
                }).catch(() => { });
            }
            startRestLiveActivity(id, seconds, liveTitle);
        } catch { }

        // Capture total duration on first tick
        const totalSecs = Math.max(1, Math.ceil((targetTime - Date.now()) / 1000));
        totalSecondsRef.current = totalSecs;

        const updateTimer = () => {
            const now = Date.now();
            const remaining = Math.ceil((targetTime - now) / 1000);
            if (remaining <= 0) {
                setTimeLeft(remaining);
                setIsFinished(true);
                if (!hasNotifiedRef.current) {
                    hasNotifiedRef.current = true;
                    if (allowNotifyRef.current && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
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
        };
    // ★ ONLY depend on targetTime + context identity — not on settings
    // Settings are read via refs inside the effect body
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [targetTime, context?.exerciseId, context?.kind, context?.setId]);

    useEffect(() => {
        if (!isFinished) return;
        if (!notifyIdRef.current) return;

        const id = notifyIdRef.current;
        cancelRestNotification(id);
        // Mark as finished — the widget handles count-up natively via timerInterval
        updateRestLiveActivity(id, true, 0, totalSecondsRef.current);
    }, [isFinished]);

    // Wake Lock: keep screen on while timer is running, re-acquire on page visible
    useEffect(() => {
        if (!targetTime) return;
        type WLSentinel = { release: () => Promise<void> };
        type WLNavigator = Navigator & { wakeLock: { request: (type: 'screen') => Promise<WLSentinel> } };

        const acquire = async () => {
            try {
                if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
                    const lock = await (navigator as WLNavigator).wakeLock.request('screen');
                    wakeLockRef.current = lock;
                }
            } catch { }
        };

        const onVisible = () => {
            if (document.visibilityState === 'visible') acquire();
        };

        acquire();
        document.addEventListener('visibilitychange', onVisible);

        return () => {
            document.removeEventListener('visibilitychange', onVisible);
            try {
                wakeLockRef.current?.release().catch(() => { });
                wakeLockRef.current = null;
            } catch { }
        };
    }, [targetTime]);

    // ── Auto-Start: automatically trigger START when timer finishes ──────────
    // Use refs for callbacks/context to avoid dependency churn cancelling the timeout
    const onStartRef = useRef(onStart);
    const onFinishRef = useRef(onFinish);
    const contextRef = useRef(context);
    onStartRef.current = onStart;
    onFinishRef.current = onFinish;
    contextRef.current = context;

    useEffect(() => {
        if (!isFinished) {
            autoStartFiredRef.current = false;
            return;
        }
        if (!autoStartLocal) return;
        if (autoStartFiredRef.current) return;
        autoStartFiredRef.current = true;
        // Small delay so the "BORA!" flash is visible before advancing
        const timeout = setTimeout(() => {
            try {
                if (notifyIdRef.current) {
                    endRestLiveActivity(notifyIdRef.current);
                }
                stopAlarm(true);
                if (typeof onStartRef.current === 'function') onStartRef.current(contextRef.current);
                else if (typeof onFinishRef.current === 'function') onFinishRef.current(contextRef.current);
            } catch {
                try {
                    if (typeof onFinishRef.current === 'function') onFinishRef.current(contextRef.current);
                } catch { }
            }
        }, 500);
        return () => clearTimeout(timeout);
    }, [isFinished, autoStartLocal]);

    if (!targetTime) return null;

    const handleStart = () => {
        try {
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

    // ── SVG Ring ────────────────────────────────────────────────────────────
    const r = 33;             // ring radius inside 96×96 viewBox (center 48,48)
    const circ = 2 * Math.PI * r; // full circumference ≈ 207.3

    // ── YELLOW — countdown phase ─────────────────────────────────────────────
    // progress = remaining / total  →  1.0 at start, 0.0 when done
    const total = totalSecondsRef.current || 1;
    const countdownProgress = !isFinished
        ? Math.max(0, Math.min(1, baseSeconds / total))
        : 0;
    // strokeDashoffset: 0 = full arc drawn, circ = nothing drawn
    const yellowOffset = circ * (1 - countdownProgress);

    // ── RED — overtime phase, resets every 60 s ──────────────────────────────
    // Within each 60 s bucket: starts full (0 offset) → drains to empty (circ offset)
    const extraProgress = isFinished
        ? Math.max(0, Math.min(1, (extraSeconds % 60) / 60))
        : 0;
    const redOffset = circ * extraProgress;

    const isOvertime = isFinished || extraSeconds > 0;
    const ringColor = isOvertime ? '#ef4444' : '#eab308';  // red : yellow
    const ringGlow = isOvertime ? 'rgba(239,68,68,0.5)' : 'rgba(234,179,8,0.4)';
    const ringOffset = isOvertime ? redOffset : yellowOffset;

    return (
        <>
            {/* Finished flash */}
            {isFinished && (
                <div className="fixed inset-0 z-[2000] bg-green-600/90 backdrop-blur-sm flex flex-col items-center justify-center">
                    <div className="text-7xl mb-4">💪</div>
                    <h1 className="text-5xl font-black text-white uppercase tracking-tighter">BORA!</h1>
                    <p className="text-white/80 font-bold mt-2 text-lg">Descanso finalizado</p>
                </div>
            )}

            <div className="fixed bottom-0 left-0 right-0 bg-neutral-950/97 backdrop-blur-xl border-t border-neutral-800/80 py-2 px-4 shadow-2xl z-[2100] animate-slide-up pb-safe">
                <div className="flex items-center gap-3 max-w-md mx-auto">
                    {/* Circular SVG ring — compact size matching bar height */}
                    <div className="relative flex-shrink-0" style={{ width: 68, height: 68 }}>
                        <svg width="68" height="68" viewBox="0 0 96 96" style={{ transform: 'rotate(-90deg)' }}>
                            {/* Track */}
                            <circle
                                cx="48" cy="48" r={r}
                                fill="none"
                                stroke="rgba(255,255,255,0.08)"
                                strokeWidth="7"
                            />
                            {/* Progress arc */}
                            <circle
                                cx="48" cy="48" r={r}
                                fill="none"
                                stroke={ringColor}
                                strokeWidth="7"
                                strokeLinecap="round"
                                strokeDasharray={circ}
                                strokeDashoffset={ringOffset}
                                style={{
                                    transition: isOvertime
                                        ? 'stroke-dashoffset 1s linear, stroke 0.4s ease'
                                        : 'stroke-dashoffset 1s linear, stroke 0.4s ease',
                                    filter: `drop-shadow(0 0 7px ${ringGlow})`,
                                }}
                            />
                        </svg>
                        {/* Central timer text */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span
                                className="font-mono font-black leading-none tabular-nums"
                                style={{ fontSize: isOvertime ? 10 : 13, color: ringColor }}
                            >
                                {isOvertime
                                    ? `+${formatDuration(extraSeconds)}`
                                    : formatDuration(baseSeconds)}
                            </span>
                            <span
                                className="text-[7px] font-black uppercase tracking-widest mt-0.5"
                                style={{ color: isOvertime ? '#ef4444' : '#737373' }}
                            >
                                {isOvertime ? 'extra' : 'rest'}
                            </span>
                        </div>
                    </div>

                    {/* Right side: label + buttons */}
                    <div className="flex-1 min-w-0">
                        <p className="text-[9px] text-yellow-500 uppercase font-black tracking-widest mb-1">Recuperação</p>
                        {extraSeconds > 0 && (
                            <p className="text-xs font-black text-green-400 mb-1">{`+${formatDuration(extraSeconds)} além do planejado`}</p>
                        )}
                        <div className="flex gap-2 mt-0.5">
                            <button
                                onClick={handleStart}
                                className="flex-1 py-2 bg-gradient-to-r from-yellow-500 to-amber-400 rounded-xl text-black font-black text-sm shadow-lg shadow-yellow-900/30 hover:shadow-yellow-500/40 transition-shadow active:scale-95"
                            >
                                START ▶
                            </button>
                            <button
                                onClick={() => {
                                    try {
                                        setAutoStartLocal(prev => !prev);
                                        if (typeof onToggleAutoStart === 'function') onToggleAutoStart();
                                    } catch { }
                                }}
                                className={`px-3 py-2 rounded-xl text-xs font-black active:scale-95 transition-all border ${
                                    autoStartLocal
                                        ? 'bg-gradient-to-r from-yellow-500/20 to-amber-500/20 border-yellow-500/50 text-yellow-400 shadow-sm shadow-yellow-500/10'
                                        : 'text-neutral-400 hover:text-white hover:border-yellow-500/30'
                                }`}
                                style={!autoStartLocal ? { background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' } : undefined}
                                aria-label={autoStartLocal ? 'Desativar auto-start' : 'Ativar auto-start'}
                            >
                                {autoStartLocal ? 'AUTO ▶' : 'AUTO'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default RestTimerOverlay;


"use client";

import React, { useState, useEffect, useRef } from 'react';
import { playTimerFinishSound, playTick } from '@/lib/sounds';
import { isNativePlatform } from '@/utils/platform';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';
import { addWidgetStartSetListener, cancelRestNotification, checkPendingWidgetAction, endRestLiveActivity, requestNativeNotifications, scheduleRestNotification, startRestLiveActivity, stopAlarmSound, triggerHaptic, updateRestLiveActivity } from '@/utils/native/irontracksNative';
import { scheduleRestEndPush as scheduleRestEndPushApi, cancelRestEndPush as cancelRestEndPushApi } from '@/lib/workout/restEndPush';

interface RestTimerContext {
    kind?: string;
    exerciseId?: string;
    exerciseName?: string;
    setId?: string;
    /** Pre-formatted label shown on the BORA screen. Examples:
     *  - "3ª série de Supino Reto" (next set of same exercise)
     *  - "1ª série de Agachamento" (first set of next exercise)
     *  - undefined when there is no next set (last set of last exercise)
     */
    nextSetLabel?: string;
    onComplete?: (finalDurationSeconds?: number) => void;
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
    /** Unix epoch ms when the workout session started — forwarded to the
     *  Live Activity so the lock screen can show total workout elapsed time. */
    workoutStartMs?: number;
}

const RestTimerOverlay: React.FC<RestTimerOverlayProps> = ({ targetTime, context, onFinish, onStart, onClose: _onClose, settings, autoStartEnabled: _autoStartEnabled, onToggleAutoStart: _onToggleAutoStart, workoutStartMs }) => {
    const isPlankMode = context?.kind === 'plank'
    const isCardioMode = context?.kind === 'cardio'
    // Timer de exercício (prancha/cardio) conta o tempo DO exercício, não o descanso.
    const isExerciseTimer = isPlankMode || isCardioMode
    const finishedLabel = isExerciseTimer ? 'Tempo concluído!' : 'Descanso finalizado'

    const [timeLeft, setTimeLeft] = useState(0);
    const [isFinished, setIsFinished] = useState(false);
    // Local dismiss: hides the overlay IMMEDIATELY on START tap instead of
    // waiting for the async React state update (setActiveSession → timerTargetTime=null).
    // Without this, the overlay stays visible for 1-2 frames after tap, during which
    // re-renders can interfere with the button's click handling on iOS WKWebView.
    const [dismissed, setDismissed] = useState(false);
    // Teclado: a barra fixa `bottom-0` ficava ATRÁS do teclado de forma
    // inconsistente no iOS (ex.: editando reps num modal de método com o
    // descanso rolando). Medimos quanto o teclado ocupa via VisualViewport e
    // levantamos a barra exatamente essa altura — funciona tanto se o WebView
    // redimensiona quanto se não (inset 0 vs >0, auto-corrige). Padroniza:
    // a barra fica SEMPRE acima do teclado.
    // Fonte única: useKeyboardInset (mesma medição, agora compartilhada com o
    // WorkoutFooter, que sofria do mesmo problema).
    const kbInset = useKeyboardInset();
    // Flash dismiss: tapping the green "BORA!" flash hides ONLY the flash,
    // keeping the bottom bar (timer + START + AUTO) visible. Lets the user
    // peek at the upcoming sets in the workout list below WITHOUT pressing
    // START — START would begin the exercise execution timer.
    //
    // Tracked as "which targetTime was the flash dismissed for" instead of a
    // plain boolean: when the next rest starts, targetTime changes and the
    // flash automatically shows again — no setState-in-effect needed.
    const [flashDismissedForTarget, setFlashDismissedForTarget] = useState<number | null>(null);
    const flashDismissed = targetTime != null && flashDismissedForTarget === targetTime;
    // AUTO: persisted in localStorage so the user's preference survives across
    // sets, sessions and app restarts. When ON, the overlay auto-advances 500 ms
    // after the countdown reaches zero.
    const [autoLocal, setAutoLocal] = useState<boolean>(() => {
        if (typeof window === 'undefined') return false;
        try {
            return window.localStorage.getItem('irontracks.restTimerAuto.v1') === '1';
        } catch {
            return false;
        }
    });
    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            window.localStorage.setItem('irontracks.restTimerAuto.v1', autoLocal ? '1' : '0');
        } catch {
            /* storage unavailable — preference simply won't persist */
        }
    }, [autoLocal]);
    const warnedRef = useRef(false);
    const notifyIdRef = useRef('');
    const soundIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const vibrateIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const alarmActiveRef = useRef(false);
    const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
    const hasNotifiedRef = useRef(false);
    // Backend rest-end push (QStash): só agendamos quando o app vai pro
    // background COM um descanso ativo; cancelamos ao voltar/terminar/pular.
    const restInfoRef = useRef<{ id: string; endMs: number; title: string; body: string } | null>(null);
    const restPushScheduleIdRef = useRef<string | null>(null);
    const isFinishedRef = useRef(false);
    // Capture total rest seconds on mount so the ring can compute % remaining
    const totalSecondsRef = useRef<number>(0);
    const safeSettings = settings && typeof settings === 'object' ? settings : null;

    // Espelha isFinished num ref e, ao finalizar com o app aberto, cancela o
    // push de fim de descanso agendado (o cliente já finaliza a LA aqui).
    useEffect(() => {
        isFinishedRef.current = isFinished;
        if (isFinished && restPushScheduleIdRef.current) {
            const sid = restPushScheduleIdRef.current;
            restPushScheduleIdRef.current = null;
            void cancelRestEndPushApi(sid);
        }
    }, [isFinished]);

    // Backend rest-end push: quando o app vai pro background COM um descanso
    // ativo (não finalizado), agenda no QStash o push que acorda + finaliza a
    // LA no fim. Ao voltar ao foreground, cancela (o cliente reassume). Só em
    // app nativo (web não tem Live Activity / push desse tipo).
    useEffect(() => {
        if (!isNativePlatform() || typeof document === 'undefined') return;
        const onVis = () => {
            if (document.hidden) {
                const info = restInfoRef.current;
                if (info && !isFinishedRef.current && !restPushScheduleIdRef.current && info.endMs > Date.now() + 2500) {
                    void scheduleRestEndPushApi(info.id, info.endMs, info.title, info.body).then((sid) => {
                        if (!sid) return;
                        // Se nesse meio tempo o app voltou ao foreground, cancela.
                        if (!document.hidden) { void cancelRestEndPushApi(sid); return; }
                        restPushScheduleIdRef.current = sid;
                    });
                }
            } else {
                const sid = restPushScheduleIdRef.current;
                if (sid) { restPushScheduleIdRef.current = null; void cancelRestEndPushApi(sid); }
            }
        };
        document.addEventListener('visibilitychange', onVis);
        return () => {
            document.removeEventListener('visibilitychange', onVis);
            const sid = restPushScheduleIdRef.current;
            if (sid) { restPushScheduleIdRef.current = null; void cancelRestEndPushApi(sid); }
        };
    }, []);
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
        // Best-effort: hoje o app NÃO toca um alarme NATIVO em background — o loop de
        // beep/vibração é in-JS e, com o app em background, o iOS mostra só 1
        // notificação local. stopAlarmSound() é um no-op nativo reservado pra quando/
        // se um alarme de background for implementado (precisa de teste em device).
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
            // Limite do alarme: se "alarme contínuo" está DESLIGADO, o alarme para
            // sozinho ao atingir o MENOR entre repeatMaxSeconds e (repeatMaxCount ×
            // intervalo). Antes esses limites eram gravados mas NUNCA lidos → o beep/
            // vibração tocavam pra SEMPRE (só paravam no toque do usuário ou com o app
            // em background), ignorando a preferência e drenando bateria.
            const maxAlarmMs = continuousAlarmRef.current
                ? Number.POSITIVE_INFINITY
                : Math.min(
                    repeatMaxSecondsRef.current * 1000,
                    repeatMaxCountRef.current * repeatIntervalMs
                );
            const alarmStartMs = Date.now();
            const reachedLimit = () => Date.now() - alarmStartMs >= maxAlarmMs;

            // Foreground: beep in-JS (Web Audio). É IMPERFEITO no iOS (o AudioContext
            // pode interromper e o beep falhar/parar), MAS é transitório e NÃO segura a
            // sessão de áudio nativa — então NÃO quebra a notificação do BLOQUEADO, que é
            // o alarme confiável (rest_alarm.wav ~8s). O player nativo (AVAudioPlayer)
            // dava um foreground melhor, mas interferia na notificação do bloqueado, então
            // foi desativado (locked > foreground perfeito).
            if (soundsEnabled) {
                playTimerFinishSound({ volume: soundVolume, enabled: soundsEnabled });
                if (repeatAlarm) {
                    if (soundIntervalRef.current) clearInterval(soundIntervalRef.current);
                    soundIntervalRef.current = setInterval(() => {
                        if (!alarmActiveRef.current) return;
                        if (reachedLimit()) { stopAlarm(false); return; }
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
                        if (reachedLimit()) { stopAlarm(false); return; }
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
        // B-007: substituído `require('@capacitor/app')` síncrono por `import()`
        // dinâmico. O require em arquivo "use client" (ESM) quebra silenciosamente
        // no Next.js 16 + Turbopack — o try/catch engolia o erro e o listener
        // appStateChange NUNCA registrava, deixando o alarm tocar indefinidamente
        // quando user voltava do background. Dynamic import funciona em ambos os
        // ambientes (CommonJS legacy e ESM moderno).
        let handle: { remove: () => void } | null = null;
        let cancelled = false;
        import('@capacitor/app').then(({ App }) => {
            if (cancelled || !App?.addListener) return;
            App.addListener('appStateChange', (state: { isActive?: boolean }) => {
                if (state?.isActive) stopAlarm(true);
            }).then((h) => {
                if (cancelled) { try { h.remove(); } catch { } return; }
                handle = h;
            }).catch(() => { });
        }).catch(() => { });
        return () => {
            cancelled = true;
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
            restInfoRef.current = null;
            if (restPushScheduleIdRef.current) {
                const sid = restPushScheduleIdRef.current;
                restPushScheduleIdRef.current = null;
                void cancelRestEndPushApi(sid);
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
                        // 1 notificação só (repetir vira spam de banner). O alarme sonoro
                        // confiável (foreground E bloqueado, sem banner) precisa de áudio
                        // NATIVO (AVAudioPlayer + sessão .playback + background audio) — Web
                        // Audio não resolve no iOS. Fica pro fix nativo dedicado.
                        scheduleRestNotification(id, seconds, notifyTitle, notifyBody, 0, 0);
                    }).catch(() => { });
                }).catch(() => { });
            }
            startRestLiveActivity(id, seconds, liveTitle, workoutStartMs);
            // Guarda os dados deste descanso p/ um eventual agendamento no
            // background. Cancela qualquer agendamento de um descanso anterior.
            if (restPushScheduleIdRef.current) {
                const prev = restPushScheduleIdRef.current;
                restPushScheduleIdRef.current = null;
                void cancelRestEndPushApi(prev);
            }
            restInfoRef.current = { id, endMs: targetTime, title: notifyTitle, body: notifyBody };
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
                            icon: '/icone-192.png',
                            tag: 'timer_finished'
                        });
                    }
                    if (typeof onCompleteRef.current === 'function') {
                        onCompleteRef.current();
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
        // ⚠️ SÓ cancela a notificação local se o app estiver em FOREGROUND.
        // Quando um treino mantém o processo vivo em background (UIBackgroundModes
        // inclui `location` — sessão de GPS do treino), este efeito dispara com a
        // TELA BLOQUEADA no instante em que o timer zera. Cancelar aqui mata a
        // ÚNICA notificação que acorda a tela / toca o alarme no bloqueado (o
        // playAlarmSound nativo é só pra foreground). Bloqueado → deixa disparar;
        // ao voltar pro foreground o onVisible→stopAlarm(true) limpa o resíduo.
        if (typeof document === 'undefined' || document.visibilityState === 'visible') {
            cancelRestNotification(id);
        }
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

    // onCompleteRef is used by the timer tick callback to notify external
    // observers (analytics, Apple Watch sync, etc.) when the rest finishes.
    const onCompleteRef = useRef(context?.onComplete);
    onCompleteRef.current = context?.onComplete;

    // Guard against double-tap on START button AND against the auto-advance
    // racing with a manual tap. Both the user's finger and the 500ms auto-fire
    // path read/write this ref before calling onStart — whoever gets there
    // first wins, the other short-circuits.
    const startBusyRef = useRef(false);

    // Reset local state when targetTime changes (new timer for a new set)
    useEffect(() => {
        startBusyRef.current = false;
        setDismissed(false);
    }, [targetTime]);

    // ── Auto-advance after rest completes ──────────────────────────────────
    // Previously the app fired the START button 500ms after the overlay mounted
    // ("START disparou sozinho" bug). Commit 1ce2ed48 ripped that out because
    // the AUTO toggle was sitting next to START and users were tapping it by
    // accident. The feature is back — but safer:
    //
    //   1. ONLY triggers when the countdown actually reaches 0 (isFinished).
    //      No more "500ms after overlay mounts" — at that moment the countdown
    //      is still running, so an auto-fire would be a skip-rest.
    //   2. Gated by `autoStartEnabled` (the `restTimerAutoStart` user setting).
    //      Default OFF — nobody gets it unless they opt-in via Settings.
    //   3. Locked per-rest with `autoStartFiredRef`. Even if autoStartEnabled
    //      flips true AFTER the countdown already finished (e.g. user opens
    //      Settings during rest), nothing fires — the decision for this rest
    //      was locked the moment isFinished went true.
    //   4. `startBusyRef` already prevents racing with a manual tap.
    const onStartRef = useRef(onStart);
    onStartRef.current = onStart;
    const onFinishRef = useRef(onFinish);
    onFinishRef.current = onFinish;
    const contextRef = useRef(context);
    contextRef.current = context;
    const autoStartFiredRef = useRef(false);
    // Ref so the widget-intent effect can call handleStart() even though the
    // function is defined below the early-return guard.
    const handleStartRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        if (!isFinished) {
            autoStartFiredRef.current = false;
            return;
        }
        if (autoStartFiredRef.current) return;
        // Lock the decision for this rest at the moment it finishes. Any later
        // toggle of the Settings switch is ignored — only the NEXT rest uses it.
        autoStartFiredRef.current = true;
        if (!autoLocal) return;

        const timeout = setTimeout(() => {
            // Bail if the user already tapped START manually during the delay
            if (startBusyRef.current) return;
            startBusyRef.current = true;
            setDismissed(true);
            try {
                if (notifyIdRef.current) endRestLiveActivity(notifyIdRef.current);
                stopAlarm(true);
                const fn = onStartRef.current ?? onFinishRef.current;
                if (typeof fn === 'function') fn(contextRef.current);
            } catch {
                try {
                    if (typeof onFinishRef.current === 'function') onFinishRef.current(contextRef.current);
                } catch { /* swallow — nothing useful to do */ }
            }
        }, 500);
        return () => clearTimeout(timeout);
    }, [isFinished, autoLocal]);

    // ── Widget lock-screen button bridge ───────────────────────────────────
    // When the user taps "PULAR DESCANSO" or "INICIAR SÉRIE" on the iOS lock
    // screen, StartSetIntent.perform() fires inside the App process:
    //   1. Writes "startSet" to UserDefaults (cold-start fallback).
    //   2. Posts IronTracksStartSetFromWidget via NotificationCenter.
    // IronTracksNativePlugin relays the notification as a Capacitor event
    // ("widgetStartSet"). This effect handles both cases.
    useEffect(() => {
        // Cold-start path: read UserDefaults flag written before JS was ready
        checkPendingWidgetAction().then((action) => {
            if (action === 'startSet') handleStartRef.current?.()
        }).catch(() => {})
        // Live path: Capacitor event relayed from NotificationCenter
        const unsub = addWidgetStartSetListener(() => {
            handleStartRef.current?.()
        })
        return unsub
    }, [])

    // ── Early return: hide immediately on dismiss OR when no timer ──
    if (!targetTime || dismissed) return null;

    const handleStart = () => {
        if (startBusyRef.current) return;
        startBusyRef.current = true;
        // Immediately hide the overlay — don't wait for async React state
        setDismissed(true);
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
    // Keep ref in sync so the widget-intent effect (above the early-return
    // guard) can call handleStart even though it was created before this point.
    handleStartRef.current = handleStart;

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
    const kind = String(context?.kind ?? '');
    const isSideRest = kind === 'side_rest';
    const isTransition = kind === 'transition';
    // Ring color: blue for side-rest, orange for transition, yellow/red for normal rest
    const baseRingColor = isSideRest ? '#f59e0b' : isTransition ? '#f97316' : '#eab308';
    const ringColor = isOvertime ? '#ef4444' : baseRingColor;
    const ringGlow = isOvertime ? 'rgba(239,68,68,0.5)' : isSideRest ? 'rgba(245,158,11,0.4)' : isTransition ? 'rgba(249,115,22,0.4)' : 'rgba(234,179,8,0.4)';
    const ringOffset = isOvertime ? redOffset : yellowOffset;

    return (
        <>
            {/* Finished flash — tap anywhere to hide it (keeps the bottom bar
                so the user can scan the upcoming sets before pressing START).
                stopPropagation still guards against the tap leaking to the
                workout modal below. */}
            {isFinished && !isTransition && !flashDismissed && (
                <div
                    role="presentation"
                    className={`fixed inset-0 z-[2000] backdrop-blur-sm flex flex-col items-center justify-center px-6 overflow-x-hidden cursor-pointer ${isSideRest ? 'bg-amber-500/90' : 'bg-green-600/90'}`}
                    onClick={(e) => { e.stopPropagation(); setFlashDismissedForTarget(targetTime ?? null); }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                >
                    <div className="text-7xl mb-4">{isSideRest ? '🔄' : '💪'}</div>
                    <h1 className="text-5xl font-black text-white uppercase tracking-tighter">{isSideRest ? 'TROCA!' : 'BORA!'}</h1>
                    {isSideRest ? (
                        <p className="text-white/80 font-bold mt-2 text-lg">Agora o outro lado</p>
                    ) : context?.nextSetLabel ? (
                        <>
                            <p className="text-white/70 font-bold mt-2 text-sm uppercase tracking-widest">Próxima</p>
                            <p className="text-white font-black mt-1 text-2xl text-center leading-tight max-w-full break-words px-2">{context.nextSetLabel}</p>
                        </>
                    ) : (
                        <p className="text-white/80 font-bold mt-2 text-lg">{finishedLabel}</p>
                    )}
                    {/* Tap hint — sits near the bottom, above the fixed bar */}
                    <p className="absolute bottom-28 left-0 right-0 text-center text-white/55 font-bold text-xs uppercase tracking-widest">
                        Toque para ver o treino
                    </p>
                </div>
            )}

            {/* perf: fundo sólido em vez de backdrop-blur-xl — o blur roda o descanso
                inteiro (efeito iOS mais caro da tela) e engasga o scroll da lista por baixo. */}
            <div style={{ bottom: kbInset || undefined }} className="fixed bottom-0 left-0 right-0 bg-neutral-950 border-t border-neutral-800/80 py-2 px-4 shadow-2xl z-[2100] animate-slide-up pb-safe overflow-x-hidden transition-[bottom] duration-150">
                <div className="flex items-center gap-3 max-w-md mx-auto min-w-0">
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
                                className="text-[6px] font-black uppercase mt-0.5 leading-none"
                                style={{
                                    color: isOvertime ? '#ef4444' : isSideRest ? '#f59e0b' : isTransition ? '#f97316' : '#737373',
                                    letterSpacing: '0.02em',
                                }}
                            >
                                {isOvertime ? 'extra' : isSideRest ? 'lado' : isTransition ? 'troca' : isCardioMode ? 'cardio' : (isPlankMode ? 'prancha' : 'desc')}
                            </span>
                        </div>
                    </div>

                    {/* Right side: buttons */}
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                        {extraSeconds > 0 && (
                            <p className="text-xs font-black text-green-400 mb-1.5">{`+${formatDuration(extraSeconds)} além do planejado`}</p>
                        )}
                        {isTransition && (
                            <p className="text-xs font-black text-orange-400 mb-1.5 truncate">
                                Vá para: {context?.exerciseName ?? 'próximo exercício'}
                            </p>
                        )}
                        <div className="flex gap-2">
                            <button
                                onClick={handleStart}
                                className={`flex-1 py-2 rounded-xl text-black font-black text-sm shadow-lg active:scale-95 transition-shadow ${
                                    isSideRest
                                        ? 'bg-gradient-to-r from-amber-500 to-amber-400 shadow-amber-900/30 hover:shadow-amber-500/40'
                                        : isTransition
                                            ? 'bg-gradient-to-r from-orange-500 to-amber-400 shadow-orange-900/30 hover:shadow-orange-500/40'
                                            : 'bg-gradient-to-r from-yellow-500 to-amber-400 shadow-yellow-900/30 hover:shadow-yellow-500/40'
                                }`}
                            >
                                {isSideRest ? 'TROCAR LADO ▶' : isTransition ? 'CHEGUEI ✓' : 'START ▶'}
                            </button>
                            {!isSideRest && !isTransition && (
                                <button
                                    onClick={() => setAutoLocal(v => !v)}
                                    className={`px-3 py-2 rounded-xl text-xs font-black transition-all active:scale-95 border ${
                                        autoLocal
                                            ? 'bg-amber-500 text-black border-amber-400 shadow-lg shadow-amber-900/40'
                                            : 'bg-neutral-800/80 text-neutral-400 border-neutral-700'
                                    }`}
                                >
                                    AUTO
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default RestTimerOverlay;

'use client';

import React, { useState, useEffect, useCallback, Suspense, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import type { RealtimeChannel } from '@supabase/supabase-js'
import {
    RotateCcw,
    History,
    MoreVertical,
    Share2,
    Trash2,
    Download,
    Plus,
    Flame,
    Play,
    Dumbbell,
    Check,
    LogOut,
    Clock,
    Upload,
    ArrowLeft,
    X,
    Crown
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { createWorkout, updateWorkout, deleteWorkout, importData, setWorkoutArchived, setWorkoutSortOrder } from '@/actions/workout-actions';

import LoginScreen from '@/components/LoginScreen';
import LoadingScreen from '@/components/LoadingScreen';
const ActiveWorkout = dynamic(() => import('@/components/ActiveWorkout'), { ssr: false });
const RestTimerOverlay = dynamic(() => import('@/components/workout/RestTimerOverlay'), { ssr: false });
const IncomingInviteModal = dynamic(() => import('@/components/IncomingInviteModal'), { ssr: false, loading: () => null });
const InviteAcceptedModal = dynamic(() => import('@/components/InviteAcceptedModal'), { ssr: false, loading: () => null });
const NotificationCenter = dynamic(() => import('@/components/NotificationCenter'), { ssr: false });
import HeaderActionsMenu from '@/components/HeaderActionsMenu';

// Heavy components — loaded only when needed
const AdminPanelV2 = dynamic(() => import('@/components/AdminPanelV2'), { ssr: false });
const ChatScreen = dynamic(() => import('@/components/ChatScreen'), { ssr: false });
const ChatListScreen = dynamic(() => import('@/components/ChatListScreen'), { ssr: false });
const ChatDirectScreen = dynamic(() => import('@/components/ChatDirectScreen'), { ssr: false });
const HistoryList = dynamic(() => import('@/components/HistoryList'), { ssr: false });
const CommunityClient = dynamic(() => import('@/app/(app)/community/CommunityClient'), { ssr: false });
const StudentEvolution = dynamic(() => import('@/components/StudentEvolution'), { ssr: false });
const WorkoutReport = dynamic(() => import('@/components/WorkoutReport'), { ssr: false });
const ExerciseEditor = dynamic(() => import('@/components/ExerciseEditor'), { ssr: false });
import { TeamWorkoutProvider } from '@/contexts/TeamWorkoutContext';
import { InAppNotificationsProvider, useInAppNotifications } from '@/contexts/InAppNotificationsContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import ErrorReporterProvider from '@/components/ErrorReporterProvider';
import { DialogProvider, useDialog } from '@/contexts/DialogContext';
import GlobalDialog from '@/components/GlobalDialog';
import { playStartSound, unlockAudio } from '@/lib/sounds';
import { workoutPlanHtml } from '@/utils/report/templates';
import { estimateExerciseSeconds, toMinutesRounded, calculateExerciseDuration } from '@/utils/pacing';
import { formatProgramWorkoutTitle } from '@/utils/workoutTitle'
import { resolveCanonicalExerciseName } from '@/utils/exerciseCanonical'
import { BackButton } from '@/components/ui/BackButton';
const StudentDashboard = dynamic(() => import('@/components/dashboard/StudentDashboard'), { ssr: false });
const WorkoutWizardModal = dynamic(() => import('@/components/dashboard/WorkoutWizardModal'), { ssr: false });
const SettingsModal = dynamic(() => import('@/components/SettingsModal'), { ssr: false });
import { useUserSettings } from '@/hooks/useUserSettings'
const WhatsNewModal = dynamic(() => import('@/components/WhatsNewModal'), { ssr: false })
const WelcomeFloatingWindow = dynamic(() => import('@/components/WelcomeFloatingWindow'), { ssr: false })
import { generateWorkoutFromWizard } from '@/utils/workoutAutoGenerator'
import { getLatestWhatsNew } from '@/content/whatsNew'
const GuidedTour = dynamic(() => import('@/components/onboarding/GuidedTour'), { ssr: false })
import { getTourSteps } from '@/utils/tourSteps'
import { cacheGetWorkouts, cacheSetWorkouts } from '@/lib/offline/offlineSync'
const OfflineSyncModal = dynamic(() => import('@/components/OfflineSyncModal'), { ssr: false })
import { useOfflineSync } from '@/hooks/useOfflineSync'
import { useVipAccess } from '@/hooks/useVipAccess'
import { useWorkoutStreak } from '@/hooks/useWorkoutStreak'
import { useGuidedTour } from '@/hooks/useGuidedTour'
import { usePresencePing } from '@/hooks/usePresencePing'
import { useProfileCompletion } from '@/hooks/useProfileCompletion'
import { useWhatsNew } from '@/hooks/useWhatsNew'
import { useUnreadBadges } from '@/hooks/useUnreadBadges'
import { useNativeDeepLinks } from '@/hooks/useNativeDeepLinks'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { onNativeNotificationAction } from '@/utils/native/irontracksNative'
import { isIosNative } from '@/utils/platform'
import { useNativeAppSetup } from '@/hooks/useNativeAppSetup'
import { BiometricLock, useBiometricLock } from '@/components/BiometricLock'
import { useLocalPersistence } from '@/hooks/useLocalPersistence'
import { useAdminPanelState } from '@/hooks/useAdminPanelState'
import { useSignOut } from '@/hooks/useSignOut'
import { useActiveSession } from '@/hooks/useActiveSession'
import { useWorkoutExport } from '@/hooks/useWorkoutExport'
import { useWorkoutCrud } from '@/hooks/useWorkoutCrud'
import { useWorkoutNormalize } from '@/hooks/useWorkoutNormalize'
import { useWorkoutFetch } from '@/hooks/useWorkoutFetch'
import { useWorkoutEditor } from '@/hooks/useWorkoutEditor'
import { mapWorkoutRow } from '@/utils/mapWorkoutRow'
import { parseJsonWithSchema } from '@/utils/zod'
import { z } from 'zod'

import {
    DirectChatState,
    WorkoutStreak,
    ActiveSession,
    ActiveWorkoutSession,
    PendingUpdate,
    Workout,
    Exercise,
    UserRecord
} from '@/types/app';
import type { AdminUser } from '@/types/admin'
import { getErrorMessage } from '@/utils/errorMessage'
import { logError, logWarn, logInfo } from '@/lib/logger'
import SectionErrorBoundary from '@/components/SectionErrorBoundary'
const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const parseStartedAtMs = (raw: unknown): number => {
    const direct = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim())
    if (Number.isFinite(direct) && direct > 0) return direct
    try {
        const d = new Date(String(raw ?? ''))
        const t = d.getTime()
        return Number.isFinite(t) ? t : 0
    } catch {
        return 0
    }
}

const AssessmentHistory = dynamic(() => import('@/components/assessment/AssessmentHistory'), { ssr: false });
const VipHub = dynamic(() => import('@/components/VipHub'), { ssr: false });

const appId = 'irontracks-production';

function InAppNotifyBinder({ bind }: { bind?: ((notify: ((payload: unknown) => void) | null) => void) | null }): React.ReactElement | null {
    const { notify } = useInAppNotifications();
    const safeBind = typeof bind === 'function' ? bind : null;
    useEffect(() => {
        if (!safeBind) return;
        safeBind(notify as (payload: unknown) => void);
        return () => {
            try { safeBind(null); } catch { }
        };
    }, [notify, safeBind]);
    return null;
}

// mapWorkoutRow moved to @/utils/mapWorkoutRow

function IronTracksApp({ initialUser, initialProfile, initialWorkouts }: { initialUser?: unknown; initialProfile?: unknown; initialWorkouts?: unknown }) {
    const { confirm, alert } = useDialog();
    const initialUserObj = initialUser && typeof initialUser === 'object' ? (initialUser as Record<string, unknown>) : null
    const initialProfileObj = initialProfile && typeof initialProfile === 'object' ? (initialProfile as Record<string, unknown>) : null
    const initialUserTyped: UserRecord | null = initialUserObj ? ({ ...initialUserObj, id: String(initialUserObj.id || "") } as UserRecord) : null
    const [user, setUser] = useState<UserRecord | null>(initialUserTyped);
    const [authLoading, setAuthLoading] = useState(false);
    const [view, setView] = useState('dashboard');
    const [directChat, setDirectChat] = useState<DirectChatState | null>(null);
    // ── Native iOS setup (notifications + biometric lock) ─────────────────────
    useNativeAppSetup(user?.id)
    const userName = String(user?.displayName || user?.email || '')

    // workouts, stats, studentFolders, fetchWorkouts, isFetching — extraídos para useWorkoutFetch
    // Streak stats — extracted to useWorkoutStreak hook (userId resolved after auth)
    const { streakStats, setStreakStats } = useWorkoutStreak(user?.id);
    const [currentWorkout, setCurrentWorkout] = useState<ActiveSession | null>(null);
    const [createWizardOpen, setCreateWizardOpen] = useState(false)
    const [quickViewWorkout, setQuickViewWorkout] = useState<ActiveSession | null>(null);
    const [reportData, setReportData] = useState({ current: null, previous: null });
    const mainScrollRef = useRef<HTMLDivElement | null>(null);
    const [reportBackView, setReportBackView] = useState('dashboard');
    const inAppNotifyRef = useRef<((payload: unknown) => void) | null>(null);
    const bindInAppNotify = useCallback((fn: unknown) => {
        inAppNotifyRef.current = typeof fn === 'function' ? (fn as (payload: unknown) => void) : null;
    }, []);
    const inAppNotify = useCallback((payload: unknown) => {
        const fn = inAppNotifyRef.current;
        if (typeof fn === 'function') fn(payload);
    }, []);

    // Sessão ativa, editor inline e pre-checkin — extraídos para useActiveSession
    const {
        activeSession, setActiveSession,
        suppressForeignFinishToastUntilRef,
        sessionTicker, setSessionTicker,
        editActiveOpen, setEditActiveOpen,
        editActiveDraft, setEditActiveDraft,
        editActiveBaseRef, editActiveAddExerciseRef,
        preCheckinOpen, setPreCheckinOpen,
        preCheckinWorkout, setPreCheckinWorkout,
        preCheckinDraft, setPreCheckinDraft,
        preCheckinResolveRef,
        requestPreWorkoutCheckin,
        handleUpdateSessionLog,
        handleStartTimer,
        handleCloseTimer,
    } = useActiveSession({ userId: user?.id })

    useNativeDeepLinks()
    usePushNotifications(user?.id)

    useEffect(() => {
        const off = onNativeNotificationAction((actionId) => {
            if (!actionId) return
            if (actionId === 'SKIP_REST') {
                handleCloseTimer()
                return
            }
            if (actionId === 'ADD_30S') {
                setActiveSession((prev) => {
                    if (!prev) return prev
                    const base = prev as unknown as Record<string, unknown>
                    const ctx = isRecord(base.timerContext) ? (base.timerContext as Record<string, unknown>) : null
                    const kind = String(ctx?.kind || '').trim()
                    const t = Number(base.timerTargetTime)
                    if (kind !== 'rest' || !Number.isFinite(t) || t <= 0) return prev
                    return { ...base, timerTargetTime: t + 30_000 } as unknown as ActiveWorkoutSession
                })
            }
        })
        return () => {
            try {
                off()
            } catch { }
        }
    }, [handleCloseTimer, setActiveSession])

    const [settingsOpen, setSettingsOpen] = useState(false)
    const [isCoach, setIsCoach] = useState(false);
    const initialRole = String(initialProfileObj?.role || '').toLowerCase()
    // VIP access & status — extracted to useVipAccess hook
    const { vipAccess, setVipAccess, vipStatus, setVipStatus } = useVipAccess({
        userId: user?.id,
        initialRole,
    })

    useEffect(() => {
        try {
            const flag = sessionStorage.getItem('irontracks_open_vip')
            if (!flag) return
            sessionStorage.removeItem('irontracks_open_vip')
            openVipView()
        } catch { }
    }, [])

    const [coachPending, setCoachPending] = useState(false);
    const [openStudent, setOpenStudent] = useState<Record<string, unknown> | null>(null);
    const [showNotifCenter, setShowNotifCenter] = useState(false);

    // Profile completion state — extracted to useProfileCompletion hook
    const {
        profileIncomplete,
        setProfileIncomplete,
        profileDraftName,
        setProfileDraftName,
        savingProfile,
        setSavingProfile,
        showCompleteProfile,
        setShowCompleteProfile,
    } = useProfileCompletion({
        userId: user?.id,
        displayName: user?.displayName ? String(user.displayName) : null,
        initialProfile,
    });

    const userSettingsApi = useUserSettings(user?.id)
    const { isLocked, unlock } = useBiometricLock(
        !!user?.id && Boolean(userSettingsApi?.settings?.requireBiometricsOnStartup)
    )
    // Offline sync state — extracted to useOfflineSync hook
    const { syncState, setSyncState, refreshSyncState, runFlushQueue } = useOfflineSync({
        userId: user?.id,
        settings: userSettingsApi?.settings && typeof userSettingsApi.settings === 'object'
            ? (userSettingsApi.settings as Record<string, unknown>)
            : null,
    })
    const [offlineSyncOpen, setOfflineSyncOpen] = useState(false)

    const supabase = useRef(createClient()).current;
    const router = useRouter();

    // Treinos, estatísticas, pastas de alunos e fetchWorkouts — extraídos para useWorkoutFetch
    const {
        workouts,
        setWorkouts,
        stats,
        setStats,
        studentFolders,
        setStudentFolders,
        fetchWorkouts,
        isFetching,
    } = useWorkoutFetch({
        user,
        supabase,
        initialWorkouts: Array.isArray(initialWorkouts) ? (initialWorkouts as Array<Record<string, unknown>>) : undefined,
    })

    // refreshSyncState, runFlushQueue, syncState effects — handled by useOfflineSync hook above

    // Tour state + logic — extracted to useGuidedTour hook
    const {
        tourOpen,
        setTourOpen,
        tourBoot,
        setTourBoot,
        TOUR_VERSION,
        logTourEvent,
        upsertTourFlags,
        writeLocalTourDismissal,
    } = useGuidedTour({
        userId: user?.id,
        userRole: user?.role ? String(user.role) : null,
        userSettings: userSettingsApi?.settings && typeof userSettingsApi.settings === 'object'
            ? (userSettingsApi.settings as Record<string, unknown>)
            : null,
        supabase,
    })

    // Presence ping — extracted to usePresencePing hook
    usePresencePing(user?.id);

    // What's New modal — extracted to useWhatsNew hook
    const { whatsNewOpen, setWhatsNewOpen, pendingUpdate, setPendingUpdate, closeWhatsNew } = useWhatsNew({
        userId: user?.id,
        userSettingsApi,
    })

    // Unread badges — extracted to useUnreadBadges hook
    const { hasUnreadNotification, setHasUnreadNotification, hasUnreadChat, setHasUnreadChat } = useUnreadBadges({
        userId: user?.id,
        supabase,
        view,
        userSettings: userSettingsApi?.settings && typeof userSettingsApi.settings === 'object'
            ? (userSettingsApi.settings as Record<string, unknown>)
            : null,
        onInAppNotify: inAppNotify,
    })

    // View + activeSession local persistence — extracted to useLocalPersistence hook
    useLocalPersistence({ userId: user?.id, view, setView, activeSession })

    // Safety net: views that require companion state render nothing if that state is null.
    // If we detect this situation, reset to 'dashboard' to prevent a permanent black screen.
    useEffect(() => {
        if (view === 'directChat' && !directChat) { setView('dashboard'); return }
        if (view === 'report' && !reportData.current) { setView('dashboard'); return }
        if (view === 'active' && !activeSession) { setView('dashboard'); return }
    }, [view, directChat, activeSession, reportData])

    useEffect(() => {
        if (authLoading) return;
        if (user) return;
        const t = setTimeout(() => {
            try {
                router.replace('/?next=/dashboard');
            } catch { }
        }, 150);
        return () => {
            clearTimeout(t);
        };
    }, [authLoading, user, router]);

    // Preload common modal chunks 3s after mount so first-open feels instant
    useEffect(() => {
        const t = setTimeout(() => {
            void import('@/components/SettingsModal')
            void import('@/components/dashboard/WorkoutWizardModal')
            void import('@/components/HistoryList')
            void import('@/components/ActiveWorkout')
            void import('@/components/IncomingInviteModal')
            void import('@/components/InviteAcceptedModal')
        }, 3000)
        return () => clearTimeout(t)
    }, [])

    // whatsNew useEffect + closeWhatsNew — handled by useWhatsNew hook above

    // Admin panel open/close state — extracted to useAdminPanelState hook
    const {
        showAdminPanel,
        setShowAdminPanel,
        openAdminPanel,
        closeAdminPanel,
        restoreAdminPanelIfNeeded,
    } = useAdminPanelState({ userRole: user?.role ? String(user.role) : null })

    // Editor de treinos — extraído para useWorkoutEditor
    const {
        resolveExerciseVideos,
        persistExerciseVideoUrls,
        generateExerciseKey,
        normalizeWorkoutForEditor,
        stripWorkoutInternalKeys,
        reindexSessionLogsAfterWorkoutEdit,
    } = useWorkoutEditor({ supabase })

    const serverSessionSyncRef = useRef<{ timer: ReturnType<typeof setTimeout> | null; lastKey: string }>({ timer: null, lastKey: '' });
    const serverSessionSyncWarnedRef = useRef(false);

    // Sign-out + session clear — extracted to useSignOut hook
    const { safeSignOut, clearClientSessionState } = useSignOut({
        userId: user?.id,
        supabase,
        onClear: () => {
            setActiveSession(null)
            setView('dashboard')
        },
    })

    useEffect(() => {
        let cancelled = false;
        const userId = user?.id ? String(user.id) : '';
        if (!userId) return;

        const scopedKey = `irontracks.activeSession.v2.${userId}`;
        let localSavedAt = 0;

        try {
            const raw = localStorage.getItem(scopedKey) || localStorage.getItem('activeSession');
            if (raw) {
                const parsed: unknown = parseJsonWithSchema(raw, z.record(z.unknown()));
                if (isRecord(parsed) && parsed?.startedAt && parsed?.workout) {
                    localSavedAt = Number(parsed?._savedAt ?? 0) || 0;
                    setActiveSession(parsed as unknown as ActiveWorkoutSession);
                    setView('active');

                    if (!localStorage.getItem(scopedKey)) {
                        try {
                            localStorage.setItem(scopedKey, JSON.stringify(parsed));
                            localStorage.removeItem('activeSession');
                        } catch { }
                    }
                }
            }
        } catch {
            try {
                localStorage.removeItem(scopedKey);
                localStorage.removeItem('activeSession');
            } catch { }
        }

        const loadServer = async () => {
            try {
                const { data, error } = await supabase
                    .from('active_workout_sessions')
                    .select('state, updated_at')
                    .eq('user_id', userId)
                    .maybeSingle();
                if (cancelled) return;
                if (error) {
                    const msg = String((error && typeof error === 'object' && 'message' in error ? error.message : '') || '').toLowerCase();
                    const code = String((error && typeof error === 'object' && 'code' in error ? error.code : '') || '').toLowerCase();
                    const isMissing = code === '42p01' || msg.includes('does not exist') || msg.includes('relation') || msg.includes('schema cache');
                    if (isMissing && !serverSessionSyncWarnedRef.current) {
                        serverSessionSyncWarnedRef.current = true;
                        try {
                            inAppNotify({
                                text: 'Sincronização do treino entre navegadores indisponível (migrations pendentes).',
                                senderName: 'Aviso do Sistema',
                                displayName: 'Sistema',
                                photoURL: null,
                            });
                        } catch { }
                    }
                    return;
                }

                const state = data?.state;
                if (!state || typeof state !== 'object') return;
                if (!state?.startedAt || !state?.workout) return;

                const updatedAtMs = (() => {
                    const fromCol = typeof data?.updated_at === 'string' ? Date.parse(data.updated_at) : NaN;
                    const fromState = Number(state?._savedAt ?? 0) || 0;
                    return Math.max(Number.isFinite(fromCol) ? fromCol : 0, fromState);
                })();

                if (updatedAtMs <= localSavedAt) return;

                setActiveSession(state);
                setView('active');
                try {
                    localStorage.setItem(scopedKey, JSON.stringify(state));
                } catch { }
            } catch { }
        };

        loadServer();

        return () => {
            cancelled = true;
        };
    }, [supabase, user?.id, inAppNotify, setActiveSession, setView, suppressForeignFinishToastUntilRef]);

    useEffect(() => {
        const userId = user?.id ? String(user.id) : '';
        if (!userId) return;

        let mounted = true;
        let channel: RealtimeChannel | null = null;

        try {
            channel = supabase
                .channel(`active-workout-session:${userId}`)
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'active_workout_sessions',
                        filter: `user_id=eq.${userId}`,
                    },
                    (payload: Record<string, unknown>) => {
                        try {
                            if (!mounted) return;
                            const ev = String(payload?.eventType || '').toUpperCase();
                            if (ev === 'DELETE') {
                                if (Date.now() < (suppressForeignFinishToastUntilRef.current || 0)) {
                                    suppressForeignFinishToastUntilRef.current = 0;
                                    return;
                                }
                                setActiveSession(null);
                                setView((prev) => (prev === 'active' ? 'dashboard' : prev));
                                try {
                                    localStorage.removeItem(`irontracks.activeSession.v2.${userId}`);
                                } catch { }
                                try {
                                    inAppNotify({
                                        text: 'Treino finalizado em outro dispositivo.',
                                        senderName: 'Aviso do Sistema',
                                        displayName: 'Sistema',
                                        photoURL: null,
                                    });
                                } catch { }
                                return;
                            }

                            if (ev === 'UPDATE') {
                                const rowNew = isRecord(payload?.new) ? (payload.new as Record<string, unknown>) : null
                                const stateRaw = rowNew?.state
                                const state = isRecord(stateRaw) ? stateRaw : null
                                if (!state || !state?.startedAt || !state?.workout) {
                                    setActiveSession(null);
                                    setView((prev) => (prev === 'active' ? 'dashboard' : prev));
                                    try {
                                        localStorage.removeItem(`irontracks.activeSession.v2.${userId}`);
                                    } catch { }
                                }
                            }
                        } catch { }
                    }
                )
                .subscribe();
        } catch { }

        return () => {
            mounted = false;
            try {
                if (channel) supabase.removeChannel(channel);
            } catch {
                try {
                    if (channel) createClient().removeChannel(channel);
                } catch { }
            }
        };
    }, [supabase, user?.id, inAppNotify, setActiveSession, setView, suppressForeignFinishToastUntilRef]);

    useEffect(() => {
        const handler = () => { try { unlockAudio(); } catch { } };
        document.addEventListener('touchstart', handler, { once: true });
        document.addEventListener('click', handler, { once: true });
        return () => {
            document.removeEventListener('touchstart', handler);
            document.removeEventListener('click', handler);
        };
    }, []);

    // View + activeSession persistence — handled by useLocalPersistence hook above

    useEffect(() => {
        const userId = user?.id ? String(user.id) : '';
        if (!userId) return;

        try {
            if (serverSessionSyncRef.current?.timer) {
                try {
                    clearTimeout(serverSessionSyncRef.current.timer);
                } catch { }
            }
        } catch { }

        const key = (() => {
            try {
                return JSON.stringify(activeSession || null);
            } catch {
                return '';
            }
        })();

        serverSessionSyncRef.current.lastKey = key;

        const run = async () => {
            try {
                if (serverSessionSyncRef.current.lastKey !== key) return;

                if (!activeSession) {
                    const { error } = await supabase.from('active_workout_sessions').delete().eq('user_id', userId);
                    if (error) {
                        const msg = String((error && typeof error === 'object' && 'message' in error ? error.message : '') || '').toLowerCase();
                        const code = String((error && typeof error === 'object' && 'code' in error ? error.code : '') || '').toLowerCase();
                        const isMissing = code === '42p01' || msg.includes('does not exist') || msg.includes('relation') || msg.includes('schema cache');
                        if (isMissing && !serverSessionSyncWarnedRef.current) {
                            serverSessionSyncWarnedRef.current = true;
                            try {
                                inAppNotify({
                                    text: 'Sincronização do treino entre navegadores indisponível (migrations pendentes).',
                                    senderName: 'Aviso do Sistema',
                                    displayName: 'Sistema',
                                    photoURL: null,
                                });
                            } catch { }
                        }
                    }
                    return;
                }

                const startedAtRaw = activeSession?.startedAt;
                const startedAtMs = typeof startedAtRaw === 'number' ? startedAtRaw : new Date(startedAtRaw || 0).getTime();
                if (!Number.isFinite(startedAtMs) || startedAtMs <= 0) return;
                if (!activeSession?.workout) return;

                const state = { ...(activeSession || {}), _savedAt: Date.now() };

                const { error } = await supabase
                    .from('active_workout_sessions')
                    .upsert(
                        {
                            user_id: userId,
                            started_at: new Date(startedAtMs).toISOString(),
                            state,
                            updated_at: new Date().toISOString(),
                        },
                        { onConflict: 'user_id' }
                    );
                if (error) {
                    const msg = String((error && typeof error === 'object' && 'message' in error ? error.message : '') || '').toLowerCase();
                    const code = String((error && typeof error === 'object' && 'code' in error ? error.code : '') || '').toLowerCase();
                    const isMissing = code === '42p01' || msg.includes('does not exist') || msg.includes('relation') || msg.includes('schema cache');
                    if (isMissing && !serverSessionSyncWarnedRef.current) {
                        serverSessionSyncWarnedRef.current = true;
                        try {
                            inAppNotify({
                                text: 'Sincronização do treino entre navegadores indisponível (migrations pendentes).',
                                senderName: 'Aviso do Sistema',
                                displayName: 'Sistema',
                                photoURL: null,
                            });
                        } catch { }
                    }
                }
            } catch { }
        };

        let timerId = null;

        try {
            timerId = setTimeout(() => {
                try {
                    run();
                } catch { }
            }, 900);
            serverSessionSyncRef.current.timer = timerId as unknown as ReturnType<typeof setTimeout>;
        } catch { }

        return () => {
            try {
                if (timerId) clearTimeout(timerId);
            } catch { }
        };
    }, [activeSession, supabase, user?.id, inAppNotify, setActiveSession, setView]);

    useEffect(() => {
        if (!activeSession) return;
        const id = setInterval(() => {
            try {
                if (typeof document !== 'undefined' && document.hidden) return;
            } catch { }
            setSessionTicker(Date.now());
        }, 1000);
        return () => clearInterval(id);
    }, [activeSession, view, setSessionTicker]);

    // Notification + DM badge useEffects — handled by useUnreadBadges hook above

    useEffect(() => {
        const baseUserObj = initialUser && typeof initialUser === 'object' ? (initialUser as Record<string, unknown>) : null
        if (!baseUserObj?.id) {
            try {
                if (typeof window !== 'undefined') window.location.href = '/?next=/dashboard'
            } catch { }
            return
        }
        const meta = baseUserObj?.user_metadata && typeof baseUserObj.user_metadata === 'object' ? (baseUserObj.user_metadata as Record<string, unknown>) : {}
        const emailRaw = String(baseUserObj?.email || '').trim()
        const emailUser = emailRaw.includes('@') ? emailRaw.split('@')[0] : (emailRaw || 'Usuário')
        const profileObj = initialProfile && typeof initialProfile === 'object' ? (initialProfile as Record<string, unknown>) : {}
        const profileDisplayName = String(profileObj?.display_name || profileObj?.displayName || '').trim()
        const profilePhotoURL = String(profileObj?.photo_url || profileObj?.photoURL || profileObj?.photoUrl || '').trim()
        const metaDisplayName = String(meta?.full_name || meta?.name || '').trim()
        const displayName = profileDisplayName || metaDisplayName || emailUser
        const photoURL = profilePhotoURL || meta?.avatar_url || meta?.picture || null
        const nextUser = { ...baseUserObj, id: String(baseUserObj.id), displayName, photoURL, role: profileObj?.role || 'user' }
        setUser(nextUser as UserRecord)
        const role = String(profileObj?.role || '').toLowerCase()
        setIsCoach(role === 'teacher' || role === 'admin')
    }, [initialUser, initialProfile])

    // vipAccess fetch is handled by useVipAccess hook above

    useEffect(() => {
        try {
            const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
                try {
                    const ev = String(_event || '').toUpperCase()
                    if (session && session.user?.id) return
                    if (ev === 'SIGNED_OUT') {
                        clearClientSessionState()
                        if (typeof window !== 'undefined') window.location.href = '/?next=/dashboard'
                        return
                    }
                    if (ev === 'INITIAL_SESSION') {
                        fetch('/api/auth/ping', { method: 'GET', credentials: 'include', cache: 'no-store' })
                            .then((r) => {
                                if (r && r.status === 204) return
                                clearClientSessionState()
                                if (typeof window !== 'undefined') window.location.href = '/?next=/dashboard'
                            })
                            .catch(() => { })
                        return
                    }
                } catch { }
            })
            return () => {
                try { sub?.subscription?.unsubscribe?.() } catch { }
            }
        } catch {
            return
        }
    }, [supabase, clearClientSessionState])

    useEffect(() => {
        restoreAdminPanelIfNeeded();
        const onVisibility = () => {
            if (typeof document === 'undefined') return;
            if (document.visibilityState === 'visible') restoreAdminPanelIfNeeded();
        };
        const onPageShow = () => restoreAdminPanelIfNeeded();
        try {
            document.addEventListener('visibilitychange', onVisibility);
            window.addEventListener('pageshow', onPageShow);
        } catch { }
        return () => {
            try {
                document.removeEventListener('visibilitychange', onVisibility);
                window.removeEventListener('pageshow', onPageShow);
            } catch { }
        };
    }, [restoreAdminPanelIfNeeded]);

    // Profile completion effect — handled by useProfileCompletion hook above

    useEffect(() => {
        if (!user?.id) return;
        let cancelled = false;
        const run = async () => {
            try {
                const res = await fetch('/api/dashboard/bootstrap', { cache: 'no-store', credentials: 'include' });
                const json = await res.json().catch((): unknown => null);
                if (cancelled) return;
                const jsonObj = json && typeof json === 'object' ? (json as Record<string, unknown>) : null
                if (!jsonObj?.ok) return;

                const prof = jsonObj?.profile && typeof jsonObj.profile === 'object' ? (jsonObj.profile as Record<string, unknown>) : null;
                const displayName = String(prof?.display_name || '').trim();
                const photoURL = String(prof?.photo_url || '').trim();
                const role = String(prof?.role || '').toLowerCase();

                setUser((prev: UserRecord | null) => {
                    const current = prev && typeof prev === 'object' ? (prev as UserRecord) : null;
                    if (!current) return prev;
                    const patch: Record<string, unknown> = {};
                    if (displayName && displayName !== String(current.displayName || '')) patch.displayName = displayName;
                    if (photoURL && photoURL !== String(current.photoURL || '')) patch.photoURL = photoURL;
                    if (role && role !== String(current.role || '').toLowerCase()) patch.role = role;
                    return Object.keys(patch).length ? ({ ...current, ...patch } as UserRecord) : prev;
                });
                if (role) setIsCoach(role === 'teacher' || role === 'admin');

                const workoutsRaw = Array.isArray(jsonObj.workouts) ? (jsonObj.workouts as unknown[]) : []
                if (workoutsRaw.length) {
                    const mapped = workoutsRaw
                        .map((row: unknown) => mapWorkoutRow(row))
                        .filter(Boolean)
                        .sort((a: Record<string, unknown>, b: Record<string, unknown>) => String(a.title || '').localeCompare(String(b.title || '')));
                    setWorkouts(mapped);
                    const totalEx = mapped.reduce((acc: number, w: Record<string, unknown>) => acc + (Array.isArray(w?.exercises) ? (w.exercises as unknown[]).length : 0), 0);
                    setStats({ workouts: mapped.length, exercises: totalEx, activeStreak: 0 });
                }
            } catch { }
        };
        run();
        return () => {
            cancelled = true;
        };
    }, [user?.id, setIsCoach, setStats, setUser, setWorkouts]);

    // fetchWorkouts, workouts, stats, studentFolders — handled by useWorkoutFetch hook above
    // streakStats fetch is handled by useWorkoutStreak hook above

    // alert from useDialog returns Promise<boolean>; hooks expect Promise<void>
    const alertVoid = useCallback(async (msg: string, title?: string): Promise<void> => { await alert(msg, title) }, [alert])

    // Export/import de treinos — extraídos para useWorkoutExport
    const {
        exportWorkout, setExportWorkout,
        showExportModal, setShowExportModal,
        exportingAll,
        showImportModal, setShowImportModal,
        showJsonImportModal, setShowJsonImportModal,
        importCode, setImportCode,
        shareCode, setShareCode,
        handleShareWorkout,
        handleExportPdf,
        handleExportJson,
        handleExportAllWorkouts,
        handleImportWorkout,
        handleJsonUpload,
    } = useWorkoutExport({ user, workouts, fetchWorkouts, alert: alertVoid, confirm })

    // CRUD de treinos — extraído para useWorkoutCrud
    const userSettingsForCrud = userSettingsApi?.settings && typeof userSettingsApi.settings === 'object'
        ? (userSettingsApi.settings as Record<string, unknown>)
        : null
    const {
        handleStartSession,
        handleFinishSession,
        handleCreateWorkout,
        handleEditWorkout,
        handleSaveWorkout,
        handlePersistWorkoutTemplateFromSession,
        handleOpenActiveWorkoutEditor,
        handleCloseActiveWorkoutEditor,
        handleSaveActiveWorkoutEditor,
        handleDeleteWorkout,
        handleRestoreWorkout,
        handleBulkEditWorkouts,
    } = useWorkoutCrud({
        user,
        workouts,
        currentWorkout,
        activeSession,
        userSettings: userSettingsForCrud,
        setCurrentWorkout,
        setActiveSession,
        setView,
        setCreateWizardOpen,
        setReportData: setReportData as (data: unknown) => void,
        setReportBackView,
        suppressForeignFinishToastUntilRef,
        fetchWorkouts,
        alert,
        confirm,
        requestPreWorkoutCheckin,
        resolveExerciseVideos,
        persistExerciseVideoUrls,
        normalizeWorkoutForEditor,
        stripWorkoutInternalKeys,
        reindexSessionLogsAfterWorkoutEdit,
        editActiveBaseRef,
        editActiveAddExerciseRef,
        setEditActiveDraft,
        setEditActiveOpen,
        inAppNotify,
    })

    // Normalização de títulos e exercícios — extraído para useWorkoutNormalize
    const {
        handleNormalizeAiWorkoutTitles,
        handleApplyTitleRule,
        handleNormalizeExercises,
    } = useWorkoutNormalize({
        workouts,
        programTitleStartDay: userSettingsApi?.settings && typeof userSettingsApi.settings === 'object'
            ? Number((userSettingsApi.settings as Record<string, unknown>).programTitleStartDay) || undefined
            : undefined,
        fetchWorkouts,
        alert,
        confirm,
    })

    // Handlers de Sessão
    const handleLogout = async () => {
        const ok = await confirm("Deseja realmente sair da sua conta?", "Sair");
        if (!ok) return;
        try { clearClientSessionState(); } catch { }
        try { window.location.href = '/auth/logout'; } catch { }
    };

    const handleSaveProfile = async () => {
        if (!user?.id) return;
        const nextName = String(profileDraftName || '').trim();
        if (!nextName) {
            await alert('Informe seu nome para completar o perfil.', 'Perfil incompleto');
            return;
        }

        setSavingProfile(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .update({
                    display_name: nextName,
                    photo_url: user.photoURL ?? null,
                    last_seen: new Date().toISOString(),
                })
                .eq('id', user.id)
                .select('id')
                .maybeSingle();
            if (error) throw error;
            if (!data?.id) {
                await alert('Não foi possível salvar seu perfil (registro não encontrado).', 'Perfil');
                return;
            }
            setProfileIncomplete(false);
            setShowCompleteProfile(false);
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e || '')
            await alert('Erro ao salvar perfil: ' + message);
        } finally {
            setSavingProfile(false);
        }
    };

    // Abre o editor manual de treino (sem wizard)
    const openManualWorkoutEditor = () => {
        setCurrentWorkout({ title: '', exercises: [] as Exercise[] } as unknown as ActiveSession)
        setView('edit')
    }

    useEffect(() => {
        if (view !== 'active') return;
        const scrollToTop = () => {
            const node = mainScrollRef.current;
            if (node) {
                node.scrollTo({ top: 0, left: 0, behavior: 'auto' });
            }
            if (typeof window !== 'undefined') {
                window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
            }
        };
        const raf = requestAnimationFrame(scrollToTop);
        const t = window.setTimeout(scrollToTop, 120);
        return () => {
            cancelAnimationFrame(raf);
            window.clearTimeout(t);
        };
    }, [view, activeSession?.id]);

    const hideVipOnIos = isIosNative();

    useEffect(() => {
        if (!hideVipOnIos) return;
        if (view === 'vip') setView('dashboard');
    }, [hideVipOnIos, view]);

    const openVipView = useCallback(() => {
        if (hideVipOnIos) return;
        setView('vip');
    }, [hideVipOnIos]);

    const handleStartFromRestTimer = useCallback(
        (ctx?: unknown) => {
            const nowMs = Date.now()
            const ctxObj = isRecord(ctx) ? (ctx as Record<string, unknown>) : null
            const prevKey = ctxObj ? String(ctxObj.key ?? '').trim() : ''
            const nextKey = ctxObj ? String(ctxObj.nextKey ?? '').trim() : ''
            const restStartedRaw = ctxObj ? ctxObj.restStartedAtMs : null
            const restStartedAtMs = typeof restStartedRaw === 'number' ? restStartedRaw : Number(String(restStartedRaw ?? '').trim())

            if (prevKey) {
                const logsObj = isRecord(activeSession?.logs) ? (activeSession?.logs as Record<string, unknown>) : {}
                const prevLog = logsObj[prevKey]
                const prevLogObj = isRecord(prevLog) ? (prevLog as Record<string, unknown>) : {}
                const completedRaw = prevLogObj.completedAtMs
                const completedAtMs = typeof completedRaw === 'number' ? completedRaw : Number(String(completedRaw ?? '').trim())
                const base = restStartedAtMs > 0 ? restStartedAtMs : completedAtMs > 0 ? completedAtMs : 0
                const restSeconds = base > 0 ? Math.max(0, Math.round((nowMs - base) / 1000)) : null
                if (restSeconds != null) {
                    handleUpdateSessionLog(prevKey, { ...prevLogObj, restSeconds })
                }
            }

            if (nextKey) {
                const logsObj = isRecord(activeSession?.logs) ? (activeSession?.logs as Record<string, unknown>) : {}
                const nextLog = logsObj[nextKey]
                const nextLogObj = isRecord(nextLog) ? (nextLog as Record<string, unknown>) : {}
                if (!Boolean(nextLogObj.done)) {
                    handleUpdateSessionLog(nextKey, { ...nextLogObj, startedAtMs: nowMs })
                    setActiveSession((prev) => {
                        if (!prev) return prev
                        const base = prev && typeof prev === 'object' ? (prev as Record<string, unknown>) : {}
                        const ui = isRecord(base.ui) ? (base.ui as Record<string, unknown>) : {}
                        return { ...(prev as Record<string, unknown>), ui: { ...ui, activeExecution: { key: nextKey, startedAtMs: nowMs } } } as unknown as ActiveWorkoutSession
                    })
                }
            }

            handleCloseTimer()
        },
        [activeSession?.logs, handleCloseTimer, handleUpdateSessionLog, setActiveSession]
    )

    const handleOpenNotifications = useCallback(() => {
        setShowNotifCenter(true);
        setHasUnreadNotification(false);
    }, []);

    const handleOpenTour = useCallback(async () => {
        try {
            await logTourEvent('tour_started', { auto: false, version: TOUR_VERSION })
        } catch { }
        setTourOpen(true)
    }, [logTourEvent, TOUR_VERSION]);

    if (authLoading) return <LoadingScreen />;
    if (!user?.id) return <LoadingScreen />;

    const currentWorkoutId = activeSession?.workout?.id;
    let nextWorkout = null;
    if (currentWorkoutId && Array.isArray(workouts) && workouts.length > 0) {
        const index = workouts.findIndex(w => w.id === currentWorkoutId);
        if (index !== -1 && index + 1 < workouts.length) {
            nextWorkout = workouts[index + 1];
        }
    }

    const isHeaderVisible = view !== 'active' && view !== 'report';


    return (
        <>
            {/* Biometric lock — shown on top of everything when app resumes from background */}
            {isLocked && user?.id ? (
                <BiometricLock userName={userName} onUnlocked={unlock} />
            ) : null}
            <InAppNotificationsProvider
                userId={user?.id || undefined}
                settings={userSettingsApi?.settings ?? null}
                onOpenMessages={() => setView('chat')}
                onOpenNotifications={handleOpenNotifications}
            >
                <InAppNotifyBinder bind={bindInAppNotify} />
                <TeamWorkoutProvider user={user?.id ? { id: String(user.id), email: user?.email ? String(user.email) : null } : null} settings={userSettingsApi?.settings ?? null} onStartSession={handleStartSession}>
                    <div className="w-full bg-neutral-900 min-h-screen relative flex flex-col overflow-hidden" suppressHydrationWarning>
                        <IncomingInviteModal onStartSession={handleStartSession} />
                        <InviteAcceptedModal />
                        <GuidedTour
                            open={Boolean(tourOpen)}
                            steps={getTourSteps({
                                role: user?.role,
                                hasCommunity: (userSettingsApi?.settings?.moduleCommunity !== false),
                            })}
                            actions={{
                                openAdminPanel: (tab: unknown) => {
                                    try {
                                        const safe = String(tab || 'dashboard').trim() || 'dashboard'
                                        openAdminPanel(safe)
                                    } catch { }
                                },
                            }}
                            onEvent={(name: unknown, payload: unknown) => {
                                logTourEvent(name, payload)
                            }}
                            onComplete={async () => {
                                setTourOpen(false)
                                setTourBoot((prev) => ({ ...prev, completed: true, skipped: false }))
                                try { writeLocalTourDismissal(user?.id, 'completed') } catch { }
                                const res = await upsertTourFlags({ tour_completed_at: new Date().toISOString(), tour_skipped_at: null })
                                if (!res?.ok) {
                                    logWarn('warn', 'Falha ao persistir flags do tour (completed). Mantendo fallback local.', res)
                                }
                                await logTourEvent('tour_completed', { version: TOUR_VERSION })
                            }}
                            onSkip={async () => {
                                setTourOpen(false)
                                setTourBoot((prev) => ({ ...prev, completed: false, skipped: true }))
                                try { writeLocalTourDismissal(user?.id, 'skipped') } catch { }
                                const res = await upsertTourFlags({ tour_skipped_at: new Date().toISOString(), tour_completed_at: null })
                                if (!res?.ok) {
                                    logWarn('warn', 'Falha ao persistir flags do tour (skipped). Mantendo fallback local.', res)
                                }
                                await logTourEvent('tour_skipped', { version: TOUR_VERSION })
                            }}
                            onCancel={async () => {
                                setTourOpen(false)
                                setTourBoot((prev) => ({ ...prev, completed: false, skipped: true }))
                                try { writeLocalTourDismissal(user?.id, 'skipped') } catch { }
                                const res = await upsertTourFlags({ tour_skipped_at: new Date().toISOString(), tour_completed_at: null })
                                if (!res?.ok) {
                                    logWarn('warn', 'Falha ao persistir flags do tour (cancelled). Mantendo fallback local.', res)
                                }
                                await logTourEvent('tour_cancelled', { version: TOUR_VERSION })
                            }}
                        />

                        {/* Header */}
                        {isHeaderVisible && (
                            <div className="bg-neutral-950 flex justify-between items-center fixed top-0 left-0 right-0 z-40 border-b border-zinc-800 px-6 shadow-lg pt-[env(safe-area-inset-top)] min-h-[calc(4rem+env(safe-area-inset-top))]">
                                <div
                                    className="flex items-center cursor-pointer group"
                                    onClick={() => setView('dashboard')}
                                >
                                    <div className="flex items-center gap-2">
                                        <Dumbbell size={18} className="text-yellow-500 opacity-25" />
                                        <h1 className="text-2xl font-black tracking-tighter italic leading-none text-white group-hover:opacity-80 transition-opacity">
                                            IRON<span className="text-yellow-500">TRACKS</span>
                                        </h1>
                                    </div>
                                    <div className="h-6 w-px bg-yellow-500 mx-4 opacity-50"></div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-zinc-400 text-xs font-medium tracking-wide uppercase">
                                            {isCoach ? 'Bem vindo Coach' : 'Bem vindo Atleta'}
                                        </span>
                                        {!hideVipOnIos && vipAccess?.hasVip && (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    openVipView()
                                                }}
                                                className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-yellow-500/10 border border-yellow-500/20 shadow-[0_0_10px_-3px_rgba(234,179,8,0.3)] mr-3 hover:bg-yellow-500/15"
                                            >
                                                <Crown size={11} className="text-yellow-500 fill-yellow-500" />
                                                <span className="text-[10px] font-black text-yellow-500 tracking-widest leading-none">VIP</span>
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-4">
                                    {(() => {
                                        const pending = Number(syncState?.pending || 0)
                                        const failed = Number(syncState?.failed || 0)
                                        const online = syncState?.online !== false
                                        const settings = userSettingsApi?.settings && typeof userSettingsApi.settings === 'object' ? userSettingsApi.settings : null
                                        const offlineSyncV2Enabled = settings?.featuresKillSwitch !== true && settings?.featureOfflineSyncV2 === true
                                        if (!online) {
                                            return (
                                                <div className="hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-black uppercase tracking-widest">
                                                    Offline
                                                </div>
                                            )
                                        }
                                        if (offlineSyncV2Enabled && (pending > 0 || failed > 0)) {
                                            return (
                                                <button
                                                    type="button"
                                                    onClick={() => setOfflineSyncOpen(true)}
                                                    className="hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 text-xs font-black uppercase tracking-widest hover:bg-yellow-500/15"
                                                    title="Abrir central de pendências"
                                                >
                                                    {syncState?.syncing ? 'Sincronizando' : 'Pendentes'}: {pending}{failed > 0 ? ` • Falhas: ${failed}` : ''}
                                                </button>
                                            )
                                        }
                                        if (pending > 0) {
                                            return (
                                                <div className="hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 text-xs font-black uppercase tracking-widest">
                                                    {syncState?.syncing ? 'Sincronizando' : 'Pendentes'}: {pending}
                                                </div>
                                            )
                                        }
                                        return null
                                    })()}
                                    <HeaderActionsMenu
                                        user={user as unknown as AdminUser}
                                        isCoach={isCoach}
                                        hasUnreadChat={hasUnreadChat}
                                        hasUnreadNotification={hasUnreadNotification}
                                        onOpenAdmin={() => {
                                            if (typeof window !== 'undefined') {
                                                const url = new URL(window.location.href);
                                                url.searchParams.delete('view');
                                                window.history.replaceState({}, '', url);
                                            }
                                            const tab = (() => {
                                                try {
                                                    const url = new URL(window.location.href);
                                                    const current = String(url.searchParams.get('tab') || '').trim();
                                                    if (current) return current;
                                                } catch { }
                                                try {
                                                    const stored = String(sessionStorage.getItem('irontracks_admin_panel_tab') || '').trim();
                                                    if (stored) return stored;
                                                } catch { }
                                                return 'dashboard';
                                            })();
                                            openAdminPanel(tab);
                                        }}
                                        onOpenChatList={() => setView('chatList')}
                                        onOpenGlobalChat={() => setView('globalChat')}
                                        onOpenHistory={() => setView('history')}
                                        onOpenNotifications={handleOpenNotifications}
                                        onOpenSchedule={() => router.push('/dashboard/schedule')}
                                        onOpenWallet={() => openVipView()}
                                        onOpenSettings={() => setSettingsOpen(true)}
                                        onOpenTour={handleOpenTour}
                                        onLogout={handleLogout}
                                    />
                                </div>
                            </div>
                        )}

                        {isCoach && coachPending && (
                            <div className="bg-yellow-500 text-black text-sm font-bold px-4 py-2 text-center">
                                Sua conta de Professor está pendente. <button className="underline" onClick={async () => { try { const r = await fetch('/api/teachers/accept', { method: 'POST' }); const j = await r.json(); if (j.ok) { setCoachPending(false); await alert('Conta ativada!'); } else { await alert('Falha ao ativar: ' + (j.error || '')); } } catch (e) { const m = e instanceof Error ? e.message : String(e); await alert('Erro: ' + m); } }}>Aceitar</button>
                            </div>
                        )}

                        {/* Main Content */}
                        <div
                            ref={mainScrollRef}
                            className="flex-1 overflow-y-auto custom-scrollbar relative"
                            style={({
                                ['--dashboard-sticky-top' as unknown as keyof React.CSSProperties]: isHeaderVisible
                                    ? 'calc(4rem + env(safe-area-inset-top))'
                                    : '0px',
                                paddingTop: isHeaderVisible ? 'calc(4rem + env(safe-area-inset-top))' : undefined,
                            } as React.CSSProperties)}
                        >
                            {(view === 'dashboard' || view === 'assessments' || view === 'community' || view === 'vip') && (
                                <StudentDashboard
                                    workouts={Array.isArray(workouts) ? workouts : []}
                                    profileIncomplete={Boolean(profileIncomplete)}
                                    onOpenCompleteProfile={() => setShowCompleteProfile(true)}
                                    view={view === 'assessments' ? 'assessments' : view === 'community' ? 'community' : view === 'vip' ? 'vip' : 'dashboard'}
                                    onChangeView={(next: string) => setView(next)}
                                    assessmentsContent={
                                        (user?.id || initialUserObj?.id) ? (
                                            <ErrorBoundary>
                                                <Suspense fallback={<div className="p-4 text-neutral-400">Carregando…</div>}>
                                                    <AssessmentHistory studentId={String(user?.id || initialUserObj?.id || '')} onClose={() => setView('dashboard')} />
                                                </Suspense>
                                            </ErrorBoundary>
                                        ) : null
                                    }
                                    communityContent={(user?.id || initialUserObj?.id) ? <CommunityClient embedded /> : null}
                                    vipContent={
                                        hideVipOnIos ? null :
                                            <VipHub
                                                user={user as unknown as AdminUser}
                                                locked={!vipAccess?.hasVip}
                                                onOpenWorkoutEditor={(w: unknown) => handleEditWorkout(w)}
                                                onOpenVipTab={() => openVipView()}
                                                onStartSession={(w: unknown) => handleStartSession(w)}
                                                onOpenWizard={() => setCreateWizardOpen(true)}
                                                onOpenHistory={() => setView('history')}
                                                onOpenReport={(s: unknown) => {
                                                    setReportBackView('vip');
                                                    setReportData({ current: s, previous: null } as unknown as Parameters<typeof setReportData>[0]);
                                                    setView('report');
                                                }}
                                            />
                                    }
                                    vipLabel="VIP"
                                    vipLocked={hideVipOnIos ? true : !vipAccess?.hasVip}
                                    vipEnabled={!hideVipOnIos}
                                    settings={userSettingsApi?.settings ?? null}
                                    onCreateWorkout={handleCreateWorkout}
                                    onQuickView={(w) => setQuickViewWorkout(w)}
                                    onStartSession={(w) => handleStartSession(w)}
                                    onRestoreWorkout={(w) => handleRestoreWorkout(w)}
                                    onShareWorkout={(w) => handleShareWorkout(w)}
                                    onEditWorkout={(w) => handleEditWorkout(w)}
                                    onDeleteWorkout={(id, title) => {
                                        if (id) handleDeleteWorkout(id, String(title || ''))
                                    }}
                                    onBulkEditWorkouts={handleBulkEditWorkouts}
                                    currentUserId={String(user?.id || initialUserObj?.id || '')}
                                    exportingAll={Boolean(exportingAll)}
                                    onExportAll={handleExportAllWorkouts}
                                    streakStats={streakStats}
                                    onOpenJsonImport={() => setShowJsonImportModal(true)}
                                    onNormalizeAiWorkoutTitles={handleNormalizeAiWorkoutTitles}
                                    onNormalizeExercises={handleNormalizeExercises}
                                    onApplyTitleRule={handleApplyTitleRule}
                                    onOpenIronScanner={async () => {
                                        try {
                                            openManualWorkoutEditor()
                                            await alert('No editor, clique em Scanner de Treino (Imagem).', 'Scanner')
                                        } catch { }
                                    }}
                                />
                            )}

                            <WorkoutWizardModal
                                isOpen={createWizardOpen}
                                onClose={() => setCreateWizardOpen(false)}
                                onManual={() => openManualWorkoutEditor()}
                                onGenerate={async (answers, options) => {
                                    const mode = String(options?.mode || 'single').trim().toLowerCase();
                                    try {
                                        const res = await fetch('/api/ai/workout-wizard', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ answers, mode }),
                                        })
                                        const data = await res.json().catch((): unknown => null)
                                        if (!res.ok) {
                                            const msg = data?.error ? String(data.error) : 'Falha ao gerar treino com IA.'
                                            throw new Error(msg)
                                        }
                                        if (mode === 'program') {
                                            const drafts = Array.isArray(data?.drafts) ? data.drafts : null
                                            if (drafts && drafts.length) return { drafts }
                                            if (data?.ok === false && Array.isArray(data?.drafts) && data.drafts.length) return { drafts: data.drafts }
                                            throw new Error(data?.error ? String(data.error) : 'Resposta inválida da IA.')
                                        }
                                        const draft = data?.draft && typeof data.draft === 'object' ? data.draft : null
                                        if (draft?.exercises && Array.isArray(draft.exercises) && draft.exercises.length > 0) return draft
                                        if (data?.ok === false && data?.draft) return data.draft
                                        throw new Error(data?.error ? String(data.error) : 'Resposta inválida da IA.')
                                    } catch (e: unknown) {
                                        const msg = getErrorMessage(e)
                                        const lower = msg.toLowerCase()
                                        const isConfig = lower.includes('api de ia não configurada') || lower.includes('google_generative_ai_api_key')
                                        if (isConfig) throw e
                                        if (mode === 'program') {
                                            const days = Math.max(2, Math.min(6, Number(answers?.daysPerWeek || 3) || 3))
                                            const drafts: Array<Record<string, unknown>> = [];
                                            for (let i = 0; i < days; i++) {
                                                drafts.push(generateWorkoutFromWizard(answers, i))
                                            }
                                            return { drafts }
                                        }
                                        return generateWorkoutFromWizard(answers, 0)
                                    }
                                }}
                                onSaveDrafts={async (drafts) => {
                                    const list = Array.isArray(drafts) ? drafts : []
                                    if (!list.length) return
                                    try {
                                        for (let i = 0; i < list.length; i += 1) {
                                            const d = list[i]
                                            const baseTitle = String(d?.title || 'Treino').trim() || 'Treino'
                                            const finalTitle = formatProgramWorkoutTitle(baseTitle, i, { startDay: userSettingsApi?.settings?.programTitleStartDay })
                                            const exercises = Array.isArray(d?.exercises) ? d.exercises : []
                                            const res = await createWorkout({ title: finalTitle, exercises })
                                            if (!res?.ok) throw new Error(String(res?.error || 'Falha ao salvar treino'))
                                        }
                                        try {
                                            await fetchWorkouts()
                                        } catch { }
                                        setCreateWizardOpen(false)
                                        await alert(`Plano salvo: ${list.length} treinos criados.`)
                                    } catch (e: unknown) {
                                        const msg = getErrorMessage(e)
                                        await alert('Erro ao salvar plano: ' + msg)
                                    }
                                }}
                                onUseDraft={(draft) => {
                                    try {
                                        const title = String(draft?.title || '').trim() || 'Treino'
                                        const exercises = (Array.isArray(draft?.exercises) ? draft.exercises : []) as import('@/types/app').Exercise[]
                                        setCurrentWorkout({ title, exercises })
                                        setView('edit')
                                    } finally {
                                        setCreateWizardOpen(false)
                                    }
                                }}
                            />

                            {view === 'edit' && (
                                <SectionErrorBoundary section="Editor de Treino" fullScreen onReset={() => setView('dashboard')}>
                                    <ExerciseEditor
                                        workout={currentWorkout as unknown as Workout}
                                        onCancel={() => setView('dashboard')}
                                        onChange={(w) => setCurrentWorkout(w as unknown as ActiveSession)}
                                        onSave={handleSaveWorkout}
                                        onSaved={() => {
                                            fetchWorkouts().catch(() => { });
                                            setView('dashboard');
                                        }}
                                    />
                                </SectionErrorBoundary>
                            )}

                            {view === 'active' && activeSession && (
                                <ActiveWorkout
                                    session={activeSession as Record<string, unknown>}
                                    user={user as unknown as AdminUser}
                                    settings={userSettingsApi?.settings ?? null}
                                    onUpdateLog={handleUpdateSessionLog}
                                    onFinish={handleFinishSession}
                                    onPersistWorkoutTemplate={handlePersistWorkoutTemplateFromSession}
                                    onBack={() => setView('dashboard')}
                                    onStartTimer={handleStartTimer}
                                    isCoach={isCoach}
                                    onUpdateSession={(updates: unknown) =>
                                        setActiveSession((prev) => {
                                            if (!prev) return prev
                                            const u = updates && typeof updates === 'object' ? (updates as Record<string, unknown>) : {}
                                            return { ...prev, ...(u as Partial<ActiveWorkoutSession>) }
                                        })
                                    }
                                    nextWorkout={nextWorkout}
                                    onEditWorkout={() => handleOpenActiveWorkoutEditor()}
                                    onAddExercise={() => handleOpenActiveWorkoutEditor({ addExercise: true })}
                                />
                            )}

                            {editActiveOpen && view === 'active' && editActiveDraft && (
                                <div
                                    className="fixed inset-0 z-[1400] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 md:p-6 pt-safe"
                                    onClick={() => handleCloseActiveWorkoutEditor()}
                                >
                                    <div
                                        className="w-full max-w-5xl h-[92vh] bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <ExerciseEditor
                                            workout={editActiveDraft}
                                            onCancel={() => handleCloseActiveWorkoutEditor()}
                                            onChange={(w: unknown) => setEditActiveDraft(normalizeWorkoutForEditor(w))}
                                            onSave={handleSaveActiveWorkoutEditor}
                                            onSaved={() => {
                                                fetchWorkouts().catch(() => { });
                                                handleCloseActiveWorkoutEditor();
                                            }}
                                        />
                                    </div>
                                </div>
                            )}

                            {view === 'history' && (
                                <SectionErrorBoundary section="Histórico" fullScreen onReset={() => setView('dashboard')}>
                                    <HistoryList
                                        user={user as unknown as AdminUser}
                                        settings={userSettingsApi?.settings ?? null}
                                        onViewReport={(s: unknown) => { setReportBackView('history'); setReportData({ current: s, previous: null } as unknown as Parameters<typeof setReportData>[0]); setView('report'); }}
                                        onBack={() => setView('dashboard')}
                                        targetId={user?.id || ''}
                                        targetEmail={user?.email ? String(user.email) : ''}
                                        readOnly={false}
                                        title="Histórico"
                                        vipLimits={vipStatus?.limits as Record<string, unknown>}
                                        onUpgrade={() => openVipView()}
                                    />
                                </SectionErrorBoundary>
                            )}

                            {/* Evolução removida conforme solicitação */}

                            {view === 'report' && reportData.current && (
                                <div className="fixed inset-0 z-[1200] bg-neutral-900 overflow-y-auto pt-safe">
                                    <SectionErrorBoundary section="Relatório" fullScreen onReset={() => setView(reportBackView || 'dashboard')}>
                                        <WorkoutReport
                                            session={reportData.current}
                                            previousSession={reportData.previous}
                                            user={user as unknown as AdminUser}
                                            isVip={vipAccess?.hasVip}
                                            settings={userSettingsApi?.settings ?? null}
                                            onUpgrade={() => openVipView()}
                                            onClose={() => setView(reportBackView || 'dashboard')}
                                        />
                                    </SectionErrorBoundary>
                                </div>
                            )}

                            {showExportModal && exportWorkout && (
                                <div className="fixed inset-0 z-[1200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowExportModal(false)}>
                                    <div className="bg-neutral-900 w-full max-w-md rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                                        <div className="p-4 border-b border-neutral-800 flex justify-between items-center">
                                            <h3 className="font-bold text-white">Como deseja exportar?</h3>
                                            <BackButton onClick={() => setShowExportModal(false)} className="bg-transparent hover:bg-neutral-800 text-neutral-300" />
                                        </div>
                                        <div className="p-4 space-y-3">
                                            <button onClick={handleExportPdf} className="w-full px-4 py-3 bg-yellow-500 text-black font-bold rounded-xl">Baixar PDF</button>
                                            <button onClick={handleExportJson} className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold rounded-xl">Baixar JSON</button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {openStudent && (
                                <div className="fixed inset-0 z-[1200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setOpenStudent(null)}>
                                    <div className="bg-neutral-900 w-full max-w-md rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                                        <div className="p-4 border-b border-neutral-800 flex justify-between items-center">
                                            <h3 className="font-bold text-white">Treinos de {String((isRecord(openStudent) ? openStudent.name : '') ?? '')}</h3>
                                            <BackButton onClick={() => setOpenStudent(null)} className="bg-transparent hover:bg-neutral-800 text-neutral-300" />
                                        </div>
                                        <div className="p-4 space-y-2 max-h-[70vh] overflow-y-auto">
                                            {(() => {
                                                const s = isRecord(openStudent) ? openStudent : {}
                                                const list = Array.isArray(s.workouts) ? s.workouts : []
                                                if (list.length !== 0) return null
                                                return (
                                                    <p className="text-neutral-500 text-sm">Nenhum treino encontrado.</p>
                                                )
                                            })()}
                                            {(() => {
                                                const s = isRecord(openStudent) ? openStudent : {}
                                                const list = Array.isArray(s.workouts) ? s.workouts : []
                                                return list.map((w: unknown, idx: number) => {
                                                    const wo = w && typeof w === 'object' ? (w as Record<string, unknown>) : ({} as Record<string, unknown>)
                                                    const id = String(wo?.id || '').trim() || `w-${idx}`
                                                    const exCount = Array.isArray(wo?.exercises) ? (wo.exercises as unknown[]).length : 0
                                                    return (
                                                        <div key={id} className="p-3 rounded-xl border border-neutral-700 bg-neutral-800">
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-white font-bold text-sm">{String(wo?.title || '')}</span>
                                                                <span className="text-xs text-neutral-400">{exCount} exercícios</span>
                                                            </div>
                                                        </div>
                                                    )
                                                })
                                            })()}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {view === 'chat' && (
                                <div className="absolute inset-0 z-50 bg-neutral-900">
                                    <SectionErrorBoundary section="Chat" fullScreen onReset={() => setView('dashboard')}>
                                        <ChatScreen user={user as unknown as AdminUser} onClose={() => setView('dashboard')} />
                                    </SectionErrorBoundary>
                                </div>
                            )}

                            {view === 'globalChat' && (
                                <div className="absolute inset-0 z-50 bg-neutral-900">
                                    <SectionErrorBoundary section="Chat Global" fullScreen onReset={() => setView('dashboard')}>
                                        <ChatScreen user={user as unknown as AdminUser} onClose={() => setView('dashboard')} />
                                    </SectionErrorBoundary>
                                </div>
                            )}

                            {view === 'chatList' && (
                                <div className="absolute inset-0 z-50 bg-neutral-900">
                                    <ChatListScreen
                                        user={user as unknown as AdminUser}
                                        onClose={() => setView('dashboard')}
                                        onSelectUser={() => { }}
                                        onSelectChannel={(c: unknown) => {
                                            const ch = isRecord(c) ? c : {}
                                            const channelId = String(ch.channel_id ?? ch.channelId ?? '')
                                            const otherUserId = String(ch.other_user_id ?? ch.otherUserId ?? ch.user_id ?? ch.userId ?? '')
                                            const otherUserName = String(ch.other_user_name ?? ch.otherUserName ?? ch.displayName ?? '')
                                            const photoUrlRaw = ch.other_user_photo ?? ch.otherUserPhoto ?? ch.photoUrl ?? null
                                            const photoUrl = photoUrlRaw != null ? String(photoUrlRaw) : null
                                            setDirectChat({
                                                channelId,
                                                userId: otherUserId,
                                                displayName: otherUserName || undefined,
                                                photoUrl,
                                                other_user_id: otherUserId,
                                                other_user_name: otherUserName || undefined,
                                                other_user_photo: photoUrl,
                                            })
                                            setView('directChat')
                                        }}
                                    />
                                </div>
                            )}

                            {view === 'directChat' && directChat && (
                                <div className="absolute inset-0 z-50 bg-neutral-900">
                                    <ChatDirectScreen
                                        user={user as unknown as AdminUser}
                                        targetUser={directChat}
                                        otherUserId={String(directChat.other_user_id ?? directChat.userId ?? '')}
                                        otherUserName={String(directChat.other_user_name ?? directChat.displayName ?? '')}
                                        otherUserPhoto={directChat.other_user_photo ?? directChat.photoUrl ?? null}
                                        onClose={() => setView('chatList')}
                                    />
                                </div>
                            )}

                            {view === 'admin' && (
                                <div className="fixed inset-0 z-[60]">
                                    <SectionErrorBoundary section="Painel Admin" fullScreen onReset={() => setView('dashboard')}>
                                        <AdminPanelV2 user={user as unknown as AdminUser} onClose={() => setView('dashboard')} />
                                    </SectionErrorBoundary>
                                </div>
                            )}
                        </div>

                        {/* Modals & Overlays */}
                        {showCompleteProfile && (
                            <div className="fixed inset-0 z-[85] bg-black/80 flex items-center justify-center p-4">
                                <div className="bg-neutral-900 p-6 rounded-2xl w-full max-w-sm border border-neutral-800">
                                    <div className="flex items-center justify-between gap-3 mb-4">
                                        <h3 className="font-black text-white">Completar Perfil</h3>
                                        <button
                                            type="button"
                                            onClick={() => setShowCompleteProfile(false)}
                                            className="w-9 h-9 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
                                            aria-label="Fechar"
                                        >
                                            <X size={18} />
                                        </button>
                                    </div>

                                    <label className="block text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2">
                                        Nome de Exibição
                                    </label>
                                    <input
                                        value={profileDraftName}
                                        onChange={(e) => setProfileDraftName(e.target.value)}
                                        placeholder="Ex: João Silva"
                                        className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-yellow-500"
                                    />

                                    <div className="flex gap-2 mt-5">
                                        <button
                                            type="button"
                                            onClick={() => setShowCompleteProfile(false)}
                                            disabled={savingProfile}
                                            className="flex-1 p-3 bg-neutral-800 rounded-xl font-bold text-neutral-300 disabled:opacity-50"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleSaveProfile}
                                            disabled={savingProfile}
                                            className="flex-1 p-3 bg-yellow-500 rounded-xl font-black text-black disabled:opacity-50"
                                        >
                                            {savingProfile ? 'Salvando...' : 'Salvar'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                        {showImportModal && (
                            <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4">
                                <div className="bg-neutral-900 p-6 rounded-2xl w-full max-w-sm border border-neutral-800">
                                    <h3 className="font-bold text-white mb-4">Importar Treino (Código)</h3>
                                    <input
                                        value={importCode}
                                        onChange={e => setImportCode(e.target.value)}
                                        placeholder="Cole o código do treino aqui"
                                        className="w-full bg-neutral-800 p-4 rounded-xl mb-4 text-white font-mono text-center uppercase"
                                    />
                                    <div className="flex gap-2">
                                        <button onClick={() => setShowImportModal(false)} className="flex-1 p-3 bg-neutral-800 rounded-xl font-bold text-neutral-400">Cancelar</button>
                                        <button onClick={handleImportWorkout} className="flex-1 p-3 bg-blue-600 rounded-xl font-bold text-white">Importar</button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {showJsonImportModal && (
                            <div className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center p-4">
                                <div className="bg-neutral-900 p-6 rounded-2xl w-full max-w-sm border border-neutral-800 text-center">
                                    <Upload size={48} className="mx-auto text-blue-500 mb-4" />
                                    <h3 className="font-bold text-white mb-2 text-xl">Restaurar Backup</h3>
                                    <p className="text-neutral-400 text-sm mb-6">Selecione o arquivo .json que você salvou anteriormente.</p>

                                    <label className="block w-full cursor-pointer bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl transition-colors">
                                        Selecionar Arquivo
                                        <input type="file" accept=".json" onChange={handleJsonUpload} className="hidden" />
                                    </label>

                                    <button onClick={() => setShowJsonImportModal(false)} className="mt-4 text-neutral-500 text-sm hover:text-white">Cancelar</button>
                                </div>
                            </div>
                        )}

                        {shareCode && (
                            <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4">
                                <div className="bg-neutral-900 p-6 rounded-2xl w-full max-w-sm border border-neutral-800 text-center">
                                    <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4 text-black"><Check size={32} /></div>
                                    <h3 className="font-bold text-white mb-2">Link Gerado!</h3>
                                    <p className="text-neutral-400 text-sm mb-6">Envie este código para seu aluno ou amigo.</p>
                                    <div className="bg-black p-4 rounded-xl font-mono text-yellow-500 text-xl mb-4 tracking-widest select-all">
                                        {shareCode}
                                    </div>
                                    <button onClick={() => setShareCode(null)} className="w-full p-3 bg-neutral-800 rounded-xl font-bold text-white">Fechar</button>
                                </div>
                            </div>
                        )}

                        {quickViewWorkout && (
                            <div className="fixed inset-0 z-[75] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setQuickViewWorkout(null)}>
                                <div className="bg-neutral-900 w-full max-w-lg rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                                    <div className="p-4 flex justify-between items-center border-b border-neutral-800">
                                        <h3 className="font-bold text-white">{String(quickViewWorkout?.title || '')}</h3>
                                        <button
                                            type="button"
                                            onClick={() => setQuickViewWorkout(null)}
                                            className="flex items-center gap-2 text-yellow-500 hover:text-yellow-400 transition-colors py-2 px-3 rounded-xl hover:bg-neutral-800 active:opacity-70"
                                            aria-label="Voltar"
                                        >
                                            <ArrowLeft size={20} />
                                            <span className="font-semibold text-sm">Voltar</span>
                                        </button>
                                    </div>
                                    <div className="p-4 max-h-[60vh] overflow-y-auto space-y-3 custom-scrollbar">
                                        {(Array.isArray(quickViewWorkout?.exercises) ? quickViewWorkout.exercises : []).map((ex: unknown, idx: number) => {
                                            const e = ex && typeof ex === 'object' ? (ex as Record<string, unknown>) : ({} as Record<string, unknown>)
                                            return (
                                                <div key={idx} className="p-3 rounded-xl bg-neutral-800/50 border border-neutral-700">
                                                    <div className="flex justify-between items-center">
                                                        <h4 className="font-bold text-white text-sm">{String(e?.name || '—')}</h4>
                                                        <span className="text-xs text-neutral-400">{(parseInt(String(e?.sets ?? '')) || 0)} x {String(e?.reps || '-')}</span>
                                                    </div>
                                                    <div className="text-xs text-neutral-400 mt-1 flex items-center gap-2">
                                                        <Clock size={14} className="text-yellow-500" /><span>Descanso: {e?.restTime ? `${parseInt(String(e.restTime))}s` : '-'}</span>
                                                    </div>
                                                    {!!e?.notes && <p className="text-sm text-neutral-300 mt-2">{String(e.notes || '')}</p>}
                                                </div>
                                            )
                                        })}
                                        {(!Array.isArray(quickViewWorkout?.exercises) || quickViewWorkout.exercises.length === 0) && (
                                            <p className="text-neutral-400 text-sm">Este treino não tem exercícios.</p>
                                        )}
                                    </div>
                                    <div className="p-4 border-t border-neutral-800 flex gap-2">
                                        <button onClick={() => { const w = quickViewWorkout; setQuickViewWorkout(null); handleStartSession(w); }} className="flex-1 p-3 bg-yellow-500 text-black font-bold rounded-xl">Iniciar Treino</button>
                                        <button onClick={() => setQuickViewWorkout(null)} className="flex-1 p-3 bg-neutral-800 text-white font-bold rounded-xl">Fechar</button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {showNotifCenter && (
                            <div className="fixed inset-0 z-[75] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe" onClick={() => setShowNotifCenter(false)}>
                                <div className="bg-neutral-900 w-full max-w-md rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                                    <div className="p-4 flex justify-between items-center border-b border-neutral-800">
                                        <h3 className="font-bold text-white">Notificações</h3>
                                        <button
                                            type="button"
                                            onClick={() => setShowNotifCenter(false)}
                                            className="w-9 h-9 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
                                            aria-label="Fechar"
                                        >
                                            <X size={18} />
                                        </button>
                                    </div>
                                    <div className="p-4 relative">
                                        <NotificationCenter user={user as unknown as AdminUser} onStartSession={handleStartSession} embedded initialOpen />
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeSession?.timerTargetTime && (
                            <RestTimerOverlay
                                targetTime={activeSession.timerTargetTime}
                                context={activeSession.timerContext as unknown as Parameters<typeof import('@/components/RestTimerOverlay').default>[0]['context']}
                                settings={userSettingsApi?.settings ?? null}
                                onClose={handleCloseTimer}
                                onFinish={handleCloseTimer}
                                onStart={handleStartFromRestTimer}
                            />
                        )}

                        {activeSession && view !== 'active' && (
                            <div className="fixed bottom-0 left-0 right-0 z-[1100]">
                                <div className="bg-neutral-900/95 backdrop-blur border-t border-neutral-800 px-4 py-3 pb-[max(env(safe-area-inset-bottom),12px)]">
                                    <div className="flex items-center gap-4">
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-bold text-white truncate">{activeSession.workout?.title || 'Treino em andamento'}</h3>
                                            <div className="flex items-center gap-3 text-xs text-neutral-300 mt-1">
                                                <span className="font-mono text-yellow-500">{(() => { const startMs = parseStartedAtMs(activeSession.startedAt); const endMs = sessionTicker || startMs; const s = startMs > 0 ? Math.max(0, Math.floor((endMs - startMs) / 1000)) : 0; const m = Math.floor(s / 60), sec = s % 60; return `${m}:${String(sec).padStart(2, '0')}`; })()}</span>
                                                <span className="text-neutral-500">tempo atual</span>
                                                <span className="opacity-30">•</span>
                                                <span className="font-mono text-neutral-200">{(() => { const list = Array.isArray(activeSession.workout?.exercises) ? activeSession.workout.exercises : []; const total = list.reduce((acc: number, ex: unknown) => acc + calculateExerciseDuration((ex && typeof ex === 'object' ? (ex as Record<string, unknown>) : ({} as Record<string, unknown>))), 0); return `${toMinutesRounded(total)} min`; })()}</span>
                                                <span className="text-neutral-500">estimado total</span>
                                            </div>
                                            <div className="h-1 bg-neutral-700 rounded-full overflow-hidden mt-2">
                                                {(() => {
                                                    const exCount = (activeSession.workout?.exercises || []).length;
                                                    let percent = 0;
                                                    if (exCount) {
                                                        const done = new Set();
                                                        if (activeSession.logs) {
                                                            Object.keys(activeSession.logs).forEach(k => {
                                                                const i = parseInt(k.split('-')[0]) || 0;
                                                                done.add(i);
                                                            });
                                                        }
                                                        const current = Math.min(done.size, exCount);
                                                        percent = Math.round((current / exCount) * 100);
                                                    }
                                                    return <div className="h-full bg-yellow-500" style={{ width: `${percent}%` }}></div>
                                                })()}
                                            </div>
                                        </div>
                                        <button className="shrink-0 px-4 py-2 bg-yellow-500 text-black font-black rounded-xl hover:bg-yellow-400" onClick={() => setView('active')}>Voltar pro treino</button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Admin Panel Modal controlled by State */}
                        {showAdminPanel && (
                            <SectionErrorBoundary section="Painel Admin" fullScreen onReset={closeAdminPanel}>
                                <AdminPanelV2 user={user as unknown as AdminUser} onClose={closeAdminPanel} />
                            </SectionErrorBoundary>
                        )}

                        {whatsNewOpen && (
                            <WhatsNewModal
                                isOpen={whatsNewOpen}
                                entry={pendingUpdate ? null : getLatestWhatsNew()}
                                update={pendingUpdate ? {
                                    id: String(pendingUpdate?.id || ''),
                                    version: pendingUpdate?.version || null,
                                    title: String(pendingUpdate?.title || ''),
                                    description: String(pendingUpdate?.description || ''),
                                    release_date: String(pendingUpdate?.release_date || pendingUpdate?.releaseDate || '') || null,
                                } : null}
                                onClose={closeWhatsNew}
                            />
                        )}

                        {preCheckinOpen && (
                            <div
                                className="fixed inset-0 z-[1300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe"
                                onClick={() => {
                                    setPreCheckinOpen(false)
                                    const r = preCheckinResolveRef.current
                                    preCheckinResolveRef.current = null
                                    if (typeof r === 'function') r(null)
                                }}
                            >
                                <div className="bg-neutral-900 w-full max-w-md rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                                    <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Check-in</div>
                                            <div className="text-white font-black text-lg truncate">Pré-treino</div>
                                            <div className="text-xs text-neutral-400 truncate">{String(preCheckinWorkout?.title || preCheckinWorkout?.name || 'Treino')}</div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setPreCheckinOpen(false)
                                                const r = preCheckinResolveRef.current
                                                preCheckinResolveRef.current = null
                                                if (typeof r === 'function') r(null)
                                            }}
                                            className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center"
                                            aria-label="Fechar"
                                        >
                                            <X size={18} />
                                        </button>
                                    </div>
                                    <div className="p-4 space-y-4">
                                        <div className="space-y-2">
                                            <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Energia (1–5)</div>
                                            <div className="grid grid-cols-5 gap-2">
                                                {[1, 2, 3, 4, 5].map((n) => (
                                                    <button
                                                        key={n}
                                                        type="button"
                                                        onClick={() => setPreCheckinDraft((prev) => ({ ...prev, energy: String(n) }))}
                                                        className={
                                                            String(preCheckinDraft?.energy || '') === String(n)
                                                                ? 'min-h-[44px] rounded-xl bg-yellow-500 text-black font-black'
                                                                : 'min-h-[44px] rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black hover:bg-neutral-800'
                                                        }
                                                    >
                                                        {n}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Dor / Soreness (0–10)</div>
                                            <select
                                                value={String(preCheckinDraft?.soreness ?? '')}
                                                onChange={(e) => setPreCheckinDraft((prev) => ({ ...prev, soreness: String(e.target.value || '') }))}
                                                className="w-full min-h-[44px] bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white"
                                            >
                                                <option value="">Não informar</option>
                                                {Array.from({ length: 11 }).map((_, i) => (
                                                    <option key={i} value={String(i)}>
                                                        {i}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="space-y-2">
                                            <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Tempo disponível</div>
                                            <div className="grid grid-cols-5 gap-2">
                                                {[30, 45, 60, 90, 120].map((n) => (
                                                    <button
                                                        key={n}
                                                        type="button"
                                                        onClick={() => setPreCheckinDraft((prev) => ({ ...prev, timeMinutes: String(n) }))}
                                                        className={
                                                            String(preCheckinDraft?.timeMinutes || '') === String(n)
                                                                ? 'min-h-[44px] rounded-xl bg-yellow-500 text-black font-black'
                                                                : 'min-h-[44px] rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black hover:bg-neutral-800'
                                                        }
                                                    >
                                                        {n}m
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Observações (opcional)</div>
                                            <textarea
                                                value={String(preCheckinDraft?.notes || '')}
                                                onChange={(e) => setPreCheckinDraft((prev) => ({ ...prev, notes: String(e.target.value || '') }))}
                                                className="w-full min-h-[90px] bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none"
                                                placeholder="Ex.: pouco sono, dor no joelho, viagem…"
                                            />
                                        </div>
                                    </div>
                                    <div className="p-4 border-t border-neutral-800 flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setPreCheckinOpen(false)
                                                const r = preCheckinResolveRef.current
                                                preCheckinResolveRef.current = null
                                                if (typeof r === 'function') r(null)
                                            }}
                                            className="flex-1 min-h-[44px] px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold hover:bg-neutral-700"
                                        >
                                            Pular
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setPreCheckinOpen(false)
                                                const r = preCheckinResolveRef.current
                                                preCheckinResolveRef.current = null
                                                if (typeof r === 'function') r(preCheckinDraft)
                                            }}
                                            className="flex-1 min-h-[44px] px-4 py-3 rounded-xl bg-yellow-500 text-black font-black hover:bg-yellow-400"
                                        >
                                            Continuar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {settingsOpen && (
                            <SettingsModal
                                isOpen={settingsOpen}
                                onClose={() => setSettingsOpen(false)}
                                settings={userSettingsApi?.settings ?? null}
                                userRole={user?.role || ''}
                                saving={Boolean(userSettingsApi?.saving)}
                                onOpenWhatsNew={async () => {
                                    setSettingsOpen(false)
                                    if (!pendingUpdate) {
                                        try {
                                            const res = await fetch(`/api/updates/unseen?limit=1`)
                                            const data = await res.json().catch(() => ({}))
                                            const updates = Array.isArray(data?.updates) ? data.updates : []
                                            const first = updates[0] || null
                                            if (first) {
                                                try {
                                                    await fetch('/api/updates/mark-prompted', {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify({ updateId: String(first.id) })
                                                    })
                                                } catch { }
                                                setPendingUpdate(first)
                                            }
                                        } catch { }
                                    }
                                    setWhatsNewOpen(true)
                                }}
                                onSave={async (next: unknown) => {
                                    try {
                                        const safeNext = next && typeof next === 'object' ? next : (userSettingsApi?.settings ?? {})
                                        const res = await userSettingsApi?.save?.(safeNext)
                                        if (!res?.ok) {
                                            await alert('Falha ao salvar: ' + (res?.error || ''))
                                            return false
                                        }
                                        return true
                                    } catch (e: unknown) {
                                        await alert('Falha ao salvar: ' + getErrorMessage(e))
                                        return false
                                    }
                                }}
                            />
                        )}

                        <OfflineSyncModal
                            open={offlineSyncOpen}
                            onClose={() => setOfflineSyncOpen(false)}
                            userId={user?.id}
                        />

                        <WelcomeFloatingWindow user={user as unknown as AdminUser} onClose={() => { }} />
                    </div>
                </TeamWorkoutProvider>
            </InAppNotificationsProvider>
        </>
    );
}

export default function IronTracksAppClient({ initialUser, initialProfile, initialWorkouts }: { initialUser?: unknown; initialProfile?: unknown; initialWorkouts?: unknown }) {
    const [isMounted, setIsMounted] = useState(false);
    useEffect(() => {
        const t = setTimeout(() => {
            setIsMounted(true);
        }, 0);
        return () => clearTimeout(t);
    }, []);
    if (!isMounted) return <LoadingScreen />;
    return (
        <DialogProvider>
            <ErrorReporterProvider>
                <ErrorBoundary>
                    <IronTracksApp initialUser={initialUser} initialProfile={initialProfile} initialWorkouts={initialWorkouts} />
                </ErrorBoundary>
                <GlobalDialog />
            </ErrorReporterProvider>
        </DialogProvider>
    );
}

'use client';

import React, { useState, useEffect, useCallback, Suspense, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

import { createClient } from '@/utils/supabase/client';
import { createWorkout } from '@/actions/workout-actions';

import LoadingScreen from '@/components/LoadingScreen';
const ActiveWorkout = dynamic(() => import('@/components/ActiveWorkout'), { ssr: false });
const RestTimerOverlay = dynamic(() => import('@/components/workout/RestTimerOverlay'), { ssr: false });
const IncomingInviteModal = dynamic(() => import('@/components/IncomingInviteModal'), { ssr: false, loading: () => null });
const InviteAcceptedModal = dynamic(() => import('@/components/InviteAcceptedModal'), { ssr: false, loading: () => null });
import { DashboardHeader } from './DashboardHeader';

// Heavy components — loaded only when needed
const AdminPanelV2 = dynamic(() => import('@/components/AdminPanelV2'), { ssr: false });
const ChatScreen = dynamic(() => import('@/components/ChatScreen'), { ssr: false });
const ChatListScreen = dynamic(() => import('@/components/ChatListScreen'), { ssr: false });
const ChatDirectScreen = dynamic(() => import('@/components/ChatDirectScreen'), { ssr: false });
const HistoryList = dynamic(() => import('@/components/HistoryList'), { ssr: false });
const CommunityClient = dynamic(() => import('@/app/(app)/community/CommunityClient'), { ssr: false });
const WorkoutReport = dynamic(() => import('@/components/WorkoutReport'), { ssr: false });
const ExerciseEditor = dynamic(() => import('@/components/ExerciseEditor'), { ssr: false });
const ProfilePage = dynamic(() => import('@/components/ProfilePage'), { ssr: false });
import { TeamWorkoutProvider } from '@/contexts/TeamWorkoutContext';
import { InAppNotificationsProvider, useInAppNotifications } from '@/contexts/InAppNotificationsContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import ErrorReporterProvider from '@/components/ErrorReporterProvider';
import { DialogProvider, useDialog } from '@/contexts/DialogContext';
import GlobalDialog from '@/components/GlobalDialog';
import { toMinutesRounded, calculateExerciseDuration } from '@/utils/pacing';
import { formatProgramWorkoutTitle } from '@/utils/workoutTitle'
import { BackButton } from '@/components/ui/BackButton';
import DashboardModals from './DashboardModals';
const StudentDashboard = dynamic(() => import('@/components/dashboard/StudentDashboard'), { ssr: false });
const WorkoutWizardModal = dynamic(() => import('@/components/dashboard/WorkoutWizardModal'), { ssr: false });
const ExpressWorkoutModal = dynamic(() => import('@/components/dashboard/ExpressWorkoutModal'), { ssr: false });
const SettingsModal = dynamic(() => import('@/components/SettingsModal'), { ssr: false });
import { useUserSettings } from '@/hooks/useUserSettings'
const WhatsNewModal = dynamic(() => import('@/components/WhatsNewModal'), { ssr: false })
import { generateWorkoutFromWizard } from '@/utils/workoutAutoGenerator'
const GuidedTour = dynamic(() => import('@/components/onboarding/GuidedTour'), { ssr: false })
import { getTourSteps } from '@/utils/tourSteps'
const OfflineSyncModal = dynamic(() => import('@/components/OfflineSyncModal'), { ssr: false })
const WorkoutRecoveryBanner = dynamic(() => import('@/components/WorkoutRecoveryBanner'), { ssr: false, loading: () => null })
import { useOfflineSync } from '@/hooks/useOfflineSync'
import { useVipAccess } from '@/hooks/useVipAccess'
import { useWorkoutStreak } from '@/hooks/useWorkoutStreak'
import { useGuidedTour } from '@/hooks/useGuidedTour'
import { usePresencePing } from '@/hooks/usePresencePing'
import { useProfileCompletion } from '@/hooks/useProfileCompletion'
import { useWhatsNew } from '@/hooks/useWhatsNew'
import { useUnreadBadges } from '@/hooks/useUnreadBadges'
import { useNativeAppSetup } from '@/hooks/useNativeAppSetup'
import { BiometricLock, useBiometricLock } from '@/components/BiometricLock'
import { useLocalPersistence } from '@/hooks/useLocalPersistence'
import { useAdminPanelState } from '@/hooks/useAdminPanelState'
import { useSignOut } from '@/hooks/useSignOut'
import { useViewNavigation } from '@/hooks/useViewNavigation'
import { useActiveSession } from '@/hooks/useActiveSession'
import { useWorkoutExport } from '@/hooks/useWorkoutExport'
import { useWorkoutCrud } from '@/hooks/useWorkoutCrud'
import { useWorkoutNormalize } from '@/hooks/useWorkoutNormalize'
import { useWorkoutFetch } from '@/hooks/useWorkoutFetch'
import { useSessionSync } from '@/hooks/useSessionSync'
import { useWorkoutEditor } from '@/hooks/useWorkoutEditor'
import { useBootstrap } from '@/hooks/useBootstrap'
import { useHealthKit } from '@/hooks/useHealthKit'
import { saveWorkoutToHealth } from '@/utils/native/irontracksNative'
import HealthWidget from '@/components/dashboard/HealthWidget'
import { useNativeTimerActions } from '@/hooks/useNativeTimerActions'
import { useAppEffects, isRecord, parseStartedAtMs } from '@/hooks/useAppEffects'
import { useAppHandlers } from '@/hooks/useAppHandlers'


import {
    DirectChatState,
    ActiveSession,
    ActiveWorkoutSession,
    Workout,
    UserRecord,
    TourState
} from '@/types/app';
import type { AdminUser } from '@/types/admin'
import { getErrorMessage } from '@/utils/errorMessage'
import { logError, logWarn, logInfo } from '@/lib/logger'
import SectionErrorBoundary from '@/components/SectionErrorBoundary'
import GymDetectToastWrapper from '@/components/dashboard/GymDetectToastWrapper'

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
    // ── Story Ring state: own story status (fed up from StoriesBar) ────────────
    const [hasActiveStory, setHasActiveStory] = useState(false)
    const handleMyStoryStateChange = useCallback((active: boolean) => setHasActiveStory(active), [])
    // ── Native iOS setup (notifications + biometric lock) ─────────────────────
    useNativeAppSetup(user?.id)
    const userName = String(user?.displayName || user?.email || '')

    // workouts, stats, studentFolders, fetchWorkouts, isFetching — extraídos para useWorkoutFetch
    // Streak stats — extracted to useWorkoutStreak hook (userId resolved after auth)
    const { streakStats, setStreakStats, streakLoading } = useWorkoutStreak(user?.id);
    const [currentWorkout, setCurrentWorkout] = useState<ActiveSession | null>(null);
    const [createWizardOpen, setCreateWizardOpen] = useState(false)
    const [expressWorkoutOpen, setExpressWorkoutOpen] = useState(false)
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
        handleTimerFinish,
    } = useActiveSession({ userId: user?.id })

    // Native timer controls (SKIP_REST, START_REST, ADD_30S) from push notifications
    // and Live Activity deeplinks — extracted to useNativeTimerActions hook
    useNativeTimerActions({ handleCloseTimer, setActiveSession })

    const [settingsOpen, setSettingsOpen] = useState(false)
    const [isCoach, setIsCoach] = useState(false);
    const initialRole = String(initialProfileObj?.role || '').toLowerCase()
    // VIP access & status — extracted to useVipAccess hook
    const { vipAccess, setVipAccess, vipStatus, setVipStatus } = useVipAccess({
        userId: user?.id,
        initialRole,
    })

    const [coachPending, setCoachPending] = useState(false);
    const [openStudent, setOpenStudent] = useState<Record<string, unknown> | null>(null);
    const [showNotifCenter, setShowNotifCenter] = useState(false);

    // Profile completion state — extracted to useProfileCompletion hook
    const userSettingsApi = useUserSettings(user?.id)
    const appleHealthEnabled = Boolean(userSettingsApi?.settings?.appleHealthSync)
    const { data: healthData, refetch: refetchHealth } = useHealthKit({
        enabled: appleHealthEnabled,
        userId: user?.id,
    })
    const {
        profileIncomplete,
        setProfileIncomplete,
        profileDraftName,
        setProfileDraftName,
        showCompleteProfile,
        setShowCompleteProfile,
    } = useProfileCompletion({
        userId: user?.id,
        displayName: user?.displayName ? String(user.displayName) : null,
        initialProfile,
        settings: userSettingsApi?.settings as import('@/schemas/settings').UserSettings | null | undefined,
    });

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
    const [showProgressPhotos, setShowProgressPhotos] = useState(false)

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


    // Sign-out + session clear — extracted to useSignOut hook
    const { safeSignOut, clearClientSessionState } = useSignOut({
        userId: user?.id,
        supabase,
        onClear: () => {
            setActiveSession(null)
            setView('dashboard')
        },
    })

    // Session sync (localStorage, server, realtime, ticker) — extracted to useSessionSync
    useSessionSync({
        userId: user?.id,
        supabase,
        inAppNotify,
        setActiveSession,
        setView: setView as (v: string | ((prev: string) => string)) => void,
        suppressForeignFinishToastUntilRef,
        activeSession,
        setSessionTicker,
        view,
    })


    // ── User init from server data ───────────────────────────────
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

    // Profile completion effect — handled by useProfileCompletion hook above

    // Bootstrap: fetch /api/dashboard/bootstrap and hydrate user, isCoach, workouts, stats
    // Extracted to useBootstrap hook for clarity.
    useBootstrap({ userId: user?.id, setUser, setIsCoach, setWorkouts, setStats })


    // fetchWorkouts, workouts, stats, studentFolders — handled by useWorkoutFetch hook above
    // streakStats fetch is handled by useWorkoutStreak hook above

    // ── Inline handlers — extracted to useAppHandlers ────────────
    const appHandlers = useAppHandlers({
        user,
        supabase,
        profileDraftName,
        setProfileIncomplete,
        setShowCompleteProfile,
        setCurrentWorkout,
        setView,
        clearClientSessionState,
        confirm,
        alert,
    })
    const { handleLogout, handleSaveProfile, openManualWorkoutEditor, handleAddStory: handleAddStoryAction } = appHandlers

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
    } = useWorkoutExport({ user, workouts, fetchWorkouts, alert: appHandlers.alertVoid, confirm })

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

    // Wrap handleFinishSession to save workout to Apple Health when enabled
    const handleFinishSessionWithHealth = useCallback(async (sessionData: unknown, showReport?: boolean) => {
        if (appleHealthEnabled) {
            try {
                const sd = sessionData && typeof sessionData === 'object'
                    ? (sessionData as Record<string, unknown>)
                    : null
                const startMs = typeof sd?.startedAt === 'number' ? sd.startedAt : 0
                const endMs = startMs > 0 ? Date.now() : 0
                if (startMs > 0 && endMs > startMs) {
                    await saveWorkoutToHealth({ startMs, endMs }).catch(() => { })
                    void refetchHealth()
                }
            } catch { /* health save is best-effort */ }
        }
        return handleFinishSession(sessionData, showReport)
    }, [appleHealthEnabled, handleFinishSession, refetchHealth])

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


    const {
        hideVipOnIos,
        openVipView,
        handleOpenHistory,
        handleOpenChat,
        handleOpenChatList,
        handleOpenGlobalChat,
        handleOpenNotifications,
        handleOpenTour,
    } = useViewNavigation({
        setView,
        setShowNotifCenter,
        setHasUnreadNotification,
        setTourOpen,
        logTourEvent,
        tourVersion: TOUR_VERSION,
    })

    // ── All standalone effects — extracted to useAppEffects ──────
    const { handleStartFromRestTimer } = useAppEffects({
        userId: user?.id,
        authLoading,
        view,
        setView,
        directChat,
        reportDataCurrent: reportData.current,
        activeSession,
        mainScrollRef,
        restoreAdminPanelIfNeeded,
        handleCloseTimer,
        handleUpdateSessionLog,
        setActiveSession,
        openVipView,
        supabase,
        clearClientSessionState,
    })

    const handleOpenProfile = useCallback(() => {
        setView('profile')
    }, [setView])

    useEffect(() => {
        if (!hideVipOnIos) return;
        if (view === 'vip') setView('dashboard');
    }, [hideVipOnIos, view]);

    // Show loading screen while auth resolves — UNLESS we already have cached workouts
    // to show. In that case, render the dashboard immediately (workouts will be
    // refreshed silently in the background once auth completes).
    const hasCachedWorkouts = Array.isArray(workouts) && workouts.length > 0
    const isDashboardReady = userSettingsApi.loaded; // streakLoading intentionally excluded (secondary data, must not block app)
    // Three-layer guard: (1) view is not 'active', (2) no active session exists yet,
    // (3) normal auth + settings loading conditions.
    // This guarantees the LoadingScreen overlay NEVER covers an active workout.
    const isAppLoading = view !== 'active' && !activeSession && (
        (authLoading && !hasCachedWorkouts) || (!user?.id && !hasCachedWorkouts) || !isDashboardReady
    );

    const currentWorkoutId = activeSession?.workout?.id;
    let nextWorkout = null;
    if (currentWorkoutId && Array.isArray(workouts) && workouts.length > 0) {
        const index = workouts.findIndex(w => w.id === currentWorkoutId);
        if (index !== -1 && index + 1 < workouts.length) {
            nextWorkout = workouts[index + 1];
        }
    }

    const isHeaderVisible = view !== 'active' && view !== 'report';

    // Loading overlay starts visible (opacity 1) on both SSR and client.
    // Once isAppLoading becomes false on the client, it fades out.
    // No `mounted` gate needed — SSR always shows loading, client fades it away.
    const loadingDone = !isAppLoading;

    // Notify the root-layout AppLoadingOverlay that the app is ready.
    useEffect(() => {
        if (!isAppLoading) {
            try { window.dispatchEvent(new CustomEvent('irontracks:app:ready')) } catch { }
        }
    }, [isAppLoading])

    return (
        <>
            {/* Persistent loading overlay — always rendered, starts visible.
                Fades out via CSS transition once the app is ready. */}
            <div
                aria-hidden
                className={loadingDone ? 'loading-overlay-done' : undefined}
                style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 9999,
                    opacity: loadingDone ? 0 : 1,
                    pointerEvents: loadingDone ? 'none' : 'auto',
                    transition: loadingDone ? 'opacity 0.3s ease-out' : 'none',
                }}
            >
                <LoadingScreen />
            </div>
            {/* Biometric lock — shown on top of everything when app resumes from background */}
            {isLocked && user?.id ? (
                <BiometricLock userName={userName} onUnlocked={unlock} />
            ) : null}
            <InAppNotificationsProvider
                userId={user?.id || undefined}
                settings={userSettingsApi?.settings ?? null}
                onOpenMessages={handleOpenChat}
                onOpenNotifications={handleOpenNotifications}
            >
                <InAppNotifyBinder bind={bindInAppNotify} />
                <TeamWorkoutProvider user={user?.id ? { id: String(user.id), email: user?.email ? String(user.email) : null } : null} settings={userSettingsApi?.settings ?? null} onStartSession={handleStartSession}>
                    <div className="w-full bg-neutral-900 min-h-screen relative flex flex-col overflow-hidden" suppressHydrationWarning>
                        <IncomingInviteModal onStartSession={handleStartSession} />
                        <InviteAcceptedModal />
                        {/* GPS: Auto-detect gym toast */}
                        {view === 'dashboard' && <GymDetectToastWrapper userId={user?.id} onStartWorkout={() => setCreateWizardOpen(true)} />}
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
                                setTourBoot((prev: TourState) => ({ ...prev, completed: true, skipped: false }))
                                try { writeLocalTourDismissal(user?.id, 'completed') } catch { }
                                const res = await upsertTourFlags({ tour_completed_at: new Date().toISOString(), tour_skipped_at: null })
                                if (!res?.ok) {
                                    logWarn('warn', 'Falha ao persistir flags do tour (completed). Mantendo fallback local.', res)
                                }
                                await logTourEvent('tour_completed', { version: TOUR_VERSION })
                            }}
                            onSkip={async () => {
                                setTourOpen(false)
                                setTourBoot((prev: TourState) => ({ ...prev, completed: false, skipped: true }))
                                try { writeLocalTourDismissal(user?.id, 'skipped') } catch { }
                                const res = await upsertTourFlags({ tour_skipped_at: new Date().toISOString(), tour_completed_at: null })
                                if (!res?.ok) {
                                    logWarn('warn', 'Falha ao persistir flags do tour (skipped). Mantendo fallback local.', res)
                                }
                                await logTourEvent('tour_skipped', { version: TOUR_VERSION })
                            }}
                            onCancel={async () => {
                                setTourOpen(false)
                                setTourBoot((prev: TourState) => ({ ...prev, completed: false, skipped: true }))
                                try { writeLocalTourDismissal(user?.id, 'skipped') } catch { }
                                const res = await upsertTourFlags({ tour_skipped_at: new Date().toISOString(), tour_completed_at: null })
                                if (!res?.ok) {
                                    logWarn('warn', 'Falha ao persistir flags do tour (cancelled). Mantendo fallback local.', res)
                                }
                                await logTourEvent('tour_cancelled', { version: TOUR_VERSION })
                            }}
                        />

                        {/* Header — extracted to DashboardHeader */}
                        <DashboardHeader
                            isCoach={isCoach}
                            view={view}
                            user={user as import('@/types/admin').AdminUser}
                            hasUnreadChat={hasUnreadChat}
                            hasUnreadNotification={hasUnreadNotification}
                            hasActiveStory={hasActiveStory}
                            onAddStory={handleAddStoryAction}
                            hideVipOnIos={hideVipOnIos}
                            vipAccess={vipAccess as { hasVip?: boolean } | null}
                            syncState={syncState as { pending?: number; failed?: number; online?: boolean; syncing?: boolean } | null}
                            userSettings={userSettingsApi?.settings && typeof userSettingsApi.settings === 'object' ? (userSettingsApi.settings as Record<string, unknown>) : null}
                            isHeaderVisible={isHeaderVisible}
                            coachPending={coachPending}
                            onGoHome={() => setView('dashboard')}
                            onOpenVip={openVipView}
                            onOpenAdmin={() => {
                                if (typeof window !== 'undefined') { const url = new URL(window.location.href); url.searchParams.delete('view'); window.history.replaceState({}, '', url) }
                                const tab = (() => { try { const url = new URL(window.location.href); const c = String(url.searchParams.get('tab') || '').trim(); if (c) return c } catch { } try { const s = String(sessionStorage.getItem('irontracks_admin_panel_tab') || '').trim(); if (s) return s } catch { } return 'dashboard' })()
                                openAdminPanel(tab); setView('admin')
                            }}
                            onOpenChatList={handleOpenChatList}
                            onOpenGlobalChat={handleOpenGlobalChat}
                            onOpenHistory={handleOpenHistory}
                            onOpenNotifications={handleOpenNotifications}
                            onOpenSchedule={() => router.push('/dashboard/schedule')}
                            onOpenWallet={() => openVipView()}
                            onOpenSettings={() => setSettingsOpen(true)}
                            onOpenTour={handleOpenTour}
                            onOpenProfile={handleOpenProfile}
                            onLogout={handleLogout}
                            onOfflineSyncOpen={() => setOfflineSyncOpen(true)}
                            onAcceptCoach={async () => { try { const r = await fetch('/api/teachers/accept', { method: 'POST' }); const j = await r.json(); if (j?.ok) { setCoachPending(false); await alert('Conta ativada!') } else { await alert('Falha ao ativar: ' + (j?.error || '')) } } catch (e) { const m = e instanceof Error ? e.message : String(e); await alert('Erro: ' + m) } }}
                        />

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
                              <>
                                {view === 'dashboard' && <WorkoutRecoveryBanner userId={String(user?.id || initialUserObj?.id || '')} />}
                                {view === 'dashboard' && appleHealthEnabled && <HealthWidget data={healthData} />}
                                <StudentDashboard
                                    workouts={Array.isArray(workouts) ? workouts : []}
                                    profileIncomplete={Boolean(profileIncomplete)}
                                    onOpenCompleteProfile={() => setView('profile')}
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
                                                user={user as AdminUser}
                                                locked={!vipAccess?.hasVip}
                                                onOpenWorkoutEditor={(w: unknown) => handleEditWorkout(w)}
                                                onOpenVipTab={() => openVipView()}
                                                onStartSession={(w: unknown) => handleStartSession(w)}
                                                onOpenWizard={() => setCreateWizardOpen(true)}
                                                onOpenHistory={handleOpenHistory}
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
                                    onExpressWorkout={() => setExpressWorkoutOpen(true)}
                                    onQuickView={(w) => setQuickViewWorkout(w)}
                                    onStartSession={(w) => handleStartSession(w)}
                                    onRestoreWorkout={(w: unknown) => handleRestoreWorkout(w)}
                                    onShareWorkout={(w: unknown) => handleShareWorkout(w)}
                                    onEditWorkout={(w: unknown) => handleEditWorkout(w)}
                                    onDeleteWorkout={(id: unknown, title: unknown) => {
                                        if (id) handleDeleteWorkout(String(id), String(title || ''))
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
                                    onOpenIronScanner={() => {
                                        try { openManualWorkoutEditor() } catch { }
                                    }}
                                    onMyStoryStateChange={handleMyStoryStateChange}
                                    onAddStory={handleAddStoryAction}
                                />
                              </>
                            )}

                            <ExpressWorkoutModal
                                isOpen={expressWorkoutOpen}
                                onClose={() => setExpressWorkoutOpen(false)}
                                onUseDraft={(draft) => {
                                    try {
                                        const title = String(draft?.title || '').trim() || 'Treino Express'
                                        const exercises = (Array.isArray(draft?.exercises) ? draft.exercises : []) as import('@/types/app').Exercise[]
                                        setCurrentWorkout({ title, exercises })
                                        setView('edit')
                                    } finally {
                                        setExpressWorkoutOpen(false)
                                    }
                                }}
                            />

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
                                        } catch (e) { logError('IronTracksApp.refetchAfterSaveDrafts', e) }
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
                                <SectionErrorBoundary section="Treino Ativo" fullScreen onReset={() => setView('dashboard')}>
                                    <ActiveWorkout
                                        session={activeSession as Record<string, unknown>}
                                        user={user as AdminUser}
                                        settings={userSettingsApi?.settings ?? null}
                                        onUpdateLog={handleUpdateSessionLog}
                                        onFinish={handleFinishSessionWithHealth}
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
                                </SectionErrorBoundary>
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
                                        user={user as AdminUser}
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
                                            user={user as AdminUser}
                                            isVip={vipAccess?.hasVip}
                                            settings={userSettingsApi?.settings ?? null}
                                            onUpgrade={() => openVipView()}
                                            onClose={() => setView(reportBackView || 'dashboard')}
                                        />
                                    </SectionErrorBoundary>
                                </div>
                            )}

                            {/* Profile Page */}
                            {view === 'profile' && (
                                <div className="fixed inset-0 z-[1200] bg-neutral-950 overflow-y-auto">
                                    <SectionErrorBoundary section="Perfil" fullScreen onReset={() => setView('dashboard')}>
                                        <ProfilePage
                                            settings={userSettingsApi?.settings as import('@/schemas/settings').UserSettings | null}
                                            displayName={String(user?.displayName || user?.email || 'Atleta')}
                                            onBack={() => setView('dashboard')}
                                            onSave={async (next) => {
                                                try {
                                                    const current = userSettingsApi?.settings && typeof userSettingsApi.settings === 'object'
                                                        ? (userSettingsApi.settings as Record<string, unknown>)
                                                        : {}
                                                    const merged = { ...current, ...next }
                                                    const saveFn = userSettingsApi?.save as ((v: unknown) => Promise<{ ok: boolean; error?: string }>) | undefined
                                                    const res = await saveFn?.(merged)
                                                    return !!res?.ok
                                                } catch (e) { logError('IronTracksApp.saveSettings', e); return false }
                                            }}
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
                                        <ChatScreen user={user as AdminUser} onClose={() => setView('dashboard')} />
                                    </SectionErrorBoundary>
                                </div>
                            )}

                            {view === 'globalChat' && (
                                <div className="absolute inset-0 z-50 bg-neutral-900">
                                    <SectionErrorBoundary section="Chat Global" fullScreen onReset={() => setView('dashboard')}>
                                        <ChatScreen user={user as AdminUser} onClose={() => setView('dashboard')} />
                                    </SectionErrorBoundary>
                                </div>
                            )}

                            {view === 'chatList' && (
                                <div className="absolute inset-0 z-50 bg-neutral-900">
                                    <ChatListScreen
                                        user={user as AdminUser}
                                        onClose={() => setView('dashboard')}
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
                                    <SectionErrorBoundary section="Chat Direto" fullScreen onReset={() => setView('chatList')}>
                                        <ChatDirectScreen
                                            user={user as AdminUser}
                                            targetUser={directChat}
                                            otherUserId={String(directChat.other_user_id ?? directChat.userId ?? '')}
                                            otherUserName={String(directChat.other_user_name ?? directChat.displayName ?? '')}
                                            otherUserPhoto={directChat.other_user_photo ?? directChat.photoUrl ?? null}
                                            onClose={handleOpenChatList}
                                        />
                                    </SectionErrorBoundary>
                                </div>
                            )}

                            {view === 'admin' && (
                                <div className="fixed inset-0 z-[60]">
                                    <SectionErrorBoundary section="Painel Admin" fullScreen onReset={() => setView('dashboard')}>
                                        <AdminPanelV2 user={user as AdminUser} onClose={() => setView('dashboard')} />
                                    </SectionErrorBoundary>
                                </div>
                            )}
                        </div>

                        {/* Modals & Overlays — extracted to DashboardModals */}
                        <DashboardModals
                            user={user as Record<string, unknown> | null}
                            showCompleteProfile={showCompleteProfile}
                            setShowCompleteProfile={setShowCompleteProfile}
                            profileDraftName={profileDraftName}
                            setProfileDraftName={setProfileDraftName}
                            savingProfile={appHandlers.savingProfile}
                            handleSaveProfile={handleSaveProfile}
                            showImportModal={showImportModal}
                            setShowImportModal={setShowImportModal}
                            importCode={importCode}
                            setImportCode={setImportCode}
                            handleImportWorkout={handleImportWorkout}
                            showJsonImportModal={showJsonImportModal}
                            setShowJsonImportModal={setShowJsonImportModal}
                            handleJsonUpload={handleJsonUpload}
                            shareCode={shareCode}
                            setShareCode={setShareCode}
                            quickViewWorkout={quickViewWorkout as Record<string, unknown> | null}
                            setQuickViewWorkout={setQuickViewWorkout}
                            handleStartSession={handleStartSession}
                            showNotifCenter={showNotifCenter}
                            setShowNotifCenter={setShowNotifCenter}
                            activeSession={activeSession}
                            handleCloseTimer={handleCloseTimer}
                            handleStartFromRestTimer={handleStartFromRestTimer}
                            handleTimerFinish={handleTimerFinish}
                            view={view}
                            setView={setView}
                            sessionTicker={sessionTicker}
                            parseStartedAtMs={parseStartedAtMs}
                            calculateExerciseDuration={calculateExerciseDuration}
                            toMinutesRounded={toMinutesRounded}
                            showAdminPanel={showAdminPanel}
                            closeAdminPanel={closeAdminPanel}
                            whatsNewOpen={whatsNewOpen}
                            setWhatsNewOpen={setWhatsNewOpen}
                            pendingUpdate={pendingUpdate as Record<string, unknown> | null}
                            setPendingUpdate={setPendingUpdate as (v: Record<string, unknown> | null) => void}
                            closeWhatsNew={closeWhatsNew}
                            preCheckinOpen={preCheckinOpen}
                            setPreCheckinOpen={setPreCheckinOpen}
                            preCheckinWorkout={preCheckinWorkout as Record<string, unknown> | null}
                            preCheckinDraft={preCheckinDraft as Record<string, unknown> | null}
                            setPreCheckinDraft={setPreCheckinDraft as unknown as (v: Record<string, unknown> | null) => void}
                            preCheckinResolveRef={preCheckinResolveRef}
                            settingsOpen={settingsOpen}
                            setSettingsOpen={setSettingsOpen}
                            userSettingsApi={userSettingsApi as Record<string, unknown> | null}
                            offlineSyncOpen={offlineSyncOpen}
                            setOfflineSyncOpen={setOfflineSyncOpen}
                            openStudent={openStudent}
                            setOpenStudent={setOpenStudent as (v: unknown) => void}
                            showExportModal={showExportModal}
                            setShowExportModal={setShowExportModal}
                            exportWorkout={exportWorkout}
                            handleExportPdf={handleExportPdf}
                            handleExportJson={handleExportJson}
                            vipAccess={vipAccess as unknown as Record<string, unknown> | null}
                            openVipView={openVipView}
                            showProgressPhotos={showProgressPhotos}
                            setShowProgressPhotos={setShowProgressPhotos}
                            alert={alert}
                        />
                    </div>
                </TeamWorkoutProvider>
            </InAppNotificationsProvider>
        </>
    );
}

export default function IronTracksAppClient({ initialUser, initialProfile, initialWorkouts }: { initialUser?: unknown; initialProfile?: unknown; initialWorkouts?: unknown }) {
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


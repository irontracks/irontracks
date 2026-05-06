'use client';

import React, { useState, useEffect, useCallback, useMemo, Suspense, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

import { createClient } from '@/utils/supabase/client';

import LoadingScreen from '@/components/LoadingScreen';
const ActiveWorkout = dynamic(() => import('@/components/ActiveWorkout'), { ssr: false });
const RestTimerOverlay = dynamic(() => import('@/components/workout/RestTimerOverlay'), { ssr: false });
const IncomingInviteModal = dynamic(() => import('@/components/IncomingInviteModal'), { ssr: false, loading: () => null });
const InviteAcceptedModal = dynamic(() => import('@/components/InviteAcceptedModal'), { ssr: false, loading: () => null });
import { DashboardHeader } from './DashboardHeader';

// Heavy components — loaded only when needed
const AdminPanelV2 = dynamic(() => import('@/components/AdminPanelV2'), { ssr: false });
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
import DashboardModals from './DashboardModals';
const StudentDashboard = dynamic(() => import('@/components/dashboard/StudentDashboard'), { ssr: false });
const WorkoutWizardModal = dynamic(() => import('@/components/dashboard/WorkoutWizardModal'), { ssr: false });
const ExpressWorkoutModal = dynamic(() => import('@/components/dashboard/ExpressWorkoutModal'), { ssr: false });
const SettingsModal = dynamic(() => import('@/components/SettingsModal'), { ssr: false });
import { useUserSettings } from '@/hooks/useUserSettings'
const WhatsNewModal = dynamic(() => import('@/components/WhatsNewModal'), { ssr: false })
const GuidedTour = dynamic(() => import('@/components/onboarding/GuidedTour'), { ssr: false })
const NutritionOverlay = dynamic(() => import('@/components/dashboard/nutrition/NutritionOverlay'), { ssr: false })
import { getTourSteps } from '@/utils/tourSteps'
const OfflineSyncModal = dynamic(() => import('@/components/OfflineSyncModal'), { ssr: false })
const WorkoutRecoveryBanner = dynamic(() => import('@/components/WorkoutRecoveryBanner'), { ssr: false, loading: () => null })
import { useOfflineSync } from '@/hooks/useOfflineSync'
import { useVipAccess } from '@/hooks/useVipAccess'
import { useWorkoutStreak } from '@/hooks/useWorkoutStreak'
import { useGuidedTour } from '@/hooks/useGuidedTour'
import { usePresencePing } from '@/hooks/usePresencePing'
import { useUtmAcquisition } from '@/hooks/useUtmAcquisition'
import { useProfileCompletion } from '@/hooks/useProfileCompletion'
import { useWhatsNew } from '@/hooks/useWhatsNew'
import { useSeasonalCampaign } from '@/hooks/useSeasonalCampaign'
import { useUnreadBadges } from '@/hooks/useUnreadBadges'
import { useNativeAppSetup } from '@/hooks/useNativeAppSetup'
import { useNativeIntentRouter } from '@/hooks/useNativeIntentRouter'
import { useBackgroundRefresh } from '@/hooks/useBackgroundRefresh'
import { useSiriWorkoutSuggestions } from '@/hooks/useSiriWorkoutSuggestions'
import { useLiveActivityPushSync } from '@/hooks/useLiveActivityPushSync'
import { useGymGeofence } from '@/hooks/useGymGeofence'
import { usePushNotifications } from '@/hooks/usePushNotifications'
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
import { saveWorkoutToHealth, endWorkoutLiveActivity } from '@/utils/native/irontracksNative'
import { isIosNative } from '@/utils/platform'
import { useNativeTimerActions } from '@/hooks/useNativeTimerActions'
import { useAppEffects, isRecord, parseStartedAtMs } from '@/hooks/useAppEffects'
import { useAppHandlers } from '@/hooks/useAppHandlers'
import { useWorkoutWizard } from '@/hooks/useWorkoutWizard'
import WatchSyncProvider from '@/components/WatchSyncProvider'
import type { WatchDashboard, WatchGym, WatchWorkout } from '@/hooks/useWatchBridge'


import {
    DirectChatState,
    ActiveSession,
    ActiveWorkoutSession,
    Exercise,
    Workout,
    UserRecord,
} from '@/types/app';
import type { AdminUser } from '@/types/admin'
import { logError } from '@/lib/logger'
import SectionErrorBoundary from '@/components/SectionErrorBoundary'
const HealthWidget = dynamic(() => import('@/components/dashboard/HealthWidget'), { ssr: false })
const GymDetectToastWrapper = dynamic(() => import('@/components/dashboard/GymDetectToastWrapper'), { ssr: false })

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
    usePushNotifications(user?.id)

    // ── Siri / Shortcuts intents (App Intents) ────────────────────────────────
    // Voice triggers like "Iniciar treino no IronTracks" route here. Every
    // intent currently brings the user back to the dashboard — that's where
    // workouts, streak and history live. Future deep links can branch here.
    useNativeIntentRouter({
        onAction: useCallback((_action) => {
            setView('dashboard')
        }, []),
    })

    // ── BGTaskScheduler — opportunistic offline-queue flush + widget refresh ──
    useBackgroundRefresh()

    // ── Live Activity push tokens — forwarded to backend for APNs updates ─────
    useLiveActivityPushSync()
    const userName = String(user?.displayName || user?.email || '')

    // workouts, stats, studentFolders, fetchWorkouts, isFetching — extraídos para useWorkoutFetch
    // Streak stats — extracted to useWorkoutStreak hook (userId resolved after auth)
    const { streakStats, setStreakStats, streakLoading } = useWorkoutStreak(user?.id);

    // ── Apple Watch: user gyms for CheckinView ────────────────────────────────
    const [watchGyms, setWatchGyms] = useState<WatchGym[]>([])
    useEffect(() => {
        if (!user?.id) return
        fetch('/api/gps/gyms')
            .then((r) => r.json() as Promise<{ ok: boolean; gyms?: Array<{ id: string; name: string; latitude: number; longitude: number; radius_meters: number }> }>)
            .then((data) => {
                if (!data.ok || !Array.isArray(data.gyms)) return
                setWatchGyms(data.gyms.map((g) => ({
                    id: g.id,
                    name: g.name,
                    latitude: g.latitude,
                    longitude: g.longitude,
                    radiusMeters: g.radius_meters,
                })))
            })
            .catch(() => {})
    }, [user?.id])
    const [currentWorkout, setCurrentWorkout] = useState<ActiveSession | null>(null);
    const [createWizardOpen, setCreateWizardOpen] = useState(false)
    const [expressWorkoutOpen, setExpressWorkoutOpen] = useState(false)
    const [nutritionOpen, setNutritionOpen] = useState(false)
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

    // ── Gym geofence (Feature 6) ──
    // Reads favourite gym from user_settings.preferences and (re)registers
    // the iOS CLCircularRegion when settings change. Local notification handles
    // entry events when the app is killed.
    const favoriteGym = useMemo(() => {
        const s = userSettingsApi?.settings as Record<string, unknown> | undefined
        if (!s) return null
        const enabled = Boolean(s.gymGeofenceEnabled)
        const lat = typeof s.favoriteGymLat === 'number' ? s.favoriteGymLat : null
        const lng = typeof s.favoriteGymLng === 'number' ? s.favoriteGymLng : null
        const name = typeof s.favoriteGymName === 'string' ? s.favoriteGymName : ''
        if (!enabled || lat == null || lng == null || !name) return null
        return { name, lat, lng }
    }, [userSettingsApi?.settings])
    useGymGeofence({
        favoriteGym,
        enabled: favoriteGym !== null,
        onEntered: useCallback((_gymName: string) => {
            // App is in foreground — bring user to dashboard so the start CTA
            // is one tap away. (Local notif handles the killed-app case.)
            setView('dashboard')
        }, []),
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

    // ── Stale Live Activity cleanup ───────────────────────────────────────────
    // When the app loads without an active workout (e.g. after a dev build was
    // force-killed without calling endWorkoutLiveActivity), any orphaned Live
    // Activity is still visible on the lock screen. End it as soon as we know
    // the app is ready and there is no ongoing session.
    const staleActivityCleanedRef = useRef(false)
    useEffect(() => {
        if (!isIosNative()) return
        if (!userSettingsApi.loaded) return
        if (staleActivityCleanedRef.current) return
        staleActivityCleanedRef.current = true
        if (!activeSession) {
            endWorkoutLiveActivity().catch(() => {})
        }
    }, [userSettingsApi.loaded, activeSession])

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

    // ── Siri Shortcuts suggestions (Feature 19) ──
    // Pushes the 10 most relevant workouts into the iOS AppEntity cache so
    // "Hey Siri, iniciar Treino A no IronTracks" works with their actual names.
    const siriWorkouts = useMemo(() => {
        const list = Array.isArray(workouts) ? (workouts as Array<Record<string, unknown>>) : []
        return list
            .slice(0, 10)
            .map((w) => ({
                id: String(w?.id ?? ''),
                name: String(w?.title ?? w?.name ?? '').trim(),
            }))
            .filter((w) => w.id && w.name)
    }, [workouts])
    useSiriWorkoutSuggestions(siriWorkouts)

    // refreshSyncState, runFlushQueue, syncState effects — handled by useOfflineSync hook above

    // Tour state + logic — extracted to useGuidedTour hook
    const {
        tourOpen,
        setTourOpen,
        TOUR_VERSION,
        logTourEvent,
        handleTourComplete,
        handleTourDismiss,
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

    // First-touch UTM attribution — captures utm_* on first visit
    // and POSTs them once the user is authenticated.
    useUtmAcquisition(user?.id);

    // What's New modal — extracted to useWhatsNew hook
    const { whatsNewOpen, setWhatsNewOpen, pendingUpdate, setPendingUpdate, closeWhatsNew } = useWhatsNew({
        userId: user?.id,
        userSettingsApi,
    })

    // Seasonal campaigns (Mother's Day, Black Friday, Christmas, …)
    const mothersDay = useSeasonalCampaign({
        id: 'mothersDay2026',
        activeFrom: '2026-05-07',
        activeUntil: '2026-05-12',
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
    useBootstrap({
      userId: user?.id,
      initialWorkoutsCount: Array.isArray(initialWorkouts) ? (initialWorkouts as unknown[]).length : 0,
      setUser, setIsCoach, setWorkouts, setStats,
    })


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
    const programTitleStartDay = userSettingsApi?.settings && typeof userSettingsApi.settings === 'object'
        ? Number((userSettingsApi.settings as Record<string, unknown>).programTitleStartDay) || undefined
        : undefined
    const {
        handleNormalizeAiWorkoutTitles,
        handleApplyTitleRule,
        handleNormalizeExercises,
    } = useWorkoutNormalize({
        workouts,
        programTitleStartDay,
        fetchWorkouts,
        alert,
        confirm,
    })

    // Workout wizard generate/save/useDraft — extracted to useWorkoutWizard
    const {
        handleWizardGenerate,
        handleWizardSaveDrafts,
        handleWizardUseDraft,
    } = useWorkoutWizard({
        setCurrentWorkout: setCurrentWorkout as (v: ActiveSession | null) => void,
        setView,
        setCreateWizardOpen,
        fetchWorkouts,
        alert,
        programTitleStartDay: programTitleStartDay ?? null,
    })

    const {
        hideVipOnIos,
        openVipView,
        handleOpenHistory,
        handleOpenChatList,
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

    const handleOpenAdmin = useCallback(() => {
        if (typeof window !== 'undefined') {
            const url = new URL(window.location.href)
            url.searchParams.delete('view')
            window.history.replaceState({}, '', url)
        }
        const tab = (() => {
            try { const url = new URL(window.location.href); const c = String(url.searchParams.get('tab') || '').trim(); if (c) return c } catch { /* ignore */ }
            try { const s = String(sessionStorage.getItem('irontracks_admin_panel_tab') || '').trim(); if (s) return s } catch { /* ignore */ }
            return 'dashboard'
        })()
        openAdminPanel(tab)
        setView('admin')
    }, [openAdminPanel, setView])

    const handleAcceptCoach = useCallback(async () => {
        try {
            const r = await fetch('/api/teachers/accept', { method: 'POST' })
            const j = await r.json() as Record<string, unknown>
            if (j?.ok) { setCoachPending(false); await alert('Conta ativada!') }
            else { await alert('Falha ao ativar: ' + (j?.error || '')) }
        } catch (e) {
            const m = e instanceof Error ? e.message : String(e)
            await alert('Erro: ' + m)
        }
    }, [alert])

    const handleSelectChannel = useCallback((c: unknown) => {
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
    }, [setView])

    const handleExpressUseDraft = useCallback((draft: { title: string; exercises: unknown[] }) => {
        try {
            const title = String(draft?.title || '').trim() || 'Treino Express'
            const exercises = (Array.isArray(draft?.exercises) ? draft.exercises : []) as Exercise[]
            setCurrentWorkout({ title, exercises } as unknown as ActiveSession)
            setView('edit')
        } finally {
            setExpressWorkoutOpen(false)
        }
    }, [setCurrentWorkout, setView])

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

    // ── Apple Watch: dashboard payload ────────────────────────────────────────
    const watchNextWorkout = useMemo((): WatchWorkout | null => {
        const list = Array.isArray(workouts) ? (workouts as Array<Record<string, unknown>>) : []
        if (!list.length) return null
        const w = list[0]
        const exercises = Array.isArray(w?.exercises) ? (w.exercises as Array<Record<string, unknown>>) : []
        return {
            id: String(w?.id ?? ''),
            name: String(w?.title ?? w?.name ?? 'Treino'),
            dayLabel: '',
            estimatedMinutes: Math.round(exercises.length * 4),
            scheduledAt: null,
            exercises: exercises.slice(0, 12).map((ex, i) => ({
                id: String(ex?.id ?? ex?._itx_exKey ?? `ex-${i}`),
                name: String(ex?.name ?? ''),
                sets: Number(ex?.sets ?? 3) || 3,
                reps: String(ex?.reps ?? '10'),
                restSeconds: Number(ex?.restTime ?? ex?.rest_time ?? 60) || 60,
                weightSuggestion: ex?.weightSuggestion ? String(ex.weightSuggestion) : null,
                muscleGroup: ex?.muscleGroup ? String(ex.muscleGroup) : null,
                notes: ex?.notes ? String(ex.notes) : null,
            })),
        }
    }, [workouts])

    const watchDashboard = useMemo((): WatchDashboard => ({
        streakDays: streakStats?.currentStreak ?? 0,
        weekWorkouts: streakStats?.weekWorkouts ?? 0,
        weekGoal: 5,
        nextWorkout: watchNextWorkout,
        userName: String(user?.displayName ?? user?.email ?? ''),
    }), [streakStats, watchNextWorkout, user?.displayName, user?.email])

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
                onOpenNotifications={handleOpenNotifications}
            >
                <InAppNotifyBinder bind={bindInAppNotify} />
                {/* Apple Watch sync — headless, no visual output */}
                <WatchSyncProvider
                    dashboard={watchDashboard}
                    nearestGyms={watchGyms}
                    onRefresh={() => { fetchWorkouts().catch(() => {}) }}
                />
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
                            onEvent={logTourEvent}
                            onComplete={handleTourComplete}
                            onSkip={() => handleTourDismiss('skipped')}
                            onCancel={() => handleTourDismiss('cancelled')}
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
                            onOpenAdmin={handleOpenAdmin}
                            onOpenChatList={handleOpenChatList}
                            onOpenHistory={handleOpenHistory}
                            onOpenNotifications={handleOpenNotifications}
                            onOpenSchedule={() => router.push('/dashboard/schedule')}
                            onOpenWallet={() => { openAdminPanel('billing'); setView('admin'); }}
                            onOpenSettings={() => setSettingsOpen(true)}
                            onOpenTour={handleOpenTour}
                            onOpenProfile={handleOpenProfile}
                            onLogout={handleLogout}
                            onOfflineSyncOpen={() => setOfflineSyncOpen(true)}
                            onAcceptCoach={handleAcceptCoach}
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
                                    onChangeView={(next: string) => {
                                        // Close the nutrition overlay before switching views — it's a
                                        // full-screen overlay, so leaving it open would hide the tab the
                                        // user just clicked AND keep the Nutrição indicator stuck on.
                                        setNutritionOpen(false)
                                        setView(next)
                                    }}
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
                                                onOpenNutrition={() => setNutritionOpen(true)}
                                            />
                                    }
                                    vipLabel="VIP"
                                    vipLocked={hideVipOnIos ? true : !vipAccess?.hasVip}
                                    vipEnabled={!hideVipOnIos}
                                    showNutritionTab={!!vipAccess?.hasVip}
                                    nutritionActive={nutritionOpen}
                                    onOpenNutrition={() => setNutritionOpen(true)}
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
                                onUseDraft={handleExpressUseDraft}
                            />

                            {nutritionOpen ? (
                                <NutritionOverlay
                                    onClose={() => setNutritionOpen(false)}
                                    canViewMacros={!!(vipStatus?.limits as Record<string, unknown> | undefined)?.nutrition_macros}
                                />
                            ) : null}

                            <WorkoutWizardModal
                                isOpen={createWizardOpen}
                                onClose={() => setCreateWizardOpen(false)}
                                onManual={() => openManualWorkoutEditor()}
                                onGenerate={handleWizardGenerate}
                                onSaveDrafts={handleWizardSaveDrafts}
                                onUseDraft={handleWizardUseDraft}
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
                                            onSaveToTemplate={handlePersistWorkoutTemplateFromSession}
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
                            {/* Export modal + OpenStudent modal rendered by DashboardModals */}

                            {view === 'chatList' && (
                                <div className="absolute inset-0 z-50 bg-neutral-900">
                                    <ChatListScreen
                                        user={user as AdminUser}
                                        onClose={() => setView('dashboard')}
                                        onSelectChannel={handleSelectChannel}
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
                            mothersDayOpen={mothersDay.isOpen}
                            closeMothersDay={mothersDay.close}
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


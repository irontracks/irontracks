'use client';

import React, { useState, useEffect, useCallback, useMemo, Suspense, useRef } from 'react';
import { useRouter, usePathname, useParams } from 'next/navigation';
import dynamic from 'next/dynamic';

import { createClient } from '@/utils/supabase/client';

import LoadingScreen from '@/components/LoadingScreen';
import CommunityLoading from '@/app/(app)/community/loading';
const ActiveWorkout = dynamic(() => import('@/components/ActiveWorkout'), { ssr: false });
const RestTimerOverlay = dynamic(() => import('@/components/workout/RestTimerOverlay'), { ssr: false });
const TeacherControlHost = dynamic(() => import('@/components/teacher/TeacherControlHost'), { ssr: false });
const IncomingInviteModal = dynamic(() => import('@/components/IncomingInviteModal'), { ssr: false, loading: () => null });
const InviteAcceptedModal = dynamic(() => import('@/components/InviteAcceptedModal'), { ssr: false, loading: () => null });
import { DashboardHeader } from './DashboardHeader';

// Heavy components — loaded only when needed
const CardioGPSPanel = dynamic(() => import('@/components/workout/CardioGPSPanel'), { ssr: false })
const AdminPanelV2 = dynamic(() => import('@/components/AdminPanelV2'), { ssr: false });
const ChatListScreen = dynamic(() => import('@/components/ChatListScreen'), { ssr: false });
const ChatDirectScreen = dynamic(() => import('@/components/ChatDirectScreen'), { ssr: false });
const HistoryList = dynamic(() => import('@/components/HistoryList'), { ssr: false });
// perf/boot: fallback enquanto o chunk baixa — evita a área ficar preta/vazia ao tocar a aba.
const LazyScreenFallback = () => <div className="min-h-screen bg-neutral-950 animate-pulse" aria-hidden="true" />;
const CommunityClient = dynamic(() => import('@/app/(app)/community/CommunityClient'), { ssr: false, loading: () => <CommunityLoading /> });
const WorkoutReport = dynamic(() => import('@/components/WorkoutReport'), { ssr: false, loading: () => <LazyScreenFallback /> });
const WeeklyMuscleSummary = dynamic(() => import('@/components/dashboard/WeeklyMuscleSummary'), { ssr: false });
const ExerciseEditor = dynamic(() => import('@/components/ExerciseEditor'), { ssr: false });
const ProfilePage = dynamic(() => import('@/components/ProfilePage'), { ssr: false });
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
const RestDayPromptCard = dynamic(() => import('@/components/dashboard/RestDayPromptCard'), { ssr: false, loading: () => null })
const StudentWorkoutStartBanner = dynamic(() => import('@/components/teacher/StudentWorkoutStartBanner'), { ssr: false, loading: () => null })
const StudentControlConsent = dynamic(
    () => import('@/components/teacher/StudentControlConsent').then(m => ({ default: m.StudentControlConsent })),
    { ssr: false, loading: () => null },
)
import { useOfflineSync } from '@/hooks/useOfflineSync'
import { useVipAccess } from '@/hooks/useVipAccess'
import { useWorkoutStreak } from '@/hooks/useWorkoutStreak'
import { useGuidedTour } from '@/hooks/useGuidedTour'
import { useProfileCompletion } from '@/hooks/useProfileCompletion'
import { useWhatsNew } from '@/hooks/useWhatsNew'
import { useSeasonalCampaign } from '@/hooks/useSeasonalCampaign'
import { useUnreadBadges } from '@/hooks/useUnreadBadges'
import { useGymGeofence } from '@/hooks/useGymGeofence'
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
import { useStudentControlNotice } from '@/hooks/useStudentControlNotice'
import { useWorkoutEditor } from '@/hooks/useWorkoutEditor'
import { useBootstrap } from '@/hooks/useBootstrap'
import { useHealthKit } from '@/hooks/useHealthKit'
import { saveWorkoutToHealth, endWorkoutLiveActivity } from '@/utils/native/irontracksNative'
import { isIosNative } from '@/utils/platform'
import { useNativeTimerActions } from '@/hooks/useNativeTimerActions'
import { useAppEffects, isRecord, parseStartedAtMs } from '@/hooks/useAppEffects'
import { useAppHandlers } from '@/hooks/useAppHandlers'
import { useWorkoutWizard } from '@/hooks/useWorkoutWizard'
import type { WatchDashboard, WatchGym, WatchWorkout } from '@/hooks/useWatchBridge'
import { DashboardEffects } from './_components/DashboardEffects'
import { DashboardProviders } from './_components/DashboardProviders'
import { useModalStore } from '@/lib/state/modalStore'


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
const VipHub = dynamic(() => import('@/components/VipHub'), { ssr: false, loading: () => <LazyScreenFallback /> });

const appId = 'irontracks-production';

// InAppNotifyBinder migrado pra DashboardProviders.tsx (PR#1 refactor).

// mapWorkoutRow moved to @/utils/mapWorkoutRow

// ─── Path → view mapping (PR#4a) ────────────────────────────────────────────
// Sub-rotas reais substituem o `view: string` state. Aqui mapeamos pathname
// pra view name pra preservar a renderização condicional existente. Quando o
// pathname não corresponde a nenhuma sub-rota conhecida, retornamos 'dashboard'
// (homepage default).
function pathnameToView(pathname: string | null): string {
    if (!pathname) return 'dashboard'
    if (pathname === '/dashboard' || pathname === '/dashboard/') return 'dashboard'
    if (pathname.startsWith('/dashboard/history')) return 'history'
    if (pathname.startsWith('/dashboard/active')) return 'active'
    if (pathname.startsWith('/dashboard/report/weekly')) return 'weeklySummary'
    if (pathname.startsWith('/dashboard/report')) return 'report'
    if (pathname.startsWith('/dashboard/chat/') && pathname.length > '/dashboard/chat/'.length) return 'directChat'
    if (pathname === '/dashboard/chat' || pathname === '/dashboard/chat/') return 'chatList'
    if (pathname.startsWith('/dashboard/profile')) return 'profile'
    if (pathname.startsWith('/dashboard/admin')) return 'admin'
    if (pathname.startsWith('/dashboard/community')) return 'community'
    if (pathname.startsWith('/dashboard/assessments')) return 'assessments'
    if (pathname.startsWith('/dashboard/vip')) return 'vip'
    if (pathname.startsWith('/dashboard/edit')) return 'edit'
    return 'dashboard'
}

function viewToPath(view: string): string {
    switch (view) {
        case 'dashboard': return '/dashboard'
        case 'history': return '/dashboard/history'
        case 'active': return '/dashboard/active'
        case 'report': return '/dashboard/report/active'
        case 'chatList': return '/dashboard/chat'
        case 'directChat': return '/dashboard/chat/_'
        case 'profile': return '/dashboard/profile'
        case 'admin': return '/dashboard/admin'
        case 'community': return '/dashboard/community'
        case 'assessments': return '/dashboard/assessments'
        case 'vip': return '/dashboard/vip'
        case 'edit': return '/dashboard/edit'
        default: return '/dashboard'
    }
}

function IronTracksApp({ initialUser, initialProfile, initialWorkouts }: { initialUser?: unknown; initialProfile?: unknown; initialWorkouts?: unknown }) {
    const { confirm, alert } = useDialog();
    const initialUserObj = initialUser && typeof initialUser === 'object' ? (initialUser as Record<string, unknown>) : null
    const initialProfileObj = initialProfile && typeof initialProfile === 'object' ? (initialProfile as Record<string, unknown>) : null
    const initialUserTyped: UserRecord | null = initialUserObj ? ({ ...initialUserObj, id: String(initialUserObj.id || "") } as UserRecord) : null
    const [user, setUser] = useState<UserRecord | null>(initialUserTyped);
    const [authLoading, setAuthLoading] = useState(false);

    // PR#4a: view agora é derivada do pathname (sub-rotas reais). Mantemos um
    // setView wrapper que faz router.push pra preservar a API de hooks legados
    // (useViewNavigation, useAppEffects, useAppHandlers, etc) que chamam
    // setView('xxx') — o efeito real é navegação.
    const router = useRouter();
    const pathname = usePathname()
    const routeParams = useParams<{ channelId?: string; sessionId?: string }>()
    const view = useMemo(() => pathnameToView(pathname), [pathname])
    const setView = useCallback((next: string | ((prev: string) => string)) => {
        const target = typeof next === 'function' ? (next as (p: string) => string)(view) : next
        if (target === view) return
        const url = viewToPath(target)
        router.push(url)
    }, [view, router])

    const [directChat, setDirectChat] = useState<DirectChatState | null>(null);
    // ── Story Ring state: own story status (fed up from StoriesBar) ────────────
    const [hasActiveStory, setHasActiveStory] = useState(false)
    const handleMyStoryStateChange = useCallback((active: boolean) => setHasActiveStory(active), [])
    // Side-effects nativos (push, BG refresh, presence, UTM, intent router) extraídos
    // pra DashboardEffects — renderizado abaixo dentro do JSX como componente headless.
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
    // Modal flags migrados pro Zustand store (PR#2). Cada seletor só re-renderiza
    // este componente quando ESSE slice muda — antes 11 useStates causavam
    // re-render global do god component a cada toggle.
    const createWizardOpen = useModalStore((s) => s.createWizardOpen)
    const setCreateWizardOpen = useModalStore((s) => s.setCreateWizardOpen)
    const expressWorkoutOpen = useModalStore((s) => s.expressWorkoutOpen)
    const setExpressWorkoutOpen = useModalStore((s) => s.setExpressWorkoutOpen)
    const standaloneCardioOpen = useModalStore((s) => s.standaloneCardioOpen)
    const setStandaloneCardioOpen = useModalStore((s) => s.setStandaloneCardioOpen)
    const nutritionOpen = useModalStore((s) => s.nutritionOpen)
    const setNutritionOpen = useModalStore((s) => s.setNutritionOpen)
    const quickViewWorkout = useModalStore((s) => s.quickViewWorkout) as ActiveSession | null
    const setQuickViewWorkout = useModalStore((s) => s.setQuickViewWorkout) as (v: ActiveSession | null) => void
    // A overlay de Nutrição é local do dashboard (fixed/z-25, não é rota). Ao navegar
    // pra qualquer outra view (ex.: Histórico pelo menu), ela precisa fechar — senão
    // fica POR CIMA da nova view (bug: Histórico não abria, a nutrição ficava sobreposta).
    useEffect(() => {
        if (view !== 'dashboard' && nutritionOpen) {
            setNutritionOpen(false)
        }
    }, [view, nutritionOpen, setNutritionOpen])
    // Abrir a Nutrição precisa VOLTAR pro dashboard antes — ela só renderiza lá
    // (gate acima). Antes os call-sites faziam só `setNutritionOpen(true)`: em
    // qualquer outra aba (Avaliações, Comunidade, VIP) o efeito acima fechava a
    // nutrição no mesmo tick e o clique não fazia absolutamente nada.
    //
    // Não dá pra só `setView('dashboard'); setNutritionOpen(true)`: `view` é
    // DERIVADA do pathname e `setView` é um `router.push` — a view só vira
    // 'dashboard' num render posterior, e até lá o efeito acima fecharia de novo.
    // Então guardamos a intenção e abrimos quando a navegação aterrissar.
    const pendingNutritionRef = useRef(false)
    const openNutrition = useCallback(() => {
        if (view === 'dashboard') { setNutritionOpen(true); return }
        pendingNutritionRef.current = true
        setView('dashboard')
    }, [view, setView, setNutritionOpen])
    useEffect(() => {
        if (view !== 'dashboard' || !pendingNutritionRef.current) return
        pendingNutritionRef.current = false
        setNutritionOpen(true)
    }, [view, setNutritionOpen])
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

    const settingsOpen = useModalStore((s) => s.settingsOpen)
    const setSettingsOpen = useModalStore((s) => s.setSettingsOpen)
    const [isCoach, setIsCoach] = useState(false);
    const initialRole = String(initialProfileObj?.role || '').toLowerCase()
    // VIP access & status — extracted to useVipAccess hook
    const { vipAccess, setVipAccess, vipStatus, setVipStatus } = useVipAccess({
        userId: user?.id,
        initialRole,
    })

    const coachPending = useModalStore((s) => s.coachPending)
    const setCoachPending = useModalStore((s) => s.setCoachPending)
    const openStudent = useModalStore((s) => s.openStudent)
    const setOpenStudent = useModalStore((s) => s.setOpenStudent)
    const showNotifCenter = useModalStore((s) => s.showNotifCenter)
    const setShowNotifCenter = useModalStore((s) => s.setShowNotifCenter)

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
        }, [setView]),
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
    const offlineSyncOpen = useModalStore((s) => s.offlineSyncOpen)
    const setOfflineSyncOpen = useModalStore((s) => s.setOfflineSyncOpen)
    const showProgressPhotos = useModalStore((s) => s.showProgressPhotos)
    const setShowProgressPhotos = useModalStore((s) => s.setShowProgressPhotos)

    // useState lazy init: createClient() roda 1x. `useRef(createClient()).current`
    // alocava nova instância (com listener storage no window) a cada render — leak.
    const [supabase] = useState(() => createClient());
    // router já declarado acima (linha ~158) pra alimentar setView via pathname

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

    // Presence ping + UTM attribution agora vivem em DashboardEffects (PR#1 refactor).

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

    // ── Teacher control notice (student side) ─────────────────────────────────
    // Watches for teacher control requests on the student's own session row.
    // Shows a consent banner when a teacher requests control, and a badge when active.
    // Declared BEFORE useSessionSync so we can pass the suppression flag.
    const controlNotice = useStudentControlNotice(
        supabase,
        user?.id,
        Boolean(activeSession),
    )

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
        // Teacher has priority: while controlling, suppress student's local writes.
        suppressLocalWrites: controlNotice.controlStatus === 'active',
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
    // programTitleStartDay é salvo como nome do dia ('monday'|'tuesday'|...),
    // não número — formatProgramWorkoutTitle espera a string. Antes usava
    // Number(), que dava NaN e caía sempre em 'monday' (select morto).
    const programTitleStartDay = userSettingsApi?.settings && typeof userSettingsApi.settings === 'object'
        ? (() => {
            const v = (userSettingsApi.settings as Record<string, unknown>).programTitleStartDay
            return typeof v === 'string' && v.trim() ? v.trim().toLowerCase() : undefined
        })()
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
    }, [alert, setCoachPending])

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
        // URL real com channelId — habilita deep-link (irontracks://dashboard/chat/<id>).
        // ChatDirectScreen renderiza usando `directChat` state em memória; deep-link
        // direto resolve via fallback effect abaixo (deep-link sem state populado).
        const safeChannelId = channelId || '_'
        router.push(`/dashboard/chat/${encodeURIComponent(safeChannelId)}`)
    }, [router])

    // Handler estável pra Siri/Shortcuts intents — todas as actions atualmente
    // roteiam pro dashboard. DashboardEffects consome via prop.
    const handleNativeIntent = useCallback((_action: string) => {
        setView('dashboard')
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
    }, [setCurrentWorkout, setView, setExpressWorkoutOpen])

    // Deep-link de push de mensagem: ao tocar na notificação, abre a conversa.
    // A push carrega sender_id/sender_name; o ChatDirectScreen resolve o canal
    // a partir do userId, então não precisamos do channelId aqui.
    useEffect(() => {
        const onPushNavigate = (e: Event) => {
            const detail = (e as CustomEvent<{ type?: string; senderId?: string; senderName?: string }>).detail;
            if (detail?.type !== 'message') return;
            const senderId = String(detail?.senderId || '').trim();
            if (!senderId) return;
            const senderName = String(detail?.senderName || '').trim();
            setDirectChat({
                channelId: '',
                userId: senderId,
                displayName: senderName || undefined,
                other_user_id: senderId,
                other_user_name: senderName || undefined,
            });
            setView('directChat');
        };
        window.addEventListener('irontracks:push:navigate', onPushNavigate);
        return () => window.removeEventListener('irontracks:push:navigate', onPushNavigate);
    }, [setView]);

    useEffect(() => {
        if (!hideVipOnIos) return;
        if (view === 'vip') setView('dashboard');
    }, [hideVipOnIos, view, setView]);

    // Show loading screen while auth resolves — UNLESS we already have cached workouts
    // to show. In that case, render the dashboard immediately (workouts will be
    // refreshed silently in the background once auth completes).
    const hasCachedWorkouts = Array.isArray(workouts) && workouts.length > 0
    // perf/boot: com treinos cacheados, NÃO travar o app inteiro esperando o round-trip
    // de user_settings — renderiza o dashboard na hora com os defaults e aplica as
    // preferências (som/unidades) quando chegarem. streakLoading segue excluído (secundário).
    const isDashboardReady = userSettingsApi.loaded || hasCachedWorkouts;
    // Quando view='active' mas activeSession=null: o WKWebView foi morto pelo iOS
    // enquanto o app estava em background. A shell nativa preservou a URL
    // /dashboard/active, mas o JS recomeçou do zero — activeSession ainda não foi
    // restaurado do localStorage/Supabase. Sem este guard, isAppLoading=false e o
    // LoadingScreen some, deixando tela preta até o restore completar.
    // Com o guard: LoadingScreen permanece visível até activeSession chegar.
    // Quando activeSession estiver preenchido, a condição vira false e o treino aparece.
    //
    // CAP DE 5s (B-014): isSessionRestoring não pode ficar true pra sempre —
    // LoadingScreen mostra "Não foi possível carregar" após 8s. Se o restore não
    // completou em 5s (localStorage vazio, auth lento, sem rede), expiramos e
    // redirecionamos pro dashboard. O safety net em useAppEffects também redireciona,
    // mas pode demorar mais — este cap garante que o LoadingScreen nunca chega aos 8s.
    const [sessionRestoringExpired, setSessionRestoringExpired] = useState(false)
    useEffect(() => {
        if (view !== 'active' || activeSession) {
            setSessionRestoringExpired(false)
            return
        }
        const t = setTimeout(() => {
            setSessionRestoringExpired(true)
            setView('dashboard') // navegar imediatamente, não esperar o safety net
        }, 5000)
        return () => clearTimeout(t)
    }, [view, activeSession, setView])

    const isSessionRestoring = view === 'active' && !activeSession && !sessionRestoringExpired
    const isAppLoading = isSessionRestoring || (view !== 'active' && !activeSession && (
        (authLoading && !hasCachedWorkouts) || (!user?.id && !hasCachedWorkouts) || !isDashboardReady
    ));

    // perf: handlers ESTÁVEIS pros cards. O React.memo do WorkoutCard só surte efeito com
    // props estáveis; os handleX subjacentes já são useCallback (useWorkoutCrud/Export),
    // aqui só fixamos as arrows que antes eram recriadas inline a cada render — o que
    // re-renderizava todos os cards a cada abertura de modal/menu no dashboard.
    const cardQuickView = useCallback((w: unknown) => setQuickViewWorkout(w as Parameters<typeof setQuickViewWorkout>[0]), [setQuickViewWorkout])
    const cardStartSession = useCallback((w: unknown) => handleStartSession(w), [handleStartSession])
    const cardRestore = useCallback((w: unknown) => handleRestoreWorkout(w), [handleRestoreWorkout])
    const cardShare = useCallback((w: unknown) => handleShareWorkout(w), [handleShareWorkout])
    const cardEdit = useCallback((w: unknown) => handleEditWorkout(w), [handleEditWorkout])
    const cardDelete = useCallback((id: unknown, title: unknown) => { if (id) handleDeleteWorkout(String(id), String(title || '')) }, [handleDeleteWorkout])

    const currentWorkoutId = activeSession?.workout?.id;
    let nextWorkout = null;
    if (currentWorkoutId && Array.isArray(workouts) && workouts.length > 0) {
        const index = workouts.findIndex(w => w.id === currentWorkoutId);
        if (index !== -1 && index + 1 < workouts.length) {
            nextWorkout = workouts[index + 1];
        }
    }

    const isHeaderVisible = view !== 'active' && view !== 'report' && view !== 'weeklySummary';

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
        // Sinaliza ao Watch que há um treino rodando no iPhone — sem isso, o Watch
        // ficaria parado em "Sem treino do dia" mesmo após o usuário iniciar.
        isWorkoutActive: Boolean(currentWorkoutId),
        activeWorkoutId: currentWorkoutId ? String(currentWorkoutId) : null,
        // VIP gate: Watch usa pra bloquear treinos/cardio se usuário não-pago.
        isVip: Boolean(vipAccess?.hasVip),
    }), [streakStats, watchNextWorkout, user?.displayName, user?.email, currentWorkoutId, vipAccess?.hasVip])

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
            <DashboardProviders
                userId={user?.id ? String(user.id) : undefined}
                settings={userSettingsApi?.settings && typeof userSettingsApi.settings === 'object'
                    ? (userSettingsApi.settings as Record<string, unknown>)
                    : null}
                onOpenNotifications={handleOpenNotifications}
                bindInAppNotify={bindInAppNotify}
                watchDashboard={watchDashboard}
                watchGyms={watchGyms}
                onWatchRefresh={() => { fetchWorkouts().catch(() => {}) }}
                teamUser={user?.id ? { id: String(user.id), email: user?.email ? String(user.email) : null } : null}
                onStartSession={handleStartSession as unknown as (w: Record<string, unknown>) => void | Promise<void>}
            >
                {/* Side-effects nativos centralizados (push, presence, UTM, intent router, BG refresh) */}
                <DashboardEffects userId={user?.id} onIntent={handleNativeIntent} />
                {/* Professor: host GLOBAL do controle de treino — abre o modal quando o aluno
                    aceita, em QUALQUER tela (antes só abria na aba de alunos). */}
                {isCoach && <TeacherControlHost teacherUserId={user?.id ? String(user.id) : undefined} supabase={supabase} />}
                    <div className="w-full bg-neutral-900 min-h-screen relative flex flex-col overflow-hidden" suppressHydrationWarning>
                        <IncomingInviteModal
                            onStartSession={handleStartSession}
                            savedWorkouts={workouts}
                            onWorkoutSaved={() => { fetchWorkouts().catch(() => {}) }}
                        />
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
                            className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar relative"
                            style={({
                                ['--dashboard-sticky-top' as unknown as keyof React.CSSProperties]: isHeaderVisible
                                    ? 'calc(4rem + env(safe-area-inset-top))'
                                    : '0px',
                                paddingTop: isHeaderVisible ? 'calc(4rem + env(safe-area-inset-top))' : undefined,
                            } as React.CSSProperties)}
                        >
                            {(view === 'dashboard' || view === 'assessments' || view === 'community' || view === 'vip') && (
                              <>
                                {/* !nutritionOpen: o overlay de Nutrição é fixed/full-screen por cima
                                    do dashboard (view continua 'dashboard' por baixo dele — só
                                    nutritionOpen muda). Sem essa checagem, estes banners seguem
                                    renderizando ACIMA do DashboardTabs e empurram a barra pra baixo
                                    do offset fixo que o NutritionOverlay assume, fazendo a barra
                                    "flutuar" por cima do conteúdo de nutrição de forma incoerente. */}
                                {/* Professor: banner em tempo real quando um aluno inicia treino (assumir controle) */}
                                {view === 'dashboard' && !nutritionOpen && isCoach && <StudentWorkoutStartBanner teacherUserId={user?.id ? String(user.id) : undefined} supabase={supabase} />}
                                {view === 'dashboard' && !nutritionOpen && <WorkoutRecoveryBanner userId={String(user?.id || initialUserObj?.id || '')} />}
                                {view === 'dashboard' && !nutritionOpen && <RestDayPromptCard userId={String(user?.id || initialUserObj?.id || '')} />}
                                {view === 'dashboard' && !nutritionOpen && appleHealthEnabled && <HealthWidget data={healthData} />}
                                <StudentDashboard
                                    workouts={Array.isArray(workouts) ? workouts : []}
                                    profileIncomplete={Boolean(profileIncomplete)}
                                    onOpenCompleteProfile={() => setView('profile')}
                                    view={view === 'assessments' ? 'assessments' : view === 'community' ? 'community' : view === 'vip' ? 'vip' : 'dashboard'}
                                    onChangeView={(next: string) => {
                                        // Close the nutrition overlay before switching views — it's a
                                        // full-screen overlay, so leaving it open would hide the tab the
                                        // user just clicked AND keep the Nutrição indicator stuck on.
                                        // Também desarma a intenção pendente: clicar Nutrição e trocar de
                                        // aba antes da navegação aterrissar não pode abrir a nutrição depois.
                                        pendingNutritionRef.current = false
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
                                                    // URL real com sessionId — habilita deep-link pra relatório específico.
                                                    const sid = isRecord(s) ? String((s as Record<string, unknown>).id ?? 'active') : 'active'
                                                    router.push(`/dashboard/report/${encodeURIComponent(sid)}`)
                                                }}
                                                onOpenNutrition={openNutrition}
                                            />
                                    }
                                    vipLabel="VIP"
                                    vipLocked={hideVipOnIos ? true : !vipAccess?.hasVip}
                                    vipEnabled={!hideVipOnIos}
                                    showNutritionTab={!!vipAccess?.hasVip}
                                    nutritionActive={nutritionOpen}
                                    onOpenNutrition={openNutrition}
                                    settings={userSettingsApi?.settings ?? null}
                                    onCreateWorkout={handleCreateWorkout}
                                    onExpressWorkout={() => setExpressWorkoutOpen(true)}
                                    onStartCardio={() => setStandaloneCardioOpen(true)}
                                    onQuickView={cardQuickView}
                                    onStartSession={cardStartSession}
                                    onRestoreWorkout={cardRestore}
                                    onShareWorkout={cardShare}
                                    onEditWorkout={cardEdit}
                                    onDeleteWorkout={cardDelete}
                                    onBulkEditWorkouts={handleBulkEditWorkouts}
                                    currentUserId={String(user?.id || initialUserObj?.id || '')}
                                    exportingAll={Boolean(exportingAll)}
                                    onExportAll={handleExportAllWorkouts}
                                    streakStats={streakStats}
                                    onOpenJsonImport={() => setShowJsonImportModal(true)}
                                    onNormalizeAiWorkoutTitles={handleNormalizeAiWorkoutTitles}
                                    onNormalizeExercises={handleNormalizeExercises}
                                    onApplyTitleRule={handleApplyTitleRule}
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

                            {/* Standalone cardio — full-screen, no workout needed */}
                            {standaloneCardioOpen && (
                                <div
                                    className="fixed inset-0 z-50 flex flex-col"
                                    style={{
                                        background: 'linear-gradient(180deg, rgba(10,20,15,0.99) 0%, rgba(5,5,5,0.99) 100%)',
                                        backdropFilter: 'blur(12px)',
                                    }}
                                >
                                    {/* Header */}
                                    <div
                                        className="flex items-center justify-between px-4 pb-3 flex-shrink-0"
                                        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 16px)' }}
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <div
                                                className="w-9 h-9 rounded-2xl flex items-center justify-center"
                                                style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)' }}
                                            >
                                                <span className="text-lg leading-none">🏃</span>
                                            </div>
                                            <span className="text-base font-black text-white">Cardio</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setStandaloneCardioOpen(false)}
                                            className="w-9 h-9 rounded-full flex items-center justify-center text-neutral-400 active:scale-95 transition-all"
                                            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                                <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                                            </svg>
                                        </button>
                                    </div>
                                    {/* Divider */}
                                    <div className="h-px flex-shrink-0" style={{ background: 'rgba(34,197,94,0.1)' }} />
                                    {/* Content */}
                                    <div className="flex flex-col flex-1 min-h-0">
                                        <CardioGPSPanel
                                            standalone
                                            onRequestClose={() => setStandaloneCardioOpen(false)}
                                            userId={user?.id ? String(user.id) : null}
                                            bodyWeightKg={
                                                typeof (userSettingsApi?.settings as Record<string, unknown> | null | undefined)?.bodyWeightKg === 'number'
                                                    ? (userSettingsApi?.settings as Record<string, unknown>).bodyWeightKg as number
                                                    : undefined
                                            }
                                        />
                                    </div>
                                </div>
                            )}

                            {nutritionOpen && view === 'dashboard' ? (
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
                                    {/* Teacher control consent banner — shown above the workout when a teacher requests control */}
                                    {controlNotice.controlStatus === 'requested' && controlNotice.controlledByName && (
                                        <div className="fixed inset-x-0 z-[60]" style={{ top: 'max(env(safe-area-inset-top, 0px), 56px)' }}>
                                            <StudentControlConsent
                                                teacherName={controlNotice.controlledByName}
                                                onAccept={controlNotice.accept}
                                                onReject={controlNotice.reject}
                                            />
                                        </div>
                                    )}
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
                                        controlledByName={controlNotice.controlStatus === 'active' ? controlNotice.controlledByName : null}
                                        onRevokeControl={controlNotice.reject}
                                    />
                                </SectionErrorBoundary>
                            )}

                            {editActiveOpen && view === 'active' && editActiveDraft && (
                                // z-[2200]: ACIMA da barra inferior do descanso (RestTimerOverlay,
                                // z-2100) e do flash (z-2000). Senão, se um descanso está rolando, a
                                // barra START/AUTO fica POR CIMA do editor e cobre o "+ Adicionar
                                // Exercício" no rodapé.
                                <div
                                    className="fixed inset-0 z-[2200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 md:p-6 pt-safe"
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
                                        onViewReport={(s: unknown) => {
                                            setReportBackView('history');
                                            setReportData({ current: s, previous: null } as unknown as Parameters<typeof setReportData>[0]);
                                            const sid = isRecord(s) ? String((s as Record<string, unknown>).id ?? 'active') : 'active'
                                            router.push(`/dashboard/report/${encodeURIComponent(sid)}`)
                                        }}
                                        onResume={(payload) => {
                                            // Reabre um treino finalizado como ATIVO, preservando os logs (séries
                                            // registradas) — pra quem finalizou sem querer e quer voltar de onde parou.
                                            const exercises = Array.isArray(payload?.exercises) ? payload.exercises : []
                                            if (!exercises.length) return
                                            setActiveSession({
                                                workout: { title: payload.title, exercises } as unknown as ActiveSession,
                                                logs: (payload.logs || {}) as Record<string, unknown>,
                                                ui: { baseExerciseCount: exercises.length, pendingTemplateUpdate: false, preCheckin: null },
                                                startedAt: Date.now(),
                                                timerTargetTime: null,
                                                timerContext: null,
                                            } as ActiveWorkoutSession)
                                            setView('active')
                                        }}
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

                            {/* Resumo muscular da semana — aberto via deep-link da push "Resumo da semana 💪" */}
                            {view === 'weeklySummary' && (
                                <SectionErrorBoundary section="Resumo da Semana" fullScreen onReset={() => setView('dashboard')}>
                                    <WeeklyMuscleSummary onBack={() => setView('dashboard')} />
                                </SectionErrorBoundary>
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
                                        onNavigateCommunity={() => setView('community')}
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
            </DashboardProviders>
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


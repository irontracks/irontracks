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
    Copy,
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
import { createWorkout, updateWorkout, deleteWorkout, importData, computeWorkoutStreakAndStats, setWorkoutArchived, setWorkoutSortOrder } from '@/actions/workout-actions';

import LoginScreen from '@/components/LoginScreen';
import AdminPanelV2 from '@/components/AdminPanelV2';
import ChatScreen from '@/components/ChatScreen';
import ChatListScreen from '@/components/ChatListScreen';
import ChatDirectScreen from '@/components/ChatDirectScreen';
import HistoryList from '@/components/HistoryList';
import CommunityClient from '@/app/(app)/community/CommunityClient';
import StudentEvolution from '@/components/StudentEvolution';
import WorkoutReport from '@/components/WorkoutReport';
import ActiveWorkout from '@/components/ActiveWorkout';
import RestTimerOverlay from '@/components/workout/RestTimerOverlay';
import LoadingScreen from '@/components/LoadingScreen';
import ExerciseEditor from '@/components/ExerciseEditor';
import IncomingInviteModal from '@/components/IncomingInviteModal';
import InviteAcceptedModal from '@/components/InviteAcceptedModal';
import NotificationCenter from '@/components/NotificationCenter';
import HeaderActionsMenu from '@/components/HeaderActionsMenu';
import { TeamWorkoutProvider } from '@/contexts/TeamWorkoutContext';
import { InAppNotificationsProvider, useInAppNotifications } from '@/contexts/InAppNotificationsContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import ErrorReporterProvider from '@/components/ErrorReporterProvider';
import { DialogProvider, useDialog } from '@/contexts/DialogContext';
import GlobalDialog from '@/components/GlobalDialog';
import { playStartSound, unlockAudio } from '@/lib/sounds';
import { workoutPlanHtml } from '@/utils/report/templates';
import { estimateExerciseSeconds, toMinutesRounded, calculateExerciseDuration } from '@/utils/pacing';
import { normalizeExerciseName } from '@/utils/normalizeExerciseName'
import { formatProgramWorkoutTitle } from '@/utils/workoutTitle'
import { resolveCanonicalExerciseName } from '@/utils/exerciseCanonical'
import { BackButton } from '@/components/ui/BackButton';
import StudentDashboard from '@/components/dashboard/StudentDashboard'
import WorkoutWizardModal from '@/components/dashboard/WorkoutWizardModal'
import SettingsModal from '@/components/SettingsModal'
import { useUserSettings } from '@/hooks/useUserSettings'
import WhatsNewModal from '@/components/WhatsNewModal'
import WelcomeFloatingWindow from '@/components/WelcomeFloatingWindow'
import { generateWorkoutFromWizard } from '@/utils/workoutAutoGenerator'
import { getLatestWhatsNew } from '@/content/whatsNew'
import GuidedTour from '@/components/onboarding/GuidedTour'
import { getTourSteps } from '@/utils/tourSteps'
import { cacheGetWorkouts, cacheSetWorkouts, flushOfflineQueue, getOfflineQueueSummary, getPendingCount, isOnline } from '@/lib/offline/offlineSync'
import OfflineSyncModal from '@/components/OfflineSyncModal'

import {
    DirectChatState,
    WorkoutStreak,
    ActiveSession,
    ActiveWorkoutSession,
    PendingUpdate,
    VipStatus,
    TourState,
    SyncState,
    DuplicateGroup,
    Workout,
    Exercise,
    UserRecord
} from '@/types/app';
import type { AdminUser } from '@/types/admin'
import { getErrorMessage } from '@/utils/errorMessage'
import { logError, logWarn, logInfo } from '@/lib/logger'
const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)

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

const mapWorkoutRow = (w: unknown) => {
    const workout = w && typeof w === 'object' ? (w as Record<string, unknown>) : ({} as Record<string, unknown>)
    const rawExercises = Array.isArray(workout?.exercises) ? (workout.exercises as unknown[]) : [];
    const exs = rawExercises
        .filter((e): e is Record<string, unknown> => Boolean(e && typeof e === 'object'))
        .sort((a: Record<string, unknown>, b: Record<string, unknown>) => (Number(a.order) || 0) - (Number(b.order) || 0))
        .map((e: Record<string, unknown>) => {
            try {
                const isCardio = String(e.method || '').toLowerCase() === 'cardio';
                const dbSets = Array.isArray(e.sets)
                    ? (e.sets as unknown[]).filter((s): s is Record<string, unknown> => Boolean(s && typeof s === 'object'))
                    : [];

                const sortedSets = dbSets
                    .slice()
                    .sort((aSet: Record<string, unknown>, bSet: Record<string, unknown>) => (Number(aSet?.set_number) || 0) - (Number(bSet?.set_number) || 0));

                const setsCount = sortedSets.length || (isCardio ? 1 : 4);

                const setDetails = sortedSets.map((s: Record<string, unknown>, idx: number) => ({
                    set_number: s?.set_number ?? idx + 1,
                    reps: s?.reps ?? null,
                    rpe: s?.rpe ?? null,
                    weight: s?.weight ?? null,
                    is_warmup: !!(s?.is_warmup ?? s?.isWarmup),
                    advanced_config: s?.advanced_config ?? s?.advancedConfig ?? null,
                }));

                const nonEmptyReps = setDetails
                    .map((s: { reps: unknown }) => s.reps)
                    .filter((r: unknown) => r !== null && r !== undefined && r !== '');
                const defaultReps = isCardio ? '20' : '10';
                let repsHeader = defaultReps;
                if (nonEmptyReps.length > 0) {
                    const uniqueReps = Array.from(new Set(nonEmptyReps));
                    repsHeader = uniqueReps.length === 1 ? String(uniqueReps[0] ?? defaultReps) : String(nonEmptyReps[0] ?? defaultReps);
                }

                const rpeValues = setDetails
                    .map((s: { rpe: unknown }) => s.rpe)
                    .filter((v: unknown) => v !== null && v !== undefined && !Number.isNaN(Number(v)));
                const defaultRpe = isCardio ? 5 : 8;
                const rpeHeader = rpeValues.length > 0 ? (Number(rpeValues[0]) || defaultRpe) : defaultRpe;

                return {
                    id: e.id,
                    name: e.name,
                    notes: e.notes,
                    videoUrl: e.video_url,
                    restTime: e.rest_time,
                    cadence: e.cadence,
                    method: e.method,
                    sets: setsCount,
                    reps: repsHeader,
                    rpe: rpeHeader,
                    setDetails,
                };
            } catch (mapErr) {
                logError('Erro ao mapear exercício', {
                    workoutId: workout?.id,
                    exerciseId: e?.id,
                    error: mapErr,
                });
                return null;
            }
        })
        .filter(Boolean);

    return {
        id: workout.id != null ? String(workout.id) : undefined,
        title: String(workout.name ?? ''),
        notes: workout.notes,
        exercises: exs,
        is_template: !!workout.is_template,
        userId: workout.user_id != null ? String(workout.user_id) : undefined,
        createdBy: workout.created_by != null ? String(workout.created_by) : undefined,
        archivedAt: workout.archived_at ?? null,
        sortOrder: typeof workout.sort_order === 'number' ? workout.sort_order : (workout.sort_order == null ? 0 : Number(workout.sort_order) || 0),
        createdAt: workout.created_at ?? null,
    };
};

function IronTracksApp({ initialUser, initialProfile, initialWorkouts }: { initialUser?: unknown; initialProfile?: unknown; initialWorkouts?: unknown }) {
    const { confirm, alert } = useDialog();
    const initialUserObj = initialUser && typeof initialUser === 'object' ? (initialUser as Record<string, unknown>) : null
    const initialProfileObj = initialProfile && typeof initialProfile === 'object' ? (initialProfile as Record<string, unknown>) : null
    const initialUserTyped: UserRecord | null = initialUserObj ? ({ ...initialUserObj, id: String(initialUserObj.id || "") } as UserRecord) : null
    const [user, setUser] = useState<UserRecord | null>(initialUserTyped);
    const [authLoading, setAuthLoading] = useState(false);
    const [view, setView] = useState('dashboard');
    const [directChat, setDirectChat] = useState<DirectChatState | null>(null);
    const [workouts, setWorkouts] = useState<Array<Record<string, unknown>>>(() => {
        try {
            const list = Array.isArray(initialWorkouts) ? (initialWorkouts as unknown[]) : [];
            const mapped = (list
                .map((row) => mapWorkoutRow(row))
                .filter(Boolean)
                .sort((a: Record<string, unknown>, b: Record<string, unknown>) => (String(a.title || '')).localeCompare(String(b.title || '')))) as Array<Record<string, unknown>>;
            return mapped;
        } catch {
            return [];
        }
    });
    const [stats, setStats] = useState({ workouts: 0, exercises: 0, activeStreak: 0 });
    const [streakStats, setStreakStats] = useState<WorkoutStreak | null>(null);
    const [currentWorkout, setCurrentWorkout] = useState<ActiveSession | null>(null);
    const [createWizardOpen, setCreateWizardOpen] = useState(false)
    const [importCode, setImportCode] = useState('');
    const [shareCode, setShareCode] = useState<string | null>(null);
    const [quickViewWorkout, setQuickViewWorkout] = useState<ActiveSession | null>(null);
    const [showImportModal, setShowImportModal] = useState(false);
    const [showJsonImportModal, setShowJsonImportModal] = useState(false);
    const [reportData, setReportData] = useState({ current: null, previous: null });
    const [reportBackView, setReportBackView] = useState('dashboard');
    const [duplicatesOpen, setDuplicatesOpen] = useState(false);
    const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
    const [duplicatesBusy, setDuplicatesBusy] = useState(false);
    const inAppNotifyRef = useRef<((payload: unknown) => void) | null>(null);
    const bindInAppNotify = useCallback((fn: unknown) => {
        inAppNotifyRef.current = typeof fn === 'function' ? (fn as (payload: unknown) => void) : null;
    }, []);
    const inAppNotify = useCallback((payload: unknown) => {
        const fn = inAppNotifyRef.current;
        if (typeof fn === 'function') fn(payload);
    }, []);

    const [preCheckinOpen, setPreCheckinOpen] = useState(false)
    const [preCheckinWorkout, setPreCheckinWorkout] = useState<ActiveSession | null>(null)
    const [preCheckinDraft, setPreCheckinDraft] = useState({ energy: '', soreness: '', timeMinutes: '60', notes: '' })
    const preCheckinResolveRef = useRef<((value: unknown) => void) | null>(null)

    const requestPreWorkoutCheckin = useCallback(async (workout: unknown) => {
        if (!user?.id) return null
        if (preCheckinOpen) return null
        return await new Promise((resolve) => {
            preCheckinResolveRef.current = (value: unknown) => {
                resolve(value ?? null)
            }
            setPreCheckinWorkout(isRecord(workout) ? (workout as unknown as ActiveSession) : null)
            setPreCheckinDraft({ energy: '', soreness: '', timeMinutes: '60', notes: '' })
            setPreCheckinOpen(true)
        })
    }, [preCheckinOpen, user?.id])
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [whatsNewOpen, setWhatsNewOpen] = useState(false)
    const [pendingUpdate, setPendingUpdate] = useState<PendingUpdate | null>(null)
    const [isCoach, setIsCoach] = useState(false);
    const initialRole = String(initialProfileObj?.role || '').toLowerCase()
    const [vipAccess, setVipAccess] = useState(() => ({
        loaded: initialRole === 'admin' || initialRole === 'teacher',
        hasVip: initialRole === 'admin' || initialRole === 'teacher',
    }))
    const [vipStatus, setVipStatus] = useState<VipStatus | null>(null)

    useEffect(() => {
        if (!user?.id) return
        fetch('/api/vip/status').then(r => r.json()).then(d => {
            if (d?.ok) setVipStatus(d)
        }).catch(() => { })
    }, [user?.id])

    const [hasUnreadChat, setHasUnreadChat] = useState(false);
    const [hasUnreadNotification, setHasUnreadNotification] = useState(false);
    const [exportWorkout, setExportWorkout] = useState<ActiveSession | null>(null);
    const [showExportModal, setShowExportModal] = useState(false);
    const [coachPending, setCoachPending] = useState(false);
    const [studentFolders, setStudentFolders] = useState<Array<Record<string, unknown>>>([]);
    const [openStudent, setOpenStudent] = useState<Record<string, unknown> | null>(null);
    const [showNotifCenter, setShowNotifCenter] = useState(false);
    const [exportingAll, setExportingAll] = useState(false);

    const [profileIncomplete, setProfileIncomplete] = useState(false);
    const [profileDraftName, setProfileDraftName] = useState('');
    const [savingProfile, setSavingProfile] = useState(false);
    const [showCompleteProfile, setShowCompleteProfile] = useState(false);

    // Estado Global da Sessão Ativa
    const [activeSession, setActiveSession] = useState<ActiveWorkoutSession | null>(null);
    const suppressForeignFinishToastUntilRef = useRef(0);
    const [sessionTicker, setSessionTicker] = useState(0);
    const [editActiveOpen, setEditActiveOpen] = useState(false);
    const [editActiveDraft, setEditActiveDraft] = useState<Record<string, unknown> | null>(null);
    const editActiveBaseRef = useRef<Record<string, unknown> | null>(null);
    const editActiveAddExerciseRef = useRef(false);
    const [showAdminPanel, setShowAdminPanel] = useState(false);
    const userSettingsApi = useUserSettings(user?.id)
    const whatsNewShownRef = useRef(false)
    const TOUR_VERSION = 1
    const [tourOpen, setTourOpen] = useState(false)
    const [tourBoot, setTourBoot] = useState<TourState>({ loaded: false, completed: false, skipped: false })
    const [syncState, setSyncState] = useState<SyncState>({ online: true, syncing: false, pending: 0, failed: 0, due: 0 })
    const [offlineSyncOpen, setOfflineSyncOpen] = useState(false)

    // Local fallback to guarantee the tour doesn't re-open when DB upsert fails/offline.
    // Stored per-user AND per-tour-version.
    const getTourLocalKey = useCallback((uid: unknown) => {
        const safeUid = uid ? String(uid) : ''
        return safeUid ? `irontracks.onboarding.tour.v${TOUR_VERSION}.dismissed.${safeUid}` : ''
    }, [TOUR_VERSION])
    const getTourAutoOpenedKey = useCallback((uid: unknown) => {
        const safeUid = uid ? String(uid) : ''
        return safeUid ? `irontracks.onboarding.tour.v${TOUR_VERSION}.autoOpened.${safeUid}` : ''
    }, [TOUR_VERSION])
    const getTourSeenKey = useCallback((uid: unknown) => {
        const safeUid = uid ? String(uid) : ''
        return safeUid ? `irontracks.onboarding.tour.v${TOUR_VERSION}.seen.${safeUid}` : ''
    }, [TOUR_VERSION])
    const readLocalTourDismissal = useCallback((uid: unknown) => {
        const safeUid = uid ? String(uid) : ''
        if (!safeUid) return null
        try {
            if (typeof window === 'undefined') return null
            const key = getTourLocalKey(safeUid)
            if (!key) return null
            const raw = window.localStorage.getItem(key) || ''
            if (!raw) return null
            const parsed = JSON.parse(raw)
            if (!parsed || typeof parsed !== 'object') return null
            const version = Number(parsed?.version || 0) || 0
            if (version !== TOUR_VERSION) return null
            const status = String(parsed?.status || '')
            if (status !== 'completed' && status !== 'skipped') return null
            return { version, status, at: Number(parsed?.at || 0) || 0 }
        } catch {
            return null
        }
    }, [TOUR_VERSION, getTourLocalKey])
    const writeLocalTourDismissal = useCallback((uid: unknown, status: unknown) => {
        const safeUid = uid ? String(uid) : ''
        if (!safeUid) return
        const safeStatus = status === 'completed' ? 'completed' : 'skipped'
        try {
            if (typeof window === 'undefined') return
            const key = getTourLocalKey(safeUid)
            if (!key) return
            window.localStorage.setItem(key, JSON.stringify({ version: TOUR_VERSION, status: safeStatus, at: Date.now() }))
        } catch { }
    }, [TOUR_VERSION, getTourLocalKey])
    const wasTourSeenEver = useCallback((uid: unknown) => {
        const safeUid = uid ? String(uid) : ''
        if (!safeUid) return false
        try {
            if (typeof window === 'undefined') return false
            const key = getTourSeenKey(safeUid)
            if (!key) return false
            return (window.localStorage.getItem(key) || '') === '1'
        } catch {
            return false
        }
    }, [getTourSeenKey])
    const markTourSeenEver = useCallback((uid: unknown) => {
        const safeUid = uid ? String(uid) : ''
        if (!safeUid) return
        try {
            if (typeof window === 'undefined') return
            const key = getTourSeenKey(safeUid)
            if (!key) return
            window.localStorage.setItem(key, '1')
        } catch { }
    }, [getTourSeenKey])
    const wasTourAutoOpenedThisSession = useCallback((uid: unknown) => {
        const safeUid = uid ? String(uid) : ''
        if (!safeUid) return false
        try {
            if (typeof window === 'undefined') return false
            const key = getTourAutoOpenedKey(safeUid)
            if (!key) return false
            return (window.sessionStorage.getItem(key) || '') === '1'
        } catch {
            return false
        }
    }, [getTourAutoOpenedKey])
    const markTourAutoOpenedThisSession = useCallback((uid: unknown) => {
        const safeUid = uid ? String(uid) : ''
        if (!safeUid) return
        try {
            if (typeof window === 'undefined') return
            const key = getTourAutoOpenedKey(safeUid)
            if (!key) return
            window.sessionStorage.setItem(key, '1')
        } catch { }
    }, [getTourAutoOpenedKey])

    const supabase = useRef(createClient()).current;
    const router = useRouter();
    const isFetching = useRef(false);

    const ADMIN_PANEL_OPEN_KEY = 'irontracks_admin_panel_open';

    const refreshSyncState = useCallback(async () => {
        try {
            const online = isOnline()
            const settings = userSettingsApi?.settings && typeof userSettingsApi.settings === 'object' ? (userSettingsApi.settings as Record<string, unknown>) : null
            const offlineSyncV2Enabled = settings?.featuresKillSwitch !== true && settings?.featureOfflineSyncV2 === true
            if (offlineSyncV2Enabled) {
                const sum = await getOfflineQueueSummary({ userId: user?.id })
                if (sum?.ok) {
                    setSyncState((prev) => ({
                        ...prev,
                        online: sum.online !== false,
                        pending: Number(sum.pending || 0),
                        failed: Number(sum.failed || 0),
                        due: Number(sum.due || 0),
                    }))
                    return
                }
            }
            const pending = await getPendingCount()
            setSyncState((prev) => ({ ...prev, online, pending, failed: 0, due: 0 }))
        } catch {
            setSyncState((prev) => ({ ...prev, online: isOnline() }))
        }
    }, [user?.id, userSettingsApi?.settings])

    const runFlushQueue = useCallback(async () => {
        try {
            if (!isOnline()) {
                setSyncState((prev) => ({ ...prev, online: false }))
                return
            }
            setSyncState((prev) => ({ ...prev, syncing: true, online: true }))
            await flushOfflineQueue({ max: 8 })
        } finally {
            setSyncState((prev) => ({ ...prev, syncing: false }))
            await refreshSyncState()
        }
    }, [refreshSyncState])

    useEffect(() => {
        refreshSyncState()
        const onChanged = () => refreshSyncState()
        const onOnline = () => runFlushQueue()
        const onOffline = () => refreshSyncState()
        try {
            window.addEventListener('irontracks.offlineQueueChanged', onChanged)
            window.addEventListener('online', onOnline)
            window.addEventListener('offline', onOffline)
        } catch { }
        return () => {
            try {
                window.removeEventListener('irontracks.offlineQueueChanged', onChanged)
                window.removeEventListener('online', onOnline)
                window.removeEventListener('offline', onOffline)
            } catch { }
        }
    }, [refreshSyncState, runFlushQueue])

    useEffect(() => {
        if (!user?.id) return
        if (!isOnline()) return
        if ((syncState?.pending || 0) <= 0) return
        const t = setInterval(() => {
            runFlushQueue()
        }, 15000)
        return () => clearInterval(t)
    }, [runFlushQueue, syncState?.pending, user?.id])

    const logTourEvent = useCallback(async (event: unknown, payload: unknown) => {
        try {
            if (!user?.id) return
            const ev = String(event || '').trim()
            if (!ev) return
            const basePayload = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : ({} as Record<string, unknown>)
            const enriched = {
                ...basePayload,
                role: String(user?.role || ''),
                path: (() => {
                    try { return typeof window !== 'undefined' ? String(window.location.pathname || '') : '' } catch { return '' }
                })(),
            }
            await supabase.from('onboarding_events').insert({
                user_id: user.id,
                event: ev,
                payload: enriched,
            })
        } catch { }
    }, [supabase, user?.id, user?.role])

    const upsertTourFlags = useCallback(async (patch: unknown) => {
        try {
            if (!user?.id) return { ok: false, error: 'missing_user' }
            const base = patch && typeof patch === 'object' ? (patch as Record<string, unknown>) : ({} as Record<string, unknown>)
            const payload = {
                user_id: user.id,
                preferences: userSettingsApi?.settings && typeof userSettingsApi.settings === 'object' ? (userSettingsApi.settings as Record<string, unknown>) : {},
                tour_version: TOUR_VERSION,
                updated_at: new Date().toISOString(),
                ...base,
            }
            await supabase.from('user_settings').upsert(payload, { onConflict: 'user_id' })
            return { ok: true }
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e)
            return { ok: false, error: message }
        }
    }, [TOUR_VERSION, supabase, user?.id, userSettingsApi?.settings])

    useEffect(() => {
        if (!user?.id) return
        let cancelled = false
            ; (async () => {
                try {
                    const uid = String(user.id)
                    const localDismissal = readLocalTourDismissal(uid)
                    if (localDismissal) {
                        // Defensive: if the user already dismissed locally (offline, blocked RLS, etc.), never auto-open again.
                        const completed = localDismissal.status === 'completed'
                        const skipped = localDismissal.status === 'skipped'
                        setTourBoot({ loaded: true, completed, skipped })
                        return
                    }

                    const { data } = await supabase
                        .from('user_settings')
                        .select('tour_version, tour_completed_at, tour_skipped_at')
                        .eq('user_id', user.id)
                        .maybeSingle()

                    if (cancelled) return

                    const dbVersion = Number(data?.tour_version || 0) || 0
                    // Only force a new auto-open when the DB explicitly says an older version was seen.
                    // If dbVersion is missing/0 but completed_at exists, we respect completed/skipped to avoid annoying loops.
                    const needsNewVersion = dbVersion > 0 && dbVersion < TOUR_VERSION
                    const completed = needsNewVersion ? false : !!data?.tour_completed_at
                    const skipped = needsNewVersion ? false : !!data?.tour_skipped_at
                    setTourBoot({ loaded: true, completed, skipped })

                    const shouldOpen = !wasTourSeenEver(uid) && !wasTourAutoOpenedThisSession(uid) && (!completed && !skipped)
                    if (shouldOpen) {
                        markTourAutoOpenedThisSession(uid)
                        markTourSeenEver(uid)
                        await logTourEvent('tour_started', { auto: true, version: TOUR_VERSION })
                        setTourOpen(true)
                    }
                } catch {
                    if (!cancelled) setTourBoot((prev) => ({ ...prev, loaded: true }))
                }
            })()
        return () => {
            cancelled = true
        }
    }, [TOUR_VERSION, logTourEvent, markTourAutoOpenedThisSession, markTourSeenEver, readLocalTourDismissal, supabase, user?.id, wasTourAutoOpenedThisSession, wasTourSeenEver])


    useEffect(() => {
        const uid = user?.id ? String(user.id) : '';
        if (!uid) return;
        const key = `irontracks.socialPresencePing.v1.${uid}`;
        try {
            if (typeof window !== 'undefined') {
                const seen = window.sessionStorage.getItem(key) || '';
                if (seen === '1') return;
                window.sessionStorage.setItem(key, '1');
            }
        } catch { }
        try {
            fetch('/api/social/presence/ping', { method: 'POST' }).catch(() => { });
        } catch { }
        try {
            fetch('/api/profiles/ping', { method: 'POST' }).catch(() => { });
        } catch { }
    }, [user?.id]);

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

    useEffect(() => {
        if (whatsNewShownRef.current) return
        const uid = user?.id ? String(user.id) : ''
        if (!uid) return
        if (!userSettingsApi?.loaded) return
        const prefs = userSettingsApi?.settings && typeof userSettingsApi.settings === 'object' ? userSettingsApi.settings : {}
        if ((prefs as Record<string, unknown>)?.whatsNewAutoOpen === false) return
            ; (async () => {
                try {
                    const res = await fetch(`/api/updates/unseen?limit=1`)
                    const data = await res.json().catch(() => ({}))
                    const updates = Array.isArray(data?.updates) ? data.updates : []
                    const first = updates[0] || null
                    if (!first) return
                    try {
                        await fetch('/api/updates/mark-prompted', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ updateId: String(first.id) })
                        })
                    } catch { }
                    whatsNewShownRef.current = true
                    setWhatsNewOpen(true)
                    setPendingUpdate(first)
                } catch { }
            })()
    }, [user?.id, userSettingsApi?.loaded, userSettingsApi?.settings])

    const closeWhatsNew = useCallback(async () => {
        try {
            setWhatsNewOpen(false)
            const updateId = pendingUpdate?.id ? String(pendingUpdate.id) : ''
            if (updateId) {
                try {
                    await fetch('/api/updates/mark-viewed', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ updateId })
                    })
                } catch { }
                setPendingUpdate(null)
                return
            }
            const entry = getLatestWhatsNew()
            if (!entry?.id) return
            const prev = userSettingsApi?.settings && typeof userSettingsApi.settings === 'object' ? userSettingsApi.settings : {}
            const nextSeenAt = Date.now()
            const next = { ...(prev || {}), whatsNewLastSeenId: String(entry.id), whatsNewLastSeenAt: nextSeenAt }
            try { userSettingsApi?.setSettings?.(next as Parameters<NonNullable<typeof userSettingsApi>['setSettings']>[0]) } catch { }
            try { await userSettingsApi?.save?.(next as Parameters<NonNullable<typeof userSettingsApi>['save']>[0]) } catch { }
        } catch { }
    }, [userSettingsApi, pendingUpdate])
    const ADMIN_PANEL_TAB_KEY = 'irontracks_admin_panel_tab';

    const setUrlTabParam = useCallback((nextTab: unknown) => {
        try {
            if (typeof window === 'undefined') return;
            const tabValue = String(nextTab || '').trim();
            if (!tabValue) return;
            const url = new URL(window.location.href);
            url.searchParams.set('tab', tabValue);
            window.history.replaceState({}, '', url);
        } catch { }
    }, []);

    const removeUrlTabParam = useCallback(() => {
        try {
            if (typeof window === 'undefined') return;
            const url = new URL(window.location.href);
            url.searchParams.delete('tab');
            window.history.replaceState({}, '', url);
        } catch { }
    }, []);

    const openAdminPanel = useCallback((tab: unknown) => {
        setShowAdminPanel(true);
        try {
            if (typeof window !== 'undefined') {
                sessionStorage.setItem(ADMIN_PANEL_OPEN_KEY, '1');
                if (tab) sessionStorage.setItem(ADMIN_PANEL_TAB_KEY, String(tab));
                if (tab) setUrlTabParam(tab);
            }
        } catch { }
    }, [setUrlTabParam]);

    const closeAdminPanel = useCallback(() => {
        setShowAdminPanel(false);
        try {
            if (typeof window !== 'undefined') {
                sessionStorage.removeItem(ADMIN_PANEL_OPEN_KEY);
                sessionStorage.removeItem(ADMIN_PANEL_TAB_KEY);
            }
        } catch { }
        removeUrlTabParam();
    }, [removeUrlTabParam]);

    const restoreAdminPanelIfNeeded = useCallback(() => {
        try {
            if (typeof window === 'undefined') return;
            const role = String(user?.role || '').toLowerCase();
            const isPrivileged = role === 'admin' || role === 'teacher';
            if (!isPrivileged) return;

            const validTabs = new Set(['dashboard', 'students', 'teachers', 'templates', 'videos', 'broadcast', 'system']);
            const url = new URL(window.location.href);
            const urlTabRaw = String(url.searchParams.get('tab') || '').trim();
            const urlTab = validTabs.has(urlTabRaw) ? urlTabRaw : '';

            const open = sessionStorage.getItem(ADMIN_PANEL_OPEN_KEY);
            const storedTabRaw = String(sessionStorage.getItem(ADMIN_PANEL_TAB_KEY) || '').trim();
            const storedTab = validTabs.has(storedTabRaw) ? storedTabRaw : '';

            // Só abre se tiver 'open=1' explícito no storage E uma aba válida
            // OU se tiver tab na URL
            const shouldOpen = (open === '1' && !!storedTab) || !!urlTab;
            
            if (!shouldOpen) {
                // Garante que fecha se não deve abrir
                if (showAdminPanel) setShowAdminPanel(false);
                return;
            }

            const tab = urlTab || storedTab || 'dashboard';
            
            // Sincroniza storage se veio pela URL
            if (urlTab) {
                try {
                    sessionStorage.setItem(ADMIN_PANEL_OPEN_KEY, '1');
                    sessionStorage.setItem(ADMIN_PANEL_TAB_KEY, tab);
                } catch { }
            }
            
            setShowAdminPanel(true);
        } catch { }
    }, [setUrlTabParam, user?.role, showAdminPanel]);

    const resolveExerciseVideos = useCallback(async (exercises: unknown): Promise<{ exercises: Array<Record<string, unknown>>; updates: Array<Record<string, unknown>> }> => {
        try {
            const list = Array.isArray(exercises) ? (exercises as unknown[]) : [];
            const exercisesList = list.map((ex) => (ex && typeof ex === 'object' ? (ex as Record<string, unknown>) : ({} as Record<string, unknown>)))
            const missingNames = exercisesList
                .map((exercise: Record<string, unknown>) => {
                    const name = String(exercise?.name || '').trim();
                    if (!name) return null;
                    const current = String(exercise?.videoUrl ?? exercise?.video_url ?? '').trim();
                    if (current) return null;
                    return name;
                })
                .filter(Boolean);

            const uniqueNames = Array.from(new Set(missingNames)).slice(0, 80);
            if (!uniqueNames.length) return { exercises: exercisesList, updates: [] };

            const res = await fetch('/api/exercise-library/resolve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ names: uniqueNames }),
            });
            const json = await res.json().catch(() => ({}));
            if (!json?.ok) return { exercises: exercisesList, updates: [] };

            const videos = json?.videos && typeof json.videos === 'object' ? (json.videos as Record<string, unknown>) : {};
            const updates: Array<Record<string, unknown>> = [];
            const next = exercisesList.map((exercise: Record<string, unknown>) => {
                const current = String(exercise?.videoUrl ?? exercise?.video_url ?? '').trim();
                if (current) return exercise;
                const normalized = normalizeExerciseName(String(exercise?.name || ''));
                const url = normalized ? String(videos[normalized] || '').trim() : '';
                if (!url) return exercise;
                if (exercise?.id) updates.push({ id: exercise.id, url });
                return { ...exercise, videoUrl: url, video_url: url };
            });

            return { exercises: next, updates };
        } catch {
            const safe = Array.isArray(exercises) ? (exercises as unknown[]) : []
            const list = safe.map((ex) => (ex && typeof ex === 'object' ? (ex as Record<string, unknown>) : ({} as Record<string, unknown>)))
            return { exercises: list, updates: [] };
        }
    }, []);

    const persistExerciseVideoUrls = useCallback(async (updates: unknown) => {
        try {
            const rows = Array.isArray(updates) ? (updates as unknown[]) : [];
            const filtered = rows
                .map((r: unknown) => {
                    const row = r && typeof r === 'object' ? (r as Record<string, unknown>) : ({} as Record<string, unknown>)
                    return { id: String(row?.id || '').trim(), url: String(row?.url || '').trim() }
                })
                .filter((r) => !!r.id && !!r.url)
                .slice(0, 100);
            if (!filtered.length) return;
            await Promise.allSettled(filtered.map((r: { id: string; url: string }) => supabase.from('exercises').update({ video_url: r.url }).eq('id', r.id)));
        } catch { }
    }, [supabase]);

    const signOutInFlightRef = useRef(false);
    const serverSessionSyncRef = useRef<{ timer: ReturnType<typeof setTimeout> | null; lastKey: string }>({ timer: null, lastKey: '' });
    const serverSessionSyncWarnedRef = useRef(false);

    const generateExerciseKey = useCallback(() => {
        try {
            if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
        } catch { }
        return `ex_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    }, []);

    const normalizeWorkoutForEditor = useCallback((raw: unknown) => {
        try {
            const base = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : ({} as Record<string, unknown>);
            const title = String(base.title || base.name || 'Treino').trim() || 'Treino';
            const exercisesRaw = Array.isArray(base.exercises) ? (base.exercises as unknown[]) : [];
            const exercisesInitial = exercisesRaw
                .filter((ex: unknown): ex is Record<string, unknown> => Boolean(ex && typeof ex === 'object'))
                .map((ex: Record<string, unknown>) => {
                    const existing = ex?._itx_exKey ? String(ex._itx_exKey) : '';
                    const fromId = ex?.id != null ? `id_${String(ex.id)}` : '';
                    const nextKey = existing || fromId || generateExerciseKey();
                    return { ...ex, _itx_exKey: nextKey };
                });

            const seen = new Set<string>();
            const exercises = exercisesInitial.map((ex: Record<string, unknown>) => {
                const k = String(ex?._itx_exKey || '');
                if (!k || seen.has(k)) {
                    const nextKey = generateExerciseKey();
                    seen.add(nextKey);
                    return { ...ex, _itx_exKey: nextKey };
                }
                seen.add(k);
                return ex;
            });

            return { ...base, title, exercises };
        } catch {
            return { title: 'Treino', exercises: [] as Exercise[] };
        }
    }, [generateExerciseKey]);

    const stripWorkoutInternalKeys = useCallback((workout: unknown) => {
        try {
            const w = workout && typeof workout === 'object' ? (workout as Record<string, unknown>) : ({} as Record<string, unknown>);
            const exercises = Array.isArray(w.exercises)
                ? (w.exercises as unknown[]).map((ex: unknown) => {
                    if (!ex || typeof ex !== 'object') return ex;
                    const obj = ex as Record<string, unknown>
                    const { _itx_exKey, ...rest } = obj;
                    void _itx_exKey
                    return rest;
                })
                : w.exercises;
            return { ...w, exercises };
        } catch {
            return workout;
        }
    }, []);

    const reindexSessionLogsAfterWorkoutEdit = useCallback((oldWorkout: unknown, newWorkout: unknown, logs: unknown) => {
        try {
            const safeLogs = logs && typeof logs === 'object' ? (logs as Record<string, unknown>) : {};
            const oldObj = oldWorkout && typeof oldWorkout === 'object' ? (oldWorkout as Record<string, unknown>) : ({} as Record<string, unknown>)
            const newObj = newWorkout && typeof newWorkout === 'object' ? (newWorkout as Record<string, unknown>) : ({} as Record<string, unknown>)
            const oldExercises = Array.isArray(oldObj?.exercises) ? (oldObj.exercises as unknown[]) : [];
            const newExercises = Array.isArray(newObj?.exercises) ? (newObj.exercises as unknown[]) : [];
            const oldKeyByIndex = oldExercises.map((ex: unknown) => {
                const exObj = ex && typeof ex === 'object' ? (ex as Record<string, unknown>) : ({} as Record<string, unknown>)
                return String(exObj?._itx_exKey || '')
            });
            const newIndexByKey = new Map<string, number>();
            newExercises.forEach((ex: unknown, idx: number) => {
                const exObj = ex && typeof ex === 'object' ? (ex as Record<string, unknown>) : ({} as Record<string, unknown>)
                const k = String(exObj?._itx_exKey || '');
                if (!k) return;
                if (newIndexByKey.has(k)) return;
                newIndexByKey.set(k, idx);
            });

            const result: Record<string, unknown> = {};
            Object.entries(safeLogs).forEach(([k, v]) => {
                const parts = String(k || '').split('-');
                if (parts.length !== 2) {
                    result[k] = v;
                    return;
                }
                const oldIdx = Number(parts[0]);
                const setIdx = Number(parts[1]);
                if (!Number.isFinite(oldIdx) || !Number.isFinite(setIdx)) {
                    result[k] = v;
                    return;
                }
                const exKey = oldKeyByIndex[oldIdx] || '';
                const newIdx = exKey ? newIndexByKey.get(exKey) : undefined;
                if (typeof newIdx !== 'number' || newIdx < 0) return;
                const ex = newExercises[newIdx] || null;
                const exObj = ex && typeof ex === 'object' ? (ex as Record<string, unknown>) : ({} as Record<string, unknown>)
                const headerSets = Number.parseInt(String(exObj?.sets ?? ''), 10) || 0;
                const details = Array.isArray(exObj?.setDetails)
                    ? (exObj.setDetails as unknown[])
                    : Array.isArray(exObj?.set_details)
                        ? (exObj.set_details as unknown[])
                        : [];
                const maxSets = headerSets || (Array.isArray(details) ? details.length : 0);
                if (maxSets && setIdx >= maxSets) return;
                result[`${newIdx}-${setIdx}`] = v;
            });

            return result;
        } catch {
            return logs && typeof logs === 'object' ? logs : {};
        }
    }, []);

    const clearSupabaseCookiesBestEffort = useCallback(() => {
        try {
            if (typeof document === 'undefined') return;
            const raw = String(document.cookie || '');
            const cookieNames = raw
                .split(';')
                .map((p) => p.trim())
                .map((p) => p.split('=')[0])
                .filter(Boolean);
            const targets = cookieNames.filter((n) => n.startsWith('sb-') || n.includes('supabase'));
            targets.forEach((name) => {
                try {
                    document.cookie = `${name}=; Max-Age=0; path=/`;
                    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
                } catch { }
            });
        } catch { }
    }, []);

    const clearSupabaseStorageBestEffort = useCallback(() => {
        try {
            if (typeof window === 'undefined') return;
            const ls = window.localStorage;
            if (!ls) return;
            const keys: string[] = [];
            for (let i = 0; i < ls.length; i++) {
                const k = ls.key(i);
                if (!k) continue;
                if (k.startsWith('sb-') || k.includes('supabase') || k.includes('auth-token')) keys.push(k);
            }
            keys.forEach((k) => {
                try { ls.removeItem(k); } catch { }
            });
        } catch { }
    }, []);

    const clearClientSessionState = useCallback(() => {
        try {
            localStorage.removeItem('activeSession');
            localStorage.removeItem('appView');
            if (user?.id) {
                localStorage.removeItem(`irontracks.activeSession.v2.${user.id}`);
                localStorage.removeItem(`irontracks.appView.v2.${user.id}`);
            }
        } catch { }
        setActiveSession(null);
        setView('dashboard');
    }, [user?.id]);

    const safeSignOut = useCallback(async (scope = 'local') => {
        if (signOutInFlightRef.current) return;
        signOutInFlightRef.current = true;
        try {
            clearSupabaseCookiesBestEffort();
            clearSupabaseStorageBestEffort();
        } catch (e) {
            try {
                clearSupabaseCookiesBestEffort();
                clearSupabaseStorageBestEffort();
            } catch { }
        } finally {
            signOutInFlightRef.current = false;
        }
    }, [clearSupabaseCookiesBestEffort, clearSupabaseStorageBestEffort]);

    useEffect(() => {
        let cancelled = false;
        const userId = user?.id ? String(user.id) : '';
        if (!userId) return;

        const scopedKey = `irontracks.activeSession.v2.${userId}`;
        let localSavedAt = 0;

        try {
            const raw = localStorage.getItem(scopedKey) || localStorage.getItem('activeSession');
            if (raw) {
                const parsed: unknown = JSON.parse(raw);
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
    }, [supabase, user?.id, inAppNotify]);

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
    }, [supabase, user?.id, inAppNotify]);

    useEffect(() => {
        const handler = () => { try { unlockAudio(); } catch { } };
        document.addEventListener('touchstart', handler, { once: true });
        document.addEventListener('click', handler, { once: true });
        return () => {
            document.removeEventListener('touchstart', handler);
            document.removeEventListener('click', handler);
        };
    }, [supabase, alert, clearClientSessionState]);

    // Persistência da View (Aba Atual)
    useEffect(() => {
        try {
            if (!user?.id) return;
            const scopedViewKey = `irontracks.appView.v2.${user.id}`;
            const scopedSessionKey = `irontracks.activeSession.v2.${user.id}`;
            const savedSession = localStorage.getItem(scopedSessionKey);
            if (savedSession) {
                setView('active');
                return;
            }

            const raw = localStorage.getItem(scopedViewKey) || localStorage.getItem('appView');
            const savedView = raw ? String(raw) : '';
            if (!savedView) {
                setView('dashboard');
                return;
            }

            if (savedView === 'active') {
                setView('dashboard');
                return;
            }

            setView(savedView);
        } catch {
            setView('dashboard');
        }
    }, [supabase, user?.id]);

    useEffect(() => {
        try {
            if (!user?.id) return;
            if (!view) return;
            localStorage.setItem(`irontracks.appView.v2.${user.id}`, view);
        } catch {
            return;
        }
    }, [view, user?.id]);

    useEffect(() => {
        try {
            if (!user?.id) return;
            const key = `irontracks.activeSession.v2.${user.id}`;
            if (!activeSession) {
                localStorage.removeItem(key);
                localStorage.removeItem('activeSession');
                return;
            }

            const payload = JSON.stringify({ ...(activeSession || {}), _savedAt: Date.now() });
            const id = setTimeout(() => {
                try {
                    localStorage.setItem(key, payload);
                } catch { }
            }, 250);
            return () => clearTimeout(id);
        } catch {
            return;
        }
    }, [activeSession, user?.id]);

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
    }, [activeSession, supabase, user?.id, inAppNotify]);

    useEffect(() => {
        if (!activeSession) return;
        const id = setInterval(() => setSessionTicker(Date.now()), 1000);
        return () => clearInterval(id);
    }, [activeSession, view]);

    useEffect(() => {
        let cancelled = false;
        if (!user?.id) {
            setHasUnreadNotification(false);
            return;
        }

        const loadInitial = async () => {
            try {
                const { data, error } = await supabase
                    .from('notifications')
                    .select('id')
                    .eq('user_id', user.id)
                    .limit(1);
                if (cancelled) return;
                if (error) {
                    logError('error', 'Erro ao carregar notificações:', error);
                    setHasUnreadNotification(false);
                    return;
                }
                setHasUnreadNotification(Array.isArray(data) && data.length > 0);
            } catch (e) {
                if (cancelled) return;
                logError('error', 'Erro ao carregar notificações:', e);
                setHasUnreadNotification(false);
            }
        };

        loadInitial();

        const channel = supabase
            .channel(`notifications:badge:${user.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${user.id}`
            }, () => {
                if (!cancelled) setHasUnreadNotification(true);
            })
            .on('postgres_changes', {
                event: 'DELETE',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${user.id}`
            }, () => {
                if (!cancelled) loadInitial();
            })
            .subscribe();

        return () => {
            cancelled = true;
            supabase.removeChannel(channel);
        };
    }, [supabase, user?.id]);

    useEffect(() => {
        if (!user?.id) return;
        const s = userSettingsApi?.settings && typeof userSettingsApi.settings === 'object' ? userSettingsApi.settings : null
        const allowNotifyDm = s ? s.notifyDirectMessages !== false : true

        const channel = supabase
            .channel(`direct-messages-badge:${user.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'direct_messages'
            }, async (payload) => {
                try {
                    if (!allowNotifyDm) return;
                    const msg = payload.new;
                    if (!msg || msg.sender_id === user.id) return;

                    const currentView = view;
                    if (currentView === 'chat' || currentView === 'chatList' || currentView === 'directChat' || currentView === 'globalChat') {
                        return;
                    }

                    const { data: senderProfile } = await supabase
                        .from('profiles')
                        .select('display_name')
                        .eq('id', msg.sender_id)
                        .maybeSingle();

                    const senderName = senderProfile?.display_name || 'Nova mensagem';
                    const preview = String(msg.content || '').slice(0, 120);
                    if (!preview) return;

                    await fetch('/api/notifications/direct-message', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            receiverId: user.id,
                            senderName,
                            preview,
                        }),
                    });
                } catch (e) {
                    logError('error', 'Erro ao gerar notificação de mensagem direta:', e);
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [supabase, user?.id, userSettingsApi?.settings, view]);

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

    useEffect(() => {
        const uid = user?.id ? String(user.id) : ''
        if (!uid) return
        let cancelled = false
            ; (async () => {
                try {
                    const res = await fetch('/api/vip/access', { method: 'GET', credentials: 'include', cache: 'no-store' })
                    const json = await res.json().catch((): unknown => null)
                    if (cancelled) return
                    if (json && json.ok) {
                        setVipAccess({ loaded: true, hasVip: !!json.hasVip })
                        return
                    }
                    setVipAccess((prev: unknown) => ({ loaded: true, hasVip: !!(prev && typeof prev === 'object' ? (prev as Record<string, unknown>)?.hasVip : false) }))
                } catch {
                    if (!cancelled) setVipAccess((prev: unknown) => ({ loaded: true, hasVip: !!(prev && typeof prev === 'object' ? (prev as Record<string, unknown>)?.hasVip : false) }))
                }
            })()
        return () => { cancelled = true }
    }, [user?.id])

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
    }, [supabase, clearClientSessionState, clearSupabaseCookiesBestEffort, clearSupabaseStorageBestEffort])

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

    // Sync Profile Separately (Optimized)
    useEffect(() => {
        if (user?.id) {
            const syncProfile = async () => {
                try {
                    return
                } catch (e) {
                    logError('error', 'Erro ao sincronizar perfil:', e);
                }
            };
            syncProfile();
        }
    }, [supabase, user?.id]);

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            if (!user?.id) {
                if (!cancelled) {
                    setProfileIncomplete(false);
                    setProfileDraftName('');
                }
                return;
            }

            try {
                const profileObj = initialProfile && typeof initialProfile === 'object' ? (initialProfile as Record<string, unknown>) : {}
                const seedName = String(profileObj?.display_name || '').trim() || String(user?.displayName || '').trim();
                if (!cancelled) {
                    setProfileIncomplete(!seedName);
                    setProfileDraftName(seedName);
                }
            } catch {
                if (!cancelled) {
                    setProfileIncomplete(true);
                    setProfileDraftName(String(user?.displayName || '').trim());
                }
            }
        };

        run();
        return () => {
            cancelled = true;
        };
    }, [initialProfile, user?.id, user?.displayName]);

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
    }, [user?.id]);

    // Fetch Workouts
    const fetchWorkouts = useCallback(async (specificUser = user) => {
        if (isFetching.current) return;
        isFetching.current = true;

        try {
            const currentUser = specificUser;

            if (!currentUser?.id) {
                logWarn('warn', "DASHBOARD: Usuário não identificado ao buscar treinos.");
                return;
            }

            if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                try {
                    const cached = await cacheGetWorkouts()
                    const cachedObj = cached && typeof cached === 'object' ? (cached as Record<string, unknown>) : null
                    const cachedWorkouts = Array.isArray(cachedObj?.workouts) ? (cachedObj?.workouts as Array<Record<string, unknown>>) : []
                    if (cachedWorkouts.length) {
                        setWorkouts(cachedWorkouts)
                        const totalEx = cachedWorkouts.reduce((acc: number, w: Record<string, unknown>) => acc + (Array.isArray(w?.exercises) ? (w.exercises as unknown[]).length : 0), 0)
                        setStats({ workouts: cachedWorkouts.length, exercises: totalEx, activeStreak: 0 })
                    }
                } catch { }
                return
            }

            const role = String(currentUser?.role || 'user') || 'user';

            let data: Array<Record<string, unknown>> = []
            let studentData: Array<Record<string, unknown>> = []
            let studentsList: Array<Record<string, unknown>> = []

            const hydrateWorkouts = async (rows: unknown) => {
                const base: Array<Record<string, unknown>> = Array.isArray(rows) ? rows.filter(isRecord) : [];
                const workoutIds = base.map((w) => String(w.id ?? '')).filter(Boolean);
                if (workoutIds.length === 0) return base.map((w) => ({ ...w, exercises: [] as Exercise[] }));

                let exercises: Array<Record<string, unknown>> = [];
                try {
                    const { data: exRows } = await supabase
                        .from('exercises')
                        .select('*')
                        .in('workout_id', workoutIds)
                        .order('order', { ascending: true })
                        .limit(5000);
                    exercises = Array.isArray(exRows) ? exRows.filter(isRecord) : [];
                } catch {
                    exercises = [];
                }

                const exIds = exercises.map((e) => String(e.id ?? '')).filter(Boolean);
                let sets: Array<Record<string, unknown>> = [];
                if (exIds.length > 0) {
                    try {
                        const { data: setRows } = await supabase
                            .from('sets')
                            .select('*')
                            .in('exercise_id', exIds)
                            .order('set_number', { ascending: true })
                            .limit(20000);
                        sets = Array.isArray(setRows) ? setRows.filter(isRecord) : [];
                    } catch {
                        sets = [];
                    }
                }

                const setsByExercise = new Map<string, Array<Record<string, unknown>>>();
                for (const s of sets) {
                    const eid = String(s?.exercise_id ?? '');
                    if (!eid) continue;
                    const list = setsByExercise.get(eid) || [];
                    list.push(s);
                    setsByExercise.set(eid, list);
                }

                const exByWorkout = new Map<string, Array<Record<string, unknown>>>();
                for (const ex of exercises) {
                    const wid = String(ex?.workout_id ?? '');
                    if (!wid) continue;
                    const exId = String(ex.id ?? '');
                    const exWithSets = { ...ex, sets: exId ? (setsByExercise.get(exId) || []) : [] };
                    const list = exByWorkout.get(wid) || [];
                    list.push(exWithSets);
                    exByWorkout.set(wid, list);
                }

                return base.map((w) => ({ ...w, exercises: exByWorkout.get(String(w.id ?? '')) || [] }));
            };

            if (role === 'admin' || role === 'teacher') {
                // 1. Fetch Students
                try {
                    const { data: st } = await supabase
                        .from('students')
                        .select('id, name, email, user_id')
                        .or(`teacher_id.eq.${currentUser.id},user_id.eq.${currentUser.id}`)
                        .order('name');
                    studentsList = Array.isArray(st) ? st : [];
                } catch (e) { logError('error', 'Erro fetching students', e); }

                // 2. Fetch My Workouts
                const { data: myBase, error: myErr } = await supabase
                    .from('workouts')
                    .select('*')
                    .eq('is_template', true)
                    .eq('user_id', currentUser.id)
                    .order('name', { ascending: true })
                if (myErr) throw myErr
                data = await hydrateWorkouts(Array.isArray(myBase) ? myBase : [])
                if (!Array.isArray(data) || data.length === 0) {
                    try {
                        const { data: myAllBase } = await supabase
                            .from('workouts')
                            .select('*')
                            .eq('user_id', currentUser.id)
                            .order('name', { ascending: true })
                            .limit(500)
                        data = await hydrateWorkouts(Array.isArray(myAllBase) ? myAllBase : [])
                    } catch { }
                }

                // 3. Fetch Student Workouts
                const ids = studentsList.map((s) => String(s.user_id ?? s.id ?? '')).filter(Boolean)
                if (ids.length > 0) {
                    const seen = new Set<string>()
                    const combined: Array<Record<string, unknown>> = [];
                    try {
                        const { data: swByUserBase } = await supabase
                            .from('workouts')
                            .select('*')
                            .eq('is_template', true)
                            .in('user_id', ids)
                            .order('name')
                            .limit(500)
                        const swByUser = await hydrateWorkouts(swByUserBase || [])
                        for (const w of (swByUser || [])) {
                            const id = String((w as Record<string, unknown>)?.id ?? '')
                            if (!id) continue
                            if (!seen.has(id)) { seen.add(id); combined.push(w) }
                        }
                    } catch { }
                    try {
                        const { data: swByStudentBase } = await supabase
                            .from('workouts')
                            .select('*')
                            .eq('is_template', true)
                            .in('student_id', ids)
                            .order('name')
                            .limit(500)
                        const swByStudent = await hydrateWorkouts(swByStudentBase || [])
                        for (const w of (swByStudent || [])) {
                            const id = String((w as Record<string, unknown>)?.id ?? '')
                            if (!id) continue
                            if (!seen.has(id)) { seen.add(id); combined.push(w) }
                        }
                    } catch { }
                    studentData = combined
                }
            } else {
                const { data: baseRows, error } = await supabase
                    .from('workouts')
                    .select('*')
                    .eq('is_template', true)
                    .eq('user_id', currentUser.id)
                    .order('name', { ascending: true })
                if (error) throw error
                data = await hydrateWorkouts(baseRows || [])

                if (!data.length) {
                    try {
                        const { data: anyRows, error: anyErr } = await supabase
                            .from('workouts')
                            .select('*')
                            .eq('user_id', currentUser.id)
                            .order('name', { ascending: true })
                            .limit(500);
                        if (!anyErr && Array.isArray(anyRows) && anyRows.length) {
                            data = await hydrateWorkouts(anyRows);
                        }
                    } catch { }
                }

                if (!data.length) {
                    try {
                        const { data: studentRow } = await supabase
                            .from('students')
                            .select('id')
                            .eq('user_id', currentUser.id)
                            .maybeSingle();
                        const studentId = studentRow?.id ? String(studentRow.id) : '';
                        if (studentId) {
                            const { data: legacyBase } = await supabase
                                .from('workouts')
                                .select('*')
                                .eq('is_template', true)
                                .or(`user_id.eq.${studentId},student_id.eq.${studentId}`)
                                .order('name', { ascending: true })
                                .limit(500);
                            const legacyHydrated = await hydrateWorkouts(legacyBase || []);
                            const seen = new Set<string>();
                            const merged: Array<Record<string, unknown>> = [];
                            for (const w of legacyHydrated) {
                                const id = String((w as Record<string, unknown>)?.id ?? '')
                                if (!id) continue;
                                if (seen.has(id)) continue;
                                seen.add(id);
                                merged.push(w);
                            }
                            data = merged;
                        }
                    } catch { }
                }

                if (!data.length) {
                    try {
                        const resLegacy = await fetch('/api/workouts/list', { cache: 'no-store' });
                        const jsonLegacy = await resLegacy.json().catch((): unknown => null);
                        const jsonLegacyObj = jsonLegacy && typeof jsonLegacy === 'object' ? (jsonLegacy as Record<string, unknown>) : null
                        const rows = Array.isArray(jsonLegacyObj?.rows) ? (jsonLegacyObj?.rows as unknown[]) : []
                        if (jsonLegacyObj?.ok && rows.length) {
                            data = rows.map((w: unknown) => {
                                const row = w && typeof w === 'object' ? (w as Record<string, unknown>) : ({} as Record<string, unknown>)
                                return ({
                                    id: row?.id,
                                    name: row?.name,
                                    notes: null,
                                    is_template: true,
                                    user_id: currentUser.id,
                                    created_by: null,
                                    exercises: [] as Exercise[] as unknown[],
                                } as Record<string, unknown>)
                            });
                        }
                    } catch { }
                }
            }

            if (Array.isArray(data)) {
                const mappedRaw = data
                    .map((row) => mapWorkoutRow(row))
                    .filter(Boolean);
                const mapped = mappedRaw.sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
                    const ao = Number.isFinite(Number(a?.sortOrder)) ? Number(a.sortOrder) : 0
                    const bo = Number.isFinite(Number(b?.sortOrder)) ? Number(b.sortOrder) : 0
                    if (ao !== bo) return ao - bo
                    return String(a.title || '').localeCompare(String(b.title || ''))
                });

                try {
                    await cacheSetWorkouts({ userId: currentUser?.id, workouts: mapped })
                } catch { }

                if (role === 'admin' || role === 'teacher') {
                    setWorkouts(mapped)
                    try {
                        const studentMapped = (studentData || []).map(mapWorkoutRow)
                        const byStudent = new Map()
                        for (const w of studentMapped) {
                            const sid = w.userId
                            if (!sid) continue
                            const list = byStudent.get(sid) || []
                            list.push(w)
                            byStudent.set(sid, list)
                        }
                        const nameById = new Map()
                        for (const s of (studentsList || [])) {
                            const sid = s.user_id || s.id
                            if (!sid) continue
                            nameById.set(sid, { name: s.name || String(sid).slice(0, 8), email: s.email || '' })
                        }
                        const folders = Array.from(byStudent.entries()).map(([sid, list]) => {
                            const info = nameById.get(sid) || { name: String(sid).slice(0, 8), email: '' }
                            return { id: sid, name: info.name, email: info.email, workouts: list }
                        }).filter(f => (f.workouts || []).length > 0)
                        setStudentFolders(folders)
                    } catch (err) {
                        logError('error', "Erro ao processar alunos:", err);
                        setStudentFolders([])
                    }
                } else {
                    setWorkouts(mapped)
                    try {
                        const shared = mapped.filter((w: Record<string, unknown>) => (w.createdBy && String(w.createdBy) !== String(currentUser.id)))
                        const byCoach = new Map<string, Array<Record<string, unknown>>>()
                        for (const w of shared) {
                            const cid = String(w.createdBy || '').trim()
                            if (!cid) continue
                            const list = byCoach.get(cid) || []
                            list.push(w)
                            byCoach.set(cid, list)
                        }
                        const coachIds = Array.from(byCoach.keys())
                        let profiles: Array<{ id: string; display_name?: string | null }> = []
                        if (coachIds.length) {
                            const { data: profs } = await supabase.from('profiles').select('id, display_name').in('id', coachIds)
                            profiles = profs || []
                        }
                        const nameByCoach = new Map(profiles.map((p) => [p.id, p.display_name || String(p.id).slice(0, 8)]))
                        const folders = Array.from(byCoach.entries()).map(([cid, list]) => ({
                            id: cid,
                            name: `Treinos compartilhados de ${nameByCoach.get(cid) || String(cid).slice(0, 8)}`,
                            email: '',
                            workouts: list
                        }))
                        setStudentFolders(folders)
                    } catch {
                        setStudentFolders([])
                    }
                }

                // Atualiza estatísticas
                const totalEx = mapped.reduce((acc: number, w: Record<string, unknown>) => acc + (Array.isArray(w?.exercises) ? (w.exercises as unknown[]).length : 0), 0);
                setStats({
                    workouts: mapped.length,
                    exercises: totalEx,
                    activeStreak: 0 // Placeholder
                });
            } else {
                logWarn('warn', 'Fetch sem dados; mantendo estado atual');
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.includes('Failed to fetch') || msg.includes('ERR_ABORTED')) {
                // Dev HMR aborts or transient network; ignore quietly
                try {
                    const cached = await cacheGetWorkouts()
                    const cachedObj = cached && typeof cached === 'object' ? (cached as Record<string, unknown>) : null
                    const cachedWorkouts = Array.isArray(cachedObj?.workouts) ? (cachedObj?.workouts as Array<Record<string, unknown>>) : []
                    if (cachedWorkouts.length) {
                        setWorkouts(cachedWorkouts)
                        const totalEx = cachedWorkouts.reduce((acc: number, w: Record<string, unknown>) => acc + (Array.isArray(w?.exercises) ? (w.exercises as unknown[]).length : 0), 0)
                        setStats({ workouts: cachedWorkouts.length, exercises: totalEx, activeStreak: 0 })
                    }
                } catch { }
                return;
            }
            logError("Erro ao buscar:", { message: msg, error: e });
        } finally { isFetching.current = false; }
    }, [supabase, user]); // Depende apenas do usuário para evitar loops de busca

    useEffect(() => {
        if (user) {
            fetchWorkouts(user);
        }
    }, [user, fetchWorkouts]);

    useEffect(() => {
        if (user && workouts.length === 0) {
            try {
                const k = 'workouts_cache_' + user.id;
                const cached = localStorage.getItem(k);
                if (cached) {
                    const arr = JSON.parse(cached);
                    if (Array.isArray(arr) && arr.length > 0) setWorkouts(arr);
                }
            } catch { }
        }
    }, [user, workouts.length]);

    useEffect(() => {
        if (!user?.id) return;
        computeWorkoutStreakAndStats()
            .then(res => {
                if (res?.ok && res?.data) {
                    const d = isRecord(res.data) ? (res.data as Record<string, unknown>) : {}
                    const badgesRaw = Array.isArray(d.badges) ? d.badges : []
                    const badges = badgesRaw
                        .filter(isRecord)
                        .map((b) => ({
                            id: String(b.id ?? ''),
                            label: String(b.label ?? ''),
                            kind: String(b.kind ?? ''),
                        }))
                        .filter((b) => !!b.id)
                    const streak: WorkoutStreak = {
                        currentStreak: Number(d.currentStreak ?? d.current_streak ?? 0) || 0,
                        bestStreak: Number(d.bestStreak ?? d.best_streak ?? d.longestStreak ?? d.longest_streak ?? 0) || 0,
                        totalWorkouts: Number(d.totalWorkouts ?? d.total_workouts ?? 0) || 0,
                        totalVolumeKg: Number(d.totalVolumeKg ?? d.total_volume_kg ?? 0) || 0,
                        badges,
                        lastWorkoutDate: d.lastWorkoutDate != null ? String(d.lastWorkoutDate) : null,
                        longestStreak: d.longestStreak != null ? Number(d.longestStreak) : undefined,
                    }
                    setStreakStats(streak)
                }
            })
            .catch(err => logError('error', 'Erro ao calcular streak:', err));
    }, [user?.id]);



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

    const handleStartSession = async (workout: unknown) => {
        const workoutObj = workout && typeof workout === 'object' ? (workout as Record<string, unknown>) : ({} as Record<string, unknown>)
        const exercisesList = Array.isArray(workoutObj?.exercises)
            ? (workoutObj.exercises as unknown[]).filter((ex: unknown): ex is Record<string, unknown> => Boolean(ex && typeof ex === 'object'))
            : [];

        if (exercisesList.length === 0) {
            await alert('Este treino está sem exercícios válidos. Edite o treino antes de iniciar.', 'Treino incompleto');
            return;
        }

        const first = exercisesList[0] || {};
        const exMin = toMinutesRounded(estimateExerciseSeconds(first));
        const totalMin = toMinutesRounded(exercisesList.reduce((acc: number, ex: Record<string, unknown>) => acc + calculateExerciseDuration(ex), 0));
        const workoutTitle = String(workoutObj?.title || workoutObj?.name || 'Treino');
        const ok = await confirm(`Iniciar "${workoutTitle}"? Primeiro exercício: ~${exMin} min. Estimado total: ~${totalMin} min.`, 'Iniciar Treino');
        if (!ok) return;
        let preCheckin = null
        try {
            const s = userSettingsApi?.settings && typeof userSettingsApi.settings === 'object' ? (userSettingsApi.settings as Record<string, unknown>) : null
            const prompt = s ? s.promptPreWorkoutCheckin !== false : true
            if (prompt) {
                preCheckin = await requestPreWorkoutCheckin(workout)
                if (preCheckin && user?.id) {
                    const pre = preCheckin && typeof preCheckin === 'object' ? (preCheckin as Record<string, unknown>) : ({} as Record<string, unknown>)
                    const energyN = Number(pre.energy)
                    const sorenessN = Number(pre.soreness)
                    const timeN = Number(pre.timeMinutes)
                    const { error: checkinError } = await supabase.from('workout_checkins').insert({
                        user_id: user.id,
                        kind: 'pre',
                        planned_workout_id: String(workoutObj?.id || '').trim() ? workoutObj.id : null,
                        active_session_user_id: null,
                        energy: Number.isFinite(energyN) && energyN >= 1 && energyN <= 5 ? Math.round(energyN) : null,
                        soreness: Number.isFinite(sorenessN) && sorenessN >= 0 && sorenessN <= 10 ? Math.round(sorenessN) : null,
                        notes: String(pre.notes || '').trim() ? String(pre.notes || '').trim() : null,
                        answers: {
                            time_minutes: Number.isFinite(timeN) && timeN > 0 ? Math.round(timeN) : null,
                        },
                    })
                    if (checkinError) throw checkinError
                }
            }
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e || '')
            logWarn('warn', 'Falha ao salvar check-in pré-treino:', message)
        }
        let resolvedExercises = exercisesList;
        try {
            const resolved = await resolveExerciseVideos(exercisesList);
            resolvedExercises = Array.isArray(resolved?.exercises) ? resolved.exercises : exercisesList;
            persistExerciseVideoUrls(resolved?.updates || []);
        } catch { }
        {
            const s = userSettingsApi?.settings && typeof userSettingsApi.settings === 'object' ? (userSettingsApi.settings as Record<string, unknown>) : null
            const enabled = s ? s.enableSounds !== false : true
            const volumeRaw = Number(s?.soundVolume ?? 100)
            const volume = Number.isFinite(volumeRaw) ? Math.max(0, Math.min(1, volumeRaw / 100)) : 1
            playStartSound({ enabled, volume })
        }
        const sessionWorkout = { ...workoutObj, exercises: resolvedExercises } as unknown as ActiveSession
        const sessionLogs: Record<string, unknown> = {}
        setActiveSession({
            workout: sessionWorkout,
            logs: sessionLogs,
            ui: {
                baseExerciseCount: resolvedExercises.length,
                pendingTemplateUpdate: false,
                preCheckin: preCheckin && typeof preCheckin === 'object' ? (preCheckin as Record<string, unknown>) : null,
            },
            startedAt: Date.now(),
            timerTargetTime: null,
            timerContext: null
        });
        setView('active');
        try {
            const wid = String(workoutObj?.id || '').trim() || null;
            const title = String(workoutObj?.title || workoutObj?.name || 'Treino').trim();
            fetch('/api/social/workout-start', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ workout_id: wid, workout_title: title }),
            }).catch(() => { });
        } catch { }
        {
            const s = userSettingsApi?.settings && typeof userSettingsApi.settings === 'object' ? (userSettingsApi.settings as Record<string, unknown>) : null
            const allowPrompt = s ? s.notificationPermissionPrompt !== false : true
            if (allowPrompt && typeof Notification !== 'undefined' && Notification.permission === 'default') {
                Notification.requestPermission().catch((e: unknown) => logWarn('Erro permissão notificação:', String((e as Error)?.message ?? e)));
            }
        }
    };

    const handleUpdateSessionLog = (key: string, data: unknown) => {
        if (!activeSession) return;
        setActiveSession((prev) => {
            if (!prev) return prev
            const logs = prev.logs && typeof prev.logs === 'object' ? prev.logs : {}
            return { ...prev, logs: { ...logs, [key]: data } }
        })
    };

    const handleStartTimer = (duration: number, context: unknown) => {
        setActiveSession((prev) => {
            if (!prev) return prev
            return {
                ...prev,
                timerTargetTime: Date.now() + (duration * 1000),
                timerContext: context && typeof context === 'object' ? context : null
            };
        });
    };

    const handleCloseTimer = () => {
        setActiveSession((prev) => (prev ? { ...prev, timerTargetTime: null, timerContext: null } : prev));
    };

    const handleFinishSession = async (sessionData: unknown, showReport?: boolean) => {
        suppressForeignFinishToastUntilRef.current = Date.now() + 8000;
        try {
            if (user?.id) {
                localStorage.removeItem(`irontracks.activeSession.v2.${user.id}`);
            }
            localStorage.removeItem('activeSession');
        } catch { }
        setActiveSession(null);
        if (showReport === false) {
            setView('dashboard');
            return;
        }
        setReportBackView('dashboard');
        setReportData({ current: sessionData, previous: null } as unknown as Parameters<typeof setReportData>[0]);
        setView('report');
    };

    // Handlers CRUD
    const openManualWorkoutEditor = () => {
        setCurrentWorkout({ title: '', exercises: [] as Exercise[] })
        setView('edit')
    }
    const handleCreateWorkout = () => { setCreateWizardOpen(true) };

    const handleEditWorkout = async (workout: unknown) => {
        const w = workout && typeof workout === 'object' ? (workout as Record<string, unknown>) : null
        if (!w || !w.id) return;
        try {
            const supabase = createClient();
            const { data, error } = await supabase
                .from('workouts')
                .select('*, exercises(*, sets(*))')
                .eq('id', w.id)
                .maybeSingle();
            if (error) throw error;
            if (!data) {
                setCurrentWorkout(w as unknown as ActiveSession);
                setView('edit');
                return;
            }
            const mapped = mapWorkoutRow(data);
            try {
                const mappedObj = mapped && typeof mapped === 'object' ? (mapped as Record<string, unknown>) : ({} as Record<string, unknown>)
                const resolved = await resolveExerciseVideos(mappedObj?.exercises || []);
                const exercises = Array.isArray(resolved?.exercises) ? resolved.exercises : (Array.isArray(mappedObj?.exercises) ? (mappedObj.exercises as Array<Record<string, unknown>>) : []);
                persistExerciseVideoUrls(resolved?.updates || []);
                setCurrentWorkout({ ...mappedObj, exercises: (exercises as unknown as Array<Record<string, unknown>>) } as unknown as ActiveSession);
            } catch {
                setCurrentWorkout(mapped as unknown as ActiveSession);
            }
            setView('edit');
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e || '');
            await alert('Erro ao carregar treino para edição: ' + msg);
        }
    };

    const handleSaveWorkout = useCallback(async (workoutToSave?: unknown) => {
        const wRaw = workoutToSave || currentWorkout;
        const w = wRaw && typeof wRaw === 'object' ? (wRaw as Record<string, unknown>) : null
        if (!user || !w || !w.title) return { ok: false, error: 'Treino inválido ou usuário ausente' };
        try {
            if (w.id) {
                const res = await updateWorkout(String(w.id), w);
                setCurrentWorkout(isRecord(wRaw) ? (wRaw as unknown as ActiveSession) : (w as unknown as ActiveSession));
                return res;
            } else {
                const created = await createWorkout(w);
                const id = created?.ok ? created.data.id : null;
                const baseObj: Record<string, unknown> = isRecord(wRaw) ? (wRaw as Record<string, unknown>) : w
                setCurrentWorkout({ ...baseObj, id: id != null ? String(id) : undefined } as unknown as ActiveSession);
                return created;
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e || 'Falha ao salvar treino');
            return { ok: false, error: msg };
        }
    }, [currentWorkout, user]);

    const handlePersistWorkoutTemplateFromSession = useCallback(async (workoutFromSession: unknown) => {
        try {
            const normalized = normalizeWorkoutForEditor(workoutFromSession);
            const cleaned = stripWorkoutInternalKeys(normalized);
            const cleanedObj = cleaned && typeof cleaned === 'object' ? (cleaned as Record<string, unknown>) : null
            if (!cleanedObj || !cleanedObj.title) return { ok: false, error: 'Treino inválido para salvar' };

            if (cleanedObj.id) {
                await updateWorkout(String(cleanedObj.id), cleanedObj);
                try {
                    await fetchWorkouts();
                } catch { }
                return { ok: true, mode: 'update' };
            }

            const created = await createWorkout(cleanedObj);
            try {
                await fetchWorkouts();
            } catch { }
            return { ok: true, mode: 'create', id: created?.ok ? created.data.id : null };
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return { ok: false, error: msg || 'Falha ao salvar treino' };
        }
    }, [fetchWorkouts, normalizeWorkoutForEditor, stripWorkoutInternalKeys]);

    const handleOpenActiveWorkoutEditor = useCallback((options: Record<string, unknown> = {}) => {
        try {
            if (!activeSession?.workout) return;
            const base = normalizeWorkoutForEditor(activeSession.workout);
            const shouldAddExercise = options && typeof options === 'object' ? !!options.addExercise : false;
            editActiveAddExerciseRef.current = shouldAddExercise;
            const nextBase = shouldAddExercise
                ? {
                    ...base,
                    exercises: [
                        ...(Array.isArray(base?.exercises) ? base.exercises : []),
                        {
                            name: '',
                            sets: 4,
                            reps: '10',
                            rpe: '8',
                            cadence: '2020',
                            restTime: 60,
                            method: 'Normal',
                            videoUrl: '',
                            notes: ''
                        }
                    ]
                }
                : base;
            editActiveBaseRef.current = base;
            setEditActiveDraft(nextBase);
            setEditActiveOpen(true);
        } catch { }
    }, [activeSession?.workout, normalizeWorkoutForEditor]);

    const handleCloseActiveWorkoutEditor = useCallback(() => {
        try {
            setEditActiveOpen(false);
            setEditActiveDraft(null);
            editActiveBaseRef.current = null;
            editActiveAddExerciseRef.current = false;
        } catch { }
    }, []);

    const handleSaveActiveWorkoutEditor = useCallback(async (workoutFromEditor: unknown) => {
        const normalized = normalizeWorkoutForEditor(workoutFromEditor);
        const cleaned = stripWorkoutInternalKeys(normalized);
        const shouldDeferPersist = !!editActiveAddExerciseRef.current;
        const res = shouldDeferPersist ? { deferred: true } : await handleSaveWorkout(cleaned);
        setActiveSession((prev) => {
            if (!prev) return prev
            const oldWorkout = editActiveBaseRef.current || normalizeWorkoutForEditor(prev.workout);
            const nextLogs = reindexSessionLogsAfterWorkoutEdit(oldWorkout, normalized, prev.logs || {}) as Record<string, unknown>;
            const baseUi = prev?.ui && typeof prev.ui === 'object' ? (prev.ui as Record<string, unknown>) : {};
            const nextUi = shouldDeferPersist ? { ...baseUi, pendingTemplateUpdate: true } : baseUi;
            return { ...prev, workout: normalized as unknown as ActiveSession, logs: nextLogs, ui: nextUi };
        });
        editActiveBaseRef.current = normalized;
        setEditActiveDraft(normalized);
        return res;
    }, [handleSaveWorkout, normalizeWorkoutForEditor, reindexSessionLogsAfterWorkoutEdit, stripWorkoutInternalKeys]);

    const handleDeleteWorkout = async (id: string, title: unknown) => {
        const name = title || (workouts.find(w => w.id === id)?.title) || 'este treino';
        if (!(await confirm(`Apagar o treino "${name}"?`, "Excluir Treino"))) return;
        try {
            const res = await deleteWorkout(id);
            if (!res?.ok) {
                await alert("Erro: " + (res?.error || 'Falha ao excluir treino'));
                return;
            }
            await fetchWorkouts();
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e)
            await alert("Erro: " + message);
        }
    };

    const handleRestoreWorkout = async (workout: unknown) => {
        const w = workout && typeof workout === 'object' ? (workout as Record<string, unknown>) : ({} as Record<string, unknown>)
        const id = String(w?.id || '').trim()
        if (!id) return
        const name = w?.title || 'este treino'
        if (!(await confirm(`Restaurar o treino "${name}"?`, 'Restaurar Treino'))) return
        try {
            const res = await setWorkoutArchived(id, false)
            if (!res?.ok) {
                await alert('Erro: ' + (res?.error || 'Falha ao restaurar treino'))
                return
            }
            await fetchWorkouts()
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e)
            await alert('Erro: ' + message)
        }
    }

    const handleDuplicateWorkout = async (workout: unknown) => {
        const w = workout && typeof workout === 'object' ? (workout as Record<string, unknown>) : ({} as Record<string, unknown>)
        if (!(await confirm(`Duplicar "${String(w.title || '')}"?`, "Duplicar Treino"))) return;
        const newWorkout = { ...w, title: `${String(w.title || '')} (Cópia)` };
        delete (newWorkout as Record<string, unknown>).id;
        try {
            await createWorkout(newWorkout as Record<string, unknown>);
            await fetchWorkouts();
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e)
            await alert("Erro ao duplicar: " + message);
        }
    };

    const handleBulkEditWorkouts = async (items: unknown) => {
        try {
            const arr = Array.isArray(items) ? items : []
            if (!arr.length) return
            let updatedTitles = 0
            for (let i = 0; i < arr.length; i += 1) {
                const it = arr[i]
                const id = String(it?.id || '').trim()
                if (!id) continue
                const w = workouts.find((x) => String(x?.id || '') === id)
                if (!w) continue

                const desiredTitle = String(it?.title || '').trim() || String(w?.title || 'Treino')
                if (desiredTitle !== String(w?.title || '')) {
                    const r = await updateWorkout(id, { title: desiredTitle, notes: w?.notes ?? '', exercises: Array.isArray(w?.exercises) ? w.exercises : [] })
                    if (!r?.ok) throw new Error(String(r?.error || 'Falha ao renomear treino'))
                    updatedTitles += 1
                }
            }

            let sortSaved = true
            let sortError = ''
            const sortIds = arr.map((it) => String(it?.id || '').trim()).filter(Boolean)
            const r2 = await setWorkoutSortOrder(sortIds)
            if (!r2?.ok) {
                sortSaved = false
                sortError = String(r2?.error || 'Falha ao ordenar treinos')
            }

            await fetchWorkouts()

            if (!sortSaved) {
                const suffix = sortError ? `\n\n${sortError}` : ''
                await alert(`Lista salva parcialmente: a ordenação não foi aplicada.${suffix}`)
                return
            }

            if (updatedTitles) {
                await alert(`Lista salva: ${updatedTitles} título(s) atualizado(s).`)
            } else {
                await alert('Lista salva.')
            }
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e)
            await alert('Erro ao salvar lista: ' + message)
        }
    }

    const handleNormalizeAiWorkoutTitles = async () => {
        try {
            const list = Array.isArray(workouts) ? workouts : []
            const candidates = list
                .map((w) => {
                    const title = String(w?.title || '').trim()
                    const m = title.match(/\(\s*dia\s*(\d+)\s*\)/i)
                    if (!m?.[1]) return null
                    const day = Number(m[1])
                    if (!Number.isFinite(day) || day <= 0) return null
                    return { workout: w, dayIndex: Math.floor(day - 1) }
                })
                .filter(Boolean)
            if (!candidates.length) {
                await alert('Nenhum treino no formato antigo “(Dia X)” foi encontrado.')
                return
            }
            if (!(await confirm(`Padronizar nomes de ${candidates.length} treinos gerados automaticamente?`, 'Padronizar nomes'))) return

            let changed = 0
            for (const item of candidates) {
                if (!item) continue
                const w = item.workout
                const idx = item.dayIndex
                const id = String(w?.id || '').trim()
                if (!id) continue
                const oldTitle = String(w?.title || '').trim()
                const nextTitle = formatProgramWorkoutTitle(oldTitle, idx, { startDay: userSettingsApi?.settings?.programTitleStartDay })
                if (!nextTitle || nextTitle === oldTitle) continue
                const res = await updateWorkout(id, { title: nextTitle, notes: w?.notes ?? '', exercises: Array.isArray(w?.exercises) ? w.exercises : [] })
                if (!res?.ok) throw new Error(String(res?.error || 'Falha ao renomear treino'))
                changed += 1
            }
            try {
                await fetchWorkouts()
            } catch { }
            await alert(`Padronização concluída: ${changed} treinos atualizados.`)
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e)
            await alert('Erro ao padronizar nomes: ' + message)
        }
    }

    const handleApplyTitleRule = async () => {
        try {
            const list = Array.isArray(workouts) ? workouts : []
            if (!list.length) {
                await alert('Nenhum treino encontrado.')
                return
            }
            if (!(await confirm(`Padronizar títulos de ${list.length} treinos com A/B/C... e dia da semana?`, 'Padronizar títulos'))) return
            let updated = 0
            for (let i = 0; i < list.length; i += 1) {
                const w = list[i]
                const id = String(w?.id || '').trim()
                if (!id) continue
                const oldTitle = String(w?.title || '').trim()
                const nextTitle = formatProgramWorkoutTitle(oldTitle || 'Treino', i, { startDay: userSettingsApi?.settings?.programTitleStartDay })
                if (!nextTitle || nextTitle === oldTitle) continue
                const res = await updateWorkout(id, {
                    title: nextTitle,
                    notes: w?.notes ?? '',
                    exercises: Array.isArray(w?.exercises) ? w.exercises : [],
                })
                if (!res?.ok) throw new Error(String(res?.error || 'Falha ao renomear treino'))
                updated += 1
            }
            try {
                await fetchWorkouts()
            } catch { }
            await alert(`Padronização concluída: ${updated} treinos atualizados.`)
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e)
            await alert('Erro ao padronizar títulos: ' + message)
        }
    }

    const handleNormalizeExercises = async () => {
        try {
            const list = Array.isArray(workouts) ? workouts : []
            const candidates = list
                .map((w) => {
                    const exercises: Array<Record<string, unknown>> = Array.isArray(w?.exercises) ? (w.exercises as unknown[]).filter(isRecord) : []
                    let changesCount = 0
                    const nextExercises = exercises.map((ex: Record<string, unknown>) => {
                        const name = String(ex?.name ?? '').trim()
                        if (!name) return ex
                        const info = resolveCanonicalExerciseName(name)
                        if (!info?.changed || !info?.canonical) return ex
                        changesCount += 1
                        return { ...ex, name: info.canonical }
                    })
                    if (!changesCount) return null
                    return { workout: w, nextExercises, changesCount }
                })
                .filter(Boolean)

            if (!candidates.length) {
                await alert('Nenhum exercício para normalizar foi encontrado.')
                return
            }
            if (!(await confirm(`Normalizar exercícios em ${candidates.length} treinos?`, 'Normalizar exercícios'))) return

            let updated = 0
            const updatedWorkouts: Array<{ title: string; changesCount: number }> = [];
            for (const item of candidates) {
                if (!item) continue
                const w = item.workout
                const id = String(w?.id || '').trim()
                if (!id) continue
                const title = String(w?.title || '').trim() || `Treino ${id.slice(0, 8)}`
                const notes = w?.notes ?? ''
                const res = await updateWorkout(id, { title, notes, exercises: item.nextExercises })
                if (!res?.ok) throw new Error(String(res?.error || 'Falha ao atualizar treino'))
                updated += 1
                updatedWorkouts.push({ title, changesCount: Number(item?.changesCount || 0) })
            }
            try {
                await fetchWorkouts()
            } catch { }
            const lines = updatedWorkouts
                .slice(0, 10)
                .map((it) => `• ${it.title}${it.changesCount ? ` (${it.changesCount} exercício(s))` : ''}`)
                .join('\n')
            const more = updatedWorkouts.length > 10 ? `\n(+${updatedWorkouts.length - 10} outros)` : ''
            const detail = lines ? `\n\nTreinos atualizados:\n${lines}${more}` : ''
            await alert(`Normalização concluída: ${updated} treinos atualizados.${detail}`)
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e)
            await alert('Erro ao normalizar exercícios: ' + message)
        }
    }

    const handleOpenDuplicates = async () => {
        const list = (Array.isArray(workouts) ? workouts : []).filter((w) => !w?.archived_at)
        const keys = list.map((w) => {
            const exercises = Array.isArray(w?.exercises) ? w.exercises : []
            const set = new Set()
            for (const ex of exercises) {
                const name = String(ex?.name || '').trim()
                if (!name) continue
                const info = resolveCanonicalExerciseName(name)
                const base = String(info?.canonical || name).trim()
                const k = normalizeExerciseName(base)
                if (k) set.add(k)
            }
            return set
        })

        const parent: number[] = Array.from({ length: list.length }).map((_, i) => i)
        const find = (x: number) => {
            let r = x
            while (parent[r] !== r) r = parent[r]
            let cur = x
            while (parent[cur] !== cur) {
                const p = parent[cur]
                parent[cur] = r
                cur = p
            }
            return r
        }
        const unite = (a: number, b: number) => {
            const ra = find(a)
            const rb = find(b)
            if (ra !== rb) parent[rb] = ra
        }

        const similarity = (a: number, b: number): number => {
            const A = keys[a]
            const B = keys[b]
            if (!A?.size || !B?.size) return 0
            let inter = 0
            for (const v of A) if (B.has(v)) inter += 1
            const union = A.size + B.size - inter
            if (!union) return 0
            return inter / union
        }

        const edges: Array<{ i: number; j: number; score: number }> = [];
        for (let i = 0; i < list.length; i += 1) {
            for (let j = i + 1; j < list.length; j += 1) {
                const score = similarity(i, j)
                if (score >= 0.9) {
                    unite(i, j)
                    edges.push({ i, j, score })
                }
            }
        }

        const groupsMap = new Map<number, number[]>()
        for (let i = 0; i < list.length; i += 1) {
            const r = find(i)
            const arr = groupsMap.get(r) || []
            arr.push(i)
            groupsMap.set(r, arr)
        }

        const groups: DuplicateGroup[] = [];
        for (const idxs of groupsMap.values()) {
            if (!idxs || idxs.length < 2) continue
            let best = 0
            for (const e of edges) {
                if (idxs.includes(e.i) && idxs.includes(e.j)) best = Math.max(best, e.score)
            }
            groups.push({ items: idxs.map((i: number) => list[i] as Record<string, unknown>), score: best || 0.9 })
        }

        if (!groups.length) {
            await alert('Não encontrei duplicados com alta similaridade.')
            return
        }
        groups.sort((a, b) => b.score - a.score)
        setDuplicateGroups(groups)
        setDuplicatesOpen(true)
    }

    const handleArchiveDuplicateGroup = async (group: unknown) => {
        if (duplicatesBusy) return
        try {
            const g = group && typeof group === 'object' ? (group as Record<string, unknown>) : ({} as Record<string, unknown>)
            const items = Array.isArray(g?.items) ? (g.items as unknown[]) : []
            if (items.length < 2) return
            const base = items[0] && typeof items[0] === 'object' ? (items[0] as Record<string, unknown>) : null
            const others = items.slice(1)
            if (!(await confirm(`Arquivar ${others.length} duplicados e manter "${base?.title || 'Treino'}"?`, 'Arquivar duplicados'))) return
            setDuplicatesBusy(true)
            for (const w of others) {
                const wo = w && typeof w === 'object' ? (w as Record<string, unknown>) : ({} as Record<string, unknown>)
                const id = String(wo?.id || '').trim()
                if (!id) continue
                const res = await setWorkoutArchived(id, true)
                if (!res?.ok) throw new Error(String(res?.error || 'Falha ao arquivar'))
            }
            await fetchWorkouts()
            setDuplicatesOpen(false)
            setDuplicateGroups([])
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e)
            await alert('Erro ao arquivar duplicados: ' + message)
        } finally {
            setDuplicatesBusy(false)
        }
    }

    const handleMergeDuplicateGroup = async (group: unknown) => {
        if (duplicatesBusy) return
        try {
            const g = group && typeof group === 'object' ? (group as Record<string, unknown>) : ({} as Record<string, unknown>)
            const items = Array.isArray(g?.items) ? (g.items as unknown[]) : []
            if (items.length < 2) return
            const base = items[0] && typeof items[0] === 'object' ? (items[0] as Record<string, unknown>) : null
            const others = items.slice(1)
            if (!(await confirm(`Mesclar ${others.length} duplicados em "${base?.title || 'Treino'}" e arquivar os demais?`, 'Mesclar duplicados'))) return
            setDuplicatesBusy(true)

            const baseExercises: Array<Record<string, unknown>> = Array.isArray(base?.exercises) ? (base.exercises as unknown[]).filter(isRecord) : []
            const seen = new Set<string>()
            const merged: Array<Record<string, unknown>> = [];
            for (const ex of baseExercises) {
                const name = String(ex?.name || '').trim()
                const method = String(ex?.method || '').trim()
                const reps = String(ex?.reps || '').trim()
                const k = `${normalizeExerciseName(resolveCanonicalExerciseName(name).canonical || name)}|${method}|${reps}`
                if (k && !seen.has(k)) {
                    seen.add(k)
                    merged.push(ex)
                }
            }
            for (const w of others) {
                const wo = w && typeof w === 'object' ? (w as Record<string, unknown>) : ({} as Record<string, unknown>)
                const exs = Array.isArray(wo?.exercises) ? (wo.exercises as unknown[]) : []
                for (const ex of exs) {
                    const exObj = ex && typeof ex === 'object' ? (ex as Record<string, unknown>) : ({} as Record<string, unknown>)
                    const name = String(exObj?.name || '').trim()
                    const method = String(exObj?.method || '').trim()
                    const reps = String(exObj?.reps || '').trim()
                    const k = `${normalizeExerciseName(resolveCanonicalExerciseName(name).canonical || name)}|${method}|${reps}`
                    if (!k || seen.has(k)) continue
                    seen.add(k)
                    merged.push(exObj)
                }
            }

            const baseId = String(base?.id || '').trim()
            if (!baseId) throw new Error('Treino base sem ID')
            const res = await updateWorkout(baseId, { title: String(base?.title || 'Treino'), notes: base?.notes ?? '', exercises: merged })
            if (!res?.ok) throw new Error(String(res?.error || 'Falha ao salvar treino mesclado'))

            for (const w of others) {
                const wo = w && typeof w === 'object' ? (w as Record<string, unknown>) : ({} as Record<string, unknown>)
                const id = String(wo?.id || '').trim()
                if (!id) continue
                const a = await setWorkoutArchived(id, true)
                if (!a?.ok) throw new Error(String(a?.error || 'Falha ao arquivar'))
            }
            await fetchWorkouts()
            setDuplicatesOpen(false)
            setDuplicateGroups([])
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e)
            await alert('Erro ao mesclar duplicados: ' + message)
        } finally {
            setDuplicatesBusy(false)
        }
    }

    const handleShareWorkout = async (workout: unknown) => {
        setExportWorkout(isRecord(workout) ? (workout as unknown as ActiveSession) : null);
        setShowExportModal(true);
    };

    const handleExportPdf = async () => {
        if (!exportWorkout || !user) return;
        try {
            const html = workoutPlanHtml(exportWorkout as Record<string, unknown>, user);
            const win = window.open('', '_blank');
            if (!win) return;
            win.document.open();
            win.document.write(html);
            win.document.close();
            win.focus();
            setTimeout(() => { try { win.print(); } catch { } }, 300);
            setShowExportModal(false);
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e)
            await alert('Erro ao gerar PDF: ' + message);
        }
    };

    const handleExportJson = () => {
        if (!exportWorkout) return;
        const json = JSON.stringify({ workout: { title: exportWorkout.title, exercises: (exportWorkout.exercises || []).map((ex: unknown) => { const e = ex && typeof ex === 'object' ? (ex as Record<string, unknown>) : ({} as Record<string, unknown>); return ({ name: e.name, sets: e.sets, reps: e.reps, rpe: e.rpe, cadence: e.cadence, restTime: e.restTime, method: e.method, videoUrl: e.videoUrl, notes: e.notes }) }) } }, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(exportWorkout.title || 'treino').replace(/\s+/g, '_')}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        setShowExportModal(false);
    };

    const handleExportAllWorkouts = async () => {
        try {
            setExportingAll(true);
            const payload = {
                user: { id: user?.id || '', email: user?.email || '' },
                workouts: (workouts || []).map((w: Record<string, unknown>) => ({
                    id: w.id,
                    title: w.title,
                    notes: w.notes,
                    is_template: true,
                    exercises: (Array.isArray(w.exercises) ? (w.exercises as unknown[]) : []).map((ex: unknown) => {
                        const e = ex && typeof ex === 'object' ? (ex as Record<string, unknown>) : ({} as Record<string, unknown>)
                        return ({
                            name: e.name,
                            sets: e.sets,
                            reps: e.reps,
                            rpe: e.rpe,
                            cadence: e.cadence,
                            restTime: e.restTime,
                            method: e.method,
                            videoUrl: e.videoUrl,
                            notes: e.notes
                        })
                    })
                }))
            };
            const json = JSON.stringify(payload, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `irontracks_workouts_${new Date().toISOString()}.json`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        } catch (e) {
        } finally {
            setExportingAll(false);
        }
    };

    const handleImportWorkout = async () => {
        await alert("Funcionalidade de importar código temporariamente indisponível na migração.", "Em Manutenção");
    };

    // JSON IMPORT HANDLER
    const handleJsonUpload = (e: unknown) => {
        const input = (e as { target?: HTMLInputElement | null })?.target ?? null;
        const file = input?.files?.[0];
        if (!file) return;
        try {
            setShowJsonImportModal(false);
        } catch { }

        const reader = new FileReader();
        reader.onload = async (event: ProgressEvent<FileReader>) => {
            try {
                const json = JSON.parse(String(event?.target?.result || ''));
                if (await confirm(`Importar dados de ${json.user?.email || 'Unknown'}? Isso criará novos treinos.`, "Importar Backup")) {
                    await importData(json);
                    await fetchWorkouts();
                    await alert("Dados importados com sucesso!", "Sucesso");
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err)
                await alert("Erro ao ler arquivo JSON: " + message);
            } finally {
                try {
                    if (input) input.value = '';
                } catch { }
            }
        };
        reader.readAsText(file);
    };

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
        <InAppNotificationsProvider
            userId={user?.id || undefined}
            settings={userSettingsApi?.settings ?? null}
            onOpenMessages={() => setView('chat')}
            onOpenNotifications={() => {
                setShowNotifCenter(true);
                setHasUnreadNotification(false);
            }}
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
                                    {vipAccess?.hasVip && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setView('vip')
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
                                                const stored = String(sessionStorage.getItem(ADMIN_PANEL_TAB_KEY) || '').trim();
                                                if (stored) return stored;
                                            } catch { }
                                            return 'dashboard';
                                        })();
                                        openAdminPanel(tab);
                                    }}
                                    onOpenChatList={() => setView('chatList')}
                                    onOpenGlobalChat={() => setView('globalChat')}
                                    onOpenHistory={() => setView('history')}
                                    onOpenNotifications={() => {
                                        setShowNotifCenter(true);
                                        setHasUnreadNotification(false);
                                    }}
                                    onOpenSchedule={() => router.push('/dashboard/schedule')}
                                    onOpenWallet={() => setView('vip')}
                                    onOpenSettings={() => setSettingsOpen(true)}
                                    onOpenTour={async () => {
                                        try {
                                            await logTourEvent('tour_started', { auto: false, version: TOUR_VERSION })
                                        } catch { }
                                        setTourOpen(true)
                                    }}
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
                                    <VipHub
                                        user={user as unknown as AdminUser}
                                        locked={!vipAccess?.hasVip}
                                        onOpenWorkoutEditor={(w: unknown) => handleEditWorkout(w)}
                                        onOpenVipTab={() => setView('vip')}
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
                                vipLocked={!vipAccess?.hasVip}
                                vipEnabled={true}
                                settings={userSettingsApi?.settings ?? null}
                                onCreateWorkout={handleCreateWorkout}
                                onQuickView={(w) => setQuickViewWorkout(w)}
                                onStartSession={(w) => handleStartSession(w)}
                                onRestoreWorkout={(w) => handleRestoreWorkout(w)}
                                onShareWorkout={(w) => handleShareWorkout(w)}
                                onDuplicateWorkout={(w) => handleDuplicateWorkout(w)}
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
                                onOpenDuplicates={handleOpenDuplicates}
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
                                onUpgrade={() => setView('vip')}
                            />
                        )}

                        {/* Evolução removida conforme solicitação */}

                        {view === 'report' && reportData.current && (
                            <div className="fixed inset-0 z-[1200] bg-neutral-900 overflow-y-auto pt-safe">
                                <WorkoutReport
                                    session={reportData.current}
                                    previousSession={reportData.previous}
                                    user={user as unknown as AdminUser}
                                    isVip={vipAccess?.hasVip}
                                    settings={userSettingsApi?.settings ?? null}
                                    onUpgrade={() => setView('vip')}
                                    onClose={() => setView(reportBackView || 'dashboard')}
                                />
                            </div>
                        )}

                        {duplicatesOpen && (
                            <div className="fixed inset-0 z-[1200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pt-safe" onClick={() => !duplicatesBusy && setDuplicatesOpen(false)}>
                                <div className="bg-neutral-900 w-full max-w-3xl rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                                    <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Ferramentas</div>
                                            <div className="text-white font-black text-lg truncate">Duplicados</div>
                                            <div className="text-xs text-neutral-400 truncate">{Array.isArray(duplicateGroups) ? `${duplicateGroups.length} grupos` : ''}</div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setDuplicatesOpen(false)}
                                            disabled={duplicatesBusy}
                                            className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 inline-flex items-center justify-center disabled:opacity-50"
                                            aria-label="Fechar"
                                        >
                                            <X size={18} />
                                        </button>
                                    </div>
                                    <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto custom-scrollbar">
                                        {(Array.isArray(duplicateGroups) ? duplicateGroups : []).map((g, idx) => {
                                            const items = Array.isArray(g?.items) ? g.items : []
                                            const score = Number(g?.score || 0)
                                            const base = items[0]
                                            return (
                                                <div key={`dup-${idx}`} className="rounded-xl border border-neutral-800 bg-neutral-950/30 p-4">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <div className="text-xs text-neutral-500 font-bold uppercase tracking-widest">Similaridade</div>
                                                            <div className="text-white font-black truncate">{String((base as Record<string, unknown>)?.title ?? 'Treino')}</div>
                                                            <div className="text-xs text-neutral-400">{Math.round(score * 100)}%</div>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                type="button"
                                                                disabled={duplicatesBusy}
                                                                onClick={() => handleMergeDuplicateGroup(g)}
                                                                className="min-h-[40px] px-3 py-2 rounded-xl bg-yellow-500 text-black font-black text-xs uppercase tracking-widest hover:bg-yellow-400 disabled:opacity-50"
                                                            >
                                                                Mesclar
                                                            </button>
                                                            <button
                                                                type="button"
                                                                disabled={duplicatesBusy}
                                                                onClick={() => handleArchiveDuplicateGroup(g)}
                                                                className="min-h-[40px] px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-black text-xs uppercase tracking-widest hover:bg-neutral-800 disabled:opacity-50"
                                                            >
                                                                Arquivar
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="mt-3 space-y-2">
                                                        {items.map((w: unknown, wi: number) => {
                                                            const wo = w && typeof w === 'object' ? (w as Record<string, unknown>) : ({} as Record<string, unknown>)
                                                            const exCount = Array.isArray(wo?.exercises) ? (wo.exercises as unknown[]).length : 0
                                                            return (
                                                                <div key={`dup-item-${idx}-${wi}`} className="flex items-center justify-between gap-3 rounded-lg bg-neutral-900/40 border border-neutral-800 px-3 py-2">
                                                                    <div className="min-w-0">
                                                                        <div className="text-sm font-bold text-white truncate">{String(wo?.title || 'Treino')}</div>
                                                                        <div className="text-[11px] text-neutral-500 font-mono">{exCount} EXERCÍCIOS</div>
                                                                    </div>
                                                                    <div className="text-[11px] font-bold text-neutral-500">{wi === 0 ? 'BASE' : 'DUP'}</div>
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
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
                                <ChatScreen user={user as unknown as AdminUser} onClose={() => setView('dashboard')} />
                            </div>
                        )}

                        {view === 'globalChat' && (
                            <div className="absolute inset-0 z-50 bg-neutral-900">
                                <ChatScreen user={user as unknown as AdminUser} onClose={() => setView('dashboard')} />
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
                                <AdminPanelV2 user={user as unknown as AdminUser} onClose={() => setView('dashboard')} />
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
                        />
                    )}

                    {activeSession && view !== 'active' && (
                        <div className="fixed bottom-0 left-0 right-0 z-[1100]">
                            <div className="bg-neutral-900/95 backdrop-blur border-t border-neutral-800 px-4 py-3 pb-[max(env(safe-area-inset-bottom),12px)]">
                                <div className="flex items-center gap-4">
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-bold text-white truncate">{activeSession.workout?.title || 'Treino em andamento'}</h3>
                                        <div className="flex items-center gap-3 text-xs text-neutral-300 mt-1">
                                            <span className="font-mono text-yellow-500">{(() => { const end = sessionTicker || activeSession.startedAt; const s = Math.max(0, Math.floor((end - activeSession.startedAt) / 1000)); const m = Math.floor(s / 60), sec = s % 60; return `${m}:${String(sec).padStart(2, '0')}`; })()}</span>
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
                        <AdminPanelV2 user={user as unknown as AdminUser} onClose={closeAdminPanel} />
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


import os

parts = []

# Part 1: Imports and Header (Lines 1-73) - Modified to include new types and remove old interfaces
parts.append("""'use client';

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
import RestTimerOverlay from '@/components/RestTimerOverlay';
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
    AdvancedConfig,
    SetDetail,
    Exercise,
    Workout,
    UserRecord,
    Profile,
    DirectChatState,
    WorkoutStreak,
    ActiveSession,
    ActiveWorkoutSession,
    PendingUpdate,
    VipStatus,
    TourState,
    SyncState,
    DuplicateGroup
} from '@/types/app';

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)

const AssessmentHistory = dynamic(() => import('@/components/assessment/AssessmentHistory'), { ssr: false });
const VipHub = dynamic(() => import('@/components/VipHub'), { ssr: false });

const appId = 'irontracks-production';

function InAppNotifyBinder({ bind }: { bind?: ((notify: ((payload: unknown) => void) | null) => void) | null }): React.ReactElement | null {
    const { notify } = useInAppNotifications();
    const safeBind = typeof bind === 'function' ? bind : null;
    useEffect(() => {
        if (!safeBind) return;
        safeBind(notify);
        return () => {
            try { safeBind(null); } catch {}
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
				console.error('Erro ao mapear exercício', {
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
		user_id: workout.user_id != null ? String(workout.user_id) : undefined,
		created_by: workout.created_by != null ? String(workout.created_by) : undefined,
        archived_at: workout.archived_at ?? null,
        sort_order: typeof workout.sort_order === 'number' ? workout.sort_order : (workout.sort_order == null ? 0 : Number(workout.sort_order) || 0),
        created_at: workout.created_at ?? null,
	};
};

function IronTracksApp({ initialUser, initialProfile, initialWorkouts }: { initialUser?: unknown; initialProfile?: unknown; initialWorkouts?: unknown }) {
    const { confirm, alert } = useDialog();
    type UserRecord = { id?: string } & Record<string, unknown>
    const initialUserObj = initialUser && typeof initialUser === 'object' ? (initialUser as Record<string, unknown>) : null
    const initialProfileObj = initialProfile && typeof initialProfile === 'object' ? (initialProfile as Record<string, unknown>) : null
    const initialUserTyped: UserRecord | null = initialUserObj ? ({ ...initialUserObj, id: initialUserObj.id ? String(initialUserObj.id) : undefined } as UserRecord) : null
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
        }).catch(() => {})
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
        } catch {}
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
        } catch {}
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
        } catch {}
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
        } catch {}
        return () => {
            try {
                window.removeEventListener('irontracks.offlineQueueChanged', onChanged)
                window.removeEventListener('online', onOnline)
                window.removeEventListener('offline', onOffline)
            } catch {}
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
        } catch {}
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
            return { ok: false, error: e?.message ?? String(e) }
        }
    }, [TOUR_VERSION, supabase, user?.id, userSettingsApi?.settings])

    useEffect(() => {
        if (!user?.id) return
        let cancelled = false
        ;(async () => {
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
""")

# Rest of the file logic (truncated for safety, will write in chunks if needed)
# I will use a different approach: write the whole file content in the script if it fits.
# Since the previous `read` outputs were quite long, I'll trust the python script to append correctly.
# But wait, I can't easily paste 4000 lines into the python script string here without hitting limits.

# Alternative: Write the imports part first, then append the rest.
# I will write the imports part using `Write` tool to create the file.
# Then I will use `RunCommand` with `cat >>` to append the rest, chunk by chunk.
# But escaping special characters in shell is a nightmare.

# Better: Use `Write` to create the file with the first 300 lines (imports + helper).
# Then I will read the file I just created to make sure it exists.
# Then I will realize I can't append easily without python.

# Let's use the Python script approach but break it down.

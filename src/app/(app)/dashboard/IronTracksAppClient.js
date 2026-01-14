'use client';

import React, { useState, useEffect, useCallback, Suspense, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Image from 'next/image';
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
    X
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { createWorkout, updateWorkout, deleteWorkout, importData } from '@/actions/workout-actions';

import LoginScreen from '@/components/LoginScreen';
import AdminPanelV2 from '@/components/AdminPanelV2';
import ChatScreen from '@/components/ChatScreen';
import ChatListScreen from '@/components/ChatListScreen';
import ChatDirectScreen from '@/components/ChatDirectScreen';
import HistoryList from '@/components/HistoryList';
import StudentEvolution from '@/components/StudentEvolution';
import WorkoutReport from '@/components/WorkoutReport';
import ActiveWorkout from '@/components/ActiveWorkout';
import RestTimerOverlay from '@/components/RestTimerOverlay';
import NotificationToast from '@/components/NotificationToast';
import LoadingScreen from '@/components/LoadingScreen';
import ExerciseEditor from '@/components/ExerciseEditor';
import IncomingInviteModal from '@/components/IncomingInviteModal';
import NotificationCenter from '@/components/NotificationCenter';
import HeaderActionsMenu from '@/components/HeaderActionsMenu';
import RealtimeNotificationBridge from '@/components/RealtimeNotificationBridge';
import { TeamWorkoutProvider } from '@/contexts/TeamWorkoutContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import { DialogProvider, useDialog } from '@/contexts/DialogContext';
import GlobalDialog from '@/components/GlobalDialog';
import { playStartSound, unlockAudio } from '@/lib/sounds';
import { workoutPlanHtml } from '@/utils/report/templates';
import { estimateExerciseSeconds, toMinutesRounded, calculateExerciseDuration } from '@/utils/pacing';
import { BackButton } from '@/components/ui/BackButton';
import StudentDashboard from '@/components/dashboard/StudentDashboard'
import SettingsModal from '@/components/SettingsModal'
import { useUserSettings } from '@/hooks/useUserSettings'

const AssessmentHistory = dynamic(() => import('@/components/assessment/AssessmentHistory'), { ssr: false });

const ADMIN_EMAIL = 'djmkapple@gmail.com';
const appId = 'irontracks-production';

const mapWorkoutRow = (w) => {
	const rawExercises = Array.isArray(w?.exercises) ? w.exercises : [];
	const exs = rawExercises
		.filter((e) => e && typeof e === 'object')
		.sort((a, b) => (a.order || 0) - (b.order || 0))
		.map((e) => {
			try {
				const isCardio = String(e.method || '').toLowerCase() === 'cardio';
				const dbSets = Array.isArray(e.sets)
					? e.sets.filter((s) => s && typeof s === 'object')
					: [];

				const sortedSets = dbSets
					.slice()
					.sort((aSet, bSet) => (aSet?.set_number || 0) - (bSet?.set_number || 0));

				const setsCount = sortedSets.length || (isCardio ? 1 : 4);

				const setDetails = sortedSets.map((s, idx) => ({
					set_number: s?.set_number ?? idx + 1,
					reps: s?.reps ?? null,
					rpe: s?.rpe ?? null,
					weight: s?.weight ?? null,
					is_warmup: !!(s?.is_warmup ?? s?.isWarmup),
					advanced_config: s?.advanced_config ?? s?.advancedConfig ?? null,
				}));

				const nonEmptyReps = setDetails
					.map((s) => s.reps)
					.filter((r) => r !== null && r !== undefined && r !== '');
				const defaultReps = isCardio ? '20' : '10';
				let repsHeader = defaultReps;
				if (nonEmptyReps.length > 0) {
					const uniqueReps = Array.from(new Set(nonEmptyReps));
					repsHeader = uniqueReps.length === 1 ? uniqueReps[0] : nonEmptyReps[0] ?? defaultReps;
				}

				const rpeValues = setDetails
					.map((s) => s.rpe)
					.filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
				const defaultRpe = isCardio ? 5 : 8;
				const rpeHeader = rpeValues.length > 0 ? rpeValues[0] : defaultRpe;

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
					workoutId: w?.id,
					exerciseId: e?.id,
					error: mapErr,
				});
				return null;
			}
		})
		.filter(Boolean);

	return {
		id: w.id,
		title: w.name,
		notes: w.notes,
		exercises: exs,
		is_template: !!w.is_template,
		user_id: w.user_id,
		created_by: w.created_by,
	};
};

function IronTracksApp({ initialUser, initialProfile }) {
    const { confirm, alert } = useDialog();
    const [user, setUser] = useState(initialUser ?? null);
    const [authLoading, setAuthLoading] = useState(false);
    const [view, setView] = useState('dashboard');
    const [directChat, setDirectChat] = useState(null);
    const [workouts, setWorkouts] = useState([]);
    const [stats, setStats] = useState({ workouts: 0, exercises: 0, activeStreak: 0 });
    const [currentWorkout, setCurrentWorkout] = useState(null);
    const [importCode, setImportCode] = useState('');
    const [shareCode, setShareCode] = useState(null);
    const [quickViewWorkout, setQuickViewWorkout] = useState(null);
    const [showImportModal, setShowImportModal] = useState(false);
    const [showJsonImportModal, setShowJsonImportModal] = useState(false);
    const [reportData, setReportData] = useState({ current: null, previous: null });
    const [notification, setNotification] = useState(null);
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [isCoach, setIsCoach] = useState(false);
    const [hasUnreadChat, setHasUnreadChat] = useState(false);
    const [hasUnreadNotification, setHasUnreadNotification] = useState(false);
    const [exportWorkout, setExportWorkout] = useState(null);
    const [showExportModal, setShowExportModal] = useState(false);
    const [coachPending, setCoachPending] = useState(false);
    const [studentFolders, setStudentFolders] = useState([]);
    const [openStudent, setOpenStudent] = useState(null);
    const [showNotifCenter, setShowNotifCenter] = useState(false);
    const [exportingAll, setExportingAll] = useState(false);

    const [profileIncomplete, setProfileIncomplete] = useState(false);
    const [profileDraftName, setProfileDraftName] = useState('');
    const [savingProfile, setSavingProfile] = useState(false);
    const [showCompleteProfile, setShowCompleteProfile] = useState(false);

    // Estado Global da Sessão Ativa
	const [activeSession, setActiveSession] = useState(null);
	const suppressForeignFinishToastUntilRef = useRef(0);
    const [sessionTicker, setSessionTicker] = useState(0);
    const [showAdminPanel, setShowAdminPanel] = useState(false);
    const userSettingsApi = useUserSettings(user?.id)

    const supabase = useRef(createClient()).current;
    const router = useRouter();
    const isFetching = useRef(false);

    const signOutInFlightRef = useRef(false);
    const serverSessionSyncRef = useRef({ timer: null, lastKey: '' });
    const serverSessionSyncWarnedRef = useRef(false);

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
                } catch {}
            });
        } catch {}
    }, []);

    const clearSupabaseStorageBestEffort = useCallback(() => {
        try {
            if (typeof window === 'undefined') return;
            const ls = window.localStorage;
            if (!ls) return;
            const keys = [];
            for (let i = 0; i < ls.length; i++) {
                const k = ls.key(i);
                if (!k) continue;
                if (k.startsWith('sb-') || k.includes('supabase') || k.includes('auth-token')) keys.push(k);
            }
            keys.forEach((k) => {
                try { ls.removeItem(k); } catch {}
            });
        } catch {}
    }, []);

		const clearClientSessionState = useCallback(() => {
		try {
			localStorage.removeItem('activeSession');
			localStorage.removeItem('appView');
			if (user?.id) {
				localStorage.removeItem(`irontracks.activeSession.v2.${user.id}`);
				localStorage.removeItem(`irontracks.appView.v2.${user.id}`);
			}
		} catch {}
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
            } catch {}
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
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object' && parsed?.startedAt && parsed?.workout) {
                    localSavedAt = Number(parsed?._savedAt ?? 0) || 0;
                    setActiveSession(parsed);
                    setView('active');

                    if (!localStorage.getItem(scopedKey)) {
                        try {
                            localStorage.setItem(scopedKey, JSON.stringify(parsed));
                            localStorage.removeItem('activeSession');
                        } catch {}
                    }
                }
            }
        } catch {
            try {
                localStorage.removeItem(scopedKey);
                localStorage.removeItem('activeSession');
            } catch {}
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
                            setNotification({
                                text: 'Sincronização do treino entre navegadores indisponível (migrations pendentes).',
                                senderName: 'Aviso do Sistema',
                                displayName: 'Sistema',
                                photoURL: null,
                            });
                        } catch {}
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
                } catch {}
            } catch {}
        };

        loadServer();

        return () => {
            cancelled = true;
        };
    }, [supabase, user?.id]);

    useEffect(() => {
        const userId = user?.id ? String(user.id) : '';
        if (!userId) return;

        let mounted = true;
        let channel;

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
                    (payload) => {
                        try {
                            if (!mounted) return;
						const ev = String(payload?.eventType || '').toUpperCase();
						if (ev === 'DELETE') {
							if (Date.now() < (suppressForeignFinishToastUntilRef.current || 0)) {
								suppressForeignFinishToastUntilRef.current = 0;
								return;
							}
							setActiveSession(null);
							setView('dashboard');
							try {
								localStorage.removeItem(`irontracks.activeSession.v2.${userId}`);
							} catch {}
                                try {
                                    setNotification({
                                        text: 'Treino finalizado em outro dispositivo.',
                                        senderName: 'Aviso do Sistema',
                                        displayName: 'Sistema',
                                        photoURL: null,
                                    });
                                } catch {}
                                return;
                            }

                            if (ev === 'UPDATE') {
                                const state = payload?.new?.state;
                                if (!state || typeof state !== 'object' || !state?.startedAt || !state?.workout) {
                                    setActiveSession(null);
                                    setView('dashboard');
                                    try {
                                        localStorage.removeItem(`irontracks.activeSession.v2.${userId}`);
                                    } catch {}
                                }
                            }
                        } catch {}
                    }
                )
                .subscribe();
        } catch {}

        return () => {
            mounted = false;
            try {
                if (channel) supabase.removeChannel(channel);
            } catch {
                try {
                    if (channel) createClient().removeChannel(channel);
                } catch {}
            }
        };
    }, [supabase, user?.id]);

    useEffect(() => {
        const handler = () => { try { unlockAudio(); } catch {} };
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
                return;
            }

            const payload = JSON.stringify({ ...(activeSession || {}), _savedAt: Date.now() });
            const id = setTimeout(() => {
                try {
                    localStorage.setItem(key, payload);
                } catch {}
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
                } catch {}
            }
        } catch {}

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
                                setNotification({
                                    text: 'Sincronização do treino entre navegadores indisponível (migrations pendentes).',
                                    senderName: 'Aviso do Sistema',
                                    displayName: 'Sistema',
                                    photoURL: null,
                                });
                            } catch {}
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
                            setNotification({
                                text: 'Sincronização do treino entre navegadores indisponível (migrations pendentes).',
                                senderName: 'Aviso do Sistema',
                                displayName: 'Sistema',
                                photoURL: null,
                            });
                        } catch {}
                    }
                }
            } catch {}
        };

        let timerId = null;

        try {
            timerId = setTimeout(() => {
                try {
                    run();
                } catch {}
            }, 900);
            serverSessionSyncRef.current.timer = timerId;
        } catch {}

        return () => {
            try {
                if (timerId) clearTimeout(timerId);
            } catch {}
        };
    }, [activeSession, supabase, user?.id]);

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
                    console.error('Erro ao carregar notificações:', error);
                    setHasUnreadNotification(false);
                    return;
                }
                setHasUnreadNotification(Array.isArray(data) && data.length > 0);
            } catch (e) {
                if (cancelled) return;
                console.error('Erro ao carregar notificações:', e);
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

        const channel = supabase
            .channel(`direct-messages-badge:${user.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'direct_messages'
            }, async (payload) => {
                try {
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
                    console.error('Erro ao gerar notificação de mensagem direta:', e);
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [supabase, user?.id, view]);

    useEffect(() => {
        const meta = initialUser?.user_metadata || {}
        const emailRaw = String(initialUser?.email || '').trim()
        const emailUser = emailRaw.includes('@') ? emailRaw.split('@')[0] : (emailRaw || 'Usuário')
        const displayName = meta?.full_name || meta?.name || emailUser
        const photoURL = meta?.avatar_url || meta?.picture || null
        const nextUser = { ...initialUser, displayName, photoURL, role: initialProfile?.role || 'student' }
        setUser(nextUser)
        setIsCoach(String(initialProfile?.role || '').toLowerCase() === 'teacher')
    }, [initialUser, initialProfile])

    // Sync Profile Separately (Optimized)
    useEffect(() => {
        if (user?.id) {
             const syncProfile = async () => {
                 try {
                    await supabase
                        .from('profiles')
                        .update({ last_seen: new Date().toISOString() })
                        .eq('id', user.id);
                 } catch (e) {
                    console.error('Erro ao sincronizar perfil:', e);
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
                const { data, error } = await supabase
                    .from('profiles')
                    .select('id, display_name')
                    .eq('id', user.id)
                    .maybeSingle();

                if (cancelled) return;

                if (error) {
                    setProfileIncomplete(true);
                    setProfileDraftName(String(user?.displayName || '').trim());
                    return;
                }

                const displayName = String(data?.display_name || '').trim();
                setProfileIncomplete(!displayName);
                setProfileDraftName(displayName || String(user?.displayName || '').trim());
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
    }, [supabase, user?.id, user?.displayName]);

	// Fetch Workouts
	const fetchWorkouts = useCallback(async (specificUser = user) => {
		const supabase = createClient();
        if (isFetching.current) return;
        isFetching.current = true;
        
		try {
			const currentUser = specificUser;

            if (!currentUser) {
                console.warn("DASHBOARD: Usuário não identificado ao buscar treinos.");
                return;
            }

            const role = currentUser.role || 'user';

            let data = []
            let studentData = []
            let studentsList = []

            if (role === 'admin' || role === 'teacher') {
                // 1. Fetch Students
                try {
                    const { data: st } = await supabase
                        .from('students')
                        .select('id, name, email, user_id')
                        .or(`teacher_id.eq.${currentUser.id},user_id.eq.${currentUser.id}`)
                        .order('name');
                    studentsList = st || [];
                } catch (e) { console.error('Erro fetching students', e); }

                // 2. Fetch My Workouts
                const { data: myD, error: myErr } = await supabase
                    .from('workouts')
                    .select(`
                        *,
                        exercises (
                            *,
                            sets (*)
                        )
                    `)
                    .eq('is_template', true)
                    .eq('user_id', currentUser.id)
                    .order('name', { ascending: true })
                if (myErr) throw myErr
                data = myD || []

                // 3. Fetch Student Workouts
                const ids = studentsList.map(s => s.user_id || s.id).filter(Boolean)
                if (ids.length > 0) {
                    const seen = new Set()
                    const combined = []
                    try {
                        const { data: swByUser } = await supabase
                            .from('workouts')
                            .select('*, exercises(*, sets(*))')
                            .eq('is_template', true)
                            .in('user_id', ids)
                            .order('name')
                            .limit(500)
                        for (const w of (swByUser || [])) { if (!seen.has(w.id)) { seen.add(w.id); combined.push(w) } }
                    } catch {}
                    try {
                        const { data: swByStudent } = await supabase
                            .from('workouts')
                            .select('*, exercises(*, sets(*))')
                            .eq('is_template', true)
                            .in('student_id', ids)
                            .order('name')
                            .limit(500)
                        for (const w of (swByStudent || [])) { if (!seen.has(w.id)) { seen.add(w.id); combined.push(w) } }
                    } catch {}
                    studentData = combined
                }
            } else {
                const { data: d, error } = await supabase
                    .from('workouts')
                    .select(`
                        *,
                        exercises (
                            *,
                            sets (*)
                        )
                    `)
                    .eq('is_template', true)
                    .eq('user_id', currentUser.id)
                    .order('name', { ascending: true })
                if (error) throw error
                data = d || []
            }

			if (Array.isArray(data)) {
				const mappedRaw = data
					.map((row) => mapWorkoutRow(row))
					.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
                const mapped = mappedRaw.filter(w => Array.isArray(w.exercises) && w.exercises.length > 0);

                if (role === 'admin' || role === 'teacher') {
                    setWorkouts(mapped)
                    try {
                        const studentMapped = (studentData || []).map(mapWorkoutRow)
                        const byStudent = new Map()
                        for (const w of studentMapped) {
                            const sid = w.user_id
                            if (!sid) continue
                            const list = byStudent.get(sid) || []
                            list.push(w)
                            byStudent.set(sid, list)
                        }
                        const nameById = new Map()
                        for (const s of (studentsList || [])) {
                            const sid = s.user_id || s.id
                            if (!sid) continue
                            nameById.set(sid, { name: s.name || String(sid).slice(0,8), email: s.email || '' })
                        }
                        const folders = Array.from(byStudent.entries()).map(([sid, list]) => {
                            const info = nameById.get(sid) || { name: String(sid).slice(0,8), email: '' }
                            return { id: sid, name: info.name, email: info.email, workouts: list }
                        }).filter(f => (f.workouts || []).length > 0)
                        setStudentFolders(folders)
                    } catch (err) {
                        console.error("Erro ao processar alunos:", err);
                        setStudentFolders([])
                    }
                } else {
                    setWorkouts(mapped)
                    try {
                        const shared = mapped.filter(w => (w.created_by && w.created_by !== currentUser.id))
                        const byCoach = new Map()
                        for (const w of shared) {
                            const cid = w.created_by
                            const list = byCoach.get(cid) || []
                            list.push(w)
                            byCoach.set(cid, list)
                        }
                        const coachIds = Array.from(byCoach.keys())
                        let profiles = []
                        if (coachIds.length) {
                            const { data: profs } = await supabase.from('profiles').select('id, display_name').in('id', coachIds)
                            profiles = profs || []
                        }
                        const nameByCoach = new Map(profiles.map(p => [p.id, p.display_name || String(p.id).slice(0,8)]))
                        const folders = Array.from(byCoach.entries()).map(([cid, list]) => ({
                            id: cid,
                            name: `Treinos compartilhados de ${nameByCoach.get(cid) || String(cid).slice(0,8)}`,
                            email: '',
                            workouts: list
                        }))
                        setStudentFolders(folders)
                    } catch {
                        setStudentFolders([])
                    }
                }
                
				// Atualiza estatísticas
				const totalEx = mapped.reduce((acc, w) => acc + (Array.isArray(w?.exercises) ? w.exercises.length : 0), 0);
				setStats({ 
					workouts: mapped.length, 
					exercises: totalEx, 
					activeStreak: 0 // Placeholder
				});
            } else {
                console.warn('Fetch sem dados; mantendo estado atual');
            }
		} catch (e) {
			const msg = e?.message ?? String(e);
			if (msg.includes('Failed to fetch') || msg.includes('ERR_ABORTED')) {
				// Dev HMR aborts or transient network; ignore quietly
				return;
			}
			console.error("Erro ao buscar:", { message: msg, error: e });
		} finally { isFetching.current = false; }
	}, [user]); // Depende apenas do usuário para evitar loops de busca

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
            } catch {}
        }
    }, [user, workouts.length]);


    // Handlers de Sessão
    const handleLogout = async () => {
        const ok = await confirm("Deseja realmente sair da sua conta?", "Sair");
        if (!ok) return;
        try { clearClientSessionState(); } catch {}
        try { window.location.href = '/auth/logout'; } catch {}
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
            await alert('Erro ao salvar perfil: ' + (e?.message || String(e || '')));
        } finally {
            setSavingProfile(false);
        }
    };

    const handleStartSession = async (workout) => {
        const exercisesList = Array.isArray(workout?.exercises)
            ? workout.exercises.filter(ex => ex && typeof ex === 'object')
            : [];

        if (exercisesList.length === 0) {
            await alert('Este treino está sem exercícios válidos. Edite o treino antes de iniciar.', 'Treino incompleto');
            return;
        }

        const first = exercisesList[0] || {};
        const exMin = toMinutesRounded(estimateExerciseSeconds(first));
        const totalMin = toMinutesRounded(exercisesList.reduce((acc, ex) => acc + calculateExerciseDuration(ex), 0));
        const workoutTitle = String(workout?.title || workout?.name || 'Treino');
        const ok = await confirm(`Iniciar "${workoutTitle}"? Primeiro exercício: ~${exMin} min. Estimado total: ~${totalMin} min.`, 'Iniciar Treino');
        if (!ok) return;
        playStartSound();
        setActiveSession({
            workout: { ...workout, exercises: exercisesList },
            logs: {},
            startedAt: Date.now(),
            timerTargetTime: null
        });
        setView('active');
        if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
            Notification.requestPermission().catch(e => console.warn('Erro permissão notificação:', e));
        }
    };

    const handleUpdateSessionLog = (key, data) => {
        if (!activeSession) return;
        setActiveSession(prev => {
            if (!prev) return null;
            return {
                ...prev,
                logs: { ...(prev.logs || {}), [key]: data }
            };
        });
    };

    const handleStartTimer = (duration) => {
        setActiveSession((prev) => {
            if (!prev) return prev;
            return {
                ...prev,
                timerTargetTime: Date.now() + (duration * 1000)
            };
        });
    };

    const handleCloseTimer = () => {
        setActiveSession((prev) => {
            if (!prev) return prev;
            return { ...prev, timerTargetTime: null };
        });
    };

	const handleFinishSession = async (sessionData, showReport) => {
		suppressForeignFinishToastUntilRef.current = Date.now() + 8000;
		setActiveSession(null);
		if (showReport === false) {
			setView('dashboard');
			return;
		}
        setReportData({ current: sessionData, previous: null });
        setView('report');
    };

    // Handlers CRUD
	const handleCreateWorkout = () => { setCurrentWorkout({ title: '', exercises: [] }); setView('edit'); };

	const handleEditWorkout = async (workout) => {
		if (!workout || !workout.id) return;
		try {
			const supabase = createClient();
			const { data, error } = await supabase
				.from('workouts')
				.select('*, exercises(*, sets(*))')
				.eq('id', workout.id)
				.maybeSingle();
			if (error) throw error;
			if (!data) {
				setCurrentWorkout(workout);
				setView('edit');
				return;
			}
			const mapped = mapWorkoutRow(data);
			setCurrentWorkout(mapped);
			setView('edit');
		} catch (e) {
			const msg = e?.message || String(e || '');
			await alert('Erro ao carregar treino para edição: ' + msg);
		}
	};

    const handleSaveWorkout = async (workoutToSave) => {
        const w = workoutToSave || currentWorkout;
        if (!user || !w || !w.title) return;
        try {
            if (w.id) {
                const res = await updateWorkout(w.id, w);
                setCurrentWorkout(w);
                return res;
            } else {
                const created = await createWorkout(w);
                const id = created?.id ?? null;
                setCurrentWorkout({ ...w, id });
                return created;
            }
        } catch (e) {
            throw e;
        }
    };

	const handleDeleteWorkout = async (id, title) => {
		const name = title || (workouts.find(w => w.id === id)?.title) || 'este treino';
		if (!(await confirm(`Apagar o treino "${name}"?`, "Excluir Treino"))) return;
		try {
			await deleteWorkout(id);
			await fetchWorkouts();
		} catch (e) { await alert("Erro: " + (e?.message ?? String(e))); }
	};

	const handleDuplicateWorkout = async (workout) => {
		if (!(await confirm(`Duplicar "${workout.title}"?`, "Duplicar Treino"))) return;
		const newWorkout = { ...workout, title: `${workout.title} (Cópia)` };
		delete newWorkout.id;
		try {
			await createWorkout(newWorkout);
			await fetchWorkouts();
		} catch (e) { await alert("Erro ao duplicar: " + (e?.message ?? String(e))); }
	};

    const handleShareWorkout = async (workout) => {
        setExportWorkout(workout);
        setShowExportModal(true);
    };

	const handleExportPdf = async () => {
		if (!exportWorkout) return;
		try {
			const html = workoutPlanHtml(exportWorkout, user);
			const win = window.open('', '_blank');
			if (!win) return;
			win.document.open();
			win.document.write(html);
			win.document.close();
			win.focus();
			setTimeout(() => { try { win.print(); } catch {} }, 300);
			setShowExportModal(false);
		} catch (e) { await alert('Erro ao gerar PDF: ' + (e?.message ?? String(e))); }
	};

    const handleExportJson = () => {
        if (!exportWorkout) return;
        const json = JSON.stringify({ workout: { title: exportWorkout.title, exercises: (exportWorkout.exercises || []).map(ex => ({ name: ex.name, sets: ex.sets, reps: ex.reps, rpe: ex.rpe, cadence: ex.cadence, restTime: ex.restTime, method: ex.method, videoUrl: ex.videoUrl, notes: ex.notes })) } }, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(exportWorkout.title || 'treino').replace(/\s+/g,'_')}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        setShowExportModal(false);
    };

    const handleExportAllWorkouts = async () => {
        try {
            setExportingAll(true);
            const payload = {
                user: { id: user?.id || '', email: user?.email || '' },
                workouts: (workouts || []).map(w => ({
                    id: w.id,
                    title: w.title,
                    notes: w.notes,
                    is_template: true,
                    exercises: (w.exercises || []).map(ex => ({
                        name: ex.name,
                        sets: ex.sets,
                        reps: ex.reps,
                        rpe: ex.rpe,
                        cadence: ex.cadence,
                        restTime: ex.restTime,
                        method: ex.method,
                        videoUrl: ex.videoUrl,
                        notes: ex.notes
                    }))
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
    const handleJsonUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const json = JSON.parse(event.target.result);
                if (await confirm(`Importar dados de ${json.user?.email || 'Unknown'}? Isso criará novos treinos.`, "Importar Backup")) {
                    await importData(json);
                    await fetchWorkouts();
                    await alert("Dados importados com sucesso!", "Sucesso");
                    setShowJsonImportModal(false);
                }
		} catch (err) {
			await alert("Erro ao ler arquivo JSON: " + (err?.message ?? String(err)));
		}
	};
        reader.readAsText(file);
    };

    if (authLoading) return <LoadingScreen />;
    if (!user) return null;

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
        <TeamWorkoutProvider user={user}>
            <div className="w-full bg-neutral-900 min-h-screen relative flex flex-col overflow-hidden">
                <IncomingInviteModal onStartSession={handleStartSession} />

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
                            <span className="text-zinc-400 text-xs font-medium tracking-wide uppercase">
                                {isCoach ? 'Bem vindo Coach' : 'Bem vindo Atleta'}
                            </span>
                        </div>
                        
                        <div className="flex items-center gap-4">
                                <HeaderActionsMenu
                                user={user}
                                isCoach={isCoach}
                                hasUnreadChat={hasUnreadChat}
                                hasUnreadNotification={hasUnreadNotification}
                                onOpenAdmin={() => {
                                    setShowAdminPanel(true);
                                    if (typeof window !== 'undefined') {
                                        const url = new URL(window.location);
                                        url.searchParams.delete('view');
                                        window.history.replaceState({}, '', url);
                                    }
                                }}
                                onOpenChatList={() => setView('chatList')}
                                onOpenGlobalChat={() => setView('globalChat')}
                                onOpenHistory={() => setView('history')}
                                onOpenNotifications={() => {
                                    setShowNotifCenter(true);
                                    setHasUnreadNotification(false);
                                }}
                                onOpenSchedule={() => router.push('/dashboard/schedule')}
                                onOpenSettings={() => setSettingsOpen(true)}
                                onLogout={handleLogout}
                            />
                        </div>
                    </div>
                )}

                {isCoach && coachPending && (
                    <div className="bg-yellow-500 text-black text-sm font-bold px-4 py-2 text-center">
                        Sua conta de Professor está pendente. <button className="underline" onClick={async () => { try { const r = await fetch('/api/teachers/accept', { method: 'POST' }); const j = await r.json(); if (j.ok) { setCoachPending(false); await alert('Conta ativada!'); } else { await alert('Falha ao ativar: ' + (j.error || '')); } } catch (e) { await alert('Erro: ' + (e?.message ?? String(e))); } }}>Aceitar</button>
                    </div>
                )}

                {user && <RealtimeNotificationBridge setNotification={setNotification} />}

                {/* Main Content */}
                <div
                    className="flex-1 overflow-y-auto custom-scrollbar relative"
                    style={{
                        '--dashboard-sticky-top': isHeaderVisible ? 'calc(4rem + env(safe-area-inset-top))' : '0px',
                        paddingTop: isHeaderVisible ? 'calc(4rem + env(safe-area-inset-top))' : undefined,
                    }}
                >
                    {(view === 'dashboard' || view === 'assessments') && (
                        <StudentDashboard
                            workouts={Array.isArray(workouts) ? workouts : []}
                            profileIncomplete={Boolean(profileIncomplete)}
                            onOpenCompleteProfile={() => setShowCompleteProfile(true)}
                            view={view === 'assessments' ? 'assessments' : 'dashboard'}
                            onChangeView={(next) => setView(next)}
                            assessmentsContent={user?.id ? <AssessmentHistory studentId={user.id} /> : null}
                            settings={userSettingsApi?.settings ?? null}
                            onCreateWorkout={handleCreateWorkout}
                            onQuickView={(w) => setQuickViewWorkout(w)}
                            onStartSession={(w) => handleStartSession(w)}
                            onShareWorkout={(w) => handleShareWorkout(w)}
                            onDuplicateWorkout={(w) => handleDuplicateWorkout(w)}
                            onEditWorkout={(w) => handleEditWorkout(w)}
                            onDeleteWorkout={(id, title) => handleDeleteWorkout(id, title)}
                            currentUserId={user?.id}
                            exportingAll={Boolean(exportingAll)}
                            onExportAll={handleExportAllWorkouts}
                            onOpenJsonImport={() => setShowJsonImportModal(true)}
                            onOpenIronScanner={async () => {
                                try {
                                    await handleCreateWorkout()
                                    await alert('No editor, clique em Scanner de Treino (Imagem).', 'Scanner')
                                } catch {}
                            }}
                        />
                    )}

					{view === 'edit' && (
						<ExerciseEditor
							workout={currentWorkout}
							onCancel={() => setView('dashboard')}
							onChange={setCurrentWorkout}
							onSave={handleSaveWorkout}
							onSaved={() => {
								fetchWorkouts().catch(() => {});
								setView('dashboard');
							}}
						/>
					)}

                    {view === 'active' && activeSession && (
                        <ActiveWorkout
                            session={activeSession}
                            user={user}
                            onUpdateLog={handleUpdateSessionLog}
                            onFinish={handleFinishSession}
                            onBack={() => setView('dashboard')}
                            onStartTimer={handleStartTimer}
                            isCoach={isCoach}
                            onUpdateSession={(updates) => setActiveSession(prev => ({ ...prev, ...updates }))}
                            nextWorkout={nextWorkout}
                        />
                    )}

                    {view === 'history' && (
                        <div className="p-4 pb-24">
                            <HistoryList
                                user={user}
                                onViewReport={(s) => { setReportData({ current: s, previous: null }); setView('report'); }}
                                onBack={() => setView('dashboard')}
                            />
                        </div>
                    )}

                    {/* Evolução removida conforme solicitação */}

                    {view === 'report' && reportData.current && (
                        <div className="fixed inset-0 z-[1200] bg-neutral-900 overflow-y-auto pt-safe">
                            <WorkoutReport
                                session={reportData.current}
                                previousSession={reportData.previous}
                                user={user}
                                onClose={() => setView('dashboard')}
                            />
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
                                    <h3 className="font-bold text-white">Treinos de {openStudent.name}</h3>
                                    <BackButton onClick={() => setOpenStudent(null)} className="bg-transparent hover:bg-neutral-800 text-neutral-300" />
                                </div>
                                <div className="p-4 space-y-2 max-h-[70vh] overflow-y-auto">
                                    {(openStudent.workouts || []).length === 0 && (
                                        <p className="text-neutral-500 text-sm">Nenhum treino encontrado.</p>
                                    )}
                                    {(openStudent.workouts || []).map(w => (
                                        <div key={w.id} className="p-3 rounded-xl border border-neutral-700 bg-neutral-800">
                                            <div className="flex items-center justify-between">
                                                <span className="text-white font-bold text-sm">{w.title}</span>
                                                <span className="text-xs text-neutral-400">{w.exercises?.length || 0} exercícios</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {view === 'chat' && (
                        <div className="absolute inset-0 z-50 bg-neutral-900">
                            <ChatScreen user={user} onClose={() => setView('dashboard')} />
                        </div>
                    )}

                    {view === 'globalChat' && (
                        <div className="absolute inset-0 z-50 bg-neutral-900">
                            <ChatScreen user={user} onClose={() => setView('dashboard')} />
                        </div>
                    )}

                    {view === 'chatList' && (
                        <div className="absolute inset-0 z-50 bg-neutral-900">
                            <ChatListScreen user={user} onClose={() => setView('dashboard')} onSelectChannel={(c) => { setDirectChat(c); setView('directChat'); }} />
                        </div>
                    )}

                    {view === 'directChat' && directChat && (
                        <div className="absolute inset-0 z-50 bg-neutral-900">
                            <ChatDirectScreen user={user} otherUserId={directChat.other_user_id} otherUserName={directChat.other_user_name} otherUserPhoto={directChat.other_user_photo} onClose={() => setView('chatList')} />
                        </div>
                    )}

                    {view === 'admin' && (
                        <div className="fixed inset-0 z-[60]">
                            <AdminPanelV2 user={user} onClose={() => setView('dashboard')} />
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
                                {(Array.isArray(quickViewWorkout?.exercises) ? quickViewWorkout.exercises : []).map((ex, idx) => (
                                    <div key={idx} className="p-3 rounded-xl bg-neutral-800/50 border border-neutral-700">
                                        <div className="flex justify-between items-center">
                                            <h4 className="font-bold text-white text-sm">{String(ex?.name || '—')}</h4>
                                            <span className="text-xs text-neutral-400">{(parseInt(ex?.sets) || 0)} x {String(ex?.reps || '-')}</span>
                                        </div>
                                        <div className="text-xs text-neutral-400 mt-1 flex items-center gap-2">
                                            <Clock size={14} className="text-yellow-500" /><span>Descanso: {ex?.restTime ? `${parseInt(ex.restTime)}s` : '-'}</span>
                                        </div>
                                        {ex?.notes && <p className="text-sm text-neutral-300 mt-2">{String(ex.notes || '')}</p>}
                                    </div>
                                ))}
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
                    <div className="fixed inset-0 z-[75] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowNotifCenter(false)}>
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
                                <NotificationCenter user={user} onStartSession={handleStartSession} embedded />
                            </div>
                        </div>
                    </div>
                )}

                {activeSession?.timerTargetTime && (
                    <RestTimerOverlay
                        targetTime={activeSession.timerTargetTime}
                        onClose={handleCloseTimer}
                        onFinish={handleCloseTimer}
                    />
                )}

                {notification && (
                    <NotificationToast
                        message={notification.text}
                        sender={notification.senderName}
                        onClick={() => { setView('chat'); setNotification(null); }}
                        onClose={() => setNotification(null)}
                    />
                )}

                {activeSession && view !== 'active' && (
                    <div className="fixed bottom-0 left-0 right-0 z-[1100]">
                        <div className="bg-neutral-900/95 backdrop-blur border-t border-neutral-800 px-4 py-3 pb-[max(env(safe-area-inset-bottom),12px)]">
                            <div className="flex items-center gap-4">
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-bold text-white truncate">{activeSession.workout?.title || 'Treino em andamento'}</h3>
                                    <div className="flex items-center gap-3 text-xs text-neutral-300 mt-1">
                                        <span className="font-mono text-yellow-500">{(() => { const end = sessionTicker || activeSession.startedAt; const s = Math.max(0, Math.floor((end - activeSession.startedAt) / 1000)); const m = Math.floor(s/60), sec = s%60; return `${m}:${String(sec).padStart(2,'0')}`; })()}</span>
                                        <span className="text-neutral-500">tempo atual</span>
                                        <span className="opacity-30">•</span>
                                        <span className="font-mono text-neutral-200">{(() => { const total = (activeSession.workout?.exercises || []).reduce((acc, ex) => acc + calculateExerciseDuration(ex), 0); return `${toMinutesRounded(total)} min`; })()}</span>
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
                    <AdminPanelV2 user={user} onClose={() => setShowAdminPanel(false)} />
                )}

                {settingsOpen && (
                    <SettingsModal
                        isOpen={settingsOpen}
                        onClose={() => setSettingsOpen(false)}
                        settings={userSettingsApi?.settings ?? null}
                        saving={Boolean(userSettingsApi?.saving)}
                        onSave={async (next) => {
                            try {
                                const safeNext = next && typeof next === 'object' ? next : (userSettingsApi?.settings ?? {})
                                const res = await userSettingsApi?.save?.(safeNext)
                                if (!res?.ok) {
                                    await alert('Falha ao salvar: ' + (res?.error || ''))
                                    return false
                                }
                                return true
                            } catch (e) {
                                await alert('Falha ao salvar: ' + (e?.message ?? String(e)))
                                return false
                            }
                        }}
                    />
                )}
            </div>
        </TeamWorkoutProvider>
    );
}

export default function IronTracksAppClient({ initialUser, initialProfile }) {
    return (
        <ErrorBoundary>
            <DialogProvider>
                <IronTracksApp initialUser={initialUser} initialProfile={initialProfile} />
                <GlobalDialog />
            </DialogProvider>
        </ErrorBoundary>
    );
}

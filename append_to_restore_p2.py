
with open('restore_client.py', 'a') as f:
    f.write('parts.append("""')
    f.write(r"""                const shouldOpen = !wasTourSeenEver(uid) && !wasTourAutoOpenedThisSession(uid) && (!completed && !skipped)
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
        } catch {}
        try {
            fetch('/api/social/presence/ping', { method: 'POST' }).catch(() => {});
        } catch {}
        try {
            fetch('/api/profiles/ping', { method: 'POST' }).catch(() => {});
        } catch {}
    }, [user?.id]);

    useEffect(() => {
        if (authLoading) return;
        if (user) return;
        const t = setTimeout(() => {
            try {
                router.replace('/?next=/dashboard');
            } catch {}
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
        if (prefs?.whatsNewAutoOpen === false) return
        ;(async () => {
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
                } catch {}
                whatsNewShownRef.current = true
                setWhatsNewOpen(true)
                setPendingUpdate(first)
            } catch {}
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
                } catch {}
                setPendingUpdate(null)
                return
            }
            const entry = getLatestWhatsNew()
            if (!entry?.id) return
            const prev = userSettingsApi?.settings && typeof userSettingsApi.settings === 'object' ? userSettingsApi.settings : {}
            const nextSeenAt = Date.now()
            const next = { ...(prev || {}), whatsNewLastSeenId: String(entry.id), whatsNewLastSeenAt: nextSeenAt }
            try { userSettingsApi?.setSettings?.(next) } catch {}
            try { await userSettingsApi?.save?.(next) } catch {}
        } catch {}
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
        } catch {}
    }, []);

    const removeUrlTabParam = useCallback(() => {
        try {
            if (typeof window === 'undefined') return;
            const url = new URL(window.location.href);
            url.searchParams.delete('tab');
            window.history.replaceState({}, '', url);
        } catch {}
    }, []);

    const openAdminPanel = useCallback((tab: unknown) => {
        setShowAdminPanel(true);
        try {
            if (typeof window !== 'undefined') {
                sessionStorage.setItem(ADMIN_PANEL_OPEN_KEY, '1');
                if (tab) sessionStorage.setItem(ADMIN_PANEL_TAB_KEY, String(tab));
                if (tab) setUrlTabParam(tab);
            }
        } catch {}
    }, [setUrlTabParam]);

    const closeAdminPanel = useCallback(() => {
        setShowAdminPanel(false);
        try {
            if (typeof window !== 'undefined') {
                sessionStorage.removeItem(ADMIN_PANEL_OPEN_KEY);
                sessionStorage.removeItem(ADMIN_PANEL_TAB_KEY);
            }
        } catch {}
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

            const shouldOpen = open === '1' || !!urlTab;
            if (!shouldOpen) return;

            const tab = urlTab || storedTab || 'dashboard';
            try {
                sessionStorage.setItem(ADMIN_PANEL_OPEN_KEY, '1');
                sessionStorage.setItem(ADMIN_PANEL_TAB_KEY, tab);
            } catch {}
            if (!urlTab && tab) setUrlTabParam(tab);
            setShowAdminPanel(true);
        } catch {}
    }, [setUrlTabParam, user?.role]);

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
        } catch {}
    }, [supabase]);

    const signOutInFlightRef = useRef(false);
    const serverSessionSyncRef = useRef({ timer: null, lastKey: '' });
    const serverSessionSyncWarnedRef = useRef(false);

    const generateExerciseKey = useCallback(() => {
        try {
            if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
        } catch {}
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
            return { title: 'Treino', exercises: [] };
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
                } catch {}
            });
        } catch {}
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
                const parsed: unknown = JSON.parse(raw);
                if (isRecord(parsed) && parsed?.startedAt && parsed?.workout) {
                    localSavedAt = Number(parsed?._savedAt ?? 0) || 0;
                    setActiveSession(parsed as unknown as ActiveWorkoutSession);
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
                            inAppNotify({
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
							} catch {}
                                try {
                                    inAppNotify({
                                        text: 'Treino finalizado em outro dispositivo.',
                                        senderName: 'Aviso do Sistema',
                                        displayName: 'Sistema',
                                        photoURL: null,
                                    });
                                } catch {}
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
    }, [supabase, user?.id, inAppNotify]);

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
""")
    f.write('\n')

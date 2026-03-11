import { useCallback, useEffect, useRef } from 'react'
import { useStableSupabaseClient } from '@/hooks/useStableSupabaseClient'
import { logError, logWarn } from '@/lib/logger'
import type { AdminUser, AdminTeacher, AdminWorkoutTemplate } from '@/types/admin'
import type { UnknownRecord } from '@/types/app'
import type { WorkoutExercise } from '@/types/workout'
import { adminFetchJson } from '@/utils/admin/adminFetch'
import { workoutTitleKey, normalizeWorkoutTitle } from '@/utils/workoutTitle'
import { getErrorMessage } from '@/utils/errorMessage'
import { z } from 'zod'
import { parseJsonWithSchema } from '@/utils/zod'
import { apiAdmin, apiWorkouts } from '@/lib/api'

interface AdminDataFetchersDeps {
    user: AdminUser
    isAdmin: boolean
    isTeacher: boolean
    registering: boolean
    teachersList: AdminTeacher[]
    addingTeacher: boolean
    editingTeacher: AdminTeacher | null
    selectedStudent: AdminUser | null
    tab: string
    subTab: string
    getAdminAuthHeaders: () => Record<string, string>
    loadedStudentInfo: React.MutableRefObject<Record<string, boolean>>
    setUsersList: (v: AdminUser[]) => void
    setTeachersList: (v: AdminTeacher[]) => void
    setTemplates: (v: unknown[]) => void
    setStudentWorkouts: (v: unknown[]) => void
    setSyncedWorkouts: (v: unknown[]) => void
    setAssessments: (v: unknown[]) => void
    setPendingProfiles: (v: unknown[]) => void
    setSelectedStudent: (v: AdminUser | null) => void
    setLoading: (v: boolean) => void
    setDebugError: (v: string) => void
    setErrorReports: (v: unknown[]) => void
    setErrorsLoading: (v: boolean) => void
    setVideoQueue: (v: unknown[]) => void
    setVideoLoading: (v: boolean) => void
    setVideoMissingCount: (v: number) => void
    setVideoMissingLoading: (v: boolean) => void
    setExerciseAliasesReview: (v: unknown[]) => void
    setExerciseAliasesLoading: (v: boolean) => void
    setExerciseAliasesError: (v: string) => void
    setTab: (v: string) => void
}

/**
 * Data fetching logic extracted from useAdminPanelController.
 * Handles: testConnection, fetchStudents, fetchTeachers, fetchTemplates,
 * fetchMissing, fetchVideos, fetchErrors, fetchAliases, fetchDetails.
 */
export function useAdminDataFetchers(deps: AdminDataFetchersDeps) {
    const supabase = useStableSupabaseClient()
    const {
        user, isAdmin, isTeacher, selectedStudent, tab, subTab,
        registering, teachersList, addingTeacher, editingTeacher,
        getAdminAuthHeaders, loadedStudentInfo,
        setUsersList, setTeachersList, setTemplates, setStudentWorkouts,
        setSyncedWorkouts, setAssessments, setPendingProfiles,
        setSelectedStudent, setLoading, setDebugError,
        setErrorReports, setErrorsLoading,
        setVideoQueue, setVideoLoading, setVideoMissingCount, setVideoMissingLoading,
        setExerciseAliasesReview, setExerciseAliasesLoading, setExerciseAliasesError,
        setTab,
    } = deps

    // ─── useEffects moved from AdminPanelV2 ────────────────────────────────────

    // testConnection
    useEffect(() => {
        const testConnection = async () => {
            try {
                if (!supabase) return;
                const { data, error } = await supabase.from('workouts').select('*').limit(1);
                if (error) {
                    logError('error', "ERRO CRÍTICO SUPABASE:", error);
                    setDebugError("Falha na conexão com o servidor. Verifique sua internet e recarregue a página.");
                } else {
                    void data; // connection OK
                }
            } catch (e: unknown) {
                logError('error', "ERRO DE CONEXÃO/FETCH:", e);
                const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
                setDebugError("Erro Catch: " + msg);
            }
        };
        testConnection();
    }, [supabase]);

    // fetchStudents
    useEffect(() => {
        const fetchStudents = async () => {
            setLoading(true);
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            if (!currentUser) { setLoading(false); return; }
            try {
                let list: UnknownRecord[] = [];
                if (isAdmin) {
                    await getAdminAuthHeaders();
                    const json = await adminFetchJson(supabase, '/api/admin/students/list') as UnknownRecord;
                    if (json?.ok) {
                        list = (json.students as UnknownRecord[]) || [];
                        // Bug 1 fix: populate pending self-registered users
                        const pp = Array.isArray((json as UnknownRecord).pending_profiles)
                            ? ((json as UnknownRecord).pending_profiles as UnknownRecord[])
                            : [];
                        setPendingProfiles(pp);
                    }

                    const legacyJson = await adminFetchJson(supabase, '/api/admin/legacy-students') as UnknownRecord;
                    if (legacyJson?.ok && legacyJson.students) {
                        const existingIds = new Set(list.map((s: UnknownRecord) => s.user_id || s.id));
                        const newLegacy = ((legacyJson.students as unknown) as UnknownRecord[]).filter((s: UnknownRecord) => !existingIds.has(s.id));
                        list = [...list, ...newLegacy];
                        const byEmail = new Map();
                        for (const s of (list || [])) {
                            const key = String(s.email || '').toLowerCase();
                            const prev = byEmail.get(key);
                            if (!prev || (!!s.teacher_id && !prev.teacher_id)) {
                                byEmail.set(key, s);
                            }
                        }
                        list = Array.from(byEmail.values());
                    }
                    if (list.length === 0) {
                        const { data: profiles } = await supabase
                            .from('profiles')
                            .select('id, display_name, email, role')
                            .neq('role', 'teacher')
                            .order('display_name');
                        let teacherEmails = new Set<string>();
                        try {
                            const tJson = await adminFetchJson(supabase, '/api/admin/teachers/list') as UnknownRecord;
                            if (tJson?.ok) teacherEmails = new Set(((tJson.teachers as UnknownRecord[]) || []).map((t: UnknownRecord) => String(t.email || '').toLowerCase()));
                        } catch { }
                        list = (profiles || [])
                            .filter((p: UnknownRecord) => !p.email || !teacherEmails.has(String(p.email).toLowerCase()))
                            .map((p: UnknownRecord) => ({ id: p.id, name: p.display_name, email: p.email, teacher_id: null as string | null, user_id: p.id }));
                        if ((list || []).length === 0) {
                            let query = supabase
                                .from('students')
                                .select('*, workouts(*)')
                                .order('name');
                            const uid = currentUser?.id ? String(currentUser.id) : '';
                            if (uid) query = query.or(`teacher_id.eq.${uid},user_id.eq.${uid}`);
                            const { data: studentsData } = await query;
                            list = (studentsData || []).filter(s => (s.email || '').toLowerCase() !== (currentUser.email || '').toLowerCase());
                        }
                    }
                    const { data: tList } = await supabase.from('teachers').select('id, name, email, user_id');
                    const tEmails = new Set((tList || []).map((t: UnknownRecord) => String(t.email || '').toLowerCase()));
                    const filtered = (list || []).filter((s: UnknownRecord) => {
                        const email = String(s.email || '').toLowerCase();
                        if (email && tEmails.has(email)) return false;
                        return true;
                    });
                    try {
                        list = (filtered || []).map((s: UnknownRecord) => {
                            const key = 'student_teacher_' + (s.email || '');
                            let tid = null;
                            try { tid = localStorage.getItem(key) || null; } catch { }
                            return tid && !s.teacher_id ? { ...s, teacher_id: tid } : s;
                        });
                    } catch { list = filtered; }
                    if (teachersList.length === 0) {
                        let jsonT = null;
                        try {
                            jsonT = await adminFetchJson(supabase, '/api/admin/teachers/list') as UnknownRecord;
                        } catch { }
                        if (jsonT?.ok) {
                            const base = (jsonT.teachers as UnknownRecord[]) || [];
                            try {
                                const emails = base.map((t: UnknownRecord) => t.email).filter(Boolean);
                                if (emails.length > 0) {
                                    const { data: profilesMap } = await supabase
                                        .from('profiles')
                                        .select('id, email')
                                        .in('email', emails);
                                    const idByEmail = new Map((profilesMap || []).map((p: UnknownRecord) => [String(p.email || ''), p.id]));
                                    const enriched: UnknownRecord[] = base.map((t: UnknownRecord) => ({ ...t, user_id: idByEmail.get(String(t.email || '')) || null }));
                                    if (selectedStudent?.teacher_id && !enriched.some((t: UnknownRecord) => t.user_id === selectedStudent.teacher_id)) {
                                        const { data: curProfile } = await supabase
                                            .from('profiles')
                                            .select('id, display_name, email')
                                            .eq('id', selectedStudent.teacher_id)
                                            .maybeSingle();
                                        if (curProfile) enriched.unshift({ id: String(curProfile.id || ''), name: curProfile.display_name, email: curProfile.email, user_id: curProfile.id, status: 'active' } as UnknownRecord);
                                    }
                                    setTeachersList(enriched as AdminTeacher[]);
                                } else {
                                    setTeachersList(base as AdminTeacher[]);
                                }
                            } catch { setTeachersList(base as AdminTeacher[]); }
                        }
                    }
                } else {
                    let query = supabase
                        .from('students')
                        .select('*, workouts(*)')
                        .order('name');
                    const uid = currentUser?.id ? String(currentUser.id) : '';
                    if (uid) query = query.or(`teacher_id.eq.${uid},user_id.eq.${uid}`);
                    const { data: studentsData } = await query;
                    list = (studentsData || []).filter(s => (s.email || '').toLowerCase() !== (currentUser.email || '').toLowerCase());
                    try {
                        list = (list || []).map(s => {
                            const key = 'student_teacher_' + (s.email || '');
                            let tid = null;
                            try { tid = localStorage.getItem(key) || null; } catch { }
                            return tid && !s.teacher_id ? { ...s, teacher_id: tid } : s;
                        });
                    } catch { }
                }
                setUsersList((list || []) as AdminUser[]);
            } finally { setLoading(false); }
        };
        fetchStudents();
        // Bug #3 fix: removed teachersList.length from deps — it caused an infinite re-fetch loop
        // (fetchStudents sets teachersList → teachersList.length changes → re-triggers fetchStudents)
        // Teachers are loaded independently via the dedicated fetchTeachers useEffect below.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [registering, isAdmin, supabase, selectedStudent?.teacher_id, getAdminAuthHeaders, setLoading, setUsersList, setTeachersList]);

    // fetchTeachers
    useEffect(() => {
        if (tab === 'teachers' && isAdmin) {
            const fetchTeachers = async () => {
                const authHeaders = await getAdminAuthHeaders();
                let json = null;
                try {
                    const raw = await apiAdmin.listTeachers(authHeaders);
                    json = raw as Record<string, unknown>;
                } catch { }
                if (json?.ok) {
                    const list = Array.isArray((json as Record<string, unknown>)?.teachers)
                        ? ((json as Record<string, unknown>).teachers as Record<string, unknown>[])
                        : [];
                    const dedup: AdminTeacher[] = [];
                    const seen = new Set<string>();
                    for (const t of list) {
                        const key = String(t?.email || '').toLowerCase();
                        if (!seen.has(key)) { seen.add(key); dedup.push(t as AdminTeacher); }
                    }
                    try {
                        const emails = dedup.map(t => t.email).filter(Boolean);
                        if (emails.length > 0) {
                            const { data: profilesMap } = await supabase
                                .from('profiles')
                                .select('id, email')
                                .in('email', emails);
                            const idByEmail = new Map((profilesMap || []).map(p => [p.email, p.id]));
                            const enriched = dedup.map(t => ({ ...t, user_id: idByEmail.get(t.email) || null }));
                            setTeachersList(enriched);
                        } else {
                            setTeachersList(dedup);
                        }
                    } catch {
                        setTeachersList(dedup);
                    }
                }
            };
            fetchTeachers();
        }
    }, [tab, isAdmin, addingTeacher, editingTeacher, supabase, getAdminAuthHeaders, setTeachersList]);

    // URL persistence
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const sp = new URLSearchParams(window.location.search);
        const t = sp.get('tab');
        if (t && ['dashboard', 'students', 'teachers', 'templates', 'videos', 'broadcast', 'system'].includes(t)) {
            setTab(t);
        }
    }, [setTab]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const sp = new URLSearchParams(window.location.search);
        if (sp.get('tab') !== tab) {
            sp.set('tab', tab);
            const url = `${window.location.pathname}?${sp.toString()}`;
            window.history.replaceState(null, '', url);
        }
        try {
            sessionStorage.setItem('irontracks_admin_panel_open', '1');
            sessionStorage.setItem('irontracks_admin_panel_tab', String(tab || 'dashboard'));
        } catch { }
    }, [tab]);

    // fetchTemplates
    useEffect(() => {
        if (tab !== 'templates') return;
        const fetchTemplates = async () => {
            try {
                const { data: { user: currentUser } } = await supabase.auth.getUser();
                if (!currentUser) return;
                let list: UnknownRecord[] = [];
                if (isAdmin || isTeacher) {
                    try {
                        const authHeaders = await getAdminAuthHeaders();
                        const json = await apiAdmin.getAdminWorkouts(authHeaders);
                        if (json.ok) {
                            list = (json.rows || []).filter((w: UnknownRecord) => w?.is_template === true && w?.user_id === currentUser.id);
                        }
                    } catch (e) { logError('error', "API fetch error", e); }
                    if ((list || []).length === 0) {
                        try {
                            const { data } = await supabase
                                .from('workouts')
                                .select('*, exercises(*, sets(*))')
                                .eq('is_template', true)
                                .eq('user_id', currentUser.id)
                                .order('name');
                            list = (data || []).filter((w: UnknownRecord) => w?.is_template === true && w?.user_id === currentUser.id);
                        } catch (e) { logError('error', "Supabase fetch error", e); }
                    }
                } else {
                    try {
                        const { data } = await supabase
                            .from('workouts')
                            .select('*, exercises(*, sets(*))')
                            .eq('is_template', true)
                            .eq('user_id', currentUser.id)
                            .order('name');
                        list = data || [];
                    } catch (e) { logError('error', "Supabase fetch error", e); }
                }
                try {
                    const jsonLegacy = await apiWorkouts.list().catch(() => ({ ok: false, rows: [] })) as Record<string, unknown>;
                    if (jsonLegacy.ok) {
                        const legacy = ((jsonLegacy.rows as UnknownRecord[] | undefined) || []).map((w: UnknownRecord) => ({ id: w.id || w.uuid, name: w.name, exercises: [] as WorkoutExercise[] }));
                        list = [...list, ...legacy];
                    }
                } catch { }
                const score = (w: UnknownRecord) => {
                    const exs = Array.isArray(w.exercises) ? w.exercises : [];
                    return exs.length;
                };
                const byTitle = new Map<string, UnknownRecord>();
                for (const w of (list || [])) {
                    if (!w || !w.name) continue;
                    try {
                        const key = workoutTitleKey(w.name as string);
                        const prev = byTitle.get(key);
                        const curHasPrefix = /^[A-Z]\s-\s/.test(normalizeWorkoutTitle(w?.name as string || ''));
                        const prevHasPrefix = /^[A-Z]\s-\s/.test(normalizeWorkoutTitle(prev?.name as string || ''));
                        if (
                            !prev
                            || score(w) > score(prev)
                            || (score(w) === score(prev) && curHasPrefix && !prevHasPrefix)
                            || (score(w) === score(prev) && !!w.is_template && !prev.is_template)
                        ) {
                            byTitle.set(key, w);
                        }
                    } catch (e) { logError("Error processing workout", w, e); }
                }
                const deduped = Array.from(byTitle.values())
                    .map((w) => ({ ...w, name: normalizeWorkoutTitle(w?.name as string || '') }))
                    .sort((a, b) => (a.name as string || '').localeCompare(b.name as string || ''));
                setTemplates((deduped || []) as AdminWorkoutTemplate[]);
            } catch (err) {
                logError('error', "Critical error fetching templates", err);
            }
        };
        fetchTemplates();
    }, [tab, isAdmin, isTeacher, supabase, getAdminAuthHeaders, setTemplates]);

    // fetchMissing + fetchVideos
    useEffect(() => {
        if (tab !== 'videos' || !isAdmin) return;
        const normalizeExercise = (value: unknown): string => {
            const s = String(value || '').trim().toLowerCase();
            if (!s) return '';
            return s
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]+/g, ' ')
                .trim()
                .replace(/\s+/g, ' ');
        };
        const fetchMissing = async () => {
            setVideoMissingLoading(true);
            try {
                const { data: rows, error } = await supabase
                    .from('exercises')
                    .select('name, video_url')
                    .or('video_url.is.null,video_url.eq.')
                    .limit(2000);
                if (error) throw error;
                const normalized = new Set<string>();
                for (const r of (rows || [])) {
                    const name = String(r?.name || '').trim();
                    if (!name) continue;
                    const n = normalizeExercise(name);
                    if (!n) continue;
                    normalized.add(n);
                    if (normalized.size >= 1000) break;
                }
                const normalizedList = Array.from(normalized);
                if (!normalizedList.length) {
                    setVideoMissingCount(0);
                    return;
                }
                const { data: libRows } = await supabase
                    .from('exercise_library')
                    .select('normalized_name, video_url')
                    .in('normalized_name', normalizedList)
                    .limit(normalizedList.length);
                const withVideo = new Set(
                    (libRows || [])
                        .filter((x) => !!String(x?.video_url || '').trim())
                        .map((x) => String(x?.normalized_name || '').trim())
                        .filter(Boolean)
                );
                let missing = 0;
                for (const n of normalizedList) {
                    if (!withVideo.has(n)) missing += 1;
                }
                setVideoMissingCount(missing);
            } catch {
                setVideoMissingCount(0);
            } finally {
                setVideoMissingLoading(false);
            }
        };
        const fetchVideos = async () => {
            setVideoLoading(true);
            try {
                const { data, error } = await supabase
                    .from('exercise_videos')
                    .select('id, url, title, channel_title, created_at, exercise_library_id, exercise_library:exercise_library_id(display_name_pt)')
                    .eq('status', 'pending')
                    .order('created_at', { ascending: false })
                    .limit(60);
                if (!error) setVideoQueue(data || []);
            } catch {
                setVideoQueue([]);
            } finally {
                setVideoLoading(false);
            }
        };
        fetchVideos();
        fetchMissing();
    }, [tab, isAdmin, supabase, setVideoLoading, setVideoMissingCount, setVideoMissingLoading, setVideoQueue]);

    // fetchErrors
    useEffect(() => {
        if (tab !== 'errors' || !isAdmin) return;
        let cancelled = false;
        const fetchErrors = async () => {
            setErrorsLoading(true);
            try {
                const { data, error } = await supabase
                    .from('error_reports')
                    .select('id, user_id, user_email, message, stack, pathname, url, user_agent, app_version, source, meta, status, created_at, updated_at, resolved_at, resolved_by')
                    .order('created_at', { ascending: false })
                    .limit(200);
                if (cancelled) return;
                if (error) {
                    setErrorReports([]);
                    return;
                }
                setErrorReports(Array.isArray(data) ? data : []);
            } catch {
                if (!cancelled) setErrorReports([]);
            } finally {
                if (!cancelled) setErrorsLoading(false);
            }
        };
        fetchErrors();
        return () => { cancelled = true; };
    }, [tab, isAdmin, supabase, setErrorReports, setErrorsLoading]);

    // fetchAliases
    useEffect(() => {
        if (tab !== 'system' || !isAdmin) return;
        let cancelled = false;
        const fetchAliases = async () => {
            setExerciseAliasesLoading(true);
            setExerciseAliasesError('');
            try {
                const { data, error } = await supabase
                    .from('exercise_aliases')
                    .select('id, user_id, canonical_id, alias, normalized_alias, confidence, source, needs_review, created_at, updated_at')
                    .eq('needs_review', true)
                    .order('created_at', { ascending: false })
                    .limit(200);
                if (cancelled) return;
                if (error) {
                    setExerciseAliasesReview([]);
                    const msg = String(getErrorMessage(error) || '');
                    if (msg) setExerciseAliasesError(msg);
                    return;
                }
                setExerciseAliasesReview(Array.isArray(data) ? data : []);
            } catch (e: unknown) {
                if (!cancelled) {
                    setExerciseAliasesReview([]);
                    const msg = e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : '';
                    if (msg) setExerciseAliasesError(msg);
                }
            } finally {
                if (!cancelled) setExerciseAliasesLoading(false);
            }
        };
        fetchAliases();
        return () => { cancelled = true; };
    }, [tab, isAdmin, supabase, setExerciseAliasesError, setExerciseAliasesLoading, setExerciseAliasesReview]);

    // fetchDetails
    // IMPORTANT: deps use primitive keys (id/email) NOT the full selectedStudent object.
    // Using the full object caused an infinite loop:
    //   fetchDetails → setSelectedStudent() → selectedStudent changes → effect re-runs → loading=true flash
    const selectedStudentRef = useRef(selectedStudent);
    selectedStudentRef.current = selectedStudent;

    useEffect(() => {
        if (!selectedStudent) return;
        const fetchDetails = async () => {
            const student = selectedStudentRef.current;
            if (!student) return;
            setLoading(true);
            const expectedStudentId = student?.id || null;
            let targetUserId = student.user_id || '';
            if (!targetUserId && student.email) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('id')
                    .ilike('email', String(student.email))
                    .maybeSingle();
                targetUserId = profile?.id || targetUserId;
            }
            try {
                const key = String(student?.id || student?.email || targetUserId || '');
                if (key && !loadedStudentInfo.current[key]) {
                    const authHeaders = await getAdminAuthHeaders();
                    try {
                        const js = await apiAdmin.listStudents(authHeaders);
                        const jsStudents = js.students as unknown as UnknownRecord[];
                        if (js.ok && Array.isArray(jsStudents)) {
                            const row = jsStudents.find((s: UnknownRecord) => (s.id === student.id) || (s.user_id && s.user_id === (student.user_id || targetUserId)) || (String(s.email || '').toLowerCase() === String(student.email || '').toLowerCase()));
                            if (row) {
                                const nextTeacher = row.teacher_id ? String(row.teacher_id) : null;
                                const nextUserId = row.user_id ? String(row.user_id) : '';
                                const shouldUpdate = (nextTeacher !== student.teacher_id) || (nextUserId !== String(student.user_id || ''));
                                if (shouldUpdate) {
                                    if (student && (!expectedStudentId || String(student.id) === String(expectedStudentId))) {
                                        setSelectedStudent({ ...student, teacher_id: nextTeacher, user_id: nextUserId || null });
                                    }
                                }
                            }
                            loadedStudentInfo.current[key] = true;
                        }
                    } catch { }
                }
            } catch { }
            try {
                if (!student.teacher_id && student.email) {
                    const cached = localStorage.getItem('student_teacher_' + String(student.email));
                    if (cached != null && cached !== String(student.teacher_id || '')) {
                        setSelectedStudent({ ...student, teacher_id: cached || null });
                    }
                }
            } catch { }
            if (targetUserId) {
                let wData: UnknownRecord[] = [];
                const { data } = await supabase
                    .from('workouts')
                    .select('*, exercises(*, sets(*))')
                    .eq('user_id', targetUserId)
                    .eq('is_template', true)
                    .order('name');
                wData = data || [];
                wData = (Array.isArray(wData) ? wData : []).filter((w: UnknownRecord) => w && typeof w === 'object' && w.is_template === true);
                const studentDeduped = (wData || []).sort((a: UnknownRecord, b: UnknownRecord) => String(a.name || '').localeCompare(String(b.name || '')));
                const synced = (studentDeduped || []).filter((w: UnknownRecord) => (String(w?.created_by || '') === String(user.id)) && (String(w?.user_id || '') === String(targetUserId)));
                const syncedIds = new Set((synced || []).map((w: UnknownRecord) => w?.id).filter(Boolean));
                const others = (studentDeduped || []).filter((w: UnknownRecord) => !syncedIds.has(w?.id));
                setStudentWorkouts(others || []);
                setSyncedWorkouts(synced || []);
            } else {
                setStudentWorkouts([]);
                setSyncedWorkouts([]);
                setAssessments([]);
            }
            const { data: { user: me } } = await supabase.auth.getUser();
            if (me) {
                let my: UnknownRecord[] = [];
                try {
                    const authHeaders = await getAdminAuthHeaders();
                    const jsonMine = await apiAdmin.getAdminWorkouts(authHeaders).catch(() => ({ ok: false, rows: [] })) as Record<string, unknown>;
                    if (jsonMine.ok) my = (jsonMine.rows as UnknownRecord[] | undefined) || [];
                    else {
                        const { data } = await supabase
                            .from('workouts')
                            .select('*, exercises(*, sets(*))')
                            .or(`created_by.eq.${me.id},user_id.eq.${me.id}`)
                            .order('name');
                        my = data || [];
                    }
                } catch {
                    const { data } = await supabase
                        .from('workouts')
                        .select('*, exercises(*, sets(*))')
                        .or(`created_by.eq.${me.id},user_id.eq.${me.id},is_template.eq.true`)
                        .order('name');
                    my = data || [];
                }
                my = (my || []).filter((w: UnknownRecord) => (w?.user_id === me.id) && (w?.is_template === true));
                const tMap = new Map<string, UnknownRecord>();
                for (const w of (my || [])) {
                    const key = workoutTitleKey(w.name as string);
                    const prev = tMap.get(key);
                    const exs = Array.isArray(w.exercises) ? w.exercises : [];
                    const prevExs = Array.isArray(prev?.exercises) ? prev.exercises : [];
                    const score = (x: unknown) => (Array.isArray(x) ? x.length : 0);
                    const curHasPrefix = /^[A-Z]\s-\s/.test(normalizeWorkoutTitle(w?.name as string || ''));
                    const prevHasPrefix = /^[A-Z]\s-\s/.test(normalizeWorkoutTitle(prev?.name as string || ''));
                    if (
                        !prev
                        || score(exs) > score(prevExs)
                        || (score(exs) === score(prevExs) && curHasPrefix && !prevHasPrefix)
                        || (score(exs) === score(prevExs) && !!w.is_template && !prev?.is_template)
                    ) {
                        tMap.set(key, w);
                    }
                }
                try {
                    const jsonLegacy = await apiWorkouts.list().catch(() => ({ ok: false, rows: [] })) as Record<string, unknown>;
                    if (jsonLegacy.ok) {
                        for (const r of ((jsonLegacy.rows as UnknownRecord[] | undefined) || [])) {
                            const key = workoutTitleKey(r.name as string);
                            const prev = tMap.get(key);
                            const candidate = { id: r.id || r.uuid, name: normalizeWorkoutTitle(r.name as string), exercises: [] as WorkoutExercise[] };
                            const prevExs = Array.isArray(prev?.exercises) ? prev.exercises : [];
                            if (!prev || prevExs.length < 1) tMap.set(key, candidate);
                        }
                    }
                } catch { }
                const dedupTemplates = Array.from(tMap.values())
                    .map((w) => ({ ...w, name: normalizeWorkoutTitle(w?.name as string || '') }))
                    .sort((a, b) => (a.name as string || '').localeCompare(b.name as string || ''));
                setTemplates((dedupTemplates || []) as AdminWorkoutTemplate[]);
            }
            if (targetUserId) {
                const assessmentOrParts: unknown[] = [];
                if (student?.id) assessmentOrParts.push(`student_id.eq.${student.id}`);
                if (targetUserId) assessmentOrParts.push(`user_id.eq.${targetUserId}`);
                if (assessmentOrParts.length > 0) {
                    const { data: aData } = await supabase
                        .from('assessments')
                        .select('*')
                        .or(assessmentOrParts.join(','))
                        .order('date', { ascending: false });
                    setAssessments(aData || []);
                } else {
                    setAssessments([]);
                }
            }
            setLoading(false);
        };
        fetchDetails();
        // CRITICAL: deps use primitive keys (id/email) NOT the full selectedStudent object
        // to prevent the infinite loop where setSelectedStudent() triggers this effect again.
        // selectedStudentRef.current is used inside to access the latest student data.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedStudent?.id, selectedStudent?.email, supabase, user?.id, isAdmin, isTeacher, getAdminAuthHeaders, loadedStudentInfo, setAssessments, setLoading, setSelectedStudent, setStudentWorkouts, setSyncedWorkouts, setTemplates]);

}

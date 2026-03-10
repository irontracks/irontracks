import { useCallback, useEffect, useRef } from 'react';
import { useState } from 'react';
import type { AdminUser } from '@/types/admin';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UnknownRecord } from '@/types/app';
import { apiAdmin } from '@/lib/api';

type GetAdminAuthHeaders = () => Promise<Record<string, string>>;

interface UseAdminUserActivityParams {
    isAdmin: boolean;
    tab: string;
    getAdminAuthHeaders: GetAdminAuthHeaders;
    // Supabase client — no generated DB types in this project; using base client type
    supabase: SupabaseClient;
}

/**
 * useAdminUserActivity
 *
 * Owns the "User Activity Monitor" domain: searching users,
 * loading activity summaries, events, and error reports.
 */
export function useAdminUserActivity({
    isAdmin,
    tab,
    getAdminAuthHeaders,
    supabase,
}: UseAdminUserActivityParams) {
    const [userActivityQuery, setUserActivityQuery] = useState<string>('');
    const [userActivityRole, setUserActivityRole] = useState<string>('all');
    const [userActivityUsers, setUserActivityUsers] = useState<AdminUser[]>([]);
    const [userActivityLoading, setUserActivityLoading] = useState<boolean>(false);
    const [userActivityError, setUserActivityError] = useState<string>('');
    const [userActivitySelected, setUserActivitySelected] = useState<AdminUser | null>(null);
    const [userActivityDays, setUserActivityDays] = useState<number>(7);
    const [userActivitySummary, setUserActivitySummary] = useState<UnknownRecord | null>(null);
    const [userActivitySummaryLoading, setUserActivitySummaryLoading] = useState<boolean>(false);
    const [userActivityEvents, setUserActivityEvents] = useState<UnknownRecord[]>([]);
    const [userActivityEventsLoading, setUserActivityEventsLoading] = useState<boolean>(false);
    const [userActivityEventsBefore, setUserActivityEventsBefore] = useState<string | null>(null);
    const [userActivityErrors, setUserActivityErrors] = useState<UnknownRecord[]>([]);
    const [userActivityErrorsLoading, setUserActivityErrorsLoading] = useState<boolean>(false);
    const userActivityQueryDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const getErrorMsg = (e: unknown) =>
        e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string'
            ? (e as { message: string }).message
            : String(e);

    const loadUserActivityUsers = useCallback(async ({ q, role }: { q?: unknown; role?: unknown } = {}) => {
        if (!isAdmin) return;
        setUserActivityLoading(true);
        setUserActivityError('');
        try {
            const qs = new URLSearchParams();
            const qq = String(q ?? '').trim();
            const rr = String(role ?? '').trim();
            if (qq) qs.set('q', qq);
            if (rr && rr !== 'all') qs.set('role', rr);
            qs.set('limit', '200');
            const authHeaders = await getAdminAuthHeaders();
            const json = await apiAdmin.getUserActivityUsers(qs.toString(), authHeaders).catch((): null => null);
            if (!json?.ok) {
                setUserActivityUsers([]);
                setUserActivityError(String((json as Record<string, unknown>)?.error || 'Falha ao carregar usuários'));
                return;
            }
            setUserActivityUsers(Array.isArray((json as Record<string, unknown>)?.users) ? ((json as Record<string, unknown>).users as AdminUser[]) : []);
        } catch (e: unknown) {
            setUserActivityUsers([]);
            setUserActivityError(getErrorMsg(e));
        } finally {
            setUserActivityLoading(false);
        }
    }, [isAdmin, getAdminAuthHeaders]);

    const loadUserActivitySummary = useCallback(async ({ userId, days }: { userId?: unknown; days?: unknown } = {}) => {
        if (!isAdmin) return;
        const uid = String(userId || '').trim();
        if (!uid) return;
        const d = Math.min(90, Math.max(1, Number(days) || 7));
        setUserActivitySummaryLoading(true);
        try {
            const qs = new URLSearchParams({ user_id: uid, days: String(d) });
            const authHeaders = await getAdminAuthHeaders();
            const json = await apiAdmin.getActivitySummary(qs.toString(), authHeaders).catch((): null => null);
            if (!json?.ok) { setUserActivitySummary(null); return; }
            setUserActivitySummary(json as UnknownRecord);
        } catch {
            setUserActivitySummary(null);
        } finally {
            setUserActivitySummaryLoading(false);
        }
    }, [isAdmin, getAdminAuthHeaders]);

    const loadUserActivityEvents = useCallback(async ({ userId, before, reset = false }: { userId?: unknown; before?: unknown; reset?: boolean } = {}) => {
        if (!isAdmin) return;
        const uid = String(userId || '').trim();
        if (!uid) return;
        setUserActivityEventsLoading(true);
        try {
            const qs = new URLSearchParams({ user_id: uid, limit: '80' });
            if (before) qs.set('before', String(before));
            const authHeaders = await getAdminAuthHeaders();
            const json = await apiAdmin.getActivityEvents(qs.toString(), authHeaders).catch((): null => null);
            if (!json?.ok) { if (reset) setUserActivityEvents([]); return; }
            const list = Array.isArray((json as Record<string, unknown>)?.events) ? ((json as Record<string, unknown>).events as UnknownRecord[]) : [];
            setUserActivityEventsBefore((json as Record<string, unknown>)?.nextBefore as string ?? null);
            setUserActivityEvents((prev) => (reset ? list : [...prev, ...list]));
        } catch {
            if (reset) setUserActivityEvents([]);
        } finally {
            setUserActivityEventsLoading(false);
        }
    }, [isAdmin, getAdminAuthHeaders]);

    const loadUserActivityErrors = useCallback(async ({ userId }: { userId?: unknown } = {}) => {
        if (!isAdmin) return;
        const uid = String(userId || '').trim();
        if (!uid) return;
        setUserActivityErrorsLoading(true);
        try {
            const { data, error } = await supabase
                .from('error_reports')
                .select('id, created_at, message, pathname, url, status, app_version, source')
                .eq('user_id', uid)
                .order('created_at', { ascending: false })
                .limit(10);
            if (error) { setUserActivityErrors([]); return; }
            setUserActivityErrors(Array.isArray(data) ? data : []);
        } catch {
            setUserActivityErrors([]);
        } finally {
            setUserActivityErrorsLoading(false);
        }
    }, [isAdmin, supabase]);

    const openUserActivityUser = useCallback(async (u: UnknownRecord) => {
        const id = String(u?.id || u?.userId || '').trim();
        if (!id) return;
        setUserActivitySelected(u as unknown as AdminUser);
        setUserActivityEvents([]);
        setUserActivityEventsBefore(null);
        setUserActivitySummary(null);
        setUserActivityErrors([]);
        try { await loadUserActivitySummary({ userId: id, days: userActivityDays }); } catch { }
        try { await loadUserActivityEvents({ userId: id, reset: true }); } catch { }
        try { await loadUserActivityErrors({ userId: id }); } catch { }
    }, [loadUserActivitySummary, loadUserActivityEvents, loadUserActivityErrors, userActivityDays]);

    // Debounced search when tab = 'system'
    useEffect(() => {
        if (!isAdmin) return;
        if (tab !== 'system') return;
        try { if (userActivityQueryDebounceRef.current) clearTimeout(userActivityQueryDebounceRef.current); } catch { }
        userActivityQueryDebounceRef.current = setTimeout(() => {
            loadUserActivityUsers({ q: userActivityQuery, role: userActivityRole });
        }, 400);
        return () => {
            try { if (userActivityQueryDebounceRef.current) clearTimeout(userActivityQueryDebounceRef.current); } catch { }
        };
    }, [isAdmin, tab, userActivityQuery, userActivityRole, loadUserActivityUsers]);

    return {
        userActivityQuery, setUserActivityQuery,
        userActivityRole, setUserActivityRole,
        userActivityUsers, setUserActivityUsers,
        userActivityLoading, setUserActivityLoading,
        userActivityError, setUserActivityError,
        userActivitySelected, setUserActivitySelected,
        userActivityDays, setUserActivityDays,
        userActivitySummary, setUserActivitySummary,
        userActivitySummaryLoading, setUserActivitySummaryLoading,
        userActivityEvents, setUserActivityEvents,
        userActivityEventsLoading, setUserActivityEventsLoading,
        userActivityEventsBefore, setUserActivityEventsBefore,
        userActivityErrors, setUserActivityErrors,
        userActivityErrorsLoading, setUserActivityErrorsLoading,
        userActivityQueryDebounceRef,
        loadUserActivityUsers,
        loadUserActivitySummary,
        loadUserActivityEvents,
        loadUserActivityErrors,
        openUserActivityUser,
    };
}

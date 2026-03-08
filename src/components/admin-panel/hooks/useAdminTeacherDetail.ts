import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdminUser, AdminTeacher, AdminWorkoutTemplate } from '@/types/admin';
import type { UnknownRecord } from '@/types/app'

type GetAdminAuthHeaders = () => Promise<Record<string, string>>;

/**
 * useAdminTeacherDetail
 *
 * Manages the "teacher detail panel" domain: loading students, templates,
 * workout history, and inbox items for the currently selected teacher.
 *
 * Receives only the minimal external dependencies — selectedTeacher, isAdmin,
 * and getAdminAuthHeaders — to avoid circular state issues.
 */
export function useAdminTeacherDetail(
    selectedTeacher: AdminTeacher | null,
    isAdmin: boolean,
    getAdminAuthHeaders: GetAdminAuthHeaders,
) {
    const [teacherDetailTab, setTeacherDetailTab] = useState<string>('students');
    const [teacherStudents, setTeacherStudents] = useState<AdminUser[]>([]);
    const [teacherStudentsLoading, setTeacherStudentsLoading] = useState<boolean>(false);
    const [teacherTemplatesRows, setTeacherTemplatesRows] = useState<AdminWorkoutTemplate[]>([]);
    const [teacherTemplatesLoading, setTeacherTemplatesLoading] = useState<boolean>(false);
    const [teacherTemplatesCursor, setTeacherTemplatesCursor] = useState<string | null>(null);
    const [teacherHistoryRows, setTeacherHistoryRows] = useState<UnknownRecord[]>([]);
    const [teacherHistoryLoading, setTeacherHistoryLoading] = useState<boolean>(false);
    const [teacherHistoryCursor, setTeacherHistoryCursor] = useState<{ cursor_date?: string; cursor_created_at?: string } | null>(null);
    const [teacherInboxItems, setTeacherInboxItems] = useState<AdminUser[]>([]);
    const [teacherInboxLoading, setTeacherInboxLoading] = useState<boolean>(false);

    // Cursor refs for stable useCallback deps
    const templatesCursorRef = useRef<string | null>(null);
    const historyCursorRef = useRef<{ cursor_date?: string; cursor_created_at?: string } | null>(null);
    templatesCursorRef.current = teacherTemplatesCursor;
    historyCursorRef.current = teacherHistoryCursor;

    const loadTeacherStudents = useCallback(async (teacher: UnknownRecord) => {
        const uid = String(teacher?.user_id || '').trim();
        if (!uid) { setTeacherStudents([]); return; }
        setTeacherStudentsLoading(true);
        try {
            const authHeaders = await getAdminAuthHeaders();
            const res = await fetch(`/api/admin/teachers/students?teacher_user_id=${encodeURIComponent(uid)}`, { headers: authHeaders });
            const json = await res.json().catch(() => ({}));
            if (!json?.ok) { setTeacherStudents([]); return; }
            setTeacherStudents(Array.isArray(json.students) ? json.students : []);
        } finally {
            setTeacherStudentsLoading(false);
        }
    }, [getAdminAuthHeaders]);

    const loadTeacherTemplates = useCallback(async (teacher: UnknownRecord, reset: boolean = false) => {
        const uid = String(teacher?.user_id || '').trim();
        if (!uid) { setTeacherTemplatesRows([]); setTeacherTemplatesCursor(null); return; }
        if (reset) { setTeacherTemplatesRows([]); setTeacherTemplatesCursor(null); }
        setTeacherTemplatesLoading(true);
        try {
            const cursor = reset ? '' : String(templatesCursorRef.current || '');
            const qs = new URLSearchParams({ teacher_user_id: uid, limit: '80' });
            if (cursor) qs.set('cursor', cursor);
            const authHeaders = await getAdminAuthHeaders();
            const res = await fetch(`/api/admin/teachers/workouts/templates?${qs.toString()}`, { headers: authHeaders });
            const json = await res.json().catch(() => ({}));
            if (!json?.ok) return;
            const rows = Array.isArray(json.rows) ? json.rows : [];
            setTeacherTemplatesRows((prev) => reset ? rows : [...(Array.isArray(prev) ? prev : []), ...rows]);
            setTeacherTemplatesCursor(json.next_cursor || null);
        } finally {
            setTeacherTemplatesLoading(false);
        }
    }, [getAdminAuthHeaders]);

    const loadTeacherHistory = useCallback(async (teacher: UnknownRecord, reset: boolean = false) => {
        const uid = String(teacher?.user_id || '').trim();
        if (!uid) { setTeacherHistoryRows([]); setTeacherHistoryCursor(null); return; }
        if (reset) { setTeacherHistoryRows([]); setTeacherHistoryCursor(null); }
        setTeacherHistoryLoading(true);
        try {
            const qs = new URLSearchParams({ teacher_user_id: uid, limit: '80' });
            const cur = reset ? null : historyCursorRef.current;
            if (cur?.cursor_date) qs.set('cursor_date', String(cur.cursor_date));
            if (cur?.cursor_created_at) qs.set('cursor_created_at', String(cur.cursor_created_at));
            const authHeaders = await getAdminAuthHeaders();
            const res = await fetch(`/api/admin/teachers/workouts/history?${qs.toString()}`, { headers: authHeaders });
            const json = await res.json().catch(() => ({}));
            if (!json?.ok) return;
            const rows = Array.isArray(json.rows) ? json.rows : [];
            setTeacherHistoryRows((prev) => reset ? rows : [...(Array.isArray(prev) ? prev : []), ...rows]);
            setTeacherHistoryCursor(json.next_cursor || null);
        } finally {
            setTeacherHistoryLoading(false);
        }
    }, [getAdminAuthHeaders]);

    const loadTeacherInbox = useCallback(async (teacher: UnknownRecord) => {
        const uid = String(teacher?.user_id || '').trim();
        if (!uid) { setTeacherInboxItems([]); return; }
        setTeacherInboxLoading(true);
        try {
            const authHeaders = await getAdminAuthHeaders();
            const res = await fetch(`/api/admin/teachers/inbox?teacher_user_id=${encodeURIComponent(uid)}&limit=80`, { headers: authHeaders });
            const json = await res.json().catch(() => ({}));
            if (!json?.ok) { setTeacherInboxItems([]); return; }
            setTeacherInboxItems(Array.isArray(json.items) ? json.items : []);
        } finally {
            setTeacherInboxLoading(false);
        }
    }, [getAdminAuthHeaders]);

    // When teacher changes: reset all and load students
    useEffect(() => {
        if (!selectedTeacher || !isAdmin) return;
        setTeacherDetailTab('students');
        setTeacherTemplatesRows([]);
        setTeacherTemplatesCursor(null);
        setTeacherHistoryRows([]);
        setTeacherHistoryCursor(null);
        setTeacherInboxItems([]);
        loadTeacherStudents(selectedTeacher as unknown as UnknownRecord).catch(() => { });
    }, [isAdmin, loadTeacherStudents, selectedTeacher]);

    // Lazy load detail tabs
    useEffect(() => {
        if (!selectedTeacher || !isAdmin) return;
        if (teacherDetailTab === 'templates' && teacherTemplatesRows.length === 0)
            loadTeacherTemplates(selectedTeacher as unknown as UnknownRecord, true).catch(() => { });
        if (teacherDetailTab === 'history' && teacherHistoryRows.length === 0)
            loadTeacherHistory(selectedTeacher as unknown as UnknownRecord, true).catch(() => { });
        if (teacherDetailTab === 'inbox' && teacherInboxItems.length === 0)
            loadTeacherInbox(selectedTeacher as unknown as UnknownRecord).catch(() => { });
    }, [isAdmin, loadTeacherHistory, loadTeacherInbox, loadTeacherTemplates, selectedTeacher, teacherDetailTab, teacherHistoryRows.length, teacherInboxItems.length, teacherTemplatesRows.length]);

    return {
        teacherDetailTab, setTeacherDetailTab,
        teacherStudents, setTeacherStudents,
        teacherStudentsLoading, setTeacherStudentsLoading,
        teacherTemplatesRows, setTeacherTemplatesRows,
        teacherTemplatesLoading, setTeacherTemplatesLoading,
        teacherTemplatesCursor, setTeacherTemplatesCursor,
        teacherHistoryRows, setTeacherHistoryRows,
        teacherHistoryLoading, setTeacherHistoryLoading,
        teacherHistoryCursor, setTeacherHistoryCursor,
        teacherInboxItems, setTeacherInboxItems,
        teacherInboxLoading, setTeacherInboxLoading,
        loadTeacherStudents,
        loadTeacherTemplates,
        loadTeacherHistory,
        loadTeacherInbox,
    };
}

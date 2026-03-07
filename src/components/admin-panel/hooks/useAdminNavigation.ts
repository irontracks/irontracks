import { useCallback, useMemo, useState } from 'react';
import type { AdminUser, AdminTeacher, AdminWorkoutTemplate } from '@/types/admin';

/**
 * useAdminNavigation
 *
 * Owns the core admin data (usersList, teachersList, templates), tab navigation,
 * search/filter state, and derived filtered lists.
 *
 * By owning the data lists internally, this hook can be called at the top of
 * useAdminPanelController without creating circular order-of-declaration issues.
 *
 * Extracted from useAdminPanelController to reduce its size.
 */
export function useAdminNavigation(
    userId: string | undefined,
    isTeacher: boolean,
) {
    // ---- Core data state ----
    const [usersList, setUsersList] = useState<AdminUser[]>([]);
    const [teachersList, setTeachersList] = useState<AdminTeacher[]>([]);
    const [templates, setTemplates] = useState<AdminWorkoutTemplate[]>([]);
    const [templatesUserId, setTemplatesUserId] = useState<string>('');
    const [myWorkoutsCount, setMyWorkoutsCount] = useState<number>(0);

    // ---- Tabs ----
    const [tab, setTab] = useState<string>('dashboard');
    const [subTab, setSubTab] = useState<string>('workouts');

    // ---- Filters ----
    const [studentQuery, setStudentQuery] = useState('');
    const [studentStatusFilter, setStudentStatusFilter] = useState('all');
    const [teacherQuery, setTeacherQuery] = useState('');
    const [teacherStatusFilter, setTeacherStatusFilter] = useState('all');
    const [templateQuery, setTemplateQuery] = useState('');

    // ---- Helpers ----
    const normalizeText = useCallback((value: unknown) => String(value || '').toLowerCase(), []);

    const statusMatches = useCallback((rowStatus: unknown, selected: unknown) => {
        if (!selected || selected === 'all') return true;
        return normalizeText(rowStatus) === normalizeText(selected);
    }, [normalizeText]);

    const studentMatchesQuery = useCallback((s: AdminUser) => {
        const q = normalizeText(studentQuery).trim();
        if (!q) return true;
        return normalizeText(s?.name).includes(q) || normalizeText(s?.email).includes(q);
    }, [normalizeText, studentQuery]);

    const teacherMatchesQuery = useCallback((t: AdminTeacher) => {
        const q = normalizeText(teacherQuery).trim();
        if (!q) return true;
        return normalizeText(t?.name).includes(q) || normalizeText(t?.email).includes(q);
    }, [normalizeText, teacherQuery]);

    const templateMatchesQuery = useCallback((t: AdminWorkoutTemplate) => {
        const q = normalizeText(templateQuery).trim();
        if (!q) return true;
        return normalizeText(t?.title).includes(q);
    }, [normalizeText, templateQuery]);

    // ---- Derived: status stats ----
    const studentStatusStats = useMemo(() => {
        const list = Array.isArray(usersList) ? usersList : [];
        const stats = { pago: 0, pendente: 0, atrasado: 0, cancelar: 0, outros: 0 };
        for (const s of list) {
            try {
                const rawStatus = s && typeof s === 'object' ? s.status : null;
                const key = String(rawStatus || 'pendente').toLowerCase().trim();
                if (Object.prototype.hasOwnProperty.call(stats, key)) {
                    (stats as Record<string, number>)[key] += 1;
                } else {
                    stats.outros += 1;
                }
            } catch { }
        }
        return stats;
    }, [usersList]);

    const totalStudents = Array.isArray(usersList) ? usersList.length : 0;
    const studentsWithTeacher = Array.isArray(usersList) ? usersList.filter(s => !!s.teacher_id).length : 0;
    const studentsWithoutTeacher = Array.isArray(usersList) ? usersList.filter(s => !s.teacher_id).length : 0;
    const totalTeachers = Array.isArray(teachersList) ? teachersList.length : 0;

    // ---- Derived: dashboard charts ----
    const dashboardCharts = useMemo(() => {
        const baseTotalStudents = typeof totalStudents === 'number' && Number.isFinite(totalStudents) && totalStudents > 0 ? totalStudents : 0;
        const baseWith = typeof studentsWithTeacher === 'number' && Number.isFinite(studentsWithTeacher) && studentsWithTeacher > 0 ? studentsWithTeacher : 0;
        const baseWithout = typeof studentsWithoutTeacher === 'number' && Number.isFinite(studentsWithoutTeacher) && studentsWithoutTeacher > 0 ? studentsWithoutTeacher : 0;
        const teacherData = {
            labels: ['Com professor', 'Sem professor'],
            datasets: [{ label: 'Alunos', data: [baseWith, baseWithout], backgroundColor: ['rgba(250, 204, 21, 0.9)', 'rgba(82, 82, 82, 0.9)'], borderRadius: 999, maxBarThickness: 40 }]
        };
        const totalStatus = studentStatusStats.pago + studentStatusStats.pendente + studentStatusStats.atrasado + studentStatusStats.cancelar + studentStatusStats.outros;
        const statusValues = totalStatus > 0
            ? [studentStatusStats.pago, studentStatusStats.pendente, studentStatusStats.atrasado, studentStatusStats.cancelar, studentStatusStats.outros]
            : [0, 0, 0, 0, 0];
        const statusData = {
            labels: ['Pago', 'Pendente', 'Atrasado', 'Cancelar', 'Outros'],
            datasets: [{ label: 'Alunos', data: statusValues, backgroundColor: ['rgba(34, 197, 94, 0.9)', 'rgba(234, 179, 8, 0.9)', 'rgba(248, 113, 113, 0.9)', 'rgba(148, 163, 184, 0.9)', 'rgba(82, 82, 82, 0.9)'], borderRadius: 12, maxBarThickness: 32 }]
        };
        return { teacherDistribution: { data: teacherData }, statusDistribution: { data: statusData }, statusTotal: totalStatus, totalStudents: baseTotalStudents };
    }, [totalStudents, studentsWithTeacher, studentsWithoutTeacher, studentStatusStats]);

    // ---- Derived: coach inbox (teacher-specific) ----
    const INACTIVE_THRESHOLD = 7;
    const coachInboxItems = useMemo<{ id: unknown; name: unknown; email: unknown; status: unknown; hasWorkouts: boolean; daysSinceLastWorkout: number | null }[]>(() => {
        if (!isTeacher) return [];
        const list = Array.isArray(usersList) ? usersList : [];
        const today = new Date();
        const todayMs = today.getTime();
        if (!Number.isFinite(todayMs)) return [];
        const safeDays = (value: unknown) => { const n = Number(value); if (!Number.isFinite(n) || n < 0) return 0; return n; };
        const items = list
            .filter((s) => s && typeof s === 'object' && s.teacher_id === userId)
            .map((s) => {
                const workouts = Array.isArray(s.workouts) ? s.workouts : [];
                const nonTemplate = workouts.filter((w) => w && typeof w === 'object' && w.is_template !== true);
                if (!nonTemplate.length) return { id: s.id, name: s.name || s.email || '', email: s.email || '', status: s.status || 'pendente', hasWorkouts: false, daysSinceLastWorkout: null };
                let lastWorkoutMs = 0;
                nonTemplate.forEach((w) => {
                    try {
                        const raw: unknown = (w as Record<string, unknown>).date || (w as Record<string, unknown>).completed_at || (w as Record<string, unknown>).created_at;
                        if (!raw) return;
                        const rawR = raw as { toDate?: () => Date } | string | number | null;
                        const d = rawR && typeof rawR === 'object' && 'toDate' in rawR && typeof rawR.toDate === 'function' ? rawR.toDate() : new Date(raw as string | number);
                        const t = d?.getTime ? d.getTime() : NaN;
                        if (!Number.isFinite(t)) return;
                        if (t > lastWorkoutMs) lastWorkoutMs = t;
                    } catch { }
                });
                if (!lastWorkoutMs) return { id: s.id, name: s.name || s.email || '', email: s.email || '', status: s.status || 'pendente', hasWorkouts: false, daysSinceLastWorkout: null };
                const diffMs = todayMs - lastWorkoutMs;
                const days = diffMs > 0 ? Math.floor(diffMs / (1000 * 60 * 60 * 24)) : 0;
                return { id: s.id, name: s.name || s.email || '', email: s.email || '', status: s.status || 'pendente', hasWorkouts: true, daysSinceLastWorkout: days };
            })
            .filter((item) => item && typeof item === 'object')
            .filter((item) => { if (!item.hasWorkouts) return true; const days = safeDays(item.daysSinceLastWorkout); return days >= INACTIVE_THRESHOLD; });
        items.sort((a, b) => {
            const aDays = a.hasWorkouts ? safeDays(a.daysSinceLastWorkout) : Number.MAX_SAFE_INTEGER;
            const bDays = b.hasWorkouts ? safeDays(b.daysSinceLastWorkout) : Number.MAX_SAFE_INTEGER;
            return bDays - aDays;
        });
        return items.slice(0, 5);
    }, [isTeacher, usersList, userId]);

    // ---- Derived: filtered lists ----
    const studentsWithTeacherFiltered = useMemo<AdminUser[]>(() => {
        const list = Array.isArray(usersList) ? usersList : [];
        return list.filter((s) => !!s?.teacher_id).filter(studentMatchesQuery).filter((s) => statusMatches(s?.status || 'pendente', studentStatusFilter));
    }, [studentStatusFilter, studentMatchesQuery, statusMatches, usersList]);

    const studentsWithoutTeacherFiltered = useMemo<AdminUser[]>(() => {
        const list = Array.isArray(usersList) ? usersList : [];
        return list.filter((s) => !s?.teacher_id).filter(studentMatchesQuery).filter((s) => statusMatches(s?.status || 'pendente', studentStatusFilter));
    }, [studentStatusFilter, studentMatchesQuery, statusMatches, usersList]);

    const teachersFiltered = useMemo<AdminTeacher[]>(() => {
        const list = Array.isArray(teachersList) ? teachersList : [];
        return list.filter(teacherMatchesQuery).filter((t) => statusMatches(t?.status || 'pendente', teacherStatusFilter));
    }, [statusMatches, teacherMatchesQuery, teacherStatusFilter, teachersList]);

    const templatesFiltered = useMemo<AdminWorkoutTemplate[]>(() => {
        const list = Array.isArray(templates) ? templates : [];
        return list.filter(templateMatchesQuery);
    }, [templateMatchesQuery, templates]);

    return {
        // Core data state
        usersList, setUsersList,
        teachersList, setTeachersList,
        templates, setTemplates,
        templatesUserId, setTemplatesUserId,
        myWorkoutsCount, setMyWorkoutsCount,
        // Tabs
        tab, setTab,
        subTab, setSubTab,
        // Filters
        studentQuery, setStudentQuery,
        studentStatusFilter, setStudentStatusFilter,
        teacherQuery, setTeacherQuery,
        teacherStatusFilter, setTeacherStatusFilter,
        templateQuery, setTemplateQuery,
        // Helpers
        normalizeText,
        statusMatches,
        studentMatchesQuery,
        teacherMatchesQuery,
        templateMatchesQuery,
        // Stats
        totalStudents, studentsWithTeacher, studentsWithoutTeacher, totalTeachers,
        studentStatusStats,
        dashboardCharts,
        coachInboxItems,
        // Filtered lists
        studentsWithTeacherFiltered,
        studentsWithoutTeacherFiltered,
        teachersFiltered,
        templatesFiltered,
    };
}

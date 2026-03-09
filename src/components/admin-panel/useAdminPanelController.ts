import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useAdminNavigation } from './hooks/useAdminNavigation';
import { useAdminTeacherDetail } from './hooks/useAdminTeacherDetail';
import { useAdminUserActivity } from './hooks/useAdminUserActivity';
import { useAdminPriorities } from './hooks/useAdminPriorities';
import { useAdminStudentOps } from './hooks/useAdminStudentOps';
import { useAdminTemplateOps } from './hooks/useAdminTemplateOps';
import { useAdminSystemOps } from './hooks/useAdminSystemOps';

import { useRouter } from 'next/navigation';
import { AdminUser, AdminTeacher, ErrorReport } from '@/types/admin';
import { useStableSupabaseClient } from '@/hooks/useStableSupabaseClient';
import { useDialog } from '@/contexts/DialogContext';
import { sendBroadcastMessage, addTeacher, updateTeacher } from '@/actions/admin-actions';
import { logError, logWarn, logInfo } from '@/lib/logger'
import { getErrorMessage } from '@/utils/errorMessage'
import { adminFetchJson } from '@/utils/admin/adminFetch';

import { useAdminActions } from './hooks/useAdminActions';
import { useAdminDataFetchers } from './hooks/useAdminDataFetchers';
import type { UnknownRecord } from '@/types/app'


export type AdminPanelProps = {
    user: AdminUser;
    onClose?: () => void;
};

export const useAdminPanelController = ({ user, onClose }: AdminPanelProps) => {
    const { alert, confirm } = useDialog();
    const supabase = useStableSupabaseClient();
    const router = useRouter();

    const getAdminAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
        try {
            if (!supabase) return {};
            const { data } = await supabase.auth.getSession();
            const token = data?.session?.access_token || '';
            if (!token) return {};
            return { Authorization: `Bearer ${token}` };
        } catch {
            return {};
        }
    }, [supabase]);

    // Roles
    const isAdmin = user?.role === 'admin';
    const isTeacher = user?.role === 'teacher';
    const unauthorized = !isAdmin && !isTeacher;

    const {
        usersList, setUsersList,
        teachersList, setTeachersList,
        templates, setTemplates,
        templatesUserId, setTemplatesUserId,
        myWorkoutsCount, setMyWorkoutsCount,
        tab, setTab,
        subTab, setSubTab,
        studentQuery, setStudentQuery,
        studentStatusFilter, setStudentStatusFilter,
        teacherQuery, setTeacherQuery,
        teacherStatusFilter, setTeacherStatusFilter,
        templateQuery, setTemplateQuery,
        normalizeText,
        statusMatches,
        studentMatchesQuery,
        teacherMatchesQuery,
        templateMatchesQuery,
        totalStudents, studentsWithTeacher, studentsWithoutTeacher, totalTeachers,
        studentStatusStats,
        dashboardCharts,
        coachInboxItems,
        studentsWithTeacherFiltered,
        studentsWithoutTeacherFiltered,
        teachersFiltered,
        templatesFiltered,
    } = useAdminNavigation(user?.id ? String(user.id) : undefined, isTeacher);

    // Selected Items
    const [selectedTeacher, setSelectedTeacher] = useState<AdminTeacher | null>(null);
    const [selectedStudent, setSelectedStudent] = useState<AdminUser | null>(null);

    const {
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
    } = useAdminTeacherDetail(selectedTeacher, isAdmin, getAdminAuthHeaders);


    // ─── Student Ops (extracted) ──────────────────────────────────────────────
    // useAdminDataFetchers expects a MutableRefObject<Record<string, boolean>>
    const loadedStudentInfo = useRef<Record<string, boolean>>({});

    const {
        studentWorkouts, setStudentWorkouts,
        syncedWorkouts, setSyncedWorkouts,
        assessments, setAssessments,
        studentCheckinsRows, setStudentCheckinsRows,
        studentCheckinsLoading, setStudentCheckinsLoading,
        studentCheckinsError, setStudentCheckinsError,
        studentCheckinsRange, setStudentCheckinsRange,
        studentCheckinsFilter, setStudentCheckinsFilter,
        pendingProfiles, setPendingProfiles,
        executionVideos, setExecutionVideos,
        executionVideosLoading, setExecutionVideosLoading,
        executionVideosError, setExecutionVideosError,
        executionVideoModalOpen, setExecutionVideoModalOpen,
        executionVideoModalUrl, setExecutionVideoModalUrl,
        executionVideoFeedbackDraft, setExecutionVideoFeedbackDraft,
        editingStudent, setEditingStudent,
        editedStudent, setEditedStudent,
        handleEditStudent,
        handleSaveStudentEdit: handleSaveStudentEditBase,
        approvePendingProfile,
    } = useAdminStudentOps({
        selectedStudent,
        subTab,
        isAdmin,
        supabase,
        user,
        getAdminAuthHeaders,
        setTeachersList,
        setUsersList,
        setPendingProfiles: () => { }, // managed internally by the hook
    });

    const handleSaveStudentEdit = useCallback(
        () => handleSaveStudentEditBase(setSelectedStudent),
        [handleSaveStudentEditBase, setSelectedStudent]
    );

    // ─── Template Ops (extracted) ─────────────────────────────────────────────
    const {
        editingTemplate, setEditingTemplate,
        editingStudentWorkout, setEditingStudentWorkout,
        viewWorkout, setViewWorkout,
        getSetsCount,
        openEditWorkout,
        openEditTemplate,
        handleSaveTemplate,
        handleAddTemplateToStudent,
        handleExportPdf,
        handleExportJson,
    } = useAdminTemplateOps({
        selectedStudent,
        user,
        supabase,
        setTemplates: (v) => setTemplates(v as Parameters<typeof setTemplates>[0]),
        setStudentWorkouts,
        setSyncedWorkouts,
    });

    // ─── System Ops (extracted) ───────────────────────────────────────────────
    const {
        dangerOpen, setDangerOpen,
        exportOpen, setExportOpen,
        historyOpen, setHistoryOpen,
        moreTabsOpen, setMoreTabsOpen,
        dangerActionLoading, setDangerActionLoading,
        dangerStudentsConfirm, setDangerStudentsConfirm,
        dangerTeachersConfirm, setDangerTeachersConfirm,
        dangerWorkoutsConfirm, setDangerWorkoutsConfirm,
        systemExporting, setSystemExporting,
        systemImporting, setSystemImporting,
        systemFileInputRef,
        handleExportSystem,
        handleImportSystemClick,
        handleImportSystem,
        handleDangerAction,
        runDangerAction,
    } = useAdminSystemOps({
        setUsersList,
        setTeachersList,
        setTemplates: (v) => setTemplates(v as Parameters<typeof setTemplates>[0]),
    });

    // Priorities / Inbox
    const {
        prioritiesItems, setPrioritiesItems,
        prioritiesLoading, setPrioritiesLoading,
        prioritiesError, setPrioritiesError,
        prioritiesSettingsOpen, setPrioritiesSettingsOpen,
        prioritiesSettings, setPrioritiesSettings,
        prioritiesSettingsLoading, setPrioritiesSettingsLoading,
        prioritiesSettingsError, setPrioritiesSettingsError,
        prioritiesSettingsPrefRef,
        prioritiesComposeOpen, setPrioritiesComposeOpen,
        prioritiesComposeStudentId, setPrioritiesComposeStudentId,
        prioritiesComposeKind, setPrioritiesComposeKind,
        prioritiesComposeText, setPrioritiesComposeText,
        fetchPriorities,
        normalizeCoachInboxSettings,
        loadPrioritiesSettings,
        savePrioritiesSettings,
    } = useAdminPriorities({ tab, userId: user?.id ? String(user.id) : undefined, supabase });

    // Broadcast
    const [broadcastTitle, setBroadcastTitle] = useState('');
    const [broadcastMsg, setBroadcastMsg] = useState('');
    const [sendingBroadcast, setSendingBroadcast] = useState(false);

    // Errors & Logs
    const [errorReports, setErrorReports] = useState<ErrorReport[]>([]);
    const [errorsLoading, setErrorsLoading] = useState<boolean>(false);
    const [errorsQuery, setErrorsQuery] = useState<string>('');
    const [errorsStatusFilter, setErrorsStatusFilter] = useState<string>('all');

    // Video Backfill
    const [videoQueue, setVideoQueue] = useState<UnknownRecord[]>([]);
    const [videoLoading, setVideoLoading] = useState<boolean>(false);
    const [videoMissingCount, setVideoMissingCount] = useState<number | null>(null);
    const [videoMissingLoading, setVideoMissingLoading] = useState<boolean>(false);
    const [videoExerciseName, setVideoExerciseName] = useState<string>('');
    const [videoBackfillLimit, setVideoBackfillLimit] = useState<string>('20');
    const [videoCycleRunning, setVideoCycleRunning] = useState<boolean>(false);
    const [videoCycleStats, setVideoCycleStats] = useState<{ processed: number; created: number; skipped: number }>({ processed: 0, created: 0, skipped: 0 });
    const videoCycleStopRef = useRef<boolean>(false);

    // Exercise Aliases
    const [exerciseAliasesReview, setExerciseAliasesReview] = useState<UnknownRecord[]>([]);
    const [exerciseAliasesLoading, setExerciseAliasesLoading] = useState<boolean>(false);
    const [exerciseAliasesError, setExerciseAliasesError] = useState<string>('');
    const [exerciseAliasesBackfillLoading, setExerciseAliasesBackfillLoading] = useState<boolean>(false);
    const [exerciseAliasesNotice, setExerciseAliasesNotice] = useState<string>('');

    const {
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
    } = useAdminUserActivity({ isAdmin, tab, getAdminAuthHeaders, supabase });

    // Debug / Diagnostic
    const [debugError, setDebugError] = useState<string | null>(null);

    // Loading State (Global)
    const [loading, setLoading] = useState<boolean>(false);

    // --- Actions (extracted to useAdminActions) ---
    const {
        handleRegisterStudent,
        handleAddTeacher,
        handleUpdateTeacher,
        handleSendBroadcast,
        handleUpdateStudentTeacher,
        handleUpdateStudentStatus,
        handleToggleStudentStatus,
        handleDeleteStudent,
        handleDeleteTeacher,
    } = useAdminActions({
        supabase, user, alert, confirm, getAdminAuthHeaders,
        setUsersList, setTeachersList,
        newStudent: { name: '', email: '' }, setNewStudent: () => { }, setShowRegisterModal: () => { }, setRegistering: () => { },
        newTeacher: { name: '', email: '', phone: '', birth_date: '' }, setNewTeacher: () => { }, setShowTeacherModal: () => { }, setAddingTeacher: () => { },
        editingTeacher: null, setEditingTeacher: () => { },
        broadcastTitle, broadcastMsg, setBroadcastTitle, setBroadcastMsg, setSendingBroadcast,
    });

    // Modals & Forms for register/teacher (kept inline — small and used by useAdminActions)
    const [showRegisterModal, setShowRegisterModal] = useState<boolean>(false);
    const [newStudent, setNewStudent] = useState<{ name: string; email: string }>({ name: '', email: '' });
    const [registering, setRegistering] = useState<boolean>(false);
    const [showTeacherModal, setShowTeacherModal] = useState<boolean>(false);
    const [newTeacher, setNewTeacher] = useState<{ name: string; email: string; phone: string; birth_date: string }>({ name: '', email: '', phone: '', birth_date: '' });
    const [addingTeacher, setAddingTeacher] = useState<boolean>(false);
    const [editingTeacher, setEditingTeacher] = useState<AdminTeacher | null>(null);

    // Re-wire useAdminActions with the proper state setters
    const adminActions = useAdminActions({
        supabase, user, alert, confirm, getAdminAuthHeaders,
        setUsersList, setTeachersList,
        newStudent, setNewStudent, setShowRegisterModal, setRegistering,
        newTeacher, setNewTeacher, setShowTeacherModal, setAddingTeacher,
        editingTeacher, setEditingTeacher,
        broadcastTitle, broadcastMsg, setBroadcastTitle, setBroadcastMsg, setSendingBroadcast,
    });

    // useAdminDataFetchers expects synchronous getAdminAuthHeaders
    const cachedHeadersRef = useRef<Record<string, string>>({});
    const syncGetAdminAuthHeaders = useCallback((): Record<string, string> => {
        getAdminAuthHeaders().then(h => { cachedHeadersRef.current = h; }).catch(() => { });
        return cachedHeadersRef.current;
    }, [getAdminAuthHeaders]);

    // --- Data Fetchers (extracted) ---
    // useAdminDataFetchers expects simple (v: T) => void, so we wrap each Dispatch with a simple function
    useAdminDataFetchers({
        user, isAdmin, isTeacher, selectedStudent, tab, subTab,
        registering, teachersList, addingTeacher, editingTeacher,
        getAdminAuthHeaders: syncGetAdminAuthHeaders, loadedStudentInfo,
        setUsersList: (v) => setUsersList(v),
        setTeachersList: (v) => setTeachersList(v),
        setTemplates: (v) => setTemplates(v as Parameters<typeof setTemplates>[0]),
        setStudentWorkouts: (v) => setStudentWorkouts(v as Parameters<typeof setStudentWorkouts>[0]),
        setSyncedWorkouts: (v) => setSyncedWorkouts(v as Parameters<typeof setSyncedWorkouts>[0]),
        setAssessments: (v) => setAssessments(v as Parameters<typeof setAssessments>[0]),
        setPendingProfiles: (v) => setPendingProfiles(v as Parameters<typeof setPendingProfiles>[0]),
        setSelectedStudent,
        setLoading, setDebugError,
        setErrorReports: (v) => setErrorReports(v as Parameters<typeof setErrorReports>[0]),
        setErrorsLoading,
        setVideoQueue: (v) => setVideoQueue(v as Parameters<typeof setVideoQueue>[0]),
        setVideoLoading, setVideoMissingCount, setVideoMissingLoading,
        setExerciseAliasesReview: (v) => setExerciseAliasesReview(v as Parameters<typeof setExerciseAliasesReview>[0]),
        setExerciseAliasesLoading, setExerciseAliasesError,
        setTab,
    })

    // Side effects
    useEffect(() => {
        if (!selectedStudent) setHistoryOpen(false);
    }, [selectedStudent, setHistoryOpen]);

    useEffect(() => {
        if (selectedStudent) setSelectedTeacher(null);
        // Intentional: clearing selectedTeacher when a student is selected is the desired behavior
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedStudent]);

    return {
        user,
        isAdmin,
        isTeacher,
        tab, setTab,
        subTab, setSubTab,
        loading, setLoading,

        // Data
        usersList, setUsersList,
        teachersList, setTeachersList,
        templates, setTemplates,
        templatesUserId,
        myWorkoutsCount,

        // Selections
        selectedTeacher, setSelectedTeacher,
        selectedStudent, setSelectedStudent,
        teacherDetailTab, setTeacherDetailTab,

        // Details
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

        studentWorkouts, setStudentWorkouts,
        syncedWorkouts, setSyncedWorkouts,
        assessments, setAssessments,
        studentCheckinsRows, setStudentCheckinsRows,
        studentCheckinsLoading, setStudentCheckinsLoading,
        studentCheckinsError, setStudentCheckinsError,
        studentCheckinsRange, setStudentCheckinsRange,
        studentCheckinsFilter, setStudentCheckinsFilter,
        loadedStudentInfo,

        // Execution Videos
        executionVideos, setExecutionVideos,
        executionVideosLoading, setExecutionVideosLoading,
        executionVideosError, setExecutionVideosError,
        executionVideoModalOpen, setExecutionVideoModalOpen,
        executionVideoModalUrl, setExecutionVideoModalUrl,
        executionVideoFeedbackDraft, setExecutionVideoFeedbackDraft,

        // Modals & Forms
        showRegisterModal, setShowRegisterModal,
        newStudent, setNewStudent,
        registering, setRegistering,
        editingStudent, setEditingStudent,
        editedStudent, setEditedStudent,
        showTeacherModal, setShowTeacherModal,
        newTeacher, setNewTeacher,
        addingTeacher, setAddingTeacher,
        editingTeacher, setEditingTeacher,
        editingTemplate, setEditingTemplate,
        editingStudentWorkout, setEditingStudentWorkout,
        viewWorkout, setViewWorkout,

        // Filters
        studentQuery, setStudentQuery,
        studentStatusFilter, setStudentStatusFilter,
        teacherQuery, setTeacherQuery,
        teacherStatusFilter, setTeacherStatusFilter,
        templateQuery, setTemplateQuery,

        // System
        dangerOpen, setDangerOpen,
        dangerActionLoading, setDangerActionLoading,
        dangerStudentsConfirm, setDangerStudentsConfirm,
        dangerTeachersConfirm, setDangerTeachersConfirm,
        dangerWorkoutsConfirm, setDangerWorkoutsConfirm,
        exportOpen, setExportOpen,
        historyOpen, setHistoryOpen,
        moreTabsOpen, setMoreTabsOpen,
        systemExporting, setSystemExporting,
        systemImporting, setSystemImporting,
        systemFileInputRef,

        // Priorities
        prioritiesItems, setPrioritiesItems,
        prioritiesLoading, setPrioritiesLoading,
        prioritiesError, setPrioritiesError,
        prioritiesSettingsOpen, setPrioritiesSettingsOpen,
        prioritiesSettings, setPrioritiesSettings,
        prioritiesSettingsLoading, setPrioritiesSettingsLoading,
        prioritiesSettingsError, setPrioritiesSettingsError,
        prioritiesSettingsPrefRef,
        prioritiesComposeOpen, setPrioritiesComposeOpen,
        prioritiesComposeStudentId, setPrioritiesComposeStudentId,
        prioritiesComposeKind, setPrioritiesComposeKind,
        prioritiesComposeText, setPrioritiesComposeText,

        // Broadcast
        broadcastTitle, setBroadcastTitle,
        broadcastMsg, setBroadcastMsg,
        sendingBroadcast, setSendingBroadcast,

        // Errors
        errorReports, setErrorReports,
        errorsLoading, setErrorsLoading,
        errorsQuery, setErrorsQuery,
        errorsStatusFilter, setErrorsStatusFilter,

        // Videos
        videoQueue, setVideoQueue,
        videoLoading, setVideoLoading,
        videoMissingCount, setVideoMissingCount,
        videoMissingLoading, setVideoMissingLoading,
        videoExerciseName, setVideoExerciseName,
        videoBackfillLimit, setVideoBackfillLimit,
        videoCycleRunning, setVideoCycleRunning,
        videoCycleStats, setVideoCycleStats,
        videoCycleStopRef,

        // Aliases
        exerciseAliasesReview, setExerciseAliasesReview,
        exerciseAliasesLoading, setExerciseAliasesLoading,
        exerciseAliasesError, setExerciseAliasesError,
        exerciseAliasesBackfillLoading, setExerciseAliasesBackfillLoading,
        exerciseAliasesNotice, setExerciseAliasesNotice,

        // User Activity
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

        // Derived
        studentsWithTeacherFiltered,
        studentsWithoutTeacherFiltered,
        teachersFiltered,
        templatesFiltered,
        dashboardCharts,
        coachInboxItems,
        ...adminActions,
        getAdminAuthHeaders,

        // Teacher loaders
        loadTeacherStudents,
        loadTeacherTemplates,
        loadTeacherHistory,
        loadTeacherInbox,

        // Priorities
        fetchPriorities,
        loadPrioritiesSettings,
        savePrioritiesSettings,
        normalizeCoachInboxSettings,

        // User Activity
        loadUserActivityUsers,
        loadUserActivitySummary,
        loadUserActivityEvents,
        loadUserActivityErrors,
        openUserActivityUser,

        // Refs (if needed directly)
        supabase,

        // Debug
        debugError, setDebugError,

        // Utility
        getSetsCount,

        // System handlers
        handleExportSystem,
        handleImportSystemClick,
        handleImportSystem,
        handleExportPdf,
        handleExportJson,
        openEditWorkout,
        openEditTemplate,

        // Student handlers
        handleAddTemplateToStudent,
        handleEditStudent,
        handleSaveStudentEdit,
        handleSaveTemplate,
        handleDangerAction,
        runDangerAction,
        // Pending self-registered users
        pendingProfiles, setPendingProfiles,
        approvePendingProfile,
    };
};

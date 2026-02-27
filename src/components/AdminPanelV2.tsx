// ============================================================
// ⚠️  NÃO ALTERAR O LAYOUT DESTE COMPONENTE  ⚠️
// ------------------------------------------------------------
// Layout CORRETO: menu horizontal SUPERIOR (sticky top-0)
//   → flex flex-col + sticky top-0 border-b + tabs no topo
//
// Layout ERRADO (não usar):
//   → aside sidebar lateral (w-20 lg:w-64)
//
// O Trae IDE tende a substituir por sidebar lateral.
// Se isso acontecer, restaurar do commit: 054d9aa
// ============================================================
'use client';

import React from 'react';
import { useAdminPanelController } from '@/components/admin-panel/useAdminPanelController';
import { AdminPanelProvider } from '@/components/admin-panel/AdminPanelContext';
import { AdminPanelHeader } from '@/components/admin-panel/AdminPanelHeader';
import { DashboardTab } from '@/components/admin-panel/DashboardTab';
import { StudentsTab } from '@/components/admin-panel/StudentsTab';
import { TeachersTab } from '@/components/admin-panel/TeachersTab';
import { TemplatesTab } from '@/components/admin-panel/TemplatesTab';
import { SystemTab } from '@/components/admin-panel/SystemTab';
import { ErrorsTab } from '@/components/admin-panel/ErrorsTab';
import { VideosTab } from '@/components/admin-panel/VideosTab';
import { PrioritiesTab } from '@/components/admin-panel/PrioritiesTab';
import { StudentDetailPanel } from '@/components/admin-panel/StudentDetailPanel';
import { Modals } from '@/components/admin-panel/Modals';
import AdminVipReports from '@/components/admin/AdminVipReports';
import RequestsTab from '@/components/admin/RequestsTab';
import type { AdminUser } from '@/types/admin';

export type AdminPanelV2Props = {
    user: AdminUser;
    onClose?: () => void;
};

const AdminPanelV2 = ({ user, onClose }: AdminPanelV2Props) => {
    const ctrl = useAdminPanelController({ user, onClose });
    const {
        tab, isAdmin, isTeacher,
        moreTabsOpen, setMoreTabsOpen,
        setTab, setSelectedStudent,
        selectedStudent,
        supabase, debugError,
    } = ctrl;

    if (!isAdmin && !isTeacher) return null;

    let TAB_LABELS: Record<string, string> = { dashboard: 'VISÃO GERAL', students: 'ALUNOS', templates: 'TREINOS' };
    if (isAdmin) {
        TAB_LABELS = { ...TAB_LABELS, requests: 'SOLICITAÇÕES', teachers: 'PROFESSORES', videos: 'VÍDEOS', errors: 'ERROS', vip_reports: 'RELATÓRIOS VIP', system: 'SISTEMA' };
    }
    if (isTeacher && !isAdmin) {
        TAB_LABELS = { ...TAB_LABELS, priorities: 'PRIORIDADES' };
    }
    if (isAdmin) {
        TAB_LABELS = { ...TAB_LABELS, priorities: 'PRIORIDADES' };
    }

    const tabKeys = Object.keys(TAB_LABELS);
    const currentTabLabel = TAB_LABELS[tab] || 'VISÃO GERAL';

    return (
        <AdminPanelProvider value={ctrl}>
            <div data-tour="adminpanel.root" className="fixed inset-0 z-50 bg-neutral-950 text-white flex flex-col overflow-hidden">
                <AdminPanelHeader
                    debugError={debugError}
                    tabLabels={TAB_LABELS}
                    tabKeys={tabKeys}
                    tab={tab}
                    currentTabLabel={currentTabLabel}
                    moreTabsOpen={moreTabsOpen}
                    setMoreTabsOpen={setMoreTabsOpen}
                    setTab={setTab}
                    setSelectedStudent={(value) => setSelectedStudent(value as AdminUser | null)}
                    onClose={onClose}
                />
                <div className="flex-1 min-h-0 overflow-y-auto p-4 pb-20 pb-safe">
                    {tab === 'dashboard' && !selectedStudent && <DashboardTab />}
                    {tab === 'priorities' && !selectedStudent && <PrioritiesTab />}
                    {tab === 'students' && !selectedStudent && <StudentsTab />}
                    {tab === 'templates' && !selectedStudent && <TemplatesTab />}
                    {tab === 'requests' && !selectedStudent && isAdmin && <RequestsTab />}
                    {tab === 'videos' && !selectedStudent && isAdmin && <VideosTab />}
                    {tab === 'errors' && !selectedStudent && isAdmin && <ErrorsTab />}
                    {tab === 'vip_reports' && !selectedStudent && <AdminVipReports supabase={supabase} />}
                    {tab === 'system' && !selectedStudent && <SystemTab />}
                    {tab === 'teachers' && isAdmin && !selectedStudent && <TeachersTab />}
                    <StudentDetailPanel />
                </div>
                <Modals />
            </div>
        </AdminPanelProvider>
    );
};

export default AdminPanelV2;

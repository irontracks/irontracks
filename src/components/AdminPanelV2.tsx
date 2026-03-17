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
import { PrioritiesTab } from '@/components/admin-panel/PrioritiesTab';
import dynamic from 'next/dynamic';

// Lazy-load heavier tabs that are only used by admins
const TeachersTab = dynamic(() => import('@/components/admin-panel/TeachersTab').then(m => ({ default: m.TeachersTab })), { ssr: false });
const TemplatesTab = dynamic(() => import('@/components/admin-panel/TemplatesTab').then(m => ({ default: m.TemplatesTab })), { ssr: false });
const SystemTab = dynamic(() => import('@/components/admin-panel/SystemTab').then(m => ({ default: m.SystemTab })), { ssr: false });
const ErrorsTab = dynamic(() => import('@/components/admin-panel/ErrorsTab').then(m => ({ default: m.ErrorsTab })), { ssr: false });
const VideosTab = dynamic(() => import('@/components/admin-panel/VideosTab').then(m => ({ default: m.VideosTab })), { ssr: false });
const StudentDetailPanel = dynamic(() => import('@/components/admin-panel/StudentDetailPanel').then(m => m.StudentDetailPanel), { ssr: false });
const AdminVipReports = dynamic(() => import('@/components/admin/AdminVipReports'), { ssr: false });
const RequestsTab = dynamic(() => import('@/components/admin/RequestsTab'), { ssr: false });
const VipTab = dynamic(() => import('@/components/admin-panel/VipTab').then(m => ({ default: m.VipTab })), { ssr: false });
import { Modals } from '@/components/admin-panel/Modals';
import { logError } from '@/lib/logger';
import type { AdminUser } from '@/types/admin';

/** Lightweight error boundary to isolate tab crashes without taking down the whole admin panel */
class TabErrorBoundary extends React.Component<{ name: string; children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
    constructor(props: { name: string; children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
    componentDidCatch(error: Error) { logError('AdminPanel', `Tab "${this.props.name}" crashed`, { error: error.message }); }
    render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center p-8 text-center gap-3">
                    <p className="text-red-400 font-bold text-sm">Erro ao carregar aba &ldquo;{this.props.name}&rdquo;</p>
                    <button onClick={() => this.setState({ hasError: false, error: null })} className="px-4 py-2 bg-neutral-800 rounded-lg text-xs text-white hover:bg-neutral-700">Tentar novamente</button>
                </div>
            );
        }
        return this.props.children;
    }
}

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
        TAB_LABELS = { ...TAB_LABELS, requests: 'SOLICITAÇÕES', teachers: 'PROFESSORES', videos: 'VÍDEOS', errors: 'FEEDBACK', vip: 'VIP GESTÃO', vip_reports: 'VIP REPORTS', system: 'FERRAMENTAS' };
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
                    {tab === 'dashboard' && !selectedStudent && <TabErrorBoundary name="Visão Geral"><DashboardTab /></TabErrorBoundary>}
                    {tab === 'priorities' && !selectedStudent && <TabErrorBoundary name="Prioridades"><PrioritiesTab /></TabErrorBoundary>}
                    {tab === 'students' && !selectedStudent && <TabErrorBoundary name="Alunos"><StudentsTab /></TabErrorBoundary>}
                    {tab === 'templates' && !selectedStudent && <TabErrorBoundary name="Treinos"><TemplatesTab /></TabErrorBoundary>}
                    {tab === 'requests' && !selectedStudent && isAdmin && <TabErrorBoundary name="Solicitações"><RequestsTab /></TabErrorBoundary>}
                    {tab === 'videos' && !selectedStudent && isAdmin && <TabErrorBoundary name="Vídeos"><VideosTab /></TabErrorBoundary>}
                    {tab === 'errors' && !selectedStudent && isAdmin && <TabErrorBoundary name="Feedback"><ErrorsTab /></TabErrorBoundary>}
                    {tab === 'vip' && !selectedStudent && isAdmin && <TabErrorBoundary name="VIP"><VipTab /></TabErrorBoundary>}
                    {tab === 'vip_reports' && !selectedStudent && <TabErrorBoundary name="VIP Reports"><AdminVipReports supabase={supabase} /></TabErrorBoundary>}
                    {tab === 'system' && !selectedStudent && <TabErrorBoundary name="Ferramentas"><SystemTab /></TabErrorBoundary>}
                    {tab === 'teachers' && isAdmin && !selectedStudent && <TabErrorBoundary name="Professores"><TeachersTab /></TabErrorBoundary>}
                    <StudentDetailPanel />
                </div>
                <Modals />
            </div>
        </AdminPanelProvider>
    );
};

export default AdminPanelV2;

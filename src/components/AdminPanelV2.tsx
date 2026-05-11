// ============================================================
// Layout: header sticky + conteúdo scrollable + bottom tab bar.
// Substituiu o sistema antigo de dropdown "VISÃO GERAL" no header.
//   - AdminPanelHeader: enxuto (logo + close)
//   - AdminPanelSubTabs: chips no topo do conteúdo (dentro de cada
//     categoria com mais de 1 sub-tab)
//   - AdminPanelBottomTabs: bottom tab bar com 4 categorias fixas
// ============================================================
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useAdminPanelController } from '@/components/admin-panel/useAdminPanelController';
import { AdminPanelProvider } from '@/components/admin-panel/AdminPanelContext';
import { AdminPanelHeader } from '@/components/admin-panel/AdminPanelHeader';
import { AdminPanelBottomTabs } from '@/components/admin-panel/AdminPanelBottomTabs';
import { AdminPanelSubTabs } from '@/components/admin-panel/AdminPanelSubTabs';
import { categoryForTab } from '@/components/admin-panel/adminPanelTabs';
import { DashboardTab } from '@/components/admin-panel/DashboardTab';
import { StudentsTab } from '@/components/admin-panel/StudentsTab';
import { PrioritiesTab } from '@/components/admin-panel/PrioritiesTab';
import dynamic from 'next/dynamic';
import { Crown, Loader2 } from 'lucide-react';

// Lazy-load heavier tabs that are only used by admins
const TeachersTab = dynamic(() => import('@/components/admin-panel/TeachersTab').then(m => ({ default: m.TeachersTab })), { ssr: false });
const TemplatesTab = dynamic(() => import('@/components/admin-panel/TemplatesTab').then(m => ({ default: m.TemplatesTab })), { ssr: false });
const SystemTab = dynamic(() => import('@/components/admin-panel/SystemTab').then(m => ({ default: m.SystemTab })), { ssr: false });
const ErrorsTab = dynamic(() => import('@/components/admin-panel/ErrorsTab').then(m => ({ default: m.ErrorsTab })), { ssr: false });
const VideosTab = dynamic(() => import('@/components/admin-panel/VideosTab').then(m => ({ default: m.VideosTab })), { ssr: false });
const StudentDetailPanel = dynamic(() => import('@/components/admin-panel/StudentDetailPanel').then(m => m.StudentDetailPanel), { ssr: false });
const RequestsTab = dynamic(() => import('@/components/admin/RequestsTab'), { ssr: false });
// VipTabUnified agrupa VipTab (assinantes) + AdminVipReports (relatórios)
const VipTabUnified = dynamic(() => import('@/components/admin-panel/VipTabUnified').then(m => ({ default: m.VipTabUnified })), { ssr: false });
const TeacherManualTab = dynamic(() => import('@/components/admin-panel/TeacherManualTab'), { ssr: false });
// FinanceTabUnified agrupa TeacherBillingTab (cobranças do aluno) + PlatformBillingTab (SaaS)
const FinanceTabUnified = dynamic(() => import('@/components/admin-panel/FinanceTabUnified').then(m => ({ default: m.FinanceTabUnified })), { ssr: false });
const AcquisitionTab = dynamic(() => import('@/components/admin-panel/AcquisitionTab').then(m => ({ default: m.AcquisitionTab })), { ssr: false });
const CronsStatusTab = dynamic(() => import('@/components/admin-panel/CronsStatusTab').then(m => ({ default: m.CronsStatusTab })), { ssr: false });
const AnalyticsTab = dynamic(() => import('@/components/admin-panel/AnalyticsTab').then(m => ({ default: m.AnalyticsTab })), { ssr: false });
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
        setTab, setSelectedStudent,
        selectedStudent,
        debugError,
    } = ctrl;

    // Deferred auth check: wait up to 3s for role to be populated before showing fallback
    const hasAccess = isAdmin || isTeacher;
    const [waited, setWaited] = useState(false);
    useEffect(() => {
        if (hasAccess) return;
        const timer = setTimeout(() => setWaited(true), 3000);
        return () => clearTimeout(timer);
    }, [hasAccess]);

    // Set de tabs disponíveis para esse role. Precisa ficar AQUI (antes dos
    // early returns de auth) por causa das regras de hooks — useMemo não
    // pode ser chamado condicionalmente.
    //
    // Mudanças do refactor 2026-05:
    //   - 'vip_reports' removida (agora dentro de 'vip' via VipTabUnified)
    //   - 'platform_billing' removida (agora dentro de 'billing' via FinanceTabUnified)
    //   - 'acquisition' adicionada (linka pra /admin/acquisition)
    const availableTabs = useMemo<ReadonlySet<string>>(() => {
        const keys = ['dashboard', 'students', 'templates'];
        if (isAdmin) {
            keys.push('requests', 'teachers', 'videos', 'errors', 'vip', 'acquisition', 'analytics', 'crons', 'system');
        }
        if (isTeacher || isAdmin) {
            keys.push('priorities', 'billing', 'guide');
        }
        return new Set(keys);
    }, [isAdmin, isTeacher]);

    // While waiting for role to populate, show loading
    if (!hasAccess && !waited) {
        return (
            <div data-tour="adminpanel.root" className="fixed inset-0 z-50 bg-neutral-950 text-white flex flex-col items-center justify-center gap-4">
                <Loader2 size={32} className="text-yellow-500 animate-spin" />
                <p className="text-sm text-neutral-400 font-medium">Carregando Painel de Controle...</p>
                <button
                    type="button"
                    onClick={() => onClose?.()}
                    className="mt-4 px-5 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-sm font-bold transition-colors border border-neutral-700"
                >
                    Voltar ao Dashboard
                </button>
            </div>
        );
    }

    // If role still not valid after timeout, show permission denied with close button
    if (!hasAccess) {
        return (
            <div data-tour="adminpanel.root" className="fixed inset-0 z-50 bg-neutral-950 text-white flex flex-col items-center justify-center gap-4 p-6">
                <div className="w-16 h-16 rounded-3xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
                    <Crown size={28} className="text-yellow-500" />
                </div>
                <h2 className="text-lg font-black text-white">Acesso Restrito</h2>
                <p className="text-sm text-neutral-400 text-center max-w-sm">
                    Seu perfil não tem permissão de Coach ou Admin. Verifique com o administrador.
                </p>
                <button
                    type="button"
                    onClick={() => onClose?.()}
                    className="mt-4 px-6 py-3 rounded-2xl bg-yellow-500 hover:bg-yellow-400 text-black font-black text-sm transition-colors"
                >
                    Voltar ao Dashboard
                </button>
            </div>
        );
    }

    // ── Tabs disponíveis por role ──────────────────────────────────────
    // Mantém a lógica que existia antes (admin vê tudo, teacher vê
    // subset). Só converte para um Set/Record consumido pelas novas
    // bottom tabs e sub-tabs.
    let TAB_LABELS: Record<string, string> = { dashboard: 'VISÃO GERAL', students: 'ALUNOS', templates: 'TREINOS' };
    if (isAdmin) {
        TAB_LABELS = { ...TAB_LABELS, requests: 'SOLICITAÇÕES', teachers: 'PROFESSORES', videos: 'VÍDEOS', errors: 'FEEDBACK', vip: 'VIP', acquisition: 'AQUISIÇÃO', analytics: 'ANALYTICS', crons: 'CRONS', system: 'FERRAMENTAS' };
    }
    if (isTeacher && !isAdmin) {
        TAB_LABELS = { ...TAB_LABELS, priorities: 'PRIORIDADES', billing: 'FINANCEIRO', guide: 'GUIA' };
    }
    if (isAdmin) {
        TAB_LABELS = { ...TAB_LABELS, priorities: 'PRIORIDADES', billing: 'FINANCEIRO', guide: 'GUIA' };
    }

    const currentTabLabel = TAB_LABELS[tab] || 'VISÃO GERAL';
    const activeCategory = categoryForTab(tab);

    return (
        <AdminPanelProvider value={ctrl}>
            <div data-tour="adminpanel.root" className="fixed inset-0 z-50 bg-neutral-950 text-white flex flex-col overflow-hidden">
                <AdminPanelHeader
                    debugError={debugError}
                    currentTabLabel={currentTabLabel}
                    setTab={setTab}
                    setSelectedStudent={(value) => setSelectedStudent(value as AdminUser | null)}
                    onClose={onClose}
                />
                {/* Conteúdo scrollable. pb-32 deixa espaço pro bottom tab
                    bar (que tem ~72px de altura incluindo safe area).
                    Sub-tabs aparecem com sticky-top dentro deste container. */}
                <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-2 pb-32">
                    <AdminPanelSubTabs
                        category={activeCategory}
                        currentTab={tab}
                        availableTabs={availableTabs}
                        tabLabels={TAB_LABELS}
                        setTab={setTab}
                        setSelectedStudent={(value) => setSelectedStudent(value as AdminUser | null)}
                    />
                    <div className="pt-2">
                        {tab === 'dashboard' && !selectedStudent && <TabErrorBoundary name="Visão Geral"><DashboardTab /></TabErrorBoundary>}
                        {tab === 'priorities' && !selectedStudent && <TabErrorBoundary name="Prioridades"><PrioritiesTab /></TabErrorBoundary>}
                        {tab === 'students' && !selectedStudent && <TabErrorBoundary name="Alunos"><StudentsTab /></TabErrorBoundary>}
                        {tab === 'templates' && !selectedStudent && <TabErrorBoundary name="Treinos"><TemplatesTab /></TabErrorBoundary>}
                        {tab === 'requests' && !selectedStudent && isAdmin && <TabErrorBoundary name="Solicitações"><RequestsTab /></TabErrorBoundary>}
                        {tab === 'videos' && !selectedStudent && isAdmin && <TabErrorBoundary name="Vídeos"><VideosTab /></TabErrorBoundary>}
                        {tab === 'errors' && !selectedStudent && isAdmin && <TabErrorBoundary name="Feedback"><ErrorsTab /></TabErrorBoundary>}
                        {/* VIP unificado: VipTabUnified internamente alterna entre
                            assinantes e relatórios via toggle. */}
                        {tab === 'vip' && !selectedStudent && isAdmin && <TabErrorBoundary name="VIP"><VipTabUnified /></TabErrorBoundary>}
                        {tab === 'acquisition' && !selectedStudent && isAdmin && <TabErrorBoundary name="Aquisição"><AcquisitionTab /></TabErrorBoundary>}
                        {tab === 'crons' && !selectedStudent && isAdmin && <TabErrorBoundary name="Crons"><CronsStatusTab /></TabErrorBoundary>}
                        {tab === 'analytics' && !selectedStudent && isAdmin && <TabErrorBoundary name="Analytics"><AnalyticsTab /></TabErrorBoundary>}
                        {tab === 'system' && !selectedStudent && <TabErrorBoundary name="Ferramentas"><SystemTab /></TabErrorBoundary>}
                        {tab === 'teachers' && isAdmin && !selectedStudent && <TabErrorBoundary name="Professores"><TeachersTab /></TabErrorBoundary>}
                        {/* Financeiro unificado: para teacher mostra só
                            cobranças dos alunos; para admin mostra toggle
                            (cobranças / plataforma). */}
                        {tab === 'billing' && !selectedStudent && <TabErrorBoundary name="Financeiro"><FinanceTabUnified /></TabErrorBoundary>}
                        {tab === 'guide' && !selectedStudent && <TabErrorBoundary name="Guia"><TeacherManualTab /></TabErrorBoundary>}
                        <StudentDetailPanel />
                    </div>
                </div>
                {/* Bottom tab bar — sempre visível enquanto o admin panel
                    está aberto. Some quando StudentDetailPanel toma a tela
                    (esse componente é fixed por conta própria e sobrepõe). */}
                {!selectedStudent && (
                    <AdminPanelBottomTabs
                        currentTab={tab}
                        availableTabs={availableTabs}
                        setTab={setTab}
                        setSelectedStudent={(value) => setSelectedStudent(value as AdminUser | null)}
                    />
                )}
                <Modals />
            </div>
        </AdminPanelProvider>
    );
};

export default AdminPanelV2;

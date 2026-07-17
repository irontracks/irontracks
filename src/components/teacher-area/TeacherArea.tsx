'use client';

// ============================================================
// Área do professor — casca de coaching própria (header + conteúdo
// scrollable + bottom nav). Reusa o MIOLO do painel: monta
// useAdminPanelController + AdminPanelProvider e apresenta os MESMOS
// componentes de tab que o AdminPanelV2 usa, só que com navegação e
// identidade de coach. Nenhuma tab é reescrita.
// ============================================================

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2, X, Crown } from 'lucide-react';
import { useAdminPanelController } from '@/components/admin-panel/useAdminPanelController';
import { AdminPanelProvider } from '@/components/admin-panel/AdminPanelContext';
import { DashboardTab } from '@/components/admin-panel/DashboardTab';
import { StudentsTab } from '@/components/admin-panel/StudentsTab';
import { PrioritiesTab } from '@/components/admin-panel/PrioritiesTab';
import { Modals } from '@/components/admin-panel/Modals';
import { logError } from '@/lib/logger';
import type { AdminUser } from '@/types/admin';
import { TeacherAreaNav } from './TeacherAreaNav';
import { TEACHER_SECTION_KEYS, labelForSection } from './teacherAreaSections';

const TemplatesTab = dynamic(() => import('@/components/admin-panel/TemplatesTab').then(m => ({ default: m.TemplatesTab })), { ssr: false });
const FinanceTabUnified = dynamic(() => import('@/components/admin-panel/FinanceTabUnified').then(m => ({ default: m.FinanceTabUnified })), { ssr: false });
const TeacherManualTab = dynamic(() => import('@/components/admin-panel/TeacherManualTab'), { ssr: false });
const StudentDetailPanel = dynamic(() => import('@/components/admin-panel/StudentDetailPanel').then(m => m.StudentDetailPanel), { ssr: false });

/** Boundary leve para isolar crash de uma seção sem derrubar a área toda. */
class SectionBoundary extends React.Component<{ name: string; children: React.ReactNode }, { hasError: boolean }> {
    constructor(props: { name: string; children: React.ReactNode }) { super(props); this.state = { hasError: false }; }
    static getDerivedStateFromError() { return { hasError: true }; }
    componentDidCatch(error: Error) { logError('TeacherArea', `Seção "${this.props.name}" quebrou`, { error: error.message }); }
    render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center p-8 text-center gap-3">
                    <p className="text-red-400 font-bold text-sm">Erro ao carregar &ldquo;{this.props.name}&rdquo;</p>
                    <button onClick={() => this.setState({ hasError: false })} className="px-4 py-2 bg-neutral-800 rounded-lg text-xs text-white hover:bg-neutral-700">Tentar novamente</button>
                </div>
            );
        }
        return this.props.children;
    }
}

export type TeacherAreaProps = {
    user: AdminUser;
    onClose?: () => void;
};

const TeacherArea = ({ user, onClose }: TeacherAreaProps) => {
    const ctrl = useAdminPanelController({ user, onClose });
    const { tab, setTab, isAdmin, isTeacher, selectedStudent, setSelectedStudent } = ctrl;

    const hasAccess = isTeacher || isAdmin;

    // O role pode chegar assíncrono na hidratação; espera até 3s antes de decidir
    // "acesso negado". Sem isso, um não-professor que abrisse /dashboard/teacher na
    // mão ficaria num spinner eterno (o layout gateia por aprovação, não por role).
    const [waited, setWaited] = useState(false);
    useEffect(() => {
        if (hasAccess) return;
        const timer = setTimeout(() => setWaited(true), 3000);
        return () => clearTimeout(timer);
    }, [hasAccess]);

    // Se o tab persistido não for uma seção da Área do professor (ex.: veio de um
    // tab admin), cai em 'dashboard'. Sem isso, a nav não destacaria nada.
    useEffect(() => {
        if (!TEACHER_SECTION_KEYS.has(tab)) setTab('dashboard');
    }, [tab, setTab]);

    if (!hasAccess && !waited) {
        return (
            <div className="fixed inset-0 z-[60] bg-neutral-950 text-white flex flex-col items-center justify-center gap-4">
                <Loader2 size={32} className="text-yellow-500 animate-spin" />
                <p className="text-sm text-neutral-400 font-medium">Carregando Área do professor...</p>
                <button type="button" onClick={() => onClose?.()} className="mt-4 px-5 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-sm font-bold border border-neutral-700">Voltar</button>
            </div>
        );
    }

    if (!hasAccess) {
        return (
            <div className="fixed inset-0 z-[60] bg-neutral-950 text-white flex flex-col items-center justify-center gap-4 p-6">
                <div className="w-16 h-16 rounded-3xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
                    <Crown size={28} className="text-yellow-500" />
                </div>
                <h2 className="text-lg font-black text-white">Acesso restrito</h2>
                <p className="text-sm text-neutral-400 text-center max-w-sm">Esta área é exclusiva para professores.</p>
                <button type="button" onClick={() => onClose?.()} className="mt-4 px-6 py-3 rounded-2xl bg-yellow-500 hover:bg-yellow-400 text-black font-black text-sm">Voltar</button>
            </div>
        );
    }

    const displayName = String(user?.displayName || user?.name || 'Professor');
    const initial = displayName.charAt(0).toUpperCase();
    const currentLabel = labelForSection(tab);

    return (
        <AdminPanelProvider value={ctrl}>
            <div data-tour="teacherarea.root" className="fixed inset-0 z-[60] bg-neutral-950 text-white flex flex-col overflow-hidden">
                {/* Header próprio de coaching */}
                <header className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-neutral-800 pt-[calc(0.75rem+env(safe-area-inset-top))]">
                    <span className="h-10 w-10 rounded-full bg-yellow-500 text-black flex items-center justify-center font-black flex-shrink-0">{initial}</span>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                            <Crown size={13} className="text-yellow-500 flex-shrink-0" />
                            <span className="text-[11px] uppercase tracking-widest text-yellow-500 font-bold">Área do professor</span>
                        </div>
                        <p className="text-sm font-bold text-white truncate">{selectedStudent ? currentLabel : displayName}</p>
                    </div>
                    <button type="button" onClick={() => onClose?.()} aria-label="Fechar" className="p-2 hover:bg-neutral-800 rounded-full text-neutral-300 flex-shrink-0">
                        <X size={18} />
                    </button>
                </header>

                {/* Conteúdo scrollável */}
                <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-3 pb-6">
                    {tab === 'dashboard' && !selectedStudent && <SectionBoundary name="Início"><DashboardTab /></SectionBoundary>}
                    {tab === 'students' && !selectedStudent && <SectionBoundary name="Alunos"><StudentsTab /></SectionBoundary>}
                    {tab === 'templates' && !selectedStudent && <SectionBoundary name="Treinos"><TemplatesTab /></SectionBoundary>}
                    {tab === 'billing' && !selectedStudent && <SectionBoundary name="Financeiro"><FinanceTabUnified /></SectionBoundary>}
                    {tab === 'priorities' && !selectedStudent && <SectionBoundary name="Prioridades"><PrioritiesTab /></SectionBoundary>}
                    {tab === 'guide' && !selectedStudent && <SectionBoundary name="Guia"><TeacherManualTab /></SectionBoundary>}
                    <StudentDetailPanel />
                </div>

                {/* Bottom nav — some quando o detalhe do aluno toma a tela */}
                {!selectedStudent && (
                    <TeacherAreaNav
                        activeTab={tab}
                        onSelect={(key) => { setSelectedStudent(null); setTab(key); }}
                    />
                )}
                <Modals />
            </div>
        </AdminPanelProvider>
    );
};

export default TeacherArea;

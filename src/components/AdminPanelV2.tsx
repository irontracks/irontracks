import React from 'react';
import { useRouter } from 'next/navigation';
import { AdminUser } from '@/types/admin';
import { AdminPanelProvider } from './admin-panel/AdminPanelContext';
import { useAdminPanelController } from './admin-panel/useAdminPanelController';
import { DashboardTab } from './admin-panel/DashboardTab';
import { StudentsTab } from './admin-panel/StudentsTab';
import { TeachersTab } from './admin-panel/TeachersTab';
import { TemplatesTab } from './admin-panel/TemplatesTab';
import { SystemTab } from './admin-panel/SystemTab';
import { VideosTab } from './admin-panel/VideosTab';
import { PrioritiesTab } from './admin-panel/PrioritiesTab';
import { ErrorsTab } from './admin-panel/ErrorsTab';
import { Modals } from './admin-panel/Modals';
import RequestsTab from './admin/RequestsTab';
import AdminVipReports from './admin/AdminVipReports';
import { 
    LayoutDashboard, Users, UserCheck, Dumbbell, 
    Settings, Video, AlertTriangle, ShieldAlert,
    UserCog, Megaphone, ChevronRight, LogOut
} from 'lucide-react';

export type AdminPanelV2Props = {
    user: AdminUser;
    onClose?: () => void;
};

const AdminPanelV2 = ({ user, onClose }: AdminPanelV2Props) => {
    const controller = useAdminPanelController({ user, onClose });
    const { 
        tab, setTab, 
        isAdmin,
        selectedStudent,
        setSelectedStudent,
        supabase
    } = controller;

    if (!user) return null;

    const tabs = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, adminOnly: false },
        { id: 'students', label: 'Alunos', icon: Users, adminOnly: false },
        { id: 'priorities', label: 'Prioridades', icon: AlertTriangle, adminOnly: false },
        { id: 'teachers', label: 'Professores', icon: UserCheck, adminOnly: true },
        { id: 'templates', label: 'Treinos', icon: Dumbbell, adminOnly: false },
        { id: 'videos', label: 'Vídeos', icon: Video, adminOnly: false },
        { id: 'errors', label: 'Erros', icon: ShieldAlert, adminOnly: true },
        { id: 'requests', label: 'Solicitações', icon: UserCog, adminOnly: true },
        { id: 'vip', label: 'Relatórios VIP', icon: Megaphone, adminOnly: true },
        { id: 'system', label: 'Sistema', icon: Settings, adminOnly: true },
    ];

    const activeTabs = tabs.filter(t => !t.adminOnly || isAdmin);

    if (!user) return null;

    return (
        <AdminPanelProvider value={controller}>
            <div className="flex h-screen bg-neutral-950 text-white overflow-hidden font-sans selection:bg-yellow-500/30">
                {/* Sidebar */}
                <aside className="w-20 lg:w-64 bg-neutral-900 border-r border-neutral-800 flex flex-col shrink-0 transition-all duration-300 relative z-20">
                    <div className="p-4 lg:p-6 flex items-center gap-3 border-b border-neutral-800/50">
                        <div className="w-8 h-8 lg:w-10 lg:h-10 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-xl flex items-center justify-center shadow-lg shadow-yellow-500/20 shrink-0">
                            <span className="font-black text-black text-xs lg:text-sm">IT</span>
                        </div>
                        <div className="hidden lg:block">
                            <h1 className="font-black text-lg leading-none tracking-tight">IronTracks</h1>
                            <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider mt-0.5">Admin Panel</p>
                        </div>
                    </div>

                    <nav className="flex-1 overflow-y-auto py-4 px-2 lg:px-4 space-y-1 scrollbar-thin scrollbar-thumb-neutral-800">
                        {activeTabs.map((t) => {
                            const Icon = t.icon;
                            const isActive = tab === t.id;
                            return (
                                <button
                                    key={t.id}
                                    onClick={() => {
                                        setTab(t.id);
                                        setSelectedStudent(null);
                                    }}
                                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group relative overflow-hidden ${
                                        isActive
                                            ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20'
                                            : 'text-neutral-400 hover:bg-white/5 hover:text-white'
                                    }`}
                                >
                                    <Icon size={20} className={`shrink-0 ${isActive ? 'text-black' : 'text-neutral-500 group-hover:text-white transition-colors'}`} />
                                    <span className={`hidden lg:block font-bold text-sm ${isActive ? 'text-black' : ''}`}>{t.label}</span>
                                    {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-black/20 rounded-r-full" />}
                                </button>
                            );
                        })}
                    </nav>

                    <div className="p-4 border-t border-neutral-800 bg-neutral-900/50">
                        <button
                            onClick={onClose}
                            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-neutral-400 hover:bg-red-500/10 hover:text-red-500 transition-all group"
                        >
                            <LogOut size={20} className="shrink-0 group-hover:scale-110 transition-transform" />
                            <span className="hidden lg:block font-bold text-sm">Sair</span>
                        </button>
                    </div>
                </aside>

                {/* Main Content */}
                <main className="flex-1 overflow-hidden flex flex-col relative bg-neutral-950">
                    <header className="h-16 lg:h-20 border-b border-neutral-800 flex items-center justify-between px-6 lg:px-8 bg-neutral-900/30 backdrop-blur-md sticky top-0 z-10">
                        <h2 className="text-xl font-black text-white flex items-center gap-2">
                            {selectedStudent ? (
                                <>
                                    <span className="text-neutral-500 cursor-pointer hover:text-white transition-colors" onClick={() => setSelectedStudent(null)}>Alunos</span>
                                    <ChevronRight size={16} className="text-neutral-600" />
                                    <span>{selectedStudent.name}</span>
                                </>
                            ) : (
                                tabs.find(t => t.id === tab)?.label
                            )}
                        </h2>
                        
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-3 px-3 py-1.5 bg-neutral-900 rounded-full border border-neutral-800">
                                <div className="w-8 h-8 rounded-full bg-yellow-500 flex items-center justify-center text-black font-black text-xs">
                                    {(user.name?.charAt(0) || 'A').toUpperCase()}
                                </div>
                                <div className="hidden sm:block pr-2">
                                    <div className="text-xs font-bold text-white leading-none">{user.name}</div>
                                    <div className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider mt-0.5">{user.role}</div>
                                </div>
                            </div>
                        </div>
                    </header>

                    <div className="flex-1 overflow-y-auto p-4 lg:p-8 scrollbar-thin scrollbar-thumb-neutral-800">
                        <div className="max-w-7xl mx-auto pb-20">
                            {tab === 'dashboard' && !selectedStudent && <DashboardTab />}
                            {tab === 'students' && !selectedStudent && <StudentsTab />}
                            {tab === 'teachers' && <TeachersTab />}
                            {tab === 'templates' && !selectedStudent && <TemplatesTab />}
                            {tab === 'system' && !selectedStudent && <SystemTab />}
                            {tab === 'videos' && !selectedStudent && <VideosTab />}
                            {tab === 'priorities' && !selectedStudent && <PrioritiesTab />}
                            {tab === 'errors' && !selectedStudent && <ErrorsTab />}
                            
                            {/* Abas legadas ou ainda não extraídas */}
                            {tab === 'requests' && !selectedStudent && <RequestsTab />}
                            {tab === 'vip' && !selectedStudent && <AdminVipReports supabase={supabase} />}
                            
                            {/* Student Details View (Manter lógica original se selectedStudent != null) */}
                            {selectedStudent && (
                                <div className="text-center py-20">
                                    <p className="text-neutral-500">Detalhes do aluno em migração para componente isolado.</p>
                                    <button 
                                        onClick={() => setSelectedStudent(null)}
                                        className="mt-4 px-4 py-2 bg-neutral-800 rounded-lg text-sm font-bold hover:bg-neutral-700"
                                    >
                                        Voltar
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </main>

                <Modals />
            </div>
        </AdminPanelProvider>
    );
};

export default AdminPanelV2;
'use client';

import React, { useState } from 'react';
import {
    LayoutDashboard,
    Users,
    UserCog,
    BookOpen,
    Settings,
    LogOut,
    Menu,
    X,
    Video,
    AlertTriangle,
    ShieldAlert
} from 'lucide-react';
import { AdminPanelProvider, useAdminPanel } from './admin-panel/AdminPanelContext';
import { useAdminPanelController } from './admin-panel/useAdminPanelController';
import { DashboardTab } from './admin-panel/DashboardTab';
import { StudentsTab } from './admin-panel/StudentsTab';
import { TeachersTab } from './admin-panel/TeachersTab';
import { TemplatesTab } from './admin-panel/TemplatesTab';
import { SystemTab } from './admin-panel/SystemTab';
import { VideosTab } from './admin-panel/VideosTab';
import { ErrorsTab } from './admin-panel/ErrorsTab';
import { PrioritiesTab } from './admin-panel/PrioritiesTab';
import { Modals } from './admin-panel/Modals';
import { AdminUser } from '@/types/admin';

// Componente interno que consome o contexto
const AdminPanelContent: React.FC = () => {
    const {
        user,
        isAdmin,
        isTeacher,
        tab,
        setTab,
        onClose,
        loading
    } = useAdminPanel();

    const [sidebarOpen, setSidebarOpen] = useState(false);

    const menuItems = [
        { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'teacher'] },
        { key: 'priorities', label: 'Prioridades', icon: AlertTriangle, roles: ['admin', 'teacher'] },
        { key: 'students', label: 'Alunos', icon: Users, roles: ['admin', 'teacher'] },
        { key: 'teachers', label: 'Professores', icon: UserCog, roles: ['admin'] },
        { key: 'templates', label: 'Templates', icon: BookOpen, roles: ['admin', 'teacher'] },
        { key: 'videos', label: 'Vídeos', icon: Video, roles: ['admin'] },
        { key: 'errors', label: 'Erros', icon: ShieldAlert, roles: ['admin'] },
        { key: 'system', label: 'Sistema', icon: Settings, roles: ['admin'] },
    ];

    const filteredMenu = menuItems.filter(item => {
        if (isAdmin) return true;
        if (isTeacher) return item.roles.includes('teacher');
        return false;
    });

    return (
        <div className="flex flex-col md:flex-row min-h-screen bg-neutral-950 text-neutral-200 font-sans selection:bg-yellow-500/30">
            {/* Sidebar Overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-neutral-900 border-r border-neutral-800 transform transition-transform duration-300 ease-in-out md:translate-x-0 md:static md:inset-auto md:flex md:flex-col ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="p-6 border-b border-neutral-800 flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-black text-white tracking-tighter italic">
                            IRON<span className="text-yellow-500">TRACKS</span>
                        </h1>
                        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest bg-neutral-800 px-2 py-0.5 rounded border border-neutral-700">
                            {isAdmin ? 'Admin' : 'Coach'} Panel
                        </span>
                    </div>
                    <button onClick={() => setSidebarOpen(false)} className="md:hidden text-neutral-400 hover:text-white">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto py-6 px-3 space-y-1 custom-scrollbar">
                    {filteredMenu.map((item) => {
                        const active = tab === item.key;
                        const Icon = item.icon;
                        return (
                            <button
                                key={item.key}
                                onClick={() => {
                                    setTab(item.key);
                                    setSidebarOpen(false);
                                }}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                                    active
                                        ? 'bg-yellow-500 text-black font-black shadow-lg shadow-yellow-500/20'
                                        : 'text-neutral-400 hover:bg-neutral-800 hover:text-white font-medium'
                                }`}
                            >
                                <Icon size={20} className={active ? 'text-black' : 'text-neutral-500 group-hover:text-yellow-500 transition-colors'} />
                                <span>{item.label}</span>
                            </button>
                        );
                    })}
                </div>

                <div className="p-4 border-t border-neutral-800 bg-neutral-900">
                    <div className="flex items-center gap-3 mb-4 px-2">
                        <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center font-black text-yellow-500 border border-neutral-700">
                            {user?.email?.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                            <div className="text-sm font-bold text-white truncate">{user?.email?.split('@')[0]}</div>
                            <div className="text-xs text-neutral-500 truncate">{user?.email}</div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-neutral-800 hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/30 text-neutral-400 rounded-xl transition-all border border-neutral-700 font-bold text-sm active:scale-95"
                    >
                        <LogOut size={18} />
                        <span>Sair do Painel</span>
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-black/20">
                {/* Mobile Header */}
                <div className="md:hidden flex items-center justify-between p-4 bg-neutral-900 border-b border-neutral-800">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setSidebarOpen(true)} className="text-neutral-400 hover:text-white">
                            <Menu size={24} />
                        </button>
                        <h1 className="text-lg font-black text-white italic">
                            IRON<span className="text-yellow-500">TRACKS</span>
                        </h1>
                    </div>
                </div>

                {/* Tab Content */}
                <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar relative">
                    {loading && (
                        <div className="absolute top-0 left-0 right-0 h-1 bg-neutral-800 overflow-hidden z-50">
                            <div className="h-full bg-yellow-500 animate-progress origin-left"></div>
                        </div>
                    )}
                    
                    <div className="max-w-7xl mx-auto">
                        <header className="mb-8 animate-in slide-in-from-top-4 duration-500">
                            <h2 className="text-3xl font-black text-white tracking-tight">
                                {menuItems.find(i => i.key === tab)?.label || 'Painel'}
                            </h2>
                            <p className="text-neutral-500 mt-1">
                                {isAdmin ? 'Gerenciamento total do sistema' : 'Gerenciamento de alunos e treinos'}
                            </p>
                        </header>

                        {tab === 'dashboard' && <DashboardTab />}
                        {tab === 'students' && <StudentsTab />}
                        {tab === 'teachers' && <TeachersTab />}
                        {tab === 'templates' && <TemplatesTab />}
                        {tab === 'system' && <SystemTab />}
                        {tab === 'videos' && <VideosTab />}
                        {tab === 'errors' && <ErrorsTab />}
                        {tab === 'priorities' && <PrioritiesTab />}
                    </div>
                </main>
            </div>

            {/* Global Modals */}
            <Modals />
        </div>
    );
};

export type AdminPanelProps = {
    user: AdminUser;
    onClose?: () => void;
};

const AdminPanelV2: React.FC<AdminPanelProps> = (props) => {
    const controller = useAdminPanelController(props);
    return (
        <AdminPanelProvider value={controller}>
            <AdminPanelContent />
        </AdminPanelProvider>
    );
};

export default AdminPanelV2;

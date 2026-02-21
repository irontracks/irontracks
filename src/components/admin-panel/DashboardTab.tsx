import React from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
    ArcElement
} from 'chart.js';
import { Users, UserCheck, UserX, AlertTriangle, Clock } from 'lucide-react';
import { useAdminPanel } from './AdminPanelContext';

ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
    ArcElement
);

export const DashboardTab: React.FC = () => {
    const {
        isAdmin,
        isTeacher,
        setTab,
        usersList,
        teachersList,
        dashboardCharts,
        coachInboxItems,
        setSelectedStudent,
        setHistoryOpen
    } = useAdminPanel();

    const chartOptions = {
        responsive: true,
        plugins: {
            legend: { position: 'bottom' as const, labels: { color: '#e5e5e5', font: { size: 11, weight: 'bold' as const } } },
            title: { display: false }
        },
        scales: {
            x: { ticks: { color: '#a3a3a3', font: { size: 10, weight: 'bold' as const } }, grid: { color: '#262626' } },
            y: { ticks: { color: '#a3a3a3', font: { size: 10, weight: 'bold' as const } }, grid: { color: '#262626' } }
        }
    };

    const doughnutOptions = {
        responsive: true,
        plugins: {
            legend: { position: 'right' as const, labels: { color: '#e5e5e5', font: { size: 11, weight: 'bold' as const } } }
        },
        cutout: '70%',
        elements: { arc: { borderWidth: 0 } }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-neutral-900/50 p-4 rounded-2xl border border-neutral-800 shadow-sm backdrop-blur-sm">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-yellow-500/10 rounded-lg">
                            <Users size={18} className="text-yellow-500" />
                        </div>
                        <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Total Alunos</span>
                    </div>
                    <div className="text-2xl font-black text-white ml-1">
                        {dashboardCharts.totalStudents}
                    </div>
                </div>

                {isAdmin && (
                    <div className="bg-neutral-900/50 p-4 rounded-2xl border border-neutral-800 shadow-sm backdrop-blur-sm">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-neutral-800 rounded-lg">
                                <UserCheck size={18} className="text-neutral-400" />
                            </div>
                            <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Professores</span>
                        </div>
                        <div className="text-2xl font-black text-white ml-1">
                            {teachersList.length}
                        </div>
                    </div>
                )}

                <div className="bg-neutral-900/50 p-4 rounded-2xl border border-neutral-800 shadow-sm backdrop-blur-sm">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-green-500/10 rounded-lg">
                            <UserCheck size={18} className="text-green-500" />
                        </div>
                        <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Ativos</span>
                    </div>
                    <div className="text-2xl font-black text-white ml-1">
                        {usersList.filter(u => String(u?.status || '').toLowerCase() === 'pago').length}
                    </div>
                </div>

                <div className="bg-neutral-900/50 p-4 rounded-2xl border border-neutral-800 shadow-sm backdrop-blur-sm">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-red-500/10 rounded-lg">
                            <UserX size={18} className="text-red-500" />
                        </div>
                        <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Pendentes</span>
                    </div>
                    <div className="text-2xl font-black text-white ml-1">
                        {usersList.filter(u => String(u?.status || '').toLowerCase() === 'pendente').length}
                    </div>
                </div>
            </div>

            {/* Inbox do Coach */}
            {isTeacher && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 bg-neutral-900/50 p-6 rounded-2xl border border-neutral-800 shadow-sm backdrop-blur-sm">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="font-black text-white text-lg flex items-center gap-2">
                                <Clock size={20} className="text-yellow-500" />
                                Coach Inbox
                            </h3>
                            <span className="text-xs font-bold text-neutral-500 bg-neutral-900 px-3 py-1 rounded-full border border-neutral-800">
                                Alunos inativos (+7 dias)
                            </span>
                        </div>

                        {coachInboxItems.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
                                <div className="p-4 bg-neutral-800/50 rounded-full">
                                    <UserCheck size={32} className="text-neutral-600" />
                                </div>
                                <p className="text-neutral-400 text-sm font-medium">Tudo em dia! Nenhum aluno inativo.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {coachInboxItems.map((item: Record<string, unknown>) => (
                                    <div key={item.id as string} className="flex items-center justify-between p-4 bg-neutral-900/80 border border-neutral-800 rounded-xl hover:border-yellow-500/30 transition-all group">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center font-black text-yellow-500 border border-neutral-700">
                                                {String(item.name ?? '').charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <div className="font-bold text-white group-hover:text-yellow-500 transition-colors">
                                                    {String(item.name ?? '')}
                                                </div>
                                                <div className="text-xs text-neutral-500 flex items-center gap-2">
                                                    <span className="text-red-400 font-bold">
                                                        {item.hasWorkouts ? `${item.daysSinceLastWorkout} dias sem treino` : 'Nunca treinou'}
                                                    </span>
                                                    <span>•</span>
                                                    <span>{String(item.email ?? '')}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => {
                                                    setSelectedStudent(item as unknown as import('@/types/admin').AdminUser);
                                                    setTab('students');
                                                }}
                                                className="px-3 py-2 text-xs font-bold text-neutral-400 bg-neutral-800 hover:bg-neutral-700 hover:text-white rounded-lg transition-all"
                                            >
                                                Ver Perfil
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setSelectedStudent(item as unknown as import('@/types/admin').AdminUser);
                                                    setHistoryOpen(true);
                                                }}
                                                className="px-3 py-2 text-xs font-bold text-black bg-yellow-500 hover:bg-yellow-400 rounded-lg transition-all"
                                            >
                                                Histórico
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                <button
                                    onClick={() => setTab('priorities')}
                                    className="w-full py-3 mt-2 text-xs font-bold text-neutral-400 hover:text-yellow-500 border-t border-neutral-800 transition-colors flex items-center justify-center gap-2"
                                >
                                    Ver todos em Prioridades <Clock size={14} />
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="bg-neutral-900/50 p-6 rounded-2xl border border-neutral-800 shadow-sm backdrop-blur-sm flex flex-col justify-center">
                        <h3 className="font-black text-white text-lg mb-6 flex items-center gap-2">
                            <AlertTriangle size={20} className="text-yellow-500" />
                            Status Geral
                        </h3>
                        <div className="relative aspect-square max-h-[250px] mx-auto">
                            <Doughnut data={dashboardCharts.statusDistribution.data} options={doughnutOptions} />
                            <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
                                <span className="text-3xl font-black text-white">{dashboardCharts.statusTotal}</span>
                                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Alunos</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Gráficos Admin */}
            {isAdmin && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-neutral-900/50 p-6 rounded-2xl border border-neutral-800 shadow-sm backdrop-blur-sm">
                        <h3 className="font-black text-white text-lg mb-6">Distribuição por Professor</h3>
                        <div className="h-[250px] w-full">
                            <Bar data={dashboardCharts.teacherDistribution.data} options={chartOptions} />
                        </div>
                    </div>

                    <div className="bg-neutral-900/50 p-6 rounded-2xl border border-neutral-800 shadow-sm backdrop-blur-sm">
                        <h3 className="font-black text-white text-lg mb-6">Status dos Alunos</h3>
                        <div className="h-[250px] w-full">
                            <Bar data={dashboardCharts.statusDistribution.data} options={chartOptions} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

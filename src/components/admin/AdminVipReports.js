import React, { useEffect, useState, useMemo } from 'react';
import { 
    Users, MessageSquare, Zap, Crown, Star, TrendingUp, 
    Download, RefreshCw, AlertCircle 
} from 'lucide-react';
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

ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
    ArcElement
);

const TIER_COLORS = {
    free: '#9ca3af', // gray-400
    vip_start: '#eab308', // yellow-500
    vip_pro: '#22c55e', // green-500
    vip_elite: '#a855f7' // purple-500
};

const TIER_LABELS = {
    free: 'Gratuito',
    vip_start: 'VIP Start',
    vip_pro: 'VIP Pro',
    vip_elite: 'VIP Elite'
};

export default function AdminVipReports({ supabase }) {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState([]);
    const [period, setPeriod] = useState('7d'); // 7d, 30d
    const [error, setError] = useState('');

    const loadStats = async () => {
        setLoading(true);
        setError('');
        try {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(endDate.getDate() - (period === '30d' ? 30 : 7));

            const { data, error } = await supabase.rpc('admin_get_vip_stats', {
                period_start: startDate.toISOString().split('T')[0],
                period_end: endDate.toISOString().split('T')[0]
            });

            if (error) throw error;
            setStats(data || []);
        } catch (err) {
            console.error(err);
            setError('Falha ao carregar relatórios VIP.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadStats();
    }, [period]);

    const aggregates = useMemo(() => {
        if (!stats.length) return null;
        
        const totalUsers = stats.reduce((acc, row) => acc + row.user_count, 0);
        const vipUsers = stats.filter(r => r.tier !== 'free').reduce((acc, row) => acc + row.user_count, 0);
        
        // Chat Usage
        const chatTotalUsage = stats.reduce((acc, row) => acc + row.stats.chat.usage, 0);
        const chatCapacity = stats.reduce((acc, row) => acc + row.stats.chat.capacity, 0);
        
        // Insights Usage
        const insightsTotalUsage = stats.reduce((acc, row) => acc + row.stats.insights.usage, 0);
        const insightsCapacity = stats.reduce((acc, row) => acc + row.stats.insights.capacity, 0);

        return { totalUsers, vipUsers, chatTotalUsage, chatCapacity, insightsTotalUsage, insightsCapacity };
    }, [stats]);

    const chartData = useMemo(() => {
        if (!stats.length) return null;

        const tiers = ['free', 'vip_start', 'vip_pro', 'vip_elite'];
        const labels = tiers.map(t => TIER_LABELS[t]);
        
        return {
            users: {
                labels,
                datasets: [{
                    label: 'Usuários Ativos',
                    data: tiers.map(t => stats.find(s => s.tier === t)?.user_count || 0),
                    backgroundColor: tiers.map(t => TIER_COLORS[t]),
                }]
            },
            usage: {
                labels,
                datasets: [
                    {
                        label: 'Chat (Msgs)',
                        data: tiers.map(t => stats.find(s => s.tier === t)?.stats.chat.usage || 0),
                        backgroundColor: '#3b82f6',
                    },
                    {
                        label: 'Insights (Gerações)',
                        data: tiers.map(t => stats.find(s => s.tier === t)?.stats.insights.usage || 0),
                        backgroundColor: '#f97316',
                    }
                ]
            }
        };
    }, [stats]);

    const downloadCsv = () => {
        if (!stats.length) return;
        
        const headers = ['Nível', 'Usuários', 'Chat (Uso)', 'Chat (Capacidade)', 'Insights (Uso)', 'Insights (Capacidade)', 'Wizard (Uso)'];
        const rows = stats.map(s => [
            TIER_LABELS[s.tier] || s.tier,
            s.user_count,
            s.stats.chat.usage,
            s.stats.chat.capacity,
            s.stats.insights.usage,
            s.stats.insights.capacity,
            s.stats.wizard.usage
        ]);

        const csvContent = "data:text/csv;charset=utf-8," 
            + [headers.join(','), ...rows.map(e => e.join(','))].join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `relatorio_vip_${period}_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        link.remove();
    };

    if (loading && !stats.length) {
        return <div className="p-8 text-center text-neutral-400">Carregando dados...</div>;
    }

    if (error) {
        return (
            <div className="p-8 flex flex-col items-center justify-center text-red-400">
                <AlertCircle size={32} className="mb-2" />
                <p>{error}</p>
                <button onClick={loadStats} className="mt-4 px-4 py-2 bg-neutral-800 rounded-lg hover:bg-neutral-700 text-white">
                    Tentar Novamente
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6 p-1">
            {/* Header Controls */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-neutral-900/50 p-4 rounded-xl border border-neutral-800">
                <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <Crown className="text-yellow-500" /> Relatórios VIP
                    </h2>
                    <p className="text-sm text-neutral-400">Análise de consumo e distribuição de planos.</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex bg-neutral-900 rounded-lg p-1 border border-neutral-800">
                        <button 
                            onClick={() => setPeriod('7d')}
                            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${period === '7d' ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
                        >
                            7 Dias
                        </button>
                        <button 
                            onClick={() => setPeriod('30d')}
                            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${period === '30d' ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
                        >
                            30 Dias
                        </button>
                    </div>
                    <button onClick={loadStats} className="p-2 bg-neutral-900 hover:bg-neutral-800 rounded-lg border border-neutral-800 text-neutral-400 hover:text-white">
                        <RefreshCw size={18} />
                    </button>
                    <button onClick={downloadCsv} className="p-2 bg-yellow-500 hover:bg-yellow-400 rounded-lg text-black font-bold flex items-center gap-2">
                        <Download size={18} /> <span className="hidden md:inline">CSV</span>
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            {aggregates && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-neutral-900 p-4 rounded-xl border border-neutral-800">
                        <div className="text-xs font-bold text-neutral-500 uppercase">Usuários VIP</div>
                        <div className="text-2xl font-black text-white mt-1">{aggregates.vipUsers} <span className="text-sm font-normal text-neutral-500">/ {aggregates.totalUsers}</span></div>
                    </div>
                    <div className="bg-neutral-900 p-4 rounded-xl border border-neutral-800">
                        <div className="text-xs font-bold text-neutral-500 uppercase">Utilização Chat</div>
                        <div className="text-2xl font-black text-blue-400 mt-1">
                            {((aggregates.chatTotalUsage / (aggregates.chatCapacity || 1)) * 100).toFixed(1)}%
                        </div>
                        <div className="text-xs text-neutral-500">{aggregates.chatTotalUsage.toLocaleString()} msgs</div>
                    </div>
                    <div className="bg-neutral-900 p-4 rounded-xl border border-neutral-800">
                        <div className="text-xs font-bold text-neutral-500 uppercase">Utilização Insights</div>
                        <div className="text-2xl font-black text-orange-400 mt-1">
                            {((aggregates.insightsTotalUsage / (aggregates.insightsCapacity || 1)) * 100).toFixed(1)}%
                        </div>
                        <div className="text-xs text-neutral-500">{aggregates.insightsTotalUsage.toLocaleString()} gerações</div>
                    </div>
                    <div className="bg-neutral-900 p-4 rounded-xl border border-neutral-800 flex items-center justify-center">
                        <div className="text-center">
                            <div className="text-xs font-bold text-neutral-500 uppercase mb-1">Status do Sistema</div>
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 text-green-400 text-xs font-bold border border-green-500/20">
                                <Zap size={12} /> Operacional
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Charts Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-neutral-900 p-6 rounded-xl border border-neutral-800">
                    <h3 className="text-sm font-bold text-white mb-4">Distribuição de Usuários</h3>
                    <div className="h-64 flex items-center justify-center">
                        {chartData && <Bar 
                            data={chartData.users} 
                            options={{
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: { legend: { display: false } },
                                scales: { y: { grid: { color: '#333' } }, x: { grid: { display: false } } }
                            }} 
                        />}
                    </div>
                </div>
                <div className="bg-neutral-900 p-6 rounded-xl border border-neutral-800">
                    <h3 className="text-sm font-bold text-white mb-4">Volume de Uso (IA)</h3>
                    <div className="h-64 flex items-center justify-center">
                        {chartData && <Bar 
                            data={chartData.usage} 
                            options={{
                                responsive: true,
                                maintainAspectRatio: false,
                                scales: { y: { grid: { color: '#333' } }, x: { grid: { display: false } } }
                            }} 
                        />}
                    </div>
                </div>
            </div>

            {/* Detailed Table */}
            <div className="bg-neutral-900 rounded-xl border border-neutral-800 overflow-hidden">
                <div className="p-4 border-b border-neutral-800">
                    <h3 className="text-sm font-bold text-white">Detalhamento por Nível</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-neutral-950 text-neutral-400 uppercase text-xs font-bold">
                            <tr>
                                <th className="px-6 py-3">Nível</th>
                                <th className="px-6 py-3 text-center">Usuários</th>
                                <th className="px-6 py-3 text-center">Chat (Uso/Cap)</th>
                                <th className="px-6 py-3 text-center">Insights (Uso/Cap)</th>
                                <th className="px-6 py-3 text-center">Wizard (Uso)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-800">
                            {stats.map((row) => (
                                <tr key={row.tier} className="hover:bg-neutral-800/50 transition-colors">
                                    <td className="px-6 py-4 font-bold flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: TIER_COLORS[row.tier] || '#fff' }} />
                                        <span style={{ color: TIER_COLORS[row.tier] || '#fff' }}>{TIER_LABELS[row.tier] || row.tier}</span>
                                    </td>
                                    <td className="px-6 py-4 text-center font-mono text-white">{row.user_count}</td>
                                    <td className="px-6 py-4 text-center">
                                        <div className="flex flex-col items-center">
                                            <span className="font-bold text-white">{row.stats.chat.usage.toLocaleString()}</span>
                                            <span className="text-xs text-neutral-500">de {row.stats.chat.capacity.toLocaleString()}</span>
                                            <div className="w-16 h-1 bg-neutral-800 rounded-full mt-1 overflow-hidden">
                                                <div 
                                                    className="h-full bg-blue-500" 
                                                    style={{ width: `${Math.min(100, (row.stats.chat.usage / (row.stats.chat.capacity || 1)) * 100)}%` }} 
                                                />
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <div className="flex flex-col items-center">
                                            <span className="font-bold text-white">{row.stats.insights.usage.toLocaleString()}</span>
                                            <span className="text-xs text-neutral-500">de {row.stats.insights.capacity.toLocaleString()}</span>
                                            <div className="w-16 h-1 bg-neutral-800 rounded-full mt-1 overflow-hidden">
                                                <div 
                                                    className="h-full bg-orange-500" 
                                                    style={{ width: `${Math.min(100, (row.stats.insights.usage / (row.stats.insights.capacity || 1)) * 100)}%` }} 
                                                />
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center font-mono text-neutral-300">
                                        {row.stats.wizard.usage.toLocaleString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

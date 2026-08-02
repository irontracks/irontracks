'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { TrendingUp, Loader2 } from 'lucide-react';
import {
    Chart as ChartJS, CategoryScale, LinearScale, LineElement, PointElement, Tooltip, Legend, Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useAdminPanel } from './AdminPanelContext';
import { adminFetchJson } from '@/utils/admin/adminFetch';
import { parseRawSession } from '@/components/historyListTypes';
import { buildLoadEvolution, type LoadSessionInput, type LoadSeries } from '@/lib/workout/loadEvolution';

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Tooltip, Legend, Filler);

const TIP = { backgroundColor: 'rgba(9,9,11,0.96)', borderColor: 'rgba(250,204,21,0.2)', borderWidth: 1, titleColor: '#fff', bodyColor: 'rgba(255,255,255,0.6)', padding: 10 } as const;
const GC = 'rgba(255,255,255,0.06)';
const TC = 'rgba(255,255,255,0.35)';

type Metric = 'e1rm' | 'volume';

function fmtDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Gráfico de evolução de carga por exercício (read-only) para o professor acompanhar a
 * progressão do aluno ao longo das sessões concluídas. Busca o histórico pela rota que já
 * valida o vínculo (canCoachStudent) e computa tudo com a fonte única (buildLoadEvolution).
 */
export const StudentLoadEvolution: React.FC = () => {
    const { selectedStudent, supabase } = useAdminPanel();
    // SÓ o auth uid (user_id). O fallback pra students.id fazia a rota history responder
    // 400 (não resolve o alvo) e mostrava erro; aluno sem conta simplesmente não tem
    // histórico → cai no empty state.
    const studentId = String(selectedStudent?.user_id || '').trim();

    const [series, setSeries] = useState<LoadSeries[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [picked, setPicked] = useState('');
    const [metric, setMetric] = useState<Metric>('e1rm');

    const load = useCallback(async () => {
        if (!studentId) { setLoading(false); return; }
        setLoading(true); setError('');
        try {
            const json = await adminFetchJson<{ ok: boolean; rows?: Array<{ notes?: string | null }>; error?: string }>(
                supabase,
                `/api/admin/workouts/history?id=${encodeURIComponent(studentId)}`,
            );
            if (!json?.ok) throw new Error(json?.error || 'Falha');
            const sessions: LoadSessionInput[] = (Array.isArray(json.rows) ? json.rows : [])
                .map((w) => parseRawSession(w?.notes ?? null))
                .filter((r): r is NonNullable<typeof r> => !!r)
                .map((r) => ({ date: r.date, logs: r.logs as Record<string, unknown>, exercises: r.exercises as Array<{ name?: string | null }> }));
            const built = buildLoadEvolution(sessions);
            setSeries(built);
            setPicked((prev) => (built.some((s) => s.exercise === prev) ? prev : built[0]?.exercise || ''));
        } catch {
            setError('Não foi possível carregar a evolução de carga.');
        } finally {
            setLoading(false);
        }
    }, [studentId, supabase]);

    useEffect(() => { void load(); }, [load]);

    const current = useMemo(() => series.find((s) => s.exercise === picked) || null, [series, picked]);

    const chart = useMemo(() => {
        if (!current) return null;
        return {
            data: {
                labels: current.points.map((p) => fmtDate(p.date)),
                datasets: [{
                    label: metric === 'e1rm' ? 'Carga estimada (1RM)' : 'Volume (kg)',
                    data: current.points.map((p) => (metric === 'e1rm' ? p.e1rm : p.volume)),
                    borderColor: '#facc15',
                    backgroundColor: 'rgba(250,204,21,0.12)',
                    pointBackgroundColor: '#facc15',
                    tension: 0.3,
                    pointRadius: 4,
                    fill: true,
                }],
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: TIP },
                scales: {
                    x: { grid: { color: GC }, ticks: { color: TC, font: { size: 10 } } },
                    y: { grid: { color: GC }, ticks: { color: TC, font: { size: 10 } }, beginAtZero: false },
                },
            },
        };
    }, [current, metric]);

    if (loading) {
        return <div className="flex items-center justify-center py-8 text-neutral-500 gap-2"><Loader2 size={18} className="animate-spin" /><span className="text-sm">Carregando evolução...</span></div>;
    }
    if (error) {
        return (
            <div className="bg-neutral-800 p-4 rounded-xl border border-neutral-700 text-center">
                <p className="text-sm text-neutral-400">{error}</p>
                <button type="button" onClick={() => void load()} className="mt-2 px-3 py-1.5 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-white text-xs font-bold">Tentar de novo</button>
            </div>
        );
    }
    if (series.length === 0) {
        return (
            <div className="bg-neutral-800 p-4 rounded-xl border border-neutral-700 text-center">
                <TrendingUp size={22} className="text-neutral-600 mx-auto mb-2" />
                <p className="text-sm text-neutral-400">Sem dados de carga ainda. Conforme o aluno registra os pesos nos treinos, a evolução aparece aqui.</p>
            </div>
        );
    }

    return (
        <div className="bg-neutral-800 p-4 rounded-xl border border-neutral-700">
            <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={16} className="text-yellow-500" />
                <h4 className="font-bold text-white">Evolução de carga</h4>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 mb-3">
                <select
                    aria-label="Exercício"
                    value={picked}
                    onChange={(e) => setPicked(e.target.value)}
                    className="flex-1 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:border-yellow-500 focus:outline-none"
                >
                    {series.map((s) => (
                        <option key={s.exercise} value={s.exercise}>{s.exercise} ({s.points.length})</option>
                    ))}
                </select>
                <div className="flex rounded-lg border border-neutral-700 overflow-hidden">
                    <button type="button" onClick={() => setMetric('e1rm')} className={`px-3 py-2 text-xs font-bold ${metric === 'e1rm' ? 'bg-yellow-500 text-black' : 'bg-neutral-900 text-neutral-300'}`}>Carga</button>
                    <button type="button" onClick={() => setMetric('volume')} className={`px-3 py-2 text-xs font-bold ${metric === 'volume' ? 'bg-yellow-500 text-black' : 'bg-neutral-900 text-neutral-300'}`}>Volume</button>
                </div>
            </div>

            {chart && (
                <div style={{ position: 'relative', height: 200 }}>
                    <Line data={chart.data} options={chart.options} />
                </div>
            )}
        </div>
    );
};

export default StudentLoadEvolution;

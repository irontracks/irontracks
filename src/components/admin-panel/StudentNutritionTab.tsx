'use client';

import React, { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Salad, Plus, RefreshCw } from 'lucide-react';
import { useAdminPanel } from './AdminPanelContext';

const PrescribeDietModal = dynamic(
    () => import('./PrescribeDietModal').then(m => ({ default: m.PrescribeDietModal })),
    { ssr: false }
);

type Totals = { calories: number; protein: number; carbs: number; fat: number };
type PlanItem = { food: string; grams: number; calories: number; protein: number; carbs: number; fat: number };
type PlanMeal = { name: string; time?: string; items: PlanItem[]; totals: Totals };
type Plan = { id: string; plan_name: string; meals: PlanMeal[]; notes: string | null; created_at: string };

const numOf = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

const mealTotals = (meal: PlanMeal): Totals => {
    const t = meal?.totals;
    if (t && numOf(t.calories) > 0) return { calories: numOf(t.calories), protein: numOf(t.protein), carbs: numOf(t.carbs), fat: numOf(t.fat) };
    const items = Array.isArray(meal?.items) ? meal.items : [];
    return items.reduce<Totals>((acc, it) => ({
        calories: acc.calories + numOf(it.calories), protein: acc.protein + numOf(it.protein),
        carbs: acc.carbs + numOf(it.carbs), fat: acc.fat + numOf(it.fat),
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
};

/** Aba Nutrição do aluno no painel do professor: prescreve o plano alimentar e mostra o ativo. */
export const StudentNutritionTab: React.FC = () => {
    const { selectedStudent, getAdminAuthHeaders } = useAdminPanel();
    const [plan, setPlan] = useState<Plan | null>(null);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);

    const studentId = String(selectedStudent?.user_id || '').trim();

    const load = useCallback(async () => {
        if (!studentId) { setPlan(null); setLoading(false); return; }
        setLoading(true);
        try {
            const authHeaders = await getAdminAuthHeaders();
            const res = await fetch(`/api/teacher/diet/plan?studentId=${encodeURIComponent(studentId)}`, {
                credentials: 'include',
                headers: { ...authHeaders },
            });
            const json = await res.json().catch(() => ({}));
            setPlan(res.ok && json?.ok && json.plan ? (json.plan as Plan) : null);
        } catch {
            setPlan(null);
        } finally {
            setLoading(false);
        }
    }, [studentId, getAdminAuthHeaders]);

    useEffect(() => { void load(); }, [load]);

    if (!selectedStudent) return null;

    const grand = plan
        ? plan.meals.reduce<Totals>((acc, m) => {
            const t = mealTotals(m);
            return { calories: acc.calories + t.calories, protein: acc.protein + t.protein, carbs: acc.carbs + t.carbs, fat: acc.fat + t.fat };
        }, { calories: 0, protein: 0, carbs: 0, fat: 0 })
        : null;

    return (
        <div className="space-y-4">
            <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.25)]">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <Salad size={18} className="text-yellow-500" />
                            <h3 className="text-base font-black text-white tracking-tight">Plano alimentar</h3>
                        </div>
                        <div className="mt-1 text-xs text-neutral-400 font-semibold">
                            {plan ? 'Plano ativo prescrito' : 'Nenhum plano ativo'}
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {plan && (
                            <button
                                type="button"
                                onClick={() => void load()}
                                className="min-h-[44px] px-4 py-3 bg-neutral-900/70 border border-yellow-500/25 text-yellow-400 rounded-xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-yellow-500/10 transition-all duration-300 active:scale-95"
                                aria-label="Atualizar"
                            >
                                <RefreshCw size={15} /> Atualizar
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => setModalOpen(true)}
                            disabled={!studentId}
                            className="min-h-[44px] px-4 py-3 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 disabled:cursor-not-allowed text-black rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 shadow-lg shadow-yellow-500/15 active:scale-95 flex items-center gap-2"
                        >
                            <Plus size={15} /> {plan ? 'Refazer plano' : 'Prescrever plano'}
                        </button>
                    </div>
                </div>
                {!studentId && (
                    <p className="mt-3 text-xs text-neutral-500">Este aluno ainda não possui acesso ao app — não é possível prescrever um plano.</p>
                )}
            </div>

            {loading && <p className="text-center text-neutral-500 text-sm animate-pulse">Carregando plano...</p>}

            {!loading && plan && grand && (
                <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <h4 className="text-sm font-bold text-white truncate">{plan.plan_name || 'Plano alimentar'}</h4>
                            <p className="text-[11px] text-neutral-500">{plan.meals.length} refeições</p>
                        </div>
                        <span className="shrink-0 text-[11px] tabular-nums text-yellow-300/90">{Math.round(grand.calories)} kcal · {Math.round(grand.protein)}g P</span>
                    </div>

                    {plan.notes ? (
                        <p className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 text-xs text-neutral-300 whitespace-pre-wrap break-words">{plan.notes}</p>
                    ) : null}

                    <div className="space-y-2">
                        {plan.meals.map((meal, idx) => {
                            const t = mealTotals(meal);
                            return (
                                <div key={`${meal.name}-${idx}`} className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-3">
                                    <div className="flex items-baseline justify-between gap-2">
                                        <span className="text-sm font-semibold text-white truncate">{meal.name}</span>
                                        <span className="shrink-0 text-[11px] tabular-nums text-neutral-300">{Math.round(t.calories)} kcal · P{Math.round(t.protein)} C{Math.round(t.carbs)} G{Math.round(t.fat)}</span>
                                    </div>
                                    <div className="mt-1 text-[11px] text-neutral-400 truncate">
                                        {(Array.isArray(meal.items) ? meal.items : []).map((it) => it.food).join(' · ')}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {modalOpen && <PrescribeDietModal onClose={() => setModalOpen(false)} onCreated={() => void load()} />}
        </div>
    );
};

export default StudentNutritionTab;

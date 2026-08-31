'use client';

import React, { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Salad, Plus, RefreshCw } from 'lucide-react';
import { useAdminPanel } from './AdminPanelContext';
import { MAX_NOTA_DA_REFEICAO, type MacroTotals, type PlanMeal as PlanMealShape } from '@/lib/nutrition/dietPlanShape';

const PrescribeDietModal = dynamic(
    () => import('./PrescribeDietModal').then(m => ({ default: m.PrescribeDietModal })),
    { ssr: false }
);

// Tipos da FONTE ÚNICA. A cópia que existia aqui não tinha o `note` da
// refeição — a mesma armadilha que já deixara a orientação invisível no card do
// aluno (ver CLAUDE.md, seção do plano alimentar).
type Totals = MacroTotals;
type PlanMeal = PlanMealShape;
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
    /** Rascunho da orientação por refeição — sem ele, o plano que volta do
     *  servidor sobrescreveria o que o professor está digitando. */
    const [notaDraft, setNotaDraft] = useState<Record<number, string>>({});
    const [salvandoNota, setSalvandoNota] = useState<number | null>(null);
    const [erroNota, setErroNota] = useState<string | null>(null);

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

    /** Grava a orientação no BLUR — uma requisição por tecla seria absurda. */
    const salvarNota = useCallback(async (mealIndex: number, atual: string) => {
        const rascunho = notaDraft[mealIndex];
        // Sem rascunho o campo mostra o que já está salvo: sair dele não é edição.
        // Tratar `undefined` como '' aqui apagaria a nota de quem só passou o dedo.
        if (rascunho === undefined) return;
        const texto = rascunho.trim();
        if (texto === (atual ?? '').trim()) return;
        setSalvandoNota(mealIndex); setErroNota(null);
        try {
            const authHeaders = await getAdminAuthHeaders();
            const res = await fetch('/api/teacher/diet/note', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json', ...authHeaders },
                body: JSON.stringify({ studentId, mealIndex, note: texto }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json?.ok) {
                setErroNota(String(json?.error || '') === 'plan_is_students_own'
                    ? 'O plano ativo deste aluno foi montado por ele. Prescreva um plano para poder orientar.'
                    : 'Não consegui salvar a orientação. O texto continua aí — tente de novo.');
                return;
            }
            setPlan((prev) => (prev ? { ...prev, meals: json.meals as PlanMeal[] } : prev));
            setNotaDraft((prev) => { const p = { ...prev }; delete p[mealIndex]; return p; });
        } catch {
            setErroNota('Falha ao salvar a orientação.');
        } finally {
            setSalvandoNota(null);
        }
    }, [notaDraft, studentId, getAdminAuthHeaders]);

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
                    <p className="mt-3 text-xs text-neutral-400">Este aluno ainda não possui acesso ao app — não é possível prescrever um plano.</p>
                )}
            </div>

            {loading && <p className="text-center text-neutral-400 text-sm animate-pulse">Carregando plano...</p>}

            {!loading && plan && grand && (
                <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <h4 className="text-sm font-bold text-white truncate">{plan.plan_name || 'Plano alimentar'}</h4>
                            <p className="text-[11px] text-neutral-400">{plan.meals.length} refeições</p>
                        </div>
                        <span className="shrink-0 text-[11px] tabular-nums text-yellow-300/90">{Math.round(grand.calories)} kcal · {Math.round(grand.protein)}g P</span>
                    </div>

                    {erroNota && (
                        <p className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">{erroNota}</p>
                    )}

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
                                    {/*
                                      A orientação que o ALUNO vê nesta refeição. Texto
                                      livre, então a autocorreção fica ligada.
                                    */}
                                    <textarea
                                        aria-label={`Orientação sobre ${meal.name}`}
                                        value={notaDraft[idx] ?? meal.note ?? ''}
                                        onChange={(e) => setNotaDraft((prev) => ({ ...prev, [idx]: e.target.value.slice(0, MAX_NOTA_DA_REFEICAO) }))}
                                        onBlur={() => void salvarNota(idx, meal.note ?? '')}
                                        rows={2}
                                        maxLength={MAX_NOTA_DA_REFEICAO}
                                        disabled={salvandoNota === idx}
                                        placeholder="Orientação pro aluno nesta refeição (ex.: mastigar devagar, trocar por atum)"
                                        className="mt-2 w-full resize-none rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-2 text-[11px] leading-relaxed text-white placeholder:text-neutral-400 outline-none transition focus:border-yellow-500/30 disabled:opacity-60"
                                    />
                                    {salvandoNota === idx && <span className="mt-1 block text-[10px] text-neutral-400">salvando…</span>}
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

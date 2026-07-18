'use client';

import React, { useState } from 'react';
import { X, Salad, Loader2, Check } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useAdminPanel } from './AdminPanelContext';
import { useDialog } from '@/contexts/DialogContext';

interface Props {
    onClose: () => void;
    /** Recarrega o plano exibido na aba após prescrever. */
    onCreated?: () => void;
}

const FIELD = 'w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:border-yellow-500 focus:outline-none';
const LABEL = 'block text-[11px] font-black uppercase tracking-widest text-neutral-400 mb-1.5';

const clampInt = (v: string, min: number, max: number, fallback: number): number => {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
};

/**
 * Professor prescreve um plano alimentar pro aluno via /api/teacher/diet/prescribe. A IA
 * monta o cardápio usando o repertório/contexto do ALUNO; o professor define as metas de
 * macro e uma observação. O plano é persistido (student_diet_plans) e o aluno passa a vê-lo
 * na aba Nutrição.
 */
export const PrescribeDietModal: React.FC<Props> = ({ onClose, onCreated }) => {
    const containerRef = useFocusTrap(true, onClose);
    const { selectedStudent, getAdminAuthHeaders } = useAdminPanel();
    const { alert } = useDialog();

    const [calories, setCalories] = useState(2000);
    const [protein, setProtein] = useState(150);
    const [carbs, setCarbs] = useState(200);
    const [fat, setFat] = useState(60);
    const [meals, setMeals] = useState(5);
    const [notes, setNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const studentId = String(selectedStudent?.user_id || '').trim();
    const studentName = String(selectedStudent?.name || selectedStudent?.email || 'aluno');

    const prescribe = async () => {
        if (!studentId) { await alert('Este aluno ainda não possui acesso ao app.'); return; }
        if (submitting) return;
        if (calories <= 0) { await alert('Defina as calorias da meta.'); return; }
        setSubmitting(true);
        try {
            const authHeaders = await getAdminAuthHeaders();
            const res = await fetch('/api/teacher/diet/prescribe', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json', ...authHeaders },
                body: JSON.stringify({ studentId, calories, protein, carbs, fat, meals, notes: notes.trim() || undefined }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json?.ok) {
                if (json?.upgradeRequired) { await alert('Limite de gerações atingido. Faça upgrade para continuar.'); return; }
                throw new Error(String(json?.error || 'Falha ao prescrever'));
            }
            const n = Array.isArray(json?.plan?.meals) ? json.plan.meals.length : 0;
            await alert(`Plano alimentar prescrito para ${studentName} (${n} refeições). Ele já aparece na aba Nutrição do aluno.`, 'Sucesso');
            onCreated?.();
            onClose();
        } catch {
            await alert('Não foi possível prescrever o plano. Tente de novo.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="presentation">
            <button type="button" className="absolute inset-0 bg-black/80 backdrop-blur-sm cursor-default" onClick={onClose} aria-label="Fechar" />
            <div ref={containerRef} className="relative z-10 bg-neutral-900 w-full max-w-md rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]" role="dialog" aria-modal="true" aria-label="Prescrever plano alimentar">
                <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-yellow-500 min-w-0">
                        <Salad size={18} />
                        <div className="min-w-0">
                            <h3 className="font-bold text-white truncate">Plano alimentar</h3>
                            <p className="text-[11px] text-neutral-500 truncate">Cardápio com IA para {studentName}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-neutral-800 rounded-full text-neutral-300 flex-shrink-0" aria-label="Fechar"><X size={16} /></button>
                </div>

                <div className="p-4 overflow-y-auto space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={LABEL} htmlFor="d-cal">Calorias (kcal)</label>
                            <input id="d-cal" aria-label="Calorias da meta em kcal" type="number" inputMode="numeric" min={800} max={10000} className={FIELD} value={calories}
                                onChange={(e) => setCalories(clampInt(e.target.value, 0, 10000, 2000))} />
                        </div>
                        <div>
                            <label className={LABEL} htmlFor="d-prot">Proteína (g)</label>
                            <input id="d-prot" aria-label="Proteína da meta em gramas" type="number" inputMode="numeric" min={0} max={1000} className={FIELD} value={protein}
                                onChange={(e) => setProtein(clampInt(e.target.value, 0, 1000, 150))} />
                        </div>
                        <div>
                            <label className={LABEL} htmlFor="d-carb">Carboidrato (g)</label>
                            <input id="d-carb" aria-label="Carboidrato da meta em gramas" type="number" inputMode="numeric" min={0} max={2000} className={FIELD} value={carbs}
                                onChange={(e) => setCarbs(clampInt(e.target.value, 0, 2000, 200))} />
                        </div>
                        <div>
                            <label className={LABEL} htmlFor="d-fat">Gordura (g)</label>
                            <input id="d-fat" aria-label="Gordura da meta em gramas" type="number" inputMode="numeric" min={0} max={1000} className={FIELD} value={fat}
                                onChange={(e) => setFat(clampInt(e.target.value, 0, 1000, 60))} />
                        </div>
                        <div>
                            <label className={LABEL} htmlFor="d-meals">Refeições/dia</label>
                            <select id="d-meals" className={FIELD} value={meals} onChange={(e) => setMeals(Number(e.target.value))}>
                                {[3, 4, 5, 6, 7].map((m) => <option key={m} value={m}>{m} refeições</option>)}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className={LABEL} htmlFor="d-notes">Observações pro aluno (opcional)</label>
                        <input id="d-notes" aria-label="Observações" className={FIELD} value={notes} maxLength={300}
                            onChange={(e) => setNotes(e.target.value)} placeholder="sem lactose, treino 18h, evitar frituras..." />
                    </div>
                    <p className="text-[11px] text-neutral-500">A IA monta o cardápio com os alimentos que o aluno já come e o contexto dele (objetivo, exames). Substitui o plano ativo anterior.</p>
                </div>

                <div className="p-4 border-t border-neutral-800">
                    <button
                        type="button"
                        onClick={prescribe}
                        disabled={submitting || !studentId}
                        className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-black py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
                    >
                        {submitting ? <><Loader2 size={18} className="animate-spin" /> Gerando...</> : <><Check size={18} /> Prescrever plano</>}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PrescribeDietModal;

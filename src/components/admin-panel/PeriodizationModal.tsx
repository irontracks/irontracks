'use client';

import React, { useState } from 'react';
import { X, CalendarRange, Loader2, Check } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useAdminPanel } from './AdminPanelContext';
import { useDialog } from '@/contexts/DialogContext';

interface Props {
    onClose: () => void;
    /** Recarrega a lista de treinos do aluno após criar (a periodização gera N modelos). */
    onCreated?: () => void;
}

const SELECT = 'w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:border-yellow-500 focus:outline-none';
const LABEL = 'block text-[11px] font-black uppercase tracking-widest text-neutral-400 mb-1.5';

/** Professor gera uma periodização (plano de várias semanas) pro aluno via /api/teacher/periodization/create. */
export const PeriodizationModal: React.FC<Props> = ({ onClose, onCreated }) => {
    const containerRef = useFocusTrap(true, onClose);
    const { selectedStudent, getAdminAuthHeaders } = useAdminPanel();
    const { alert } = useDialog();

    const [goal, setGoal] = useState<'hypertrophy' | 'strength' | 'recomp'>('hypertrophy');
    const [model, setModel] = useState<'linear' | 'undulating'>('linear');
    const [weeks, setWeeks] = useState<4 | 6 | 8>(6);
    const [level, setLevel] = useState<'beginner' | 'intermediate' | 'advanced'>('intermediate');
    const [daysPerWeek, setDaysPerWeek] = useState(4);
    const [timeMinutes, setTimeMinutes] = useState(60);
    const [limitations, setLimitations] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const studentId = String(selectedStudent?.user_id || '').trim();
    const studentName = String(selectedStudent?.name || selectedStudent?.email || 'aluno');

    const generate = async () => {
        if (!studentId) { await alert('Este aluno ainda não possui acesso ao app.'); return; }
        if (submitting) return;
        setSubmitting(true);
        try {
            const authHeaders = await getAdminAuthHeaders();
            const res = await fetch('/api/teacher/periodization/create', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json', ...authHeaders },
                body: JSON.stringify({ studentId, model, weeks, goal, level, daysPerWeek, timeMinutes, limitations }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json?.ok) {
                if (json?.upgradeRequired) { await alert('Limite de gerações atingido. Faça upgrade para continuar.'); return; }
                throw new Error(String(json?.error || 'Falha ao gerar'));
            }
            const n = Array.isArray(json?.program?.createdWorkoutIds) ? json.program.createdWorkoutIds.length : 0;
            await alert(`Periodização de ${weeks} semanas criada para ${studentName} (${n} treinos).`, 'Sucesso');
            onCreated?.();
            onClose();
        } catch {
            await alert('Não foi possível gerar a periodização. Tente de novo.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="presentation">
            <button type="button" className="absolute inset-0 bg-black/80 backdrop-blur-sm cursor-default" onClick={onClose} aria-label="Fechar" />
            <div ref={containerRef} className="relative z-10 bg-neutral-900 w-full max-w-md rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]" role="dialog" aria-modal="true" aria-label="Gerar periodização">
                <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-yellow-500 min-w-0">
                        <CalendarRange size={18} />
                        <div className="min-w-0">
                            <h3 className="font-bold text-white truncate">Periodização</h3>
                            <p className="text-[11px] text-neutral-500 truncate">Plano de várias semanas para {studentName}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-neutral-800 rounded-full text-neutral-300 flex-shrink-0" aria-label="Fechar"><X size={16} /></button>
                </div>

                <div className="p-4 overflow-y-auto space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={LABEL} htmlFor="p-goal">Objetivo</label>
                            <select id="p-goal" className={SELECT} value={goal} onChange={(e) => setGoal(e.target.value as typeof goal)}>
                                <option value="hypertrophy">Hipertrofia</option>
                                <option value="strength">Força</option>
                                <option value="recomp">Recomposição</option>
                            </select>
                        </div>
                        <div>
                            <label className={LABEL} htmlFor="p-model">Modelo</label>
                            <select id="p-model" className={SELECT} value={model} onChange={(e) => setModel(e.target.value as typeof model)}>
                                <option value="linear">Linear</option>
                                <option value="undulating">Ondulatório</option>
                            </select>
                        </div>
                        <div>
                            <label className={LABEL} htmlFor="p-weeks">Duração</label>
                            <select id="p-weeks" className={SELECT} value={weeks} onChange={(e) => setWeeks(Number(e.target.value) as typeof weeks)}>
                                <option value={4}>4 semanas</option>
                                <option value={6}>6 semanas</option>
                                <option value={8}>8 semanas</option>
                            </select>
                        </div>
                        <div>
                            <label className={LABEL} htmlFor="p-level">Nível</label>
                            <select id="p-level" className={SELECT} value={level} onChange={(e) => setLevel(e.target.value as typeof level)}>
                                <option value="beginner">Iniciante</option>
                                <option value="intermediate">Intermediário</option>
                                <option value="advanced">Avançado</option>
                            </select>
                        </div>
                        <div>
                            <label className={LABEL} htmlFor="p-days">Dias/semana</label>
                            <select id="p-days" className={SELECT} value={daysPerWeek} onChange={(e) => setDaysPerWeek(Number(e.target.value))}>
                                {[2, 3, 4, 5, 6].map((d) => <option key={d} value={d}>{d} dias</option>)}
                            </select>
                        </div>
                        <div>
                            <label className={LABEL} htmlFor="p-time">Tempo/sessão</label>
                            <select id="p-time" className={SELECT} value={timeMinutes} onChange={(e) => setTimeMinutes(Number(e.target.value))}>
                                {[30, 45, 60, 75, 90].map((t) => <option key={t} value={t}>{t} min</option>)}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className={LABEL} htmlFor="p-lim">Limitações (opcional)</label>
                        <input id="p-lim" aria-label="Limitações" className={SELECT} value={limitations} onChange={(e) => setLimitations(e.target.value)} placeholder="lesão no ombro, joelho..." />
                    </div>
                    <p className="text-[11px] text-neutral-500">A IA usa o histórico de carga do aluno pra calibrar os pesos. Os treinos entram como modelos na conta dele.</p>
                </div>

                <div className="p-4 border-t border-neutral-800">
                    <button
                        type="button"
                        onClick={generate}
                        disabled={submitting || !studentId}
                        className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-black py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
                    >
                        {submitting ? <><Loader2 size={18} className="animate-spin" /> Gerando...</> : <><Check size={18} /> Gerar periodização</>}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PeriodizationModal;

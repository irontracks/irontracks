"use client";

import React, { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { Flame, ArrowLeft, Activity } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

interface StudentEvolutionProps {
    user: { id: string } | null;
    onClose: () => void;
}

const StudentEvolution = ({ user, onClose }: StudentEvolutionProps) => {
    const [mode, setMode] = useState('simple');
    const [assessments, setAssessments] = useState<Record<string, unknown>[]>([]);
    const [photos, setPhotos] = useState<Record<string, unknown>[]>([]);
    const supabase = useMemo(() => createClient(), []);
    const safeUserId = user?.id ? String(user.id) : '';

    useEffect(() => {
        let isMounted = true;

        const loadData = async () => {
            if (!safeUserId) {
                if (isMounted) {
                    setAssessments([]);
                    setPhotos([]);
                }
                return;
            }

            try {
                const { data: rawAssData, error: assError } = await supabase
                    .from('assessments')
                    .select('*')
                    .eq('student_id', safeUserId)
                    .order('assessment_date', { ascending: false });

                if (assError) throw assError;

                // Adaptar dados do schema novo para o componente antigo
                const assData = (rawAssData || []).map(a => ({
                    ...a,
                    id: a.id,
                    date: a.assessment_date || a.date, // fallback
                    bf: a.body_fat_percentage ?? a.bf,
                    weight: a.weight,
                    waist: a.waist_circ ?? a.waist,
                    arm: a.arm_circ ?? a.arm,
                    sum7: (a.sum7 ?? (
                        (Number(a.triceps_skinfold) || 0) +
                        (Number(a.biceps_skinfold) || 0) +
                        (Number(a.subscapular_skinfold) || 0) +
                        (Number(a.suprailiac_skinfold) || 0) +
                        (Number(a.abdominal_skinfold) || 0) +
                        (Number(a.thigh_skinfold) || 0) +
                        (Number(a.calf_skinfold) || 0)
                    )) || null
                }));

                // Tentar buscar fotos (tabela antiga ou nova?)
                // Mantendo lógica original para photos por enquanto para evitar quebra se a tabela existir
                const { data: photoData } = await supabase
                    .from('photos')
                    .select('*')
                    .eq('user_id', safeUserId)
                    .order('date', { ascending: false });

                if (isMounted) {
                    setAssessments(Array.isArray(assData) ? assData : []);
                    setPhotos(Array.isArray(photoData) ? photoData : []);
                }
            } catch {
                if (isMounted) {
                    setAssessments([]);
                    setPhotos([]);
                }
            }
        };

        loadData();

        return () => {
            isMounted = false;
        };
    }, [supabase, safeUserId]);

    const safeAssessments = Array.isArray(assessments) ? assessments.filter((a) => a && typeof a === 'object') : [];
    const safePhotos = Array.isArray(photos) ? photos.filter((p) => p && typeof p === 'object') : [];
    const latest = safeAssessments[0] || null;
    const formatDate = (value: string | number | Date | null) => {
        try {
            const t = new Date(value || 0).getTime();
            if (!Number.isFinite(t)) return 'Data desconhecida';
            return new Date(t).toLocaleDateString();
        } catch {
            return 'Data desconhecida';
        }
    };

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto animate-slide-up p-6 pb-20 text-white" style={{ background: 'linear-gradient(180deg, rgba(12,10,6,1) 0%, rgba(10,10,10,1) 30%)' }}>
            <div className="flex justify-between items-center mb-6 pt-safe">
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-yellow-500 flex items-center gap-2"><Flame size={18} /> EVOLUÇÃO</h2>
                <button type="button" onClick={onClose} className="px-3 py-2 rounded-xl border text-neutral-400 hover:text-white hover:border-yellow-500/40 transition-all active:scale-95 inline-flex items-center gap-2" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}><ArrowLeft className="w-4 h-4" /><span className="text-xs font-bold">Voltar</span></button>
            </div>
            <div className="flex p-1 rounded-2xl mb-8" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <button type="button" onClick={() => setMode('simple')} className={`cursor-pointer relative z-10 flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${mode === 'simple' ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20' : 'text-neutral-500 hover:text-neutral-300'}`}>Resumo</button>
                <button type="button" onClick={() => setMode('complete')} className={`cursor-pointer relative z-10 flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${mode === 'complete' ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20' : 'text-neutral-500 hover:text-neutral-300'}`}>Detalhado</button>
            </div>
            {mode === 'simple' && (
                <div className="text-center py-10">
                    {latest ? (
                        <div className="animate-fade-in">
                            <div className="w-48 h-48 rounded-full border-2 flex flex-col items-center justify-center mx-auto mb-8" style={{ borderColor: 'rgba(234,179,8,0.4)', background: 'linear-gradient(160deg, rgba(20,18,10,0.8) 0%, rgba(12,12,12,0.95) 50%)', boxShadow: '0 0 60px rgba(234,179,8,0.12), inset 0 1px 0 rgba(234,179,8,0.1)' }}>
                                <span className="text-6xl font-black text-white tracking-tighter">{String((latest as Record<string, unknown>)?.bf ?? '')}</span>
                                <span className="text-sm font-bold text-yellow-500 uppercase tracking-widest">% GORDURA</span>
                            </div>
                            <h3 className="text-2xl font-bold text-white mb-2">Resultado Incrível!</h3>
                            <p className="text-neutral-400 text-sm">Avaliação feita em {formatDate((latest as Record<string, unknown>)?.date as string | number | Date | null)}</p>
                        </div>
                    ) : (
                        <div className="py-20 opacity-50"><Activity size={64} className="mx-auto mb-4" /><p>Ainda sem avaliações.</p></div>
                    )}
                </div>
            )}
            {mode === 'complete' && (
                    <div className="space-y-6 animate-slide-up">
                        <div className="p-6 rounded-2xl border" style={{ background: 'linear-gradient(160deg, rgba(20,18,10,0.8) 0%, rgba(12,12,12,0.95) 50%)', borderColor: 'rgba(255,255,255,0.06)' }}>
                            <h3 className="text-[10px] font-black mb-6 text-yellow-500/80 uppercase tracking-[0.2em]">Histórico Corporal</h3>
                        {safeAssessments.map((a, idx) => {
                            const obj = (a || {}) as Record<string, unknown>;
                            const key = String(obj?.id || `assessment_${idx}`);
                            return (
                                <div key={key} className="py-4 last:border-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="font-mono text-neutral-400">{formatDate(obj?.date as string | number | Date | null)}</span>
                                        <div className="text-right"><span className="font-black text-xl text-white block">{String(obj?.bf ?? '-')}%</span><span className="text-[10px] text-neutral-500 uppercase">Gordura</span></div>
                                    </div>
                                    <div className="grid grid-cols-4 gap-2 text-[10px] text-neutral-500 p-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)' }}>
                                        <div className="text-center"><span className="block font-bold text-white">{String(obj?.weight || '-')}kg</span>Peso</div>
                                        <div className="text-center"><span className="block font-bold text-white">{String(obj?.waist || '-')}cm</span>Cintura</div>
                                        <div className="text-center"><span className="block font-bold text-white">{String(obj?.arm || '-')}cm</span>Braço</div>
                                        <div className="text-center"><span className="block font-bold text-white">{String(obj?.sum7 || '-')}mm</span>Dobras</div>
                                    </div>
                                </div>
                            )
                        })}
                        </div>
                        <div className="p-6 rounded-2xl border" style={{ background: 'linear-gradient(160deg, rgba(20,18,10,0.8) 0%, rgba(12,12,12,0.95) 50%)', borderColor: 'rgba(255,255,255,0.06)' }}>
                            <h3 className="text-[10px] font-black mb-6 text-yellow-500/80 uppercase tracking-[0.2em]">Galeria</h3>
                        {safePhotos.length === 0 && <p className="text-neutral-500 text-sm">Nenhuma foto.</p>}
                        <div className="grid grid-cols-2 gap-3">
                            {safePhotos.map((p, idx) => {
                                const pobj = (p || {}) as Record<string, unknown>;
                                const url = typeof pobj?.url === 'string' ? (pobj.url as string) : '';
                                const key = String(pobj?.id || `photo_${idx}`);
                                return (
                                    <div key={key} className="aspect-square rounded-2xl overflow-hidden border relative" style={{ background: 'rgba(0,0,0,0.5)', borderColor: 'rgba(255,255,255,0.06)' }}>
                                        {url ? (
                                            <Image src={url} alt="Foto de progresso" fill className="object-cover" sizes="(max-width: 768px) 50vw, 33vw" />
                                        ) : (
                                            <div className="absolute inset-0 flex items-center justify-center text-neutral-500 text-xs">Sem imagem</div>
                                        )}
                                        <div className="absolute bottom-0 inset-x-0 bg-black/60 p-2 text-[10px] text-center text-white">{formatDate(pobj?.date as string | number | Date | null)}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StudentEvolution;

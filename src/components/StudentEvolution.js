import React, { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { Flame, ArrowLeft, Activity } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

const StudentEvolution = ({ user, onClose }) => {
    const [mode, setMode] = useState('simple');
    const [assessments, setAssessments] = useState([]);
    const [photos, setPhotos] = useState([]);
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
                const { data: assData } = await supabase
                    .from('assessments')
                    .select('*')
                    .eq('user_id', safeUserId)
                    .order('date', { ascending: false });

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
    const formatDate = (value) => {
        try {
            const t = new Date(value || 0).getTime();
            if (!Number.isFinite(t)) return 'Data desconhecida';
            return new Date(t).toLocaleDateString();
        } catch {
            return 'Data desconhecida';
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-neutral-900 overflow-y-auto animate-slide-up p-6 pb-20 text-white">
                <div className="flex justify-between items-center mb-6 pt-safe">
                <h2 className="text-2xl font-black text-yellow-500 flex gap-2"><Flame/> EVOLUÇÃO</h2>
                <button type="button" onClick={onClose} className="cursor-pointer relative z-10 bg-neutral-800 px-3 py-2 rounded-full inline-flex items-center gap-2"><ArrowLeft className="w-4 h-4"/><span className="text-xs font-bold">Voltar</span></button>
                </div>
                <div className="flex bg-neutral-800 p-1 rounded-xl mb-8">
                <button type="button" onClick={()=>setMode('simple')} className={`cursor-pointer relative z-10 flex-1 py-3 rounded-lg font-bold text-xs uppercase ${mode==='simple'?'bg-yellow-500 text-black':'text-neutral-500'}`}>Resumo</button>
                <button type="button" onClick={()=>setMode('complete')} className={`cursor-pointer relative z-10 flex-1 py-3 rounded-lg font-bold text-xs uppercase ${mode==='complete'?'bg-yellow-500 text-black':'text-neutral-500'}`}>Detalhado</button>
                </div>
                {mode === 'simple' && (
                <div className="text-center py-10">
                    {latest ? (
                        <div className="animate-fade-in">
                            <div className="w-48 h-48 rounded-full border-4 border-yellow-500 flex flex-col items-center justify-center mx-auto mb-8 shadow-[0_0_50px_rgba(234,179,8,0.2)] bg-neutral-800">
                                <span className="text-6xl font-black text-white tracking-tighter">{latest.bf}</span>
                                <span className="text-sm font-bold text-yellow-500 uppercase tracking-widest">% GORDURA</span>
                            </div>
                            <h3 className="text-2xl font-bold text-white mb-2">Resultado Incrível!</h3>
                            <p className="text-neutral-400 text-sm">Avaliação feita em {formatDate(latest?.date)}</p>
                        </div>
                    ) : (
                        <div className="py-20 opacity-50"><Activity size={64} className="mx-auto mb-4"/><p>Ainda sem avaliações.</p></div>
                    )}
                </div>
                )}
                {mode === 'complete' && (
                <div className="space-y-6 animate-slide-up">
                        <div className="bg-neutral-800 p-6 rounded-3xl border border-neutral-700">
                        <h3 className="font-bold mb-6 text-yellow-500 text-sm uppercase tracking-widest">Histórico Corporal</h3>
                        {safeAssessments.map((a, idx) => (
                            <div key={a?.id ?? `assessment_${idx}`} className="border-b border-neutral-700 py-4 last:border-0">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="font-mono text-neutral-400">{formatDate(a?.date)}</span>
                                    <div className="text-right"><span className="font-black text-xl text-white block">{a?.bf ?? '-'}%</span><span className="text-[10px] text-neutral-500 uppercase">Gordura</span></div>
                                </div>
                                <div className="grid grid-cols-4 gap-2 text-[10px] text-neutral-400 bg-neutral-900/50 p-2 rounded-lg">
                                    <div className="text-center"><span className="block font-bold text-white">{a?.weight || '-'}kg</span>Peso</div>
                                    <div className="text-center"><span className="block font-bold text-white">{a?.waist || '-'}cm</span>Cintura</div>
                                    <div className="text-center"><span className="block font-bold text-white">{a?.arm || '-'}cm</span>Braço</div>
                                    <div className="text-center"><span className="block font-bold text-white">{a?.sum7 || '-'}mm</span>Dobras</div>
                                </div>
                            </div>
                        ))}
                        </div>
                        <div className="bg-neutral-800 p-6 rounded-3xl border border-neutral-700">
                        <h3 className="font-bold mb-6 text-yellow-500 text-sm uppercase tracking-widest">Galeria</h3>
                        {safePhotos.length===0 && <p className="text-neutral-500 text-sm">Nenhuma foto.</p>}
                        <div className="grid grid-cols-2 gap-3">
                            {safePhotos.map((p, idx) => {
                                const url = typeof p?.url === 'string' ? p.url : '';
                                return (
                                    <div key={p?.id ?? `photo_${idx}`} className="aspect-square bg-black rounded-2xl overflow-hidden border border-neutral-700 relative">
                                        {url ? (
                                            <Image src={url} alt="Foto de progresso" fill className="object-cover" sizes="(max-width: 768px) 50vw, 33vw"/>
                                        ) : (
                                            <div className="absolute inset-0 flex items-center justify-center text-neutral-500 text-xs">Sem imagem</div>
                                        )}
                                        <div className="absolute bottom-0 inset-x-0 bg-black/60 p-2 text-[10px] text-center text-white">{formatDate(p?.date)}</div>
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

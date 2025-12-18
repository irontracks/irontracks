import React, { useState, useEffect } from 'react';
import { ArrowLeft, History, Trash2 } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { useDialog } from '@/contexts/DialogContext';

const HistoryList = ({ user, onViewReport, onBack }) => {
    const { confirm, alert } = useDialog();
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const supabase = createClient();

    useEffect(() => {
        const loadHistory = async () => {
            try {
                // Fetch completed workouts (is_template = false)
                const { data, error } = await supabase
                    .from('workouts')
                    .select('*')
                    .eq('user_id', user.id)
                    .eq('is_template', false)
                    .order('date', { ascending: false });

                if (error) throw error;

                // Format data
                const formatted = data.map(w => ({
                    id: w.id,
                    workoutTitle: w.name,
                    date: w.date,
                    // Parse notes if it contains JSON session data, or fallback
                    totalTime: w.notes && w.notes.startsWith('{') ? JSON.parse(w.notes).totalTime : 0,
                    // If notes is just text, keep it, otherwise parsed object might be needed for details
                    rawSession: w.notes && w.notes.startsWith('{') ? JSON.parse(w.notes) : null
                }));

                setHistory(formatted);
            } catch (e) {
                console.error("Erro histórico", e);
            } finally {
                setLoading(false);
            }
        };
        loadHistory();
    }, [user]);

    const handleDeleteClick = async (e, session) => {
        e.stopPropagation();
        e.preventDefault();

        if (!(await confirm("Excluir este histórico permanentemente?", "Excluir"))) return;

        try {
            const { error } = await supabase.from('workouts').delete().eq('id', session.id);
            if (error) throw error;
            setHistory(prev => prev.filter(h => h.id !== session.id));
        } catch (error) {
            await alert("Erro ao excluir: " + error.message);
        }
    };

    return (
        <div className="min-h-screen bg-neutral-900 text-white p-4 pb-20">
            <div className="flex items-center gap-3 mb-6 pt-safe">
                <button type="button" onClick={onBack} className="cursor-pointer relative z-10 p-2 bg-neutral-800 rounded-lg hover:bg-neutral-700"><ArrowLeft className="pointer-events-none" /></button>
                <h2 className="text-xl font-bold flex items-center gap-2"><History className="text-yellow-500" /> Histórico</h2>
            </div>
            {loading && <p className="text-center text-neutral-500 animate-pulse">Carregando histórico...</p>}
            {!loading && history.length === 0 && <div className="text-center py-10 opacity-50"><p>Nenhum treino finalizado ainda.</p></div>}
            <div className="space-y-3">
                {history.map(session => (
                    <div key={session.id} onClick={() => onViewReport(session.rawSession || session)} className="bg-neutral-800 p-4 rounded-xl border border-neutral-700 cursor-pointer hover:border-yellow-500/50 relative group transition-colors">
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="font-bold text-lg text-white">{session.workoutTitle}</h3>
                                <p className="text-xs text-neutral-500">{new Date(session.date).toLocaleDateString()} • {Math.floor((session.totalTime || 0) / 60)} min</p>
                            </div>
                            <button 
                                type="button" 
                                onClick={(e) => handleDeleteClick(e, session)} 
                                className="cursor-pointer relative z-20 p-3 rounded-lg transition-colors bg-neutral-900/50 text-neutral-500 border border-transparent hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20"
                            >
                                <Trash2 size={20} className="pointer-events-none"/>
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default HistoryList;

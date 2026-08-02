'use client';

import React, { useMemo, useState } from 'react';
import { X, Check, Users } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import type { AdminUser } from '@/types/admin';

interface Props {
    /** Título do treino sendo aplicado (para o cabeçalho). */
    workoutName: string;
    /** Alunos aptos (já filtrados: do professor e com conta). */
    students: AdminUser[];
    onClose: () => void;
    /** Recebe os auth uids (user_id) selecionados. */
    onApply: (studentUserIds: string[]) => void | Promise<void>;
}

/**
 * Seletor multi-aluno pra aplicar um treino a vários de uma vez. Só lê os alunos que o
 * chamador já filtrou como aptos (eligibleStudentsForApply). Emite os user_id escolhidos;
 * quem grava/notifica é o handler do painel (handleApplyTemplateToStudents).
 */
export const ApplyWorkoutToStudentsModal: React.FC<Props> = ({ workoutName, students, onClose, onApply }) => {
    const containerRef = useFocusTrap(true, onClose);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [applying, setApplying] = useState(false);

    const ids = useMemo(
        () => students.map((s) => String(s.user_id || '').trim()).filter(Boolean),
        [students],
    );
    const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));

    const toggle = (id: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };
    const toggleAll = () => {
        setSelected((prev) => (prev.size === ids.length ? new Set() : new Set(ids)));
    };

    const handleApply = async () => {
        if (selected.size === 0 || applying) return;
        setApplying(true);
        try {
            await onApply(Array.from(selected));
        } finally {
            setApplying(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="presentation">
            <button
                type="button"
                className="absolute inset-0 bg-black/80 backdrop-blur-sm cursor-default"
                onClick={onClose}
                aria-label="Fechar"
            />
            <div
                ref={containerRef}
                className="relative z-10 bg-neutral-900 w-full max-w-md rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
                role="dialog"
                aria-modal="true"
                aria-label="Aplicar treino a vários alunos"
            >
                <div className="p-4 border-b border-neutral-800 flex justify-between items-center gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 text-yellow-500">
                            <Users size={16} />
                            <h3 className="font-bold text-white truncate">Aplicar a vários alunos</h3>
                        </div>
                        <p className="text-xs text-neutral-400 mt-0.5 truncate">{workoutName}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-neutral-800 rounded-full text-neutral-300 flex-shrink-0" aria-label="Fechar">
                        <X size={16} />
                    </button>
                </div>

                {ids.length === 0 ? (
                    <div className="p-6 text-sm text-neutral-400 text-center">
                        Nenhum aluno com conta no app pra receber o treino.
                    </div>
                ) : (
                    <>
                        <div className="px-4 py-2 border-b border-neutral-800">
                            <button
                                type="button"
                                onClick={toggleAll}
                                className="text-xs font-bold text-yellow-500 hover:text-yellow-400"
                            >
                                {allSelected ? 'Limpar seleção' : 'Selecionar todos'}
                            </button>
                        </div>
                        <div className="overflow-y-auto flex-1 p-2 space-y-1">
                            {students.map((s) => {
                                const id = String(s.user_id || '').trim();
                                if (!id) return null;
                                const checked = selected.has(id);
                                const label = String(s.name || s.email || 'Aluno');
                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => toggle(id)}
                                        aria-pressed={checked}
                                        className={`w-full flex items-center gap-3 p-2 rounded-xl text-left transition-colors ${checked ? 'bg-yellow-500/10 border border-yellow-500/40' : 'hover:bg-neutral-800 border border-transparent'}`}
                                    >
                                        <span className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${checked ? 'bg-yellow-500 text-black' : 'bg-neutral-700 text-neutral-200'}`}>
                                            {label.charAt(0).toUpperCase()}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-sm text-white truncate">{label}</span>
                                            {s.email && <span className="block text-xs text-neutral-500 truncate">{String(s.email)}</span>}
                                        </span>
                                        <span className={`h-5 w-5 rounded-md flex items-center justify-center flex-shrink-0 ${checked ? 'bg-yellow-500 text-black' : 'border border-neutral-600'}`}>
                                            {checked && <Check size={13} />}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                        <div className="p-4 border-t border-neutral-800">
                            <button
                                type="button"
                                onClick={handleApply}
                                disabled={selected.size === 0 || applying}
                                className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold py-3 rounded-xl transition-colors"
                            >
                                {applying ? 'Aplicando...' : `Aplicar a ${selected.size} aluno${selected.size === 1 ? '' : 's'}`}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default ApplyWorkoutToStudentsModal;

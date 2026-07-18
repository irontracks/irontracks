'use client';

import React from 'react';
import { Dumbbell, Plus, Users, ArrowRight } from 'lucide-react';

interface Props {
    /** Abre a biblioteca de treinos (seção Treinos). */
    onOpenWorkouts: () => void;
    /** Abre a lista de alunos (pra montar treino de um aluno específico). */
    onOpenStudents: () => void;
}

/**
 * Destaque do sistema de criação de treinos no topo da tela inicial da Área do professor.
 * O treino é o coração do trabalho do coach — este hero coloca "montar treino" a um toque,
 * seja pela biblioteca (criar/aplicar a vários) ou por um aluno específico.
 */
export const TeacherWorkoutHighlight: React.FC<Props> = ({ onOpenWorkouts, onOpenStudents }) => {
    return (
        <div className="rounded-3xl border border-yellow-500/30 bg-yellow-500/[0.06] p-5 mb-5">
            <div className="flex items-center gap-2 text-yellow-500 mb-1">
                <Dumbbell size={16} />
                <span className="text-[11px] font-black uppercase tracking-widest">Treinos</span>
            </div>
            <h2 className="text-xl font-black text-white leading-tight">Monte o treino dos seus alunos</h2>
            <p className="text-sm text-neutral-400 mt-1">Crie, edite e aplique treinos — a vários alunos de uma vez.</p>

            <div className="flex flex-col sm:flex-row gap-2 mt-4">
                <button
                    type="button"
                    onClick={onOpenWorkouts}
                    className="flex-1 min-h-[48px] px-4 bg-yellow-500 hover:bg-yellow-400 text-black font-black rounded-2xl flex items-center justify-center gap-2 transition-colors active:scale-[0.98]"
                >
                    <Plus size={18} /> Montar treino
                </button>
                <button
                    type="button"
                    onClick={onOpenStudents}
                    className="flex-1 min-h-[48px] px-4 bg-neutral-900/70 border border-neutral-800 hover:bg-neutral-900 text-neutral-200 font-black rounded-2xl flex items-center justify-center gap-2 transition-colors active:scale-[0.98]"
                >
                    <Users size={18} /> Treino por aluno <ArrowRight size={16} className="text-neutral-500" />
                </button>
            </div>
        </div>
    );
};

export default TeacherWorkoutHighlight;

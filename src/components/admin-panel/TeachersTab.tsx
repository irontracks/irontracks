import React from 'react';
import { Search, UserPlus, Phone, Calendar, Mail, User, ChevronRight, Edit3 } from 'lucide-react';
import { useAdminPanel } from './AdminPanelContext';
import { AdminTeacher } from '@/types/admin';

export const TeachersTab: React.FC = () => {
    const {
        teachersFiltered,
        teacherQuery,
        setTeacherQuery,
        setShowTeacherModal,
        selectedTeacher,
        setSelectedTeacher,
        setEditingTeacher,
        // Detalhes do professor seriam implementados aqui ou em outro componente
        // Por enquanto vou focar na lista
    } = useAdminPanel();

    if (selectedTeacher) {
        return (
            <div className="space-y-6 animate-in slide-in-from-right duration-300">
                <div className="flex items-center gap-4 mb-6">
                    <button 
                        onClick={() => setSelectedTeacher(null)}
                        className="p-2 hover:bg-neutral-800 rounded-full transition-colors text-neutral-400 hover:text-white"
                    >
                        <ChevronRight className="rotate-180" size={24} />
                    </button>
                    <div>
                        <h2 className="text-2xl font-black text-white">{selectedTeacher.name}</h2>
                        <p className="text-neutral-500 text-sm">{selectedTeacher.email}</p>
                    </div>
                </div>
                
                {/* Aqui viriam as abas de detalhes do professor (Alunos, Treinos, Histórico) */}
                <div className="p-12 text-center border border-dashed border-neutral-800 rounded-2xl bg-neutral-900/30">
                    <p className="text-neutral-500">Funcionalidade de detalhes do professor em desenvolvimento.</p>
                    <button 
                        onClick={() => setSelectedTeacher(null)}
                        className="mt-4 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg font-bold text-sm transition-colors"
                    >
                        Voltar para lista
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-neutral-900/50 p-4 rounded-2xl border border-neutral-800 backdrop-blur-sm">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={18} />
                    <input
                        type="text"
                        placeholder="Buscar professores..."
                        value={teacherQuery}
                        onChange={(e) => setTeacherQuery(e.target.value)}
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-10 pr-4 py-3 text-white placeholder:text-neutral-600 focus:border-yellow-500 focus:outline-none transition-colors"
                    />
                </div>

                <button
                    onClick={() => setShowTeacherModal(true)}
                    className="w-full md:w-auto px-4 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-black rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 whitespace-nowrap"
                >
                    <UserPlus size={18} />
                    <span>Novo Professor</span>
                </button>
            </div>

            <div className="grid gap-3">
                {teachersFiltered.map((t) => (
                    <div key={t.id} className="group flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-neutral-900/50 border border-neutral-800 rounded-xl hover:border-yellow-500/30 transition-all gap-4">
                        <div className="flex items-center gap-4 cursor-pointer flex-1" onClick={() => setSelectedTeacher(t)}>
                            <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center font-black text-yellow-500 border border-neutral-700 group-hover:border-yellow-500 transition-colors">
                                {(t.name || t.email || '?').charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <div className="font-bold text-white group-hover:text-yellow-500 transition-colors text-lg">
                                    {t.name || t.email || 'Sem Nome'}
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-neutral-400">
                                    <div className="flex items-center gap-1.5">
                                        <Mail size={12} className="text-neutral-500" />
                                        {t.email}
                                    </div>
                                    {t.phone && (
                                        <div className="flex items-center gap-1.5">
                                            <Phone size={12} className="text-neutral-500" />
                                            {t.phone}
                                        </div>
                                    )}
                                    {t.birth_date && (
                                        <div className="flex items-center gap-1.5">
                                            <Calendar size={12} className="text-neutral-500" />
                                            {new Date(t.birth_date).toLocaleDateString('pt-BR')}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center">
                            <button
                                onClick={() => setEditingTeacher(t)}
                                className="p-2 text-neutral-400 hover:text-yellow-500 hover:bg-yellow-500/10 rounded-lg transition-colors"
                                title="Editar Professor"
                            >
                                <Edit3 size={18} />
                            </button>
                            <button
                                onClick={() => setSelectedTeacher(t)}
                                className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
                            >
                                <ChevronRight size={20} />
                            </button>
                        </div>
                    </div>
                ))}

                {teachersFiltered.length === 0 && (
                    <div className="text-center py-12 border border-dashed border-neutral-800 rounded-2xl">
                        <div className="w-16 h-16 bg-neutral-800 rounded-full flex items-center justify-center mx-auto mb-4">
                            <User size={32} className="text-neutral-600" />
                        </div>
                        <h3 className="text-white font-bold text-lg mb-1">Nenhum professor encontrado</h3>
                        <p className="text-neutral-500">Adicione um novo professor para começar.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

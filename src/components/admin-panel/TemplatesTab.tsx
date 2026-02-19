import React from 'react';
import { Search, Plus, Edit, Download, Trash2, BookOpen } from 'lucide-react';
import { useAdminPanel } from './AdminPanelContext';
import { AdminWorkoutTemplate } from '@/types/admin';
import { normalizeWorkoutTitle } from '@/utils/workoutTitle';

export const TemplatesTab: React.FC = () => {
    const {
        templatesFiltered,
        templateQuery,
        setTemplateQuery,
        setEditingTemplate,
        // Preciso das funções para adicionar e deletar template
        // No original: setEditingTemplate({ id: '', name: 'Novo Treino', ... })
        // e handleDeleteTemplate (preciso mover pro hook ou deixar inline se for simples)
        // Vou assumir que o hook exporta handleDeleteTemplate
    } = useAdminPanel();

    // Como handleDeleteTemplate não estava no hook, vou adicionar depois. 
    // Por enquanto, deixo comentado ou uso uma função placeholder.
    const handleDeleteTemplate = (id: string) => {
        alert('Funcionalidade de excluir template em implementação.');
    };

    const handleCreateTemplate = () => {
        setEditingTemplate({
            id: '',
            name: 'Novo Treino',
            description: '',
            difficulty: 'Iniciante',
            exercises: [],
            is_template: true,
            user_id: null,
            created_at: new Date().toISOString()
        } as unknown as AdminWorkoutTemplate);
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-neutral-900/50 p-4 rounded-2xl border border-neutral-800 backdrop-blur-sm">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={18} />
                    <input
                        type="text"
                        placeholder="Buscar templates..."
                        value={templateQuery}
                        onChange={(e) => setTemplateQuery(e.target.value)}
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-10 pr-4 py-3 text-white placeholder:text-neutral-600 focus:border-yellow-500 focus:outline-none transition-colors"
                    />
                </div>

                <button
                    onClick={handleCreateTemplate}
                    className="w-full md:w-auto px-4 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-black rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 whitespace-nowrap"
                >
                    <Plus size={18} />
                    <span>Novo Template</span>
                </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {templatesFiltered.map((t) => (
                    <div key={t.id} className="group bg-neutral-900/50 border border-neutral-800 rounded-xl p-5 hover:border-yellow-500/30 transition-all flex flex-col justify-between min-h-[160px]">
                        <div>
                            <div className="flex items-start justify-between mb-3">
                                <div className="p-2 bg-neutral-800 rounded-lg group-hover:bg-yellow-500/10 transition-colors">
                                    <BookOpen size={20} className="text-neutral-400 group-hover:text-yellow-500 transition-colors" />
                                </div>
                                <span className="px-2 py-1 bg-neutral-800 rounded text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                                    {t.difficulty || 'Geral'}
                                </span>
                            </div>
                            <h3 className="font-bold text-white text-lg mb-1 line-clamp-2">
                                {normalizeWorkoutTitle(t.name)}
                            </h3>
                            <p className="text-sm text-neutral-500 line-clamp-2">
                                {t.description || 'Sem descrição.'}
                            </p>
                        </div>
                        
                        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-neutral-800/50">
                            <button
                                onClick={() => setEditingTemplate(t)}
                                className="flex-1 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2"
                            >
                                <Edit size={14} /> Editar
                            </button>
                            <button
                                onClick={() => handleDeleteTemplate(t.id)}
                                className="p-2 bg-neutral-800 hover:bg-red-500/10 hover:text-red-500 text-neutral-400 rounded-lg transition-colors"
                                title="Excluir"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </div>
                ))}

                {templatesFiltered.length === 0 && (
                    <div className="col-span-full text-center py-12 border border-dashed border-neutral-800 rounded-2xl">
                        <div className="w-16 h-16 bg-neutral-800 rounded-full flex items-center justify-center mx-auto mb-4">
                            <BookOpen size={32} className="text-neutral-600" />
                        </div>
                        <h3 className="text-white font-bold text-lg mb-1">Nenhum template encontrado</h3>
                        <p className="text-neutral-500">Crie seu primeiro template de treino.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

import React from 'react';
import { useAdminPanel } from './AdminPanelContext';
import { X, UserPlus, Edit3, ArrowLeft } from 'lucide-react';
import HistoryList from '../HistoryList'; // Import relative or alias
import AdminWorkoutEditor from '../AdminWorkoutEditor'; // Import relative or alias
// import { AdminWorkout } from '@/types/admin';

export const Modals: React.FC = () => {
    const {
        showRegisterModal,
        setShowRegisterModal,
        newStudent,
        setNewStudent,
        handleRegisterStudent,
        registering,
        
        showTeacherModal,
        setShowTeacherModal,
        newTeacher,
        setNewTeacher,
        handleAddTeacher,
        addingTeacher,
        
        editingTeacher,
        setEditingTeacher,
        handleUpdateTeacher,
        
        historyOpen,
        setHistoryOpen,
        selectedStudent,
        user,
        
        editingTemplate,
        setEditingTemplate,
        // Preciso de handleSaveTemplate que estava inline.
        // Vou assumir que o hook exporta handleSaveTemplate ou similar.
        // Se não, vou usar placeholder.
        
        executionVideoModalOpen,
        setExecutionVideoModalOpen,
        executionVideoModalUrl,
        setExecutionVideoModalUrl
    } = useAdminPanel();

    // Placeholder functions for now (move to hook later)
    const handleSaveTemplate = async (data: any) => {
         alert('Salvar template em implementação.');
    };

    return (
        <>
            {/* Register Student Modal */}
            {showRegisterModal && (
                <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-neutral-900 p-6 rounded-2xl w-full max-w-sm border border-neutral-800 shadow-2xl animate-in zoom-in-95 duration-200">
                        <h3 className="font-bold text-white text-xl mb-4 flex items-center gap-2">
                            <UserPlus size={24} className="text-yellow-500" /> Novo Aluno
                        </h3>
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs text-neutral-500 uppercase font-bold">Nome Completo</label>
                                <input
                                    value={newStudent.name}
                                    onChange={e => setNewStudent({ ...newStudent, name: e.target.value })}
                                    className="w-full bg-neutral-800 p-3 rounded-lg text-white border border-neutral-700 focus:border-yellow-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-neutral-500 uppercase font-bold">Email</label>
                                <input
                                    value={newStudent.email}
                                    onChange={e => setNewStudent({ ...newStudent, email: e.target.value })}
                                    className="w-full bg-neutral-800 p-3 rounded-lg text-white border border-neutral-700 focus:border-yellow-500 outline-none"
                                />
                            </div>
                        </div>
                        <div className="flex gap-2 mt-6">
                            <button onClick={() => setShowRegisterModal(false)} className="flex-1 p-3 bg-neutral-800 text-neutral-400 font-bold rounded-xl hover:bg-neutral-700 transition-colors">Cancelar</button>
                            <button onClick={handleRegisterStudent} disabled={registering} className="flex-1 p-3 bg-yellow-500 text-black font-bold rounded-xl hover:bg-yellow-400 disabled:opacity-50 transition-colors">
                                {registering ? 'Cadastrando...' : 'CADASTRAR'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Teacher Modal */}
            {showTeacherModal && (
                <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-neutral-900 p-6 rounded-2xl w-full max-w-sm border border-neutral-800 shadow-2xl animate-in zoom-in-95 duration-200">
                        <h3 className="font-bold text-white text-xl mb-4 flex items-center gap-2">
                            <UserPlus size={24} className="text-yellow-500" /> Novo Professor
                        </h3>
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs text-neutral-500 uppercase font-bold">Nome Completo</label>
                                <input
                                    value={newTeacher.name}
                                    onChange={e => setNewTeacher({ ...newTeacher, name: e.target.value })}
                                    className="w-full bg-neutral-800 p-3 rounded-lg text-white border border-neutral-700 focus:border-yellow-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-neutral-500 uppercase font-bold">Email</label>
                                <input
                                    value={newTeacher.email}
                                    onChange={e => setNewTeacher({ ...newTeacher, email: e.target.value })}
                                    className="w-full bg-neutral-800 p-3 rounded-lg text-white border border-neutral-700 focus:border-yellow-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-neutral-500 uppercase font-bold">Telefone</label>
                                <input
                                    value={newTeacher.phone}
                                    onChange={e => setNewTeacher({ ...newTeacher, phone: e.target.value })}
                                    className="w-full bg-neutral-800 p-3 rounded-lg text-white border border-neutral-700 focus:border-yellow-500 outline-none"
                                />
                            </div>
                        </div>
                        <div className="flex gap-2 mt-6">
                            <button onClick={() => setShowTeacherModal(false)} className="flex-1 p-3 bg-neutral-800 text-neutral-400 font-bold rounded-xl hover:bg-neutral-700 transition-colors">Cancelar</button>
                            <button onClick={handleAddTeacher} disabled={addingTeacher} className="flex-1 p-3 bg-yellow-500 text-black font-bold rounded-xl hover:bg-yellow-400 disabled:opacity-50 transition-colors">
                                {addingTeacher ? 'Salvando...' : 'ADICIONAR'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Editing Teacher Modal */}
            {editingTeacher && (
                <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-neutral-900 p-6 rounded-2xl w-full max-w-sm border border-neutral-800 shadow-2xl animate-in zoom-in-95 duration-200">
                        <h3 className="font-bold text-white text-xl mb-4 flex items-center gap-2">
                            <Edit3 size={24} className="text-yellow-500" /> Editar Professor
                        </h3>
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs text-neutral-500 uppercase font-bold">Nome Completo</label>
                                <input
                                    value={editingTeacher.name}
                                    onChange={e => setEditingTeacher({ ...editingTeacher, name: e.target.value })}
                                    className="w-full bg-neutral-800 p-3 rounded-lg text-white border border-neutral-700 focus:border-yellow-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-neutral-500 uppercase font-bold">Email</label>
                                <input
                                    value={editingTeacher.email}
                                    onChange={e => setEditingTeacher({ ...editingTeacher, email: e.target.value })}
                                    className="w-full bg-neutral-800 p-3 rounded-lg text-white border border-neutral-700 focus:border-yellow-500 outline-none"
                                />
                            </div>
                             <div>
                                <label className="text-xs text-neutral-500 uppercase font-bold">Telefone</label>
                                <input
                                    value={editingTeacher.phone || ''}
                                    onChange={e => setEditingTeacher({ ...editingTeacher, phone: e.target.value })}
                                    className="w-full bg-neutral-800 p-3 rounded-lg text-white border border-neutral-700 focus:border-yellow-500 outline-none"
                                />
                            </div>
                        </div>
                        <div className="flex gap-2 mt-6">
                            <button onClick={() => setEditingTeacher(null)} className="flex-1 p-3 bg-neutral-800 text-neutral-400 font-bold rounded-xl hover:bg-neutral-700 transition-colors">Cancelar</button>
                            <button onClick={handleUpdateTeacher} className="flex-1 p-3 bg-yellow-500 text-black font-bold rounded-xl hover:bg-yellow-400 transition-colors">
                                SALVAR
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Execution Video Modal */}
            {executionVideoModalOpen && executionVideoModalUrl && (
                <div className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => { setExecutionVideoModalOpen(false); setExecutionVideoModalUrl(''); }}>
                    <div className="bg-neutral-900 w-full max-w-3xl rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
                        <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
                            <div className="font-black text-white">Vídeo de execução</div>
                            <button
                                type="button"
                                onClick={() => { setExecutionVideoModalOpen(false); setExecutionVideoModalUrl(''); }}
                                className="w-10 h-10 rounded-full bg-neutral-900/70 border border-neutral-800 hover:bg-neutral-900 text-neutral-300 hover:text-white flex items-center justify-center transition-all duration-300 active:scale-95"
                                aria-label="Fechar"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-4">
                            <video src={executionVideoModalUrl} controls className="w-full rounded-xl bg-black" />
                        </div>
                    </div>
                </div>
            )}

            {/* Template Editor Modal */}
            {editingTemplate && (
                <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditingTemplate(null)}>
                    <div className="bg-neutral-900 w-full max-w-3xl rounded-2xl border border-neutral-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
                        <div className="p-4 border-b border-neutral-800 flex justify-between items-center">
                            <h3 className="font-bold text-white">Editar Treino</h3>
                            <button onClick={() => setEditingTemplate(null)} className="px-3 py-1.5 hover:bg-neutral-800 rounded-full inline-flex items-center gap-2 text-neutral-300">
                                <ArrowLeft size={16} /><span className="text-xs font-bold">Voltar</span>
                            </button>
                        </div>
                        <div className="p-4 max-h-[75vh] overflow-y-auto">
                            <AdminWorkoutEditor
                                initialData={editingTemplate as any}
                                onSave={handleSaveTemplate}
                                onCancel={() => setEditingTemplate(null)}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* History List Modal */}
            {historyOpen && selectedStudent && (
                <div className="fixed inset-0 z-[1500] bg-neutral-900 overflow-y-auto animate-in fade-in duration-200">
                    <HistoryList
                        user={user}
                        settings={{}}
                        vipLimits={{}}
                        onViewReport={() => {}}
                        onUpgrade={() => {}}
                        targetId={String(selectedStudent?.user_id || selectedStudent?.id || '')}
                        targetEmail={String(selectedStudent?.email || '')}
                        readOnly
                        title={`Histórico - ${String(selectedStudent?.name || selectedStudent?.email || 'Aluno')}`}
                        onBack={() => setHistoryOpen(false)}
                    />
                </div>
            )}
        </>
    );
};

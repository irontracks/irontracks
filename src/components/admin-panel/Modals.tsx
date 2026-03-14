import React, { useEffect } from 'react';
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
        setExecutionVideoModalUrl,
        handleSaveTemplate,
    } = useAdminPanel();


    return (
        <>
            {/* Register Student Modal */}
            {showRegisterModal && (
                <div className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4 pt-safe pb-safe backdrop-blur-md">
                    <div className="p-6 rounded-2xl w-full max-w-sm border shadow-2xl animate-in zoom-in-95 duration-200 relative overflow-hidden" style={{ background: 'linear-gradient(160deg, rgba(20,18,10,0.98) 0%, rgba(10,10,10,0.99) 40%)', borderColor: 'rgba(234,179,8,0.12)', boxShadow: '0 32px 64px -16px rgba(0,0,0,0.8), inset 0 1px 0 rgba(234,179,8,0.1)' }}>
                        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-500/40 to-transparent" />
                        <h3 className="font-bold text-white text-xl mb-4 flex items-center gap-2">
                            <UserPlus size={24} className="text-yellow-500" /> Novo Aluno
                        </h3>
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs text-neutral-500 uppercase font-bold">Nome Completo</label>
                                <input
                                    value={newStudent.name}
                                    onChange={e => setNewStudent({ ...newStudent, name: e.target.value })}
                                    className="w-full p-3 rounded-xl text-white border focus:border-yellow-500/40 outline-none transition-all"
                                    style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
                                />
                            </div>
                            <div>
                                <label className="text-xs text-neutral-500 uppercase font-bold">Email</label>
                                <input
                                    value={newStudent.email}
                                    onChange={e => setNewStudent({ ...newStudent, email: e.target.value })}
                                    className="w-full p-3 rounded-xl text-white border focus:border-yellow-500/40 outline-none transition-all"
                                    style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
                                />
                            </div>
                        </div>
                        <div className="flex gap-2 mt-6">
                            <button onClick={() => setShowRegisterModal(false)} className="flex-1 p-3 border text-neutral-400 font-bold rounded-xl hover:text-white hover:border-yellow-500/30 transition-all" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}>Cancelar</button>
                            <button onClick={handleRegisterStudent} disabled={registering} className="flex-1 p-3 font-black rounded-xl disabled:opacity-50 transition-all btn-gold-animated">
                                {registering ? 'Cadastrando...' : 'CADASTRAR'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Teacher Modal */}
            {showTeacherModal && (
                <div className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4 pt-safe pb-safe backdrop-blur-md">
                    <div className="p-6 rounded-2xl w-full max-w-sm border shadow-2xl animate-in zoom-in-95 duration-200 relative overflow-hidden" style={{ background: 'linear-gradient(160deg, rgba(20,18,10,0.98) 0%, rgba(10,10,10,0.99) 40%)', borderColor: 'rgba(234,179,8,0.12)', boxShadow: '0 32px 64px -16px rgba(0,0,0,0.8), inset 0 1px 0 rgba(234,179,8,0.1)' }}>
                        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-500/40 to-transparent" />
                        <h3 className="font-bold text-white text-xl mb-4 flex items-center gap-2">
                            <UserPlus size={24} className="text-yellow-500" /> Novo Professor
                        </h3>
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs text-neutral-500 uppercase font-bold">Nome Completo</label>
                                <input
                                    value={newTeacher.name}
                                    onChange={e => setNewTeacher({ ...newTeacher, name: e.target.value })}
                                    className="w-full p-3 rounded-xl text-white border focus:border-yellow-500/40 outline-none transition-all"
                                    style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
                                />
                            </div>
                            <div>
                                <label className="text-xs text-neutral-500 uppercase font-bold">Email</label>
                                <input
                                    value={newTeacher.email}
                                    onChange={e => setNewTeacher({ ...newTeacher, email: e.target.value })}
                                    className="w-full p-3 rounded-xl text-white border focus:border-yellow-500/40 outline-none transition-all"
                                    style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
                                />
                            </div>
                            <div>
                                <label className="text-xs text-neutral-500 uppercase font-bold">Telefone</label>
                                <input
                                    value={newTeacher.phone}
                                    onChange={e => setNewTeacher({ ...newTeacher, phone: e.target.value })}
                                    className="w-full p-3 rounded-xl text-white border focus:border-yellow-500/40 outline-none transition-all"
                                    style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
                                />
                            </div>
                        </div>
                        <div className="flex gap-2 mt-6">
                            <button onClick={() => setShowTeacherModal(false)} className="flex-1 p-3 border text-neutral-400 font-bold rounded-xl hover:text-white hover:border-yellow-500/30 transition-all" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}>Cancelar</button>
                            <button onClick={handleAddTeacher} disabled={addingTeacher} className="flex-1 p-3 font-black rounded-xl disabled:opacity-50 transition-all btn-gold-animated">
                                {addingTeacher ? 'Salvando...' : 'ADICIONAR'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Editing Teacher Modal */}
            {editingTeacher && (
                <div className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4 pt-safe pb-safe backdrop-blur-md">
                    <div className="p-6 rounded-2xl w-full max-w-sm border shadow-2xl animate-in zoom-in-95 duration-200 relative overflow-hidden" style={{ background: 'linear-gradient(160deg, rgba(20,18,10,0.98) 0%, rgba(10,10,10,0.99) 40%)', borderColor: 'rgba(234,179,8,0.12)', boxShadow: '0 32px 64px -16px rgba(0,0,0,0.8), inset 0 1px 0 rgba(234,179,8,0.1)' }}>
                        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-500/40 to-transparent" />
                        <h3 className="font-bold text-white text-xl mb-4 flex items-center gap-2">
                            <Edit3 size={24} className="text-yellow-500" /> Editar Professor
                        </h3>
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs text-neutral-500 uppercase font-bold">Nome Completo</label>
                                <input
                                    value={editingTeacher.name}
                                    onChange={e => setEditingTeacher({ ...editingTeacher, name: e.target.value })}
                                    className="w-full p-3 rounded-xl text-white border focus:border-yellow-500/40 outline-none transition-all"
                                    style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
                                />
                            </div>
                            <div>
                                <label className="text-xs text-neutral-500 uppercase font-bold">Email</label>
                                <input
                                    value={editingTeacher.email}
                                    onChange={e => setEditingTeacher({ ...editingTeacher, email: e.target.value })}
                                    className="w-full p-3 rounded-xl text-white border focus:border-yellow-500/40 outline-none transition-all"
                                    style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
                                />
                            </div>
                            <div>
                                <label className="text-xs text-neutral-500 uppercase font-bold">Telefone</label>
                                <input
                                    value={editingTeacher.phone || ''}
                                    onChange={e => setEditingTeacher({ ...editingTeacher, phone: e.target.value })}
                                    className="w-full p-3 rounded-xl text-white border focus:border-yellow-500/40 outline-none transition-all"
                                    style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
                                />
                            </div>
                        </div>
                        <div className="flex gap-2 mt-6">
                            <button onClick={() => setEditingTeacher(null)} className="flex-1 p-3 border text-neutral-400 font-bold rounded-xl hover:text-white hover:border-yellow-500/30 transition-all" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}>Cancelar</button>
                            <button onClick={handleUpdateTeacher} className="flex-1 p-3 font-black rounded-xl transition-all btn-gold-animated">
                                SALVAR
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Execution Video Modal */}
            {executionVideoModalOpen && executionVideoModalUrl && (
                <div className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-md flex items-center justify-center p-4" onClick={() => { setExecutionVideoModalOpen(false); setExecutionVideoModalUrl(''); }}>
                    <div className="w-full max-w-3xl rounded-2xl border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 relative" style={{ background: 'linear-gradient(160deg, rgba(20,18,10,0.98) 0%, rgba(10,10,10,0.99) 40%)', borderColor: 'rgba(234,179,8,0.12)', boxShadow: '0 32px 64px -16px rgba(0,0,0,0.8), inset 0 1px 0 rgba(234,179,8,0.1)' }} onClick={(e) => e.stopPropagation()}>
                        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-500/40 to-transparent" />
                        <div className="p-4 flex items-center justify-between gap-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <div className="text-xs font-black uppercase tracking-[0.2em] text-yellow-500/80">Vídeo de execução</div>
                            <button
                                type="button"
                                onClick={() => { setExecutionVideoModalOpen(false); setExecutionVideoModalUrl(''); }}
                                className="w-9 h-9 rounded-xl border flex items-center justify-center text-neutral-500 hover:text-white hover:border-yellow-500/40 transition-all"
                                style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
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
                <div className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setEditingTemplate(null)}>
                    <div className="w-full max-w-3xl rounded-2xl border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 relative" style={{ background: 'linear-gradient(160deg, rgba(20,18,10,0.98) 0%, rgba(10,10,10,0.99) 40%)', borderColor: 'rgba(234,179,8,0.12)', boxShadow: '0 32px 64px -16px rgba(0,0,0,0.8), inset 0 1px 0 rgba(234,179,8,0.1)' }} onClick={(e) => e.stopPropagation()}>
                        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-500/40 to-transparent" />
                        <div className="p-4 flex justify-between items-center" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-yellow-500/80">Editar Treino</h3>
                            <button onClick={() => setEditingTemplate(null)} className="px-3 py-1.5 rounded-xl border inline-flex items-center gap-2 text-neutral-400 hover:text-white hover:border-yellow-500/30 transition-all" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}>
                                <ArrowLeft size={16} /><span className="text-xs font-bold">Voltar</span>
                            </button>
                        </div>
                        <div className="p-4 max-h-[75vh] overflow-y-auto">
                            <AdminWorkoutEditor
                                initialData={editingTemplate as Record<string, unknown>}
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
                    <EscapeListener onEscape={() => setHistoryOpen(false)} />
                    <HistoryList
                        user={user}
                        settings={{}}
                        vipLimits={{}}
                        onViewReport={() => { }}
                        onUpgrade={() => { }}
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

/** Bug #11 fix: mounts an ESC key listener while in scope, unmounts on cleanup. */
const EscapeListener: React.FC<{ onEscape: () => void }> = ({ onEscape }) => {
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onEscape(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onEscape]);
    return null;
};

import React, { useEffect } from 'react';
import { useAdminPanel } from './AdminPanelContext';
import { UserPlus, Edit3, ArrowLeft } from 'lucide-react';
import HistoryList from '../HistoryList'; // Import relative or alias
import AdminWorkoutEditor from '../AdminWorkoutEditor'; // Import relative or alias
import { useFocusTrap } from '@/hooks/useFocusTrap';
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
                <ModalShell
                    onClose={() => setShowRegisterModal(false)}
                    ariaLabel="Cadastrar novo aluno"
                    overlayClass="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4 pt-safe pb-safe backdrop-blur-md"
                    panelClass="p-6 rounded-2xl w-full max-w-sm border shadow-2xl animate-in zoom-in-95 duration-200 relative overflow-hidden"
                    panelStyle={{ background: 'linear-gradient(160deg, rgba(20,18,10,0.98) 0%, rgba(10,10,10,0.99) 40%)', borderColor: 'rgba(234,179,8,0.12)', boxShadow: '0 32px 64px -16px rgba(0,0,0,0.8), inset 0 1px 0 rgba(234,179,8,0.1)' }}
                >
                        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-500/40 to-transparent" />
                        <h3 className="font-bold text-white text-xl mb-4 flex items-center gap-2">
                            <UserPlus size={24} className="text-yellow-500" /> Novo Aluno
                        </h3>
                        <div className="space-y-3">
                            <div>
                                <label htmlFor="new-student-name" className="text-xs text-neutral-400 uppercase font-bold">Nome Completo</label>
                                <input
                                    id="new-student-name"
                                    type="text"
                                    aria-label="Nome Completo"
                                    value={newStudent.name}
                                    onChange={e => setNewStudent({ ...newStudent, name: e.target.value })}
                                    className="w-full p-3 rounded-xl text-white border focus:border-yellow-500/40 outline-none transition-all"
                                    style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
                                />
                            </div>
                            <div>
                                <label htmlFor="new-student-email" className="text-xs text-neutral-400 uppercase font-bold">Email</label>
                                <input
                                    id="new-student-email"
                                    type="email"
                                    aria-label="Email"
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
                </ModalShell>
            )}

            {/* Teacher Modal */}
            {showTeacherModal && (
                <ModalShell
                    onClose={() => setShowTeacherModal(false)}
                    ariaLabel="Cadastrar novo professor"
                    overlayClass="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4 pt-safe pb-safe backdrop-blur-md"
                    panelClass="p-6 rounded-2xl w-full max-w-sm border shadow-2xl animate-in zoom-in-95 duration-200 relative overflow-hidden"
                    panelStyle={{ background: 'linear-gradient(160deg, rgba(20,18,10,0.98) 0%, rgba(10,10,10,0.99) 40%)', borderColor: 'rgba(234,179,8,0.12)', boxShadow: '0 32px 64px -16px rgba(0,0,0,0.8), inset 0 1px 0 rgba(234,179,8,0.1)' }}
                >
                        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-500/40 to-transparent" />
                        <h3 className="font-bold text-white text-xl mb-4 flex items-center gap-2">
                            <UserPlus size={24} className="text-yellow-500" /> Novo Professor
                        </h3>
                        <div className="space-y-3">
                            <div>
                                <label htmlFor="new-teacher-name" className="text-xs text-neutral-400 uppercase font-bold">Nome Completo</label>
                                <input
                                    id="new-teacher-name"
                                    type="text"
                                    aria-label="Nome Completo"
                                    value={newTeacher.name}
                                    onChange={e => setNewTeacher({ ...newTeacher, name: e.target.value })}
                                    className="w-full p-3 rounded-xl text-white border focus:border-yellow-500/40 outline-none transition-all"
                                    style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
                                />
                            </div>
                            <div>
                                <label htmlFor="new-teacher-email" className="text-xs text-neutral-400 uppercase font-bold">Email</label>
                                <input
                                    id="new-teacher-email"
                                    type="email"
                                    aria-label="Email"
                                    value={newTeacher.email}
                                    onChange={e => setNewTeacher({ ...newTeacher, email: e.target.value })}
                                    className="w-full p-3 rounded-xl text-white border focus:border-yellow-500/40 outline-none transition-all"
                                    style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
                                />
                            </div>
                            <div>
                                <label htmlFor="new-teacher-phone" className="text-xs text-neutral-400 uppercase font-bold">Telefone</label>
                                <input
                                    id="new-teacher-phone"
                                    type="tel"
                                    aria-label="Telefone"
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
                </ModalShell>
            )}

            {/* Editing Teacher Modal */}
            {editingTeacher && (
                <ModalShell
                    onClose={() => setEditingTeacher(null)}
                    ariaLabel="Editar professor"
                    overlayClass="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4 pt-safe pb-safe backdrop-blur-md"
                    panelClass="p-6 rounded-2xl w-full max-w-sm border shadow-2xl animate-in zoom-in-95 duration-200 relative overflow-hidden"
                    panelStyle={{ background: 'linear-gradient(160deg, rgba(20,18,10,0.98) 0%, rgba(10,10,10,0.99) 40%)', borderColor: 'rgba(234,179,8,0.12)', boxShadow: '0 32px 64px -16px rgba(0,0,0,0.8), inset 0 1px 0 rgba(234,179,8,0.1)' }}
                >
                        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-500/40 to-transparent" />
                        <h3 className="font-bold text-white text-xl mb-4 flex items-center gap-2">
                            <Edit3 size={24} className="text-yellow-500" /> Editar Professor
                        </h3>
                        <div className="space-y-3">
                            <div>
                                <label htmlFor="edit-teacher-name" className="text-xs text-neutral-400 uppercase font-bold">Nome Completo</label>
                                <input
                                    id="edit-teacher-name"
                                    type="text"
                                    aria-label="Nome Completo"
                                    value={editingTeacher.name}
                                    onChange={e => setEditingTeacher({ ...editingTeacher, name: e.target.value })}
                                    className="w-full p-3 rounded-xl text-white border focus:border-yellow-500/40 outline-none transition-all"
                                    style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
                                />
                            </div>
                            <div>
                                <label htmlFor="edit-teacher-email" className="text-xs text-neutral-400 uppercase font-bold">Email</label>
                                <input
                                    id="edit-teacher-email"
                                    type="email"
                                    aria-label="Email"
                                    value={editingTeacher.email}
                                    onChange={e => setEditingTeacher({ ...editingTeacher, email: e.target.value })}
                                    className="w-full p-3 rounded-xl text-white border focus:border-yellow-500/40 outline-none transition-all"
                                    style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
                                />
                            </div>
                            <div>
                                <label htmlFor="edit-teacher-phone" className="text-xs text-neutral-400 uppercase font-bold">Telefone</label>
                                <input
                                    id="edit-teacher-phone"
                                    type="tel"
                                    aria-label="Telefone"
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
                </ModalShell>
            )}

            {/* Execution Video Modal */}
            {executionVideoModalOpen && executionVideoModalUrl && (
                <div className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-md flex items-center justify-center p-4" role="button" tabIndex={-1} aria-label="Fechar modal de vídeo" onClick={(e) => { if (e.target === e.currentTarget) { setExecutionVideoModalOpen(false); setExecutionVideoModalUrl(''); } }} onKeyDown={(e) => { if (e.key === 'Escape') { setExecutionVideoModalOpen(false); setExecutionVideoModalUrl(''); } }}>
                    <div className="w-full max-w-3xl rounded-2xl border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 relative" role="dialog" aria-modal="true" aria-label="Vídeo de execução" style={{ background: 'linear-gradient(160deg, rgba(20,18,10,0.98) 0%, rgba(10,10,10,0.99) 40%)', borderColor: 'rgba(234,179,8,0.12)', boxShadow: '0 32px 64px -16px rgba(0,0,0,0.8), inset 0 1px 0 rgba(234,179,8,0.1)' }}>
                        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-500/40 to-transparent" />
                        <div className="p-4 flex items-center justify-between gap-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <div className="text-xs font-black uppercase tracking-[0.2em] text-yellow-500/80">Vídeo de execução</div>
                            <button
                                type="button"
                                onClick={() => { setExecutionVideoModalOpen(false); setExecutionVideoModalUrl(''); }}
                                className="w-9 h-9 rounded-xl border flex items-center justify-center text-neutral-400 hover:text-white hover:border-yellow-500/40 transition-all"
                                style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
                                aria-label="Voltar"
                                title="Voltar"
                            >
                                <ArrowLeft size={18} />
                            </button>
                        </div>
                        <div className="p-4">
                            <video src={executionVideoModalUrl} controls aria-label="Vídeo de execução do exercício" className="w-full rounded-xl bg-black">
                                <track kind="captions" />
                            </video>
                        </div>
                    </div>
                </div>
            )}

            {/* Template Editor Modal */}
            {editingTemplate && (
                <div className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-md flex items-center justify-center p-4" role="button" tabIndex={-1} aria-label="Fechar modal de edição" onClick={(e) => { if (e.target === e.currentTarget) setEditingTemplate(null); }} onKeyDown={(e) => { if (e.key === 'Escape') setEditingTemplate(null); }}>
                    <div className="w-full max-w-3xl rounded-2xl border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 relative" role="dialog" aria-modal="true" aria-label="Editar treino" style={{ background: 'linear-gradient(160deg, rgba(20,18,10,0.98) 0%, rgba(10,10,10,0.99) 40%)', borderColor: 'rgba(234,179,8,0.12)', boxShadow: '0 32px 64px -16px rgba(0,0,0,0.8), inset 0 1px 0 rgba(234,179,8,0.1)' }}>
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

/**
 * Wrapper for admin modals: applies useFocusTrap (Tab cycle + Esc) and proper
 * role="dialog" + aria-modal="true" + aria-label semantics.
 * WCAG 2.4.3 (Focus Order), 2.1.2 (No Keyboard Trap), 4.1.2 (Name/Role/Value).
 */
const ModalShell: React.FC<{
    onClose: () => void
    ariaLabel: string
    overlayClass: string
    panelClass: string
    panelStyle?: React.CSSProperties
    children: React.ReactNode
}> = ({ onClose, ariaLabel, overlayClass, panelClass, panelStyle, children }) => {
    const containerRef = useFocusTrap(true, onClose)
    return (
        <div className={overlayClass} role="dialog" aria-modal="true" aria-label={ariaLabel}>
            <div ref={containerRef} className={panelClass} style={panelStyle}>
                {children}
            </div>
        </div>
    )
}

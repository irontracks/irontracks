import React from 'react';
import { Search, Filter, UserPlus, MoreVertical, Trash2, Edit, Activity, User } from 'lucide-react';
import { useAdminPanel } from './AdminPanelContext';
import { AdminUser } from '@/types/admin';

export const StudentsTab: React.FC = () => {
    const {
        isAdmin,
        isTeacher,
        studentQuery,
        setStudentQuery,
        studentStatusFilter,
        setStudentStatusFilter,
        setShowRegisterModal,
        studentsWithTeacherFiltered,
        studentsWithoutTeacherFiltered,
        teachersList,
        handleUpdateStudentTeacher,
        handleToggleStudentStatus,
        handleDeleteStudent,
        setSelectedStudent,
        setHistoryOpen,
        user
    } = useAdminPanel();

    const renderStudentRow = (s: AdminUser) => {
        const statusColor =
            s.status === 'pago' ? 'text-green-500 bg-green-500/10 border-green-500/20' :
            s.status === 'pendente' ? 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20' :
            'text-red-500 bg-red-500/10 border-red-500/20';

        return (
            <div key={s.id} className="group flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-neutral-900/50 border border-neutral-800 rounded-xl hover:border-neutral-700 transition-all gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center font-black text-neutral-400 border border-neutral-700">
                        {(s.name || s.email || '?').charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <div className="font-bold text-white group-hover:text-yellow-500 transition-colors">
                            {s.name || s.email || 'Sem Nome'}
                        </div>
                        <div className="text-xs text-neutral-500 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                            <span>{s.email}</span>
                            <span className="hidden sm:inline">•</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider w-fit ${statusColor}`}>
                                {s.status}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    {isAdmin && (
                        <select
                            className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-neutral-300 focus:border-yellow-500 outline-none min-w-[140px]"
                            value={s.teacher_id || ''}
                            onChange={(e) => handleUpdateStudentTeacher(s.id, e.target.value || null)}
                        >
                            <option value="">Sem professor</option>
                            {teachersList.map((t) => (
                                <option key={t.id} value={t.id}>
                                    {t.name}
                                </option>
                            ))}
                        </select>
                    )}

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <button
                            onClick={() => {
                                setSelectedStudent(s);
                                setHistoryOpen(true);
                            }}
                            className="p-2 text-neutral-400 hover:text-yellow-500 hover:bg-yellow-500/10 rounded-lg transition-colors"
                            title="Ver Histórico"
                        >
                            <Activity size={18} />
                        </button>
                        
                        {isAdmin && (
                            <>
                                <button
                                    onClick={() => handleToggleStudentStatus(s)}
                                    className="p-2 text-neutral-400 hover:text-green-500 hover:bg-green-500/10 rounded-lg transition-colors"
                                    title="Alterar Status"
                                >
                                    <Edit size={18} />
                                </button>
                                <button
                                    onClick={() => handleDeleteStudent(s.id)}
                                    className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                    title="Excluir Aluno"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-neutral-900/50 p-4 rounded-2xl border border-neutral-800 backdrop-blur-sm">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={18} />
                    <input
                        type="text"
                        placeholder="Buscar alunos..."
                        value={studentQuery}
                        onChange={(e) => setStudentQuery(e.target.value)}
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-10 pr-4 py-3 text-white placeholder:text-neutral-600 focus:border-yellow-500 focus:outline-none transition-colors"
                    />
                </div>

                <div className="flex gap-2 w-full md:w-auto">
                    <div className="relative flex-1 md:flex-none">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={18} />
                        <select
                            value={studentStatusFilter}
                            onChange={(e) => setStudentStatusFilter(e.target.value)}
                            className="w-full md:w-48 bg-neutral-900 border border-neutral-800 rounded-xl pl-10 pr-4 py-3 text-white appearance-none focus:border-yellow-500 focus:outline-none cursor-pointer"
                        >
                            <option value="all">Todos os Status</option>
                            <option value="pago">Ativos</option>
                            <option value="pendente">Pendentes</option>
                            <option value="atrasado">Atrasados</option>
                        </select>
                    </div>

                    {isAdmin && (
                        <button
                            onClick={() => setShowRegisterModal(true)}
                            className="px-4 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-black rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 whitespace-nowrap"
                        >
                            <UserPlus size={18} />
                            <span className="hidden sm:inline">Novo Aluno</span>
                        </button>
                    )}
                </div>
            </div>

            <div className="space-y-8">
                {/* Meus Alunos (Teacher View) ou Alunos com Professor (Admin View) */}
                {(isTeacher || (isAdmin && studentsWithTeacherFiltered.length > 0)) && (
                    <div className="space-y-4">
                        <h3 className="text-sm font-black text-neutral-500 uppercase tracking-widest px-1">
                            {isTeacher ? 'Meus Alunos' : 'Alunos com Professor'}
                        </h3>
                        <div className="grid gap-3">
                            {isTeacher 
                                ? studentsWithTeacherFiltered
                                    .filter(s => s.teacher_id === user.id)
                                    .map(renderStudentRow)
                                : studentsWithTeacherFiltered.map(renderStudentRow)
                            }
                            {isTeacher && studentsWithTeacherFiltered.filter(s => s.teacher_id === user.id).length === 0 && (
                                <div className="text-center py-12 border border-dashed border-neutral-800 rounded-2xl">
                                    <p className="text-neutral-500 font-medium">Nenhum aluno encontrado.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Alunos Sem Professor (Admin View) */}
                {isAdmin && studentsWithoutTeacherFiltered.length > 0 && (
                    <div className="space-y-4">
                        <h3 className="text-sm font-black text-neutral-500 uppercase tracking-widest px-1">
                            Sem Professor
                        </h3>
                        <div className="grid gap-3">
                            {studentsWithoutTeacherFiltered.map(renderStudentRow)}
                        </div>
                    </div>
                )}
                
                {isAdmin && studentsWithTeacherFiltered.length === 0 && studentsWithoutTeacherFiltered.length === 0 && (
                     <div className="text-center py-12 border border-dashed border-neutral-800 rounded-2xl">
                        <div className="w-16 h-16 bg-neutral-800 rounded-full flex items-center justify-center mx-auto mb-4">
                            <User size={32} className="text-neutral-600" />
                        </div>
                        <h3 className="text-white font-bold text-lg mb-1">Nenhum aluno encontrado</h3>
                        <p className="text-neutral-500">Tente ajustar os filtros ou adicione um novo aluno.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

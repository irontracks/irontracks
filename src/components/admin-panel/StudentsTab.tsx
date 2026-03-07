import React, { useMemo } from 'react';
import { Search, UserPlus, Trash2, Activity, User, UserCheck, ClipboardList, Crown } from 'lucide-react';
import { useAdminPanel } from './AdminPanelContext';
import { AdminUser } from '@/types/admin';
import { useAdminVipMap, getVipLabel, getVipColors } from '@/hooks/useAdminVipMap';

const STATUS_OPTIONS = [
    { value: 'pago', label: 'Pago', color: 'text-green-400' },
    { value: 'pendente', label: 'Pendente', color: 'text-yellow-400' },
    { value: 'atrasado', label: 'Atrasado', color: 'text-red-400' },
    { value: 'cancelar', label: 'Cancelado', color: 'text-neutral-400' },
] as const;

type StatusValue = typeof STATUS_OPTIONS[number]['value'];

const statusBadgeClass = (status: string) => {
    switch (status) {
        case 'pago': return 'text-green-500  bg-green-500/10  border-green-500/20';
        case 'atrasado': return 'text-red-500    bg-red-500/10    border-red-500/20';
        case 'cancelar': return 'text-neutral-400 bg-neutral-700/30 border-neutral-600/30';
        default: return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
    }
};

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
        usersList,
        handleUpdateStudentTeacher,
        handleUpdateStudentStatus,
        handleDeleteStudent,
        setSelectedStudent,
        setHistoryOpen,
        user,
        // Bug 1 fix: pending self-registered users
        pendingProfiles,
        approvePendingProfile,
    } = useAdminPanel();

    // Live counts for filter pills
    const statusCounts = React.useMemo(() => {
        const list = Array.isArray(usersList) ? usersList : [];
        return list.reduce<Record<string, number>>((acc, s) => {
            const key = String(s?.status || 'pendente').toLowerCase().trim();
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});
    }, [usersList]);

    // VIP batch lookup — use user_id (profiles.id), NOT id (students table PK)
    const allStudentIds = useMemo(() => {
        const ids = [
            ...(Array.isArray(studentsWithTeacherFiltered) ? studentsWithTeacherFiltered : []),
            ...(Array.isArray(studentsWithoutTeacherFiltered) ? studentsWithoutTeacherFiltered : []),
        ].map(s => String(s.user_id || s.id || '')).filter(Boolean);
        return [...new Set(ids)];
    }, [studentsWithTeacherFiltered, studentsWithoutTeacherFiltered]);
    const { vipMap } = useAdminVipMap(allStudentIds);

    const renderStudentRow = (s: AdminUser) => {
        const uid = String(s.user_id || s.id || '');
        const vip = vipMap[uid];
        const vipLabel = vip ? getVipLabel(vip.tier) : null;
        const vipColor = vip ? getVipColors(vip.tier) : null;
        return (
            <div
                key={s.id}
                className="group flex flex-col gap-3 p-4 bg-neutral-900/50 border border-neutral-800 rounded-xl hover:border-yellow-500/40 transition-all cursor-pointer"
                onClick={() => setSelectedStudent(s)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedStudent(s); }}
                aria-label={`Ver detalhes de ${s.name || s.email || 'Aluno'}`}
            >
                {/* Top row: avatar + info */}
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 flex-shrink-0 rounded-full bg-neutral-800 flex items-center justify-center font-black text-neutral-400 border border-neutral-700">
                        {(s.name || s.email || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                        <div className="font-bold text-white group-hover:text-yellow-500 transition-colors truncate">
                            {s.name || s.email || 'Sem Nome'}
                        </div>
                        <div className="text-xs text-neutral-500 truncate">{s.email}</div>
                    </div>
                    {/* VIP badge */}
                    {vipLabel && vipColor && (
                        <span
                            className={`ml-auto flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${vipColor.bg} ${vipColor.text} ${vipColor.border}`}
                            title={vip?.valid_until ? `Expira: ${new Date(vip.valid_until).toLocaleDateString('pt-BR')}` : 'VIP'}
                        >
                            <Crown size={9} />
                            {vipLabel}
                        </span>
                    )}
                    {/* Status badge (read-only display) */}
                    <span className={`${vipLabel ? '' : 'ml-auto'} flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${statusBadgeClass(String(s.status || 'pendente'))}`}>
                        {String(s.status || 'pendente')}
                    </span>
                </div>

                {/* Controls row — stop propagation so selects/buttons don't trigger card click */}
                <div
                    className="flex flex-wrap items-center gap-2"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    role="none"
                >
                    {/* Status select — ALL transitions */}
                    {isAdmin && (
                        <select
                            className="flex-1 min-w-[120px] bg-neutral-900 border border-neutral-700 rounded-lg px-2 py-1.5 text-xs text-neutral-300 focus:border-yellow-500 outline-none"
                            value={s.status || 'pendente'}
                            onChange={(e) => {
                                e.stopPropagation();
                                handleUpdateStudentStatus(s, e.target.value as StatusValue);
                            }}
                            title="Alterar status de pagamento"
                            aria-label="Status de pagamento"
                        >
                            {STATUS_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    )}

                    {/* Teacher select — value uses t.user_id (profiles.id) to match students.teacher_id FK */}
                    {isAdmin && (
                        <select
                            className="flex-1 min-w-[140px] bg-neutral-900 border border-neutral-700 rounded-lg px-2 py-1.5 text-xs text-neutral-300 focus:border-yellow-500 outline-none"
                            value={s.teacher_id || ''}
                            onChange={(e) => {
                                e.stopPropagation();
                                // Pass user_id (profiles.id), not t.id (teachers table PK)
                                handleUpdateStudentTeacher(s.id, e.target.value || null);
                            }}
                            title="Atribuir professor"
                            aria-label="Professor responsável"
                        >
                            <option value="">Sem professor</option>
                            {teachersList.map((t) => (
                                <option
                                    key={t.id}
                                    value={String(t.user_id || '')}
                                    disabled={!t.user_id}
                                >
                                    {t.name || t.email || String(t.id).slice(0, 8)}
                                    {!t.user_id ? ' (sem conta)' : ''}
                                </option>
                            ))}
                        </select>
                    )}

                    {/* Icon actions */}
                    <div className="flex items-center gap-1 ml-auto">
                        <button
                            onClick={(e) => { e.stopPropagation(); setSelectedStudent(s); setHistoryOpen(true); }}
                            className="p-2 text-neutral-400 hover:text-yellow-500 hover:bg-yellow-500/10 rounded-lg transition-colors"
                            title="Ver Histórico"
                            aria-label="Ver Histórico"
                        >
                            <Activity size={16} />
                        </button>

                        {isAdmin && (
                            <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteStudent(s.id); }}
                                className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                title="Excluir Aluno"
                                aria-label="Excluir Aluno"
                            >
                                <Trash2 size={16} />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Search + Filters */}
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

                <div className="flex flex-wrap gap-2 w-full md:w-auto items-center">
                    {([
                        { key: 'all', label: 'Todos', color: 'text-neutral-300  bg-neutral-800   border-neutral-700   hover:border-neutral-600' },
                        { key: 'pago', label: 'Ativos', color: 'text-green-400   bg-green-500/10   border-green-500/20  hover:border-green-500/40' },
                        { key: 'pendente', label: 'Pendentes', color: 'text-yellow-400  bg-yellow-500/10  border-yellow-500/20 hover:border-yellow-500/40' },
                        { key: 'atrasado', label: 'Atrasados', color: 'text-red-400     bg-red-500/10     border-red-500/20    hover:border-red-500/40' },
                        { key: 'cancelar', label: 'Cancelados', color: 'text-neutral-400 bg-neutral-700/30 border-neutral-600/30 hover:border-neutral-500/40' },
                    ] as const).map(({ key, label, color }) => {
                        const count = key === 'all'
                            ? (Array.isArray(usersList) ? usersList.length : 0)
                            : (statusCounts[key] || 0);
                        const active = studentStatusFilter === key;
                        return (
                            <button
                                key={key}
                                onClick={() => setStudentStatusFilter(key)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${color} ${active ? 'ring-2 ring-yellow-500/50 ring-offset-1 ring-offset-black' : ''}`}
                            >
                                {label}
                                <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] rounded-full font-black ${active ? 'bg-yellow-500 text-black' : 'bg-black/40 text-current'}`}>
                                    {count}
                                </span>
                            </button>
                        );
                    })}

                    {isAdmin && (
                        <button
                            onClick={() => setShowRegisterModal(true)}
                            className="ml-auto md:ml-0 px-4 py-2.5 bg-yellow-500 hover:bg-yellow-400 text-black font-black rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 whitespace-nowrap"
                        >
                            <UserPlus size={16} />
                            <span className="hidden sm:inline">Novo Aluno</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Solicitações de Cadastro — novos membros que se auto-cadastraram via app */}
            {isAdmin && Array.isArray(pendingProfiles) && pendingProfiles.length > 0 && (
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <ClipboardList size={16} className="text-yellow-500" />
                        <h3 className="text-sm font-black text-yellow-500 uppercase tracking-widest">
                            Solicitações de Cadastro
                        </h3>
                        <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] rounded-full font-black bg-yellow-500 text-black">
                            {pendingProfiles.length}
                        </span>
                    </div>
                    <div className="grid gap-3">
                        {pendingProfiles.map((p) => {
                            const uid = String(p.user_id || p.id || '');
                            return (
                                <div
                                    key={uid}
                                    className="flex items-center gap-3 p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-xl"
                                >
                                    <div className="w-10 h-10 flex-shrink-0 rounded-full bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center font-black text-yellow-500">
                                        {(String(p.name || p.email || '?').charAt(0)).toUpperCase()}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="font-bold text-white truncate">{String(p.name || p.email || 'Novo membro')}</div>
                                        <div className="text-xs text-neutral-400 truncate">{String(p.email || '')}</div>
                                    </div>
                                    <button
                                        onClick={() => approvePendingProfile(p)}
                                        className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 bg-yellow-500 hover:bg-yellow-400 text-black rounded-lg text-xs font-black transition-all active:scale-95"
                                        title="Aprovar membro"
                                    >
                                        <UserCheck size={14} />
                                        Aprovar
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}


            {/* Lists */}
            <div className="space-y-8">
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

                {/* Sem Professor */}
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

                {/* Empty state */}
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

import React, { useState } from 'react';
import {
    Search, UserPlus, Mail, ChevronLeft, Edit3, Users,
    Dumbbell, Clock, AlertCircle, Loader2, BookOpen,
    CheckCircle2, CalendarDays, Phone, ShieldCheck, Trophy
} from 'lucide-react';
import { useAdminPanel } from './AdminPanelContext';
import type { AdminUser, AdminTeacher } from '@/types/admin';

// ─── Avatar helper ────────────────────────────────────────────────
const TeacherAvatar = ({ teacher, size = 'md' }: { teacher: AdminTeacher; size?: 'sm' | 'md' | 'lg' }) => {
    const sizes = { sm: 'w-9 h-9 text-sm', md: 'w-12 h-12 text-base', lg: 'w-16 h-16 text-xl' };
    const char = (teacher.name || teacher.email || '?').charAt(0).toUpperCase();
    if (teacher.photo_url) {
        return (
            <img
                src={teacher.photo_url}
                alt={teacher.name || ''}
                className={`${sizes[size]} rounded-2xl object-cover border border-yellow-500/30 shadow-lg shadow-yellow-500/10`}
            />
        );
    }
    return (
        <div className={`${sizes[size]} rounded-2xl bg-gradient-to-br from-yellow-500/20 to-amber-600/10 border border-yellow-500/30 flex items-center justify-center font-black text-yellow-400 shadow-lg shadow-yellow-500/10 flex-shrink-0`}>
            {char}
        </div>
    );
};

// ─── Teacher Card ─────────────────────────────────────────────────
const TeacherCard = ({
    teacher,
    onClick,
    onEdit,
}: {
    teacher: AdminTeacher;
    onClick: () => void;
    onEdit: (e: React.MouseEvent) => void;
}) => {
    const name = teacher.name || teacher.email || 'Sem Nome';
    const studentCount = (teacher as unknown as Record<string, unknown>).student_count as number | undefined;

    return (
        <div
            onClick={onClick}
            className="group relative bg-neutral-900/60 border border-neutral-800/80 rounded-3xl p-5 cursor-pointer transition-all duration-300 hover:border-yellow-500/40 hover:bg-neutral-900/90 hover:shadow-[0_8px_40px_rgba(234,179,8,0.08)] active:scale-[0.99] overflow-hidden"
        >
            {/* Subtle glow bg */}
            <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

            {/* Top row */}
            <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-3 min-w-0">
                    <TeacherAvatar teacher={teacher} size="md" />
                    <div className="min-w-0">
                        <div className="font-black text-white text-[15px] leading-snug truncate group-hover:text-yellow-400 transition-colors">
                            {name}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <Mail size={11} className="text-neutral-500 flex-shrink-0" />
                            <span className="text-[11px] text-neutral-500 truncate">{teacher.email}</span>
                        </div>
                    </div>
                </div>
                <button
                    onClick={onEdit}
                    className="flex-shrink-0 w-8 h-8 rounded-xl bg-neutral-800/80 hover:bg-yellow-500/15 border border-neutral-700/60 hover:border-yellow-500/40 text-neutral-500 hover:text-yellow-400 flex items-center justify-center transition-all duration-200 active:scale-95"
                    title="Editar"
                >
                    <Edit3 size={13} />
                </button>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 gap-2">
                <div className="bg-neutral-800/50 rounded-2xl px-3 py-2.5 border border-neutral-700/40">
                    <div className="flex items-center gap-1.5 mb-1">
                        <Users size={11} className="text-yellow-500" />
                        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Alunos</span>
                    </div>
                    <div className="text-lg font-black text-white leading-none">
                        {studentCount ?? <span className="text-neutral-600 text-sm">—</span>}
                    </div>
                </div>
                <div className="bg-neutral-800/50 rounded-2xl px-3 py-2.5 border border-neutral-700/40">
                    <div className="flex items-center gap-1.5 mb-1">
                        <ShieldCheck size={11} className="text-green-500" />
                        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Status</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.7)]" />
                        <span className="text-[12px] font-black text-green-400">Ativo</span>
                    </div>
                </div>
            </div>

            {/* CREF if exists */}
            {teacher.cref && (
                <div className="mt-3 flex items-center gap-2 text-[11px] text-neutral-500">
                    <Trophy size={11} className="text-yellow-500/60" />
                    <span className="font-bold">CREF:</span> {teacher.cref}
                </div>
            )}

            {/* Phone if exists */}
            {teacher.phone && (
                <div className="mt-1 flex items-center gap-2 text-[11px] text-neutral-500">
                    <Phone size={11} className="text-neutral-600" />
                    {teacher.phone}
                </div>
            )}

            {/* Arrow indicator */}
            <div className="absolute right-4 bottom-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="w-6 h-6 rounded-full bg-yellow-500/20 border border-yellow-500/30 flex items-center justify-center">
                    <ChevronLeft size={12} className="text-yellow-400 rotate-180" />
                </div>
            </div>
        </div>
    );
};

// ─── Detail Tab Pill ─────────────────────────────────────────────
const DetailTabPill = ({ label, icon: Icon, active, onClick, badge }: {
    label: string;
    icon: React.ElementType;
    active: boolean;
    onClick: () => void;
    badge?: number;
}) => (
    <button
        type="button"
        onClick={onClick}
        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[11px] font-black uppercase tracking-widest whitespace-nowrap transition-all duration-200 active:scale-95 ${active
                ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/25'
                : 'bg-neutral-800/60 text-neutral-400 border border-neutral-700/60 hover:bg-neutral-800 hover:text-white'
            }`}
    >
        <Icon size={12} />
        {label}
        {badge !== undefined && badge > 0 && (
            <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black leading-none ${active ? 'bg-black/20 text-black' : 'bg-yellow-500/20 text-yellow-400'}`}>
                {badge}
            </span>
        )}
    </button>
);

// ─── Student Row ─────────────────────────────────────────────────
const StudentRow = ({ student }: { student: AdminUser }) => {
    const name = student.name || student.email || 'Sem Nome';
    const char = name.charAt(0).toUpperCase();
    return (
        <div className="flex items-center gap-3 p-3.5 bg-neutral-800/30 border border-neutral-700/40 rounded-2xl hover:border-yellow-500/20 hover:bg-neutral-800/50 transition-all">
            <div className="w-9 h-9 rounded-xl bg-neutral-700/60 flex items-center justify-center font-black text-yellow-500 text-sm flex-shrink-0 border border-neutral-600/40">
                {char}
            </div>
            <div className="min-w-0 flex-1">
                <div className="font-bold text-white text-sm truncate">{name}</div>
                <div className="text-[11px] text-neutral-500 truncate">{student.email}</div>
            </div>
            <div className={`flex-shrink-0 px-2 py-1 rounded-lg text-[10px] font-black uppercase ${String(student.status || '').toLowerCase() === 'pago'
                    ? 'bg-green-500/15 text-green-400 border border-green-500/20'
                    : 'bg-neutral-700/50 text-neutral-500 border border-neutral-600/30'
                }`}>
                {student.status || '—'}
            </div>
        </div>
    );
};

// ─── Workout Row ─────────────────────────────────────────────────
const WorkoutRow = ({ workout }: { workout: Record<string, unknown> }) => (
    <div className="flex items-center gap-3 p-3.5 bg-neutral-800/30 border border-neutral-700/40 rounded-2xl hover:border-yellow-500/20 transition-all">
        <div className="w-9 h-9 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center flex-shrink-0">
            <Dumbbell size={14} className="text-yellow-500" />
        </div>
        <div className="min-w-0 flex-1">
            <div className="font-bold text-white text-sm truncate">{String(workout.name || workout.title || 'Treino')}</div>
            <div className="text-[11px] text-neutral-500">
                {Array.isArray(workout.exercises) ? `${workout.exercises.length} exercícios` : '—'}
            </div>
        </div>
        {workout.created_at && (
            <div className="flex-shrink-0 text-[10px] text-neutral-600 flex items-center gap-1">
                <CalendarDays size={10} />
                {new Date(String(workout.created_at)).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
            </div>
        )}
    </div>
);

// ─── Inbox Row ───────────────────────────────────────────────────
const InboxRow = ({ student }: { student: AdminUser }) => {
    const name = student.name || student.email || 'Sem Nome';
    const days = (student as unknown as Record<string, unknown>).daysSinceLastWorkout as number | undefined;
    return (
        <div className="flex items-center gap-3 p-3.5 bg-neutral-800/30 border border-red-500/10 rounded-2xl">
            <div className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
                <AlertCircle size={14} className="text-red-400" />
            </div>
            <div className="min-w-0 flex-1">
                <div className="font-bold text-white text-sm truncate">{name}</div>
                <div className="text-[11px] text-red-400 font-semibold">
                    {days !== undefined ? `${days} dias sem treinar` : 'Inativo'}
                </div>
            </div>
        </div>
    );
};

// ─── Empty State ─────────────────────────────────────────────────
const EmptyState = ({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle: string }) => (
    <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
        <div className="w-14 h-14 rounded-2xl bg-neutral-800/60 border border-neutral-700/40 flex items-center justify-center">
            <Icon size={24} className="text-neutral-600" />
        </div>
        <div>
            <div className="font-black text-white text-sm mb-1">{title}</div>
            <div className="text-[12px] text-neutral-500">{subtitle}</div>
        </div>
    </div>
);

// ─── Main Component ───────────────────────────────────────────────
export const TeachersTab: React.FC = () => {
    const {
        teachersFiltered,
        teacherQuery,
        setTeacherQuery,
        setShowTeacherModal,
        selectedTeacher,
        setSelectedTeacher,
        setEditingTeacher,
        teacherDetailTab,
        setTeacherDetailTab,
        teacherStudents,
        teacherStudentsLoading,
        teacherTemplatesRows,
        teacherTemplatesLoading,
        teacherHistoryRows,
        teacherHistoryLoading,
        teacherInboxItems,
        teacherInboxLoading,
    } = useAdminPanel();

    // ─── Detail View ──────────────────────────────────────────────
    if (selectedTeacher) {
        const t = selectedTeacher;
        const name = t.name || t.email || 'Sem Nome';
        const char = name.charAt(0).toUpperCase();

        const detailTabs = [
            { key: 'students', label: 'Alunos', icon: Users, count: teacherStudents.length },
            { key: 'templates', label: 'Treinos', icon: Dumbbell, count: teacherTemplatesRows.length },
            { key: 'history', label: 'Histórico', icon: Clock, count: teacherHistoryRows.length },
            { key: 'inbox', label: 'Inbox', icon: AlertCircle, count: teacherInboxItems.length },
        ];

        return (
            <div className="space-y-5 animate-in slide-in-from-right-4 duration-300">
                {/* Back header */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setSelectedTeacher(null)}
                        className="w-9 h-9 rounded-2xl bg-neutral-800/60 border border-neutral-700/60 hover:bg-neutral-800 hover:border-neutral-600 text-neutral-400 hover:text-white flex items-center justify-center transition-all active:scale-95"
                    >
                        <ChevronLeft size={18} />
                    </button>
                    <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">Professores</span>
                </div>

                {/* Teacher hero card */}
                <div className="relative bg-neutral-900/70 border border-neutral-800 rounded-3xl p-6 overflow-hidden">
                    {/* Gold shimmer bg */}
                    <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/[0.05] via-transparent to-amber-600/[0.03] pointer-events-none" />
                    <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-500/25 to-transparent" />

                    <div className="relative flex items-start gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-yellow-500/25 to-amber-600/15 border border-yellow-500/35 flex items-center justify-center font-black text-yellow-400 text-2xl shadow-lg shadow-yellow-500/15 flex-shrink-0">
                            {char}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <h2 className="text-xl font-black text-white leading-snug">{name}</h2>
                                    <div className="flex items-center gap-1.5 mt-1">
                                        <Mail size={12} className="text-neutral-500" />
                                        <span className="text-xs text-neutral-500 truncate">{t.email}</span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setEditingTeacher(t)}
                                    className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/25 text-yellow-400 text-[11px] font-black uppercase tracking-wider transition-all active:scale-95"
                                >
                                    <Edit3 size={11} />
                                    Editar
                                </button>
                            </div>

                            {/* Info badges */}
                            <div className="flex flex-wrap gap-2 mt-3">
                                {t.phone && (
                                    <div className="flex items-center gap-1 px-2.5 py-1 bg-neutral-800/60 border border-neutral-700/50 rounded-full text-[11px] text-neutral-400">
                                        <Phone size={10} />
                                        {t.phone}
                                    </div>
                                )}
                                {t.cref && (
                                    <div className="flex items-center gap-1 px-2.5 py-1 bg-yellow-500/10 border border-yellow-500/20 rounded-full text-[11px] text-yellow-400 font-bold">
                                        <Trophy size={10} />
                                        CREF: {t.cref}
                                    </div>
                                )}
                                {t.birth_date && (
                                    <div className="flex items-center gap-1 px-2.5 py-1 bg-neutral-800/60 border border-neutral-700/50 rounded-full text-[11px] text-neutral-400">
                                        <CalendarDays size={10} />
                                        {new Date(t.birth_date).toLocaleDateString('pt-BR')}
                                    </div>
                                )}
                                <div className="flex items-center gap-1 px-2.5 py-1 bg-green-500/10 border border-green-500/20 rounded-full text-[11px] text-green-400 font-bold">
                                    <CheckCircle2 size={10} />
                                    Ativo
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Stats row */}
                    <div className="relative grid grid-cols-4 gap-2 mt-5 pt-5 border-t border-neutral-800/60">
                        {[
                            { label: 'Alunos', value: teacherStudents.length, icon: Users, color: 'yellow' },
                            { label: 'Treinos', value: teacherTemplatesRows.length, icon: Dumbbell, color: 'blue' },
                            { label: 'Histórico', value: teacherHistoryRows.length, icon: BookOpen, color: 'violet' },
                            { label: 'Alertas', value: teacherInboxItems.length, icon: AlertCircle, color: 'red' },
                        ].map(({ label, value, icon: Icon, color }) => (
                            <div key={label} className="text-center">
                                <div className={`text-xl font-black ${color === 'yellow' ? 'text-yellow-400'
                                        : color === 'blue' ? 'text-blue-400'
                                            : color === 'violet' ? 'text-violet-400'
                                                : 'text-red-400'
                                    }`}>{value}</div>
                                <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">{label}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Tab pills */}
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                    {detailTabs.map(({ key, label, icon, count }) => (
                        <DetailTabPill
                            key={key}
                            label={label}
                            icon={icon}
                            active={teacherDetailTab === key}
                            onClick={() => setTeacherDetailTab(key)}
                            badge={count}
                        />
                    ))}
                </div>

                {/* Tab content */}
                <div className="space-y-2 animate-in fade-in duration-300">

                    {/* Students */}
                    {teacherDetailTab === 'students' && (
                        <>
                            {teacherStudentsLoading ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 size={24} className="animate-spin text-yellow-500" />
                                </div>
                            ) : teacherStudents.length === 0 ? (
                                <EmptyState icon={Users} title="Sem alunos" subtitle="Este professor ainda não tem alunos vinculados." />
                            ) : (
                                teacherStudents.map((s) => <StudentRow key={s.id} student={s} />)
                            )}
                        </>
                    )}

                    {/* Templates */}
                    {teacherDetailTab === 'templates' && (
                        <>
                            {teacherTemplatesLoading ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 size={24} className="animate-spin text-yellow-500" />
                                </div>
                            ) : teacherTemplatesRows.length === 0 ? (
                                <EmptyState icon={Dumbbell} title="Sem treinos" subtitle="Nenhum treino template encontrado para este professor." />
                            ) : (
                                teacherTemplatesRows.map((w, i) => <WorkoutRow key={String(w.id || i)} workout={w as unknown as Record<string, unknown>} />)
                            )}
                        </>
                    )}

                    {/* History */}
                    {teacherDetailTab === 'history' && (
                        <>
                            {teacherHistoryLoading ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 size={24} className="animate-spin text-yellow-500" />
                                </div>
                            ) : teacherHistoryRows.length === 0 ? (
                                <EmptyState icon={Clock} title="Sem histórico" subtitle="Nenhum treino realizado encontrado." />
                            ) : (
                                teacherHistoryRows.map((w, i) => <WorkoutRow key={String((w as Record<string, unknown>).id || i)} workout={w as Record<string, unknown>} />)
                            )}
                        </>
                    )}

                    {/* Inbox */}
                    {teacherDetailTab === 'inbox' && (
                        <>
                            {teacherInboxLoading ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 size={24} className="animate-spin text-yellow-500" />
                                </div>
                            ) : teacherInboxItems.length === 0 ? (
                                <EmptyState icon={CheckCircle2} title="Inbox limpo" subtitle="Nenhum aluno inativo detectado para este professor." />
                            ) : (
                                teacherInboxItems.map((s) => <InboxRow key={s.id} student={s} />)
                            )}
                        </>
                    )}
                </div>
            </div>
        );
    }

    // ─── List View ────────────────────────────────────────────────
    return (
        <div className="space-y-5 animate-in fade-in duration-500">

            {/* Header stats bar */}
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-gradient-to-br from-yellow-500/10 to-amber-600/5 border border-yellow-500/20 rounded-2xl p-4">
                    <div className="text-[10px] font-black uppercase tracking-widest text-yellow-500/70 mb-1">Total</div>
                    <div className="text-3xl font-black text-white">{teachersFiltered.length}</div>
                    <div className="text-[11px] text-neutral-500 mt-0.5">professores cadastrados</div>
                </div>
                <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4 flex flex-col justify-between">
                    <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-2">Novo professor</div>
                    <button
                        onClick={() => setShowTeacherModal(true)}
                        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-black font-black rounded-xl py-2.5 text-[12px] uppercase tracking-wider transition-all active:scale-95 shadow-lg shadow-yellow-500/20"
                    >
                        <UserPlus size={14} />
                        Adicionar
                    </button>
                </div>
            </div>

            {/* Search */}
            <div className="relative">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" />
                <input
                    type="text"
                    placeholder="Buscar professor por nome ou e-mail…"
                    value={teacherQuery}
                    onChange={(e) => setTeacherQuery(e.target.value)}
                    className="w-full bg-neutral-900/60 border border-neutral-800 rounded-2xl pl-11 pr-4 py-3.5 text-white text-sm placeholder:text-neutral-600 focus:border-yellow-500/60 focus:outline-none focus:bg-neutral-900/90 transition-all"
                />
            </div>

            {/* Teachers grid */}
            {teachersFiltered.length === 0 ? (
                <div className="py-16 flex flex-col items-center gap-4 text-center border border-dashed border-neutral-800 rounded-3xl">
                    <div className="w-16 h-16 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center">
                        <Users size={28} className="text-neutral-700" />
                    </div>
                    <div>
                        <div className="font-black text-white text-base mb-1">
                            {teacherQuery ? 'Nenhum resultado' : 'Nenhum professor cadastrado'}
                        </div>
                        <p className="text-neutral-500 text-sm">
                            {teacherQuery
                                ? `Nada encontrado para "${teacherQuery}".`
                                : 'Adicione o primeiro professor para começar.'}
                        </p>
                    </div>
                    {!teacherQuery && (
                        <button
                            onClick={() => setShowTeacherModal(true)}
                            className="flex items-center gap-2 px-5 py-2.5 bg-yellow-500 hover:bg-yellow-400 text-black font-black rounded-xl text-sm transition-all active:scale-95"
                        >
                            <UserPlus size={16} />
                            Adicionar Professor
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {teachersFiltered.map((t, i) => (
                        <div
                            key={t.id}
                            className="animate-in fade-in slide-in-from-bottom-2"
                            style={{ animationDelay: `${i * 40}ms` }}
                        >
                            <TeacherCard
                                teacher={t}
                                onClick={() => setSelectedTeacher(t)}
                                onEdit={(e) => { e.stopPropagation(); setEditingTeacher(t); }}
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

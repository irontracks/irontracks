'use client';

import React, { useState } from 'react';
import { MoreHorizontal, Calendar } from 'lucide-react';
import { TEACHER_PRIMARY_SECTIONS, TEACHER_MORE_SECTIONS, isMoreSection } from './teacherAreaSections';

interface Props {
    activeTab: string;
    onSelect: (key: string) => void;
    /** Abre a Agenda (página própria). Fica no sheet "Mais". */
    onOpenSchedule: () => void;
}

/** Barra inferior da Área do professor: 4 seções fixas + botão "Mais". */
export const TeacherAreaNav: React.FC<Props> = ({ activeTab, onSelect, onOpenSchedule }) => {
    const [moreOpen, setMoreOpen] = useState(false);
    const moreActive = isMoreSection(activeTab);

    const pick = (key: string) => {
        setMoreOpen(false);
        onSelect(key);
    };

    return (
        <>
            {moreOpen && (
                <div className="fixed inset-0 z-[61]" role="presentation">
                    <button
                        type="button"
                        className="absolute inset-0 bg-black/60"
                        aria-label="Fechar"
                        onClick={() => setMoreOpen(false)}
                    />
                    <div className="absolute bottom-[72px] left-0 right-0 bg-neutral-900 border-t border-neutral-800 p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] rounded-t-2xl">
                        <button
                            type="button"
                            onClick={() => { setMoreOpen(false); onOpenSchedule(); }}
                            className="w-full flex items-center gap-3 p-3 rounded-xl text-left text-neutral-200 hover:bg-neutral-800 transition-colors"
                        >
                            <Calendar size={18} />
                            <span className="text-sm font-bold">Agenda</span>
                        </button>
                        {TEACHER_MORE_SECTIONS.map(({ key, label, Icon }) => {
                            const active = activeTab === key;
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => pick(key)}
                                    className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors ${active ? 'bg-yellow-500/10 text-yellow-400' : 'text-neutral-200 hover:bg-neutral-800'}`}
                                >
                                    <Icon size={18} />
                                    <span className="text-sm font-bold">{label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            <nav className="flex-shrink-0 bg-neutral-950/95 backdrop-blur border-t border-neutral-800 flex items-stretch pb-[env(safe-area-inset-bottom)]">
                {TEACHER_PRIMARY_SECTIONS.map(({ key, label, Icon }) => {
                    const active = activeTab === key;
                    return (
                        <button
                            key={key}
                            type="button"
                            onClick={() => pick(key)}
                            aria-current={active ? 'page' : undefined}
                            className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 transition-colors ${active ? 'text-yellow-400' : 'text-neutral-400 hover:text-neutral-200'}`}
                        >
                            <Icon size={20} />
                            <span className="text-[10px] font-bold tracking-wide">{label}</span>
                        </button>
                    );
                })}
                <button
                    type="button"
                    onClick={() => setMoreOpen((v) => !v)}
                    aria-expanded={moreOpen}
                    aria-label="Mais seções"
                    className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 transition-colors ${moreActive || moreOpen ? 'text-yellow-400' : 'text-neutral-400 hover:text-neutral-200'}`}
                >
                    <MoreHorizontal size={20} />
                    <span className="text-[10px] font-bold tracking-wide">Mais</span>
                </button>
            </nav>
        </>
    );
};

export default TeacherAreaNav;

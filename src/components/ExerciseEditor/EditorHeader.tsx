'use client'

import React from 'react'
import { Save, X, Upload, MoreVertical } from 'lucide-react'

interface WorkoutHeaderProps {
    saving: boolean
    fileInputRef: React.RefObject<HTMLInputElement | null>
    onSave: () => void
    onCancel: () => void
    onImportJsonClick: () => void
    onImportJson: (e: React.ChangeEvent<HTMLInputElement>) => void
}

export const WorkoutHeader: React.FC<WorkoutHeaderProps> = ({
    saving,
    fileInputRef,
    onSave,
    onCancel,
    onImportJsonClick,
    onImportJson,
}) => {
    const [menuOpen, setMenuOpen] = React.useState(false)

    return (
        <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between gap-3 bg-depth-overlay backdrop-blur-xl sticky top-0 z-30 pt-safe">
            <h2 className="text-lg font-black text-white tracking-tight truncate min-w-0">
                Editar Treino
            </h2>

            <div className="shrink-0 flex items-center gap-2">
                <button
                    type="button"
                    onClick={onSave}
                    disabled={saving}
                    aria-label="Salvar treino"
                    className="flex items-center gap-2 px-3 sm:px-5 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-black rounded-full transition-all text-sm disabled:opacity-70 disabled:cursor-not-allowed active:scale-95 min-h-[44px]"
                >
                    <Save size={18} />
                    <span className="hidden sm:inline">{saving ? 'SALVANDO...' : 'SALVAR'}</span>
                </button>

                <div className="relative">
                    <button
                        type="button"
                        onClick={() => setMenuOpen((o) => !o)}
                        aria-label="Mais opções"
                        aria-haspopup="menu"
                        aria-expanded={menuOpen}
                        className="h-10 w-10 inline-flex items-center justify-center rounded-full bg-white/[0.04] border border-white/[0.06] text-neutral-300 hover:bg-white/[0.08] hover:text-white transition-colors"
                    >
                        <MoreVertical size={18} />
                    </button>

                    {menuOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden="true" />
                            <div
                                role="menu"
                                className="absolute right-0 mt-2 w-52 z-50 rounded-2xl bg-depth-3 border border-white/[0.06] shadow-2xl overflow-hidden animate-dropdown-in"
                            >
                                <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => { setMenuOpen(false); onImportJsonClick() }}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-neutral-200 hover:bg-white/[0.05] transition-colors"
                                >
                                    <Upload size={16} className="text-neutral-400" />
                                    Carregar JSON
                                </button>
                            </div>
                        </>
                    )}
                </div>

                <button
                    type="button"
                    onClick={onCancel}
                    aria-label="Fechar editor"
                    className="h-10 w-10 inline-flex items-center justify-center rounded-full bg-white/[0.04] border border-white/[0.06] text-neutral-300 hover:bg-white/[0.08] hover:text-white transition-colors"
                    title="Fechar"
                >
                    <X size={16} />
                </button>

                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    aria-label="Selecionar arquivo JSON do treino"
                    className="hidden"
                    onChange={onImportJson}
                />
            </div>
        </div>
    )
}

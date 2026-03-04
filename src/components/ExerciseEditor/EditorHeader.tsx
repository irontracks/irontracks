'use client'

import React from 'react'
import { Save, X, Upload, Image as ImageIcon } from 'lucide-react'

interface WorkoutHeaderProps {
    saving: boolean
    scannerLoading: boolean
    scannerFileInputRef: React.RefObject<HTMLInputElement | null>
    fileInputRef: React.RefObject<HTMLInputElement | null>
    onSave: () => void
    onCancel: () => void
    onScannerFileClick: () => void
    onScannerFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
    onImportJsonClick: () => void
    onImportJson: (e: React.ChangeEvent<HTMLInputElement>) => void
}

export const WorkoutHeader: React.FC<WorkoutHeaderProps> = ({
    saving,
    scannerLoading,
    scannerFileInputRef,
    fileInputRef,
    onSave,
    onCancel,
    onScannerFileClick,
    onScannerFileChange,
    onImportJsonClick,
    onImportJson,
}) => (
    <div className="px-4 py-2 border-b border-neutral-800 flex items-center justify-between bg-neutral-950 sticky top-0 z-30 pt-safe">
        <div className="w-full flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between min-h-[48px]">
            <div className="flex items-center justify-between gap-3 min-w-0">
                <h2 className="text-base md:text-lg font-bold text-white whitespace-nowrap truncate min-w-0">
                    Editar Treino
                </h2>
                <div className="shrink-0 flex items-center gap-2">
                    <button
                        type="button"
                        onClick={onSave}
                        disabled={saving}
                        aria-label="Salvar treino"
                        className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-full transition-colors text-sm disabled:opacity-70 disabled:cursor-not-allowed min-h-[44px]"
                    >
                        <Save size={18} />
                        <span className="hidden sm:inline">{saving ? 'SALVANDO...' : 'SALVAR'}</span>
                    </button>
                    <button
                        type="button"
                        onClick={onCancel}
                        aria-label="Fechar editor"
                        className="h-10 w-10 inline-flex items-center justify-center rounded-full bg-neutral-900 border border-neutral-800 text-neutral-200 hover:bg-neutral-800 transition-colors"
                        title="Fechar"
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <button
                    onClick={onScannerFileClick}
                    disabled={scannerLoading}
                    aria-label="Importar treino via IA com foto ou PDF"
                    className="shrink-0 flex items-center gap-2 px-3 py-2 text-yellow-400 hover:text-yellow-300 rounded-full hover:bg-yellow-500/10 transition-colors min-h-[44px] disabled:opacity-60 disabled:cursor-not-allowed"
                    title="Importar treino via IA (foto/PDF)"
                >
                    <ImageIcon size={18} />
                    <span className="text-sm font-bold hidden sm:inline">Importar Treino (Foto/PDF)</span>
                    <span className="text-sm font-bold sm:hidden">Importar</span>
                </button>
                <input
                    ref={scannerFileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    aria-label="Selecionar arquivo de treino para escaneamento"
                    className="hidden"
                    onChange={onScannerFileChange}
                />
                <button
                    onClick={onImportJsonClick}
                    aria-label="Carregar treino a partir de arquivo JSON"
                    className="shrink-0 flex items-center gap-2 px-3 py-2 text-neutral-300 hover:text-white rounded-full hover:bg-neutral-800 transition-colors min-h-[44px]"
                    title="Carregar JSON"
                >
                    <Upload size={18} />
                    <span className="text-sm font-bold hidden sm:inline">Carregar JSON</span>
                    <span className="text-sm font-bold sm:hidden">JSON</span>
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
    </div>
)

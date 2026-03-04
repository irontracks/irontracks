'use client'

import { memo } from 'react'
import { Loader2, Sparkles } from 'lucide-react'

type MaybePromise<T> = T | Promise<T>

interface WorkoutToolsPanelProps {
    onClose: () => void
    onCreateWorkout: () => MaybePromise<void>
    onOpenIronScanner: () => void
    onOpenJsonImport: () => void
    onExportAll: () => MaybePromise<void>
    exportingAll?: boolean
    onNormalizeAiWorkoutTitles?: () => MaybePromise<void>
    onNormalizeExercises?: () => MaybePromise<void>
    onApplyTitleRule?: () => MaybePromise<void>
    normalizingAiTitles: boolean
    normalizingExercises: boolean
    applyingTitleRule: boolean
    setNormalizingAiTitles: (v: boolean) => void
    setNormalizingExercises: (v: boolean) => void
    setApplyingTitleRule: (v: boolean) => void
}

export const WorkoutToolsPanel = memo(function WorkoutToolsPanel({
    onClose,
    onCreateWorkout,
    onOpenIronScanner,
    onOpenJsonImport,
    onExportAll,
    exportingAll,
    onNormalizeAiWorkoutTitles,
    onNormalizeExercises,
    onApplyTitleRule,
    normalizingAiTitles,
    normalizingExercises,
    applyingTitleRule,
    setNormalizingAiTitles,
    setNormalizingExercises,
    setApplyingTitleRule,
}: WorkoutToolsPanelProps) {
    return (
        <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-40" onClick={onClose} />

            {/* ── Premium Tools Panel ─────────────────────────────── */}
            <div className="absolute right-0 mt-2 w-72 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="rounded-3xl border border-white/10 bg-neutral-950/97 backdrop-blur-xl shadow-2xl shadow-black/70 overflow-hidden">

                    {/* Gold top shimmer */}
                    <div className="h-px bg-gradient-to-r from-transparent via-yellow-500/80 to-transparent" />

                    {/* Header */}
                    <div className="px-4 pt-3.5 pb-2.5 flex items-center gap-2.5 border-b border-white/5">
                        <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-yellow-500/20 to-amber-600/10 border border-yellow-500/30 flex items-center justify-center">
                            <Sparkles size={13} className="text-yellow-400" />
                        </div>
                        <div>
                            <p className="text-[11px] font-black uppercase tracking-widest text-yellow-500">Ferramentas</p>
                            <p className="text-[10px] text-neutral-600 font-medium leading-none mt-0.5">Ações avançadas do seu treino</p>
                        </div>
                    </div>

                    <div className="p-2 space-y-0.5">

                        {/* ── GROUP: Criar ──────────────────────────────── */}
                        <p className="px-3 pt-2 pb-1 text-[9px] font-black uppercase tracking-[0.15em] text-neutral-600">Criar</p>

                        {/* Criar automaticamente */}
                        <button
                            onClick={() => { onClose(); onCreateWorkout() }}
                            className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-gradient-to-r hover:from-yellow-500/10 hover:to-transparent transition-all duration-150 active:scale-[0.98]"
                        >
                            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-yellow-500/20 to-amber-600/10 border border-yellow-500/25 flex items-center justify-center flex-shrink-0">
                                <Sparkles size={14} className="text-yellow-400" />
                            </div>
                            <div className="flex-1 text-left">
                                <p className="text-[13px] font-bold text-white group-hover:text-yellow-100 leading-tight">Criar automaticamente</p>
                                <p className="text-[10px] text-neutral-600">Wizard com IA</p>
                            </div>
                        </button>

                        {/* Scanner de Treino */}
                        <button
                            onClick={() => { onClose(); onOpenIronScanner() }}
                            className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-gradient-to-r hover:from-orange-500/10 hover:to-transparent transition-all duration-150 active:scale-[0.98]"
                        >
                            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500/20 to-red-600/10 border border-orange-500/25 flex items-center justify-center flex-shrink-0">
                                <span className="text-sm leading-none">📷</span>
                            </div>
                            <div className="flex-1 text-left">
                                <p className="text-[13px] font-bold text-white group-hover:text-orange-100 leading-tight">Scanner de Treino</p>
                                <p className="text-[10px] text-neutral-600">Digitalizar treino físico</p>
                            </div>
                        </button>

                        {/* Divisor */}
                        <div className="mx-3 my-1 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />

                        {/* ── GROUP: Importar / Exportar ─────────────────── */}
                        <p className="px-3 pt-2 pb-1 text-[9px] font-black uppercase tracking-[0.15em] text-neutral-600">Importar / Exportar</p>

                        {/* Importar JSON */}
                        <button
                            onClick={() => { onClose(); onOpenJsonImport() }}
                            className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-gradient-to-r hover:from-purple-500/10 hover:to-transparent transition-all duration-150 active:scale-[0.98]"
                        >
                            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-700/10 border border-purple-500/25 flex items-center justify-center flex-shrink-0">
                                <span className="text-sm font-black text-purple-400 leading-none">↵</span>
                            </div>
                            <div className="flex-1 text-left">
                                <p className="text-[13px] font-bold text-white group-hover:text-purple-100 leading-tight">Importar JSON</p>
                                <p className="text-[10px] text-neutral-600">Carregar treinos salvos</p>
                            </div>
                        </button>

                        {/* Exportar JSON */}
                        <button
                            onClick={() => { onClose(); onExportAll() }}
                            disabled={!!exportingAll}
                            className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-gradient-to-r hover:from-neutral-500/10 hover:to-transparent transition-all duration-150 active:scale-[0.98] disabled:opacity-50"
                        >
                            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-neutral-600/30 to-neutral-700/10 border border-neutral-600/25 flex items-center justify-center flex-shrink-0">
                                {exportingAll
                                    ? <Loader2 size={14} className="text-neutral-400 animate-spin" />
                                    : <span className="text-sm font-black text-neutral-400 leading-none">↓</span>
                                }
                            </div>
                            <div className="flex-1 text-left">
                                <p className="text-[13px] font-bold text-neutral-300 group-hover:text-white leading-tight">
                                    {exportingAll ? 'Exportando...' : 'Exportar JSON'}
                                </p>
                                <p className="text-[10px] text-neutral-600">Backup dos seus treinos</p>
                            </div>
                        </button>

                        {/* Divisor */}
                        <div className="mx-3 my-1 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />

                        {/* ── GROUP: Manutenção ─────────────────────────── */}
                        <p className="px-3 pt-2 pb-1 text-[9px] font-black uppercase tracking-[0.15em] text-neutral-600">Manutenção</p>

                        {/* Padronizar nomes IA */}
                        <button
                            onClick={async () => {
                                onClose()
                                if (typeof onNormalizeAiWorkoutTitles !== 'function') return
                                try { setNormalizingAiTitles(true); await onNormalizeAiWorkoutTitles() }
                                finally { setNormalizingAiTitles(false) }
                            }}
                            disabled={normalizingAiTitles}
                            className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-gradient-to-r hover:from-yellow-500/10 hover:to-transparent transition-all duration-150 active:scale-[0.98] disabled:opacity-50"
                        >
                            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-yellow-500/15 to-amber-700/10 border border-yellow-600/20 flex items-center justify-center flex-shrink-0">
                                {normalizingAiTitles
                                    ? <Loader2 size={14} className="text-yellow-400 animate-spin" />
                                    : <Sparkles size={14} className="text-yellow-500" />
                                }
                            </div>
                            <div className="flex-1 text-left">
                                <p className="text-[13px] font-bold text-neutral-300 group-hover:text-white leading-tight">
                                    {normalizingAiTitles ? 'Padronizando...' : 'Padronizar nomes IA'}
                                </p>
                                <p className="text-[10px] text-neutral-600">Uniformizar com IA</p>
                            </div>
                        </button>

                        {/* Normalizar exercícios */}
                        <button
                            onClick={async () => {
                                onClose()
                                if (typeof onNormalizeExercises !== 'function') return
                                try { setNormalizingExercises(true); await onNormalizeExercises() }
                                finally { setNormalizingExercises(false) }
                            }}
                            disabled={normalizingExercises}
                            className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-gradient-to-r hover:from-yellow-500/10 hover:to-transparent transition-all duration-150 active:scale-[0.98] disabled:opacity-50"
                        >
                            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-yellow-500/15 to-amber-700/10 border border-yellow-600/20 flex items-center justify-center flex-shrink-0">
                                {normalizingExercises
                                    ? <Loader2 size={14} className="text-yellow-400 animate-spin" />
                                    : <span className="text-sm text-yellow-500 leading-none font-black">✦</span>
                                }
                            </div>
                            <div className="flex-1 text-left">
                                <p className="text-[13px] font-bold text-neutral-300 group-hover:text-white leading-tight">
                                    {normalizingExercises ? 'Normalizando...' : 'Normalizar exercícios'}
                                </p>
                                <p className="text-[10px] text-neutral-600">Corrigir nomes duplicados</p>
                            </div>
                        </button>

                        {/* Padronizar títulos A/B/C */}
                        <button
                            onClick={async () => {
                                onClose()
                                if (typeof onApplyTitleRule !== 'function') return
                                try { setApplyingTitleRule(true); await onApplyTitleRule() }
                                finally { setApplyingTitleRule(false) }
                            }}
                            disabled={applyingTitleRule}
                            className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-gradient-to-r hover:from-yellow-500/10 hover:to-transparent transition-all duration-150 active:scale-[0.98] disabled:opacity-50"
                        >
                            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-yellow-500/15 to-amber-700/10 border border-yellow-600/20 flex items-center justify-center flex-shrink-0">
                                {applyingTitleRule
                                    ? <Loader2 size={14} className="text-yellow-400 animate-spin" />
                                    : <span className="text-sm text-yellow-500 font-black leading-none">A</span>
                                }
                            </div>
                            <div className="flex-1 text-left">
                                <p className="text-[13px] font-bold text-neutral-300 group-hover:text-white leading-tight">
                                    {applyingTitleRule ? 'Aplicando...' : 'Padronizar títulos'}
                                </p>
                                <p className="text-[10px] text-neutral-600">Renomear A/B/C automaticamente</p>
                            </div>
                        </button>

                    </div>

                    {/* Gold bottom shimmer */}
                    <div className="h-px bg-gradient-to-r from-transparent via-yellow-500/20 to-transparent" />
                </div>
            </div>
        </>
    )
})

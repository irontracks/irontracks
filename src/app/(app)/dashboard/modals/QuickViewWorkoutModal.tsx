'use client'

import { X, ArrowLeft, Clock, Dumbbell, Zap, ChevronRight, PlayCircle } from 'lucide-react'

interface QuickViewWorkoutModalProps {
    quickViewWorkout: Record<string, unknown> | null
    setQuickViewWorkout: (v: Record<string, unknown> | null) => void
    handleStartSession: (w: unknown) => void
}

export function QuickViewWorkoutModal({
    quickViewWorkout,
    setQuickViewWorkout,
    handleStartSession,
}: QuickViewWorkoutModalProps) {
    if (!quickViewWorkout) return null
    const qw = quickViewWorkout
    const exercises = Array.isArray(qw?.exercises) ? qw.exercises as Record<string, unknown>[] : []
    const title = String(qw?.title || qw?.name || 'Treino')
    const exCount = exercises.length
    return (
        <div
            className="fixed inset-0 z-[75] bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4"
            onClick={() => setQuickViewWorkout(null)}
        >
            {/* Modal card */}
            <div
                className="relative w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-[0_-20px_80px_rgba(0,0,0,0.7)] sm:shadow-[0_40px_120px_rgba(0,0,0,0.8)] border border-white/[0.07] animate-in slide-in-from-bottom-4 sm:fade-in sm:slide-in-from-bottom-0 duration-300"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Glassmorphism bg layers */}
                <div className="absolute inset-0 bg-neutral-950/97 backdrop-blur-2xl" />
                <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/[0.06] via-transparent to-transparent pointer-events-none" />
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-500/40 to-transparent" />

                {/* Content */}
                <div className="relative">
                    {/* Handle bar (mobile) */}
                    <div className="sm:hidden flex justify-center pt-3 pb-0">
                        <div className="w-10 h-1 rounded-full bg-white/15" />
                    </div>

                    {/* Header */}
                    <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-yellow-500/25 to-amber-600/15 border border-yellow-500/30 flex items-center justify-center flex-shrink-0 shadow-lg shadow-yellow-500/10 mt-0.5">
                                <Dumbbell size={18} className="text-yellow-400" />
                            </div>
                            <div className="min-w-0">
                                <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-yellow-500/70 leading-none mb-1">Treino</div>
                                <h3 className="font-bold text-white text-lg leading-snug truncate">{title}</h3>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[11px] font-bold text-neutral-500">{exCount} exercício{exCount !== 1 ? 's' : ''}</span>
                                </div>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setQuickViewWorkout(null)}
                            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-400 hover:text-white text-[11px] font-black uppercase tracking-wider transition-all active:scale-95"
                            aria-label="Voltar"
                        >
                            <ArrowLeft size={12} />
                            Voltar
                        </button>
                    </div>

                    {/* Gold divider */}
                    <div className="mx-5 h-px bg-gradient-to-r from-transparent via-yellow-500/20 to-transparent mb-1" />

                    {/* Exercise list */}
                    <div className="px-3 py-2 max-h-[52vh] overflow-y-auto space-y-2">
                        {exCount === 0 && (
                            <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
                                <div className="w-12 h-12 rounded-2xl bg-neutral-800/60 border border-neutral-700/40 flex items-center justify-center">
                                    <Dumbbell size={20} className="text-neutral-600" />
                                </div>
                                <p className="text-neutral-500 text-sm">Este treino não tem exercícios.</p>
                            </div>
                        )}
                        {exercises.map((ex, idx) => {
                            const sets = parseInt(String(ex?.sets ?? ex?.numSets ?? '')) || 0
                            const reps = String(ex?.reps || '—')
                            const rest = ex?.restTime ? `${parseInt(String(ex.restTime))}s` : ex?.rest_time ? `${parseInt(String(ex.rest_time))}s` : null
                            const method = String(ex?.method || '')
                            const notes = String(ex?.notes || '').trim()
                            const isSpecialMethod = method && method.toLowerCase() !== 'normal' && method.toLowerCase() !== ''
                            return (
                                <div
                                    key={idx}
                                    className="group relative bg-white/[0.03] border border-white/[0.07] hover:border-yellow-500/20 hover:bg-white/[0.05] rounded-2xl p-4 transition-all duration-200"
                                >
                                    {/* Exercise number accent */}
                                    <div className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full bg-gradient-to-b from-yellow-500/60 to-yellow-500/10 ml-3" />

                                    <div className="pl-3">
                                        {/* Top row: name + sets/reps */}
                                        <div className="flex items-start justify-between gap-3 mb-2">
                                            <div className="flex items-start gap-2.5 min-w-0">
                                                <span className="flex-shrink-0 w-5 h-5 rounded-md bg-yellow-500/15 border border-yellow-500/25 flex items-center justify-center text-[10px] font-black text-yellow-400 leading-none mt-0.5">
                                                    {idx + 1}
                                                </span>
                                                <h4 className="font-bold text-white text-[13.5px] leading-snug">{String(ex?.name || '—')}</h4>
                                            </div>
                                            {sets > 0 && (
                                                <div className="flex-shrink-0 px-2.5 py-1 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                                                    <span className="text-[12px] font-black text-yellow-400">{sets} × {reps}</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Badges row */}
                                        <div className="flex flex-wrap items-center gap-1.5 ml-7">
                                            {rest && (
                                                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-neutral-800/80 border border-neutral-700/50">
                                                    <Clock size={10} className="text-yellow-500" />
                                                    <span className="text-[10.5px] font-bold text-neutral-400">Descanso: {rest}</span>
                                                </div>
                                            )}
                                            {isSpecialMethod && (
                                                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20">
                                                    <Zap size={10} className="text-violet-400" />
                                                    <span className="text-[10.5px] font-bold text-violet-400">{method}</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Notes */}
                                        {notes && (
                                            <div className="mt-2.5 ml-7 pl-3 border-l border-yellow-500/20">
                                                <p className="text-[11.5px] text-neutral-400 leading-relaxed italic">{notes}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {/* Bottom padding area */}
                    <div className="h-2" />

                    {/* Gold top-line divider before CTA */}
                    <div className="mx-5 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

                    {/* CTA Footer */}
                    <div className="p-4 flex gap-3">
                        <button
                            type="button"
                            onClick={() => setQuickViewWorkout(null)}
                            className="flex-shrink-0 w-12 h-12 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-neutral-400 hover:text-white flex items-center justify-center transition-all active:scale-95"
                            aria-label="Fechar"
                        >
                            <X size={18} />
                        </button>
                        <button
                            type="button"
                            onClick={() => { const w = quickViewWorkout; setQuickViewWorkout(null); handleStartSession(w); }}
                            className="flex-1 flex items-center justify-center gap-2.5 bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-black font-black rounded-2xl py-3.5 text-[14px] uppercase tracking-wider transition-all active:scale-[0.98] shadow-lg shadow-yellow-500/25"
                        >
                            <PlayCircle size={18} className="fill-black/20" />
                            Iniciar Treino
                            <ChevronRight size={16} className="opacity-60" />
                        </button>
                    </div>

                    {/* Safe area spacer */}
                    <div className="h-safe-bottom sm:hidden" />
                </div>
            </div>
        </div>
    )
}

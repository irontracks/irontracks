'use client'
import React, { useState, useCallback } from 'react'
import { Bot, Sparkles, Trophy, Zap, ChevronRight, RotateCcw, X } from 'lucide-react'

interface ParticipantInput {
    userId: string
    displayName: string
    totalVolume?: number
    setsCompleted?: number
    topExercise?: string
    topWeight?: number
    prsAchieved?: number
}

interface TeamInsights {
    mvp: string
    teamSummary: string[]
    highlights: string[]
    perParticipant: Record<string, string>
    nextSessionTip: string
}

interface TeamAIInsightsProps {
    sessionId?: string
    workoutName?: string
    durationMinutes?: number
    participants: ParticipantInput[]
    onClose: () => void
}

/**
 * TeamAIInsights — fetches and displays Gemini-powered comparative analysis
 * of a team workout session. Shows MVP, team highlights, per-participant
 * individual coaching tips, and a next session recommendation.
 */
export function TeamAIInsights({ sessionId, workoutName, durationMinutes, participants, onClose }: TeamAIInsightsProps) {
    const [insights, setInsights] = useState<TeamInsights | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const generate = useCallback(async () => {
        setLoading(true)
        setError(null)
        setInsights(null)
        try {
            const res = await fetch('/api/ai/team-workout-insights', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId, workoutName, durationMinutes, participants }),
            })
            const json = await res.json()
            if (!json.ok || !json.insights) throw new Error(json.error || 'Erro ao gerar insights.')
            setInsights(json.insights as TeamInsights)
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : String(e))
        } finally {
            setLoading(false)
        }
    }, [sessionId, workoutName, durationMinutes, participants])

    return (
        <div className="fixed inset-0 z-[110] bg-black/95 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
            <div className="w-full sm:max-w-sm bg-neutral-900 rounded-t-3xl sm:rounded-3xl border border-neutral-700 border-b-0 sm:border-b shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="relative px-5 pt-5 pb-3 border-b border-neutral-800 shrink-0">
                    <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center hover:bg-neutral-700 transition-colors">
                        <X size={14} className="text-white" />
                    </button>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500/30 to-purple-500/20 border border-violet-500/30 flex items-center justify-center">
                            <Bot size={18} className="text-violet-400" />
                        </div>
                        <div>
                            <h2 className="text-base font-black text-white">IA de Equipe</h2>
                            <p className="text-[11px] text-neutral-500">Análise comparativa da sessão</p>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {/* Initial state — call to action */}
                    {!loading && !insights && !error && (
                        <div className="text-center py-4">
                            <div className="w-16 h-16 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-4">
                                <Sparkles size={24} className="text-violet-400" />
                            </div>
                            <h3 className="text-base font-black text-white mb-1">Análise por IA</h3>
                            <p className="text-xs text-neutral-500 mb-5">
                                A IA vai analisar o desempenho comparativo de cada participante e gerar insights personalizados para a equipe.
                            </p>
                            <button
                                onClick={generate}
                                className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white font-black text-sm hover:from-violet-500 hover:to-purple-500 transition-all active:scale-95 shadow-lg shadow-violet-900/30"
                            >
                                ✨ Gerar Insights da Equipe
                            </button>
                        </div>
                    )}

                    {/* Loading */}
                    {loading && (
                        <div className="flex flex-col items-center justify-center py-10 gap-3">
                            <div className="w-10 h-10 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                            <p className="text-xs text-neutral-500">Analisando desempenho da equipe…</p>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center">
                            <p className="text-xs text-red-400 mb-3">{error}</p>
                            <button onClick={generate} className="flex items-center gap-1.5 text-xs text-red-400 mx-auto hover:text-red-300 transition-colors">
                                <RotateCcw size={12} /> Tentar novamente
                            </button>
                        </div>
                    )}

                    {/* Insights */}
                    {insights && (
                        <div className="space-y-4">
                            {/* MVP */}
                            {insights.mvp && (
                                <div className="rounded-2xl bg-yellow-500/10 border border-yellow-500/30 p-4 flex items-start gap-3">
                                    <Trophy size={16} className="text-yellow-400 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-[10px] text-yellow-500 font-bold uppercase tracking-wide mb-0.5">MVP da Sessão 🏆</p>
                                        <p className="text-sm text-white">{insights.mvp}</p>
                                    </div>
                                </div>
                            )}

                            {/* Team summary */}
                            {Array.isArray(insights.teamSummary) && insights.teamSummary.length > 0 && (
                                <div className="rounded-2xl bg-neutral-800/50 border border-neutral-700 p-4">
                                    <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-wide mb-2">Resumo da Equipe</p>
                                    <ul className="space-y-1.5">
                                        {insights.teamSummary.map((s, i) => (
                                            <li key={i} className="flex items-start gap-2 text-xs text-neutral-300">
                                                <ChevronRight size={10} className="text-violet-400 mt-0.5 shrink-0" />
                                                {s}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Highlights */}
                            {Array.isArray(insights.highlights) && insights.highlights.length > 0 && (
                                <div className="rounded-2xl bg-neutral-800/50 border border-neutral-700 p-4">
                                    <div className="flex items-center gap-1.5 mb-2">
                                        <Zap size={11} className="text-orange-400" />
                                        <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-wide">Destaques</p>
                                    </div>
                                    <ul className="space-y-1">
                                        {insights.highlights.map((h, i) => (
                                            <li key={i} className="text-xs text-neutral-300">🔥 {h}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Per-participant */}
                            {insights.perParticipant && Object.keys(insights.perParticipant).length > 0 && (
                                <div className="rounded-2xl bg-neutral-800/50 border border-neutral-700 p-4">
                                    <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-wide mb-3">Feedback Individual</p>
                                    <div className="space-y-3">
                                        {Object.entries(insights.perParticipant).map(([name, feedback]) => (
                                            <div key={name} className="border-l-2 border-violet-500/40 pl-3">
                                                <p className="text-[11px] text-violet-300 font-bold mb-0.5">{name}</p>
                                                <p className="text-xs text-neutral-400">{feedback}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Next session tip */}
                            {insights.nextSessionTip && (
                                <div className="rounded-xl bg-gradient-to-br from-violet-500/10 to-purple-500/10 border border-violet-500/20 p-3 flex items-start gap-2">
                                    <Sparkles size={13} className="text-violet-400 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-[10px] text-violet-400 font-bold mb-0.5">Próxima sessão</p>
                                        <p className="text-xs text-neutral-300">{insights.nextSessionTip}</p>
                                    </div>
                                </div>
                            )}

                            {/* Regenerate */}
                            <button
                                onClick={generate}
                                className="w-full py-2.5 rounded-xl border border-neutral-700 text-neutral-500 text-xs font-bold flex items-center justify-center gap-1.5 hover:text-white hover:border-neutral-600 transition-colors"
                            >
                                <RotateCcw size={11} /> Gerar novamente
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

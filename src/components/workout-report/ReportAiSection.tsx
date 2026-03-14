'use client'
import React from 'react'
import { Sparkles, Loader2, Check } from 'lucide-react'

type AnyObj = Record<string, unknown>

interface ApplyState {
    status: 'idle' | 'loading' | 'success' | 'error'
    error: string
    templateId?: string | null
}

interface ReportAiSectionProps {
    ai: AnyObj | null
    aiState: { loading: boolean; error: string | null; cached: boolean }
    credits: { insights?: { used: number; limit: number | null } } | null
    applyState: ApplyState
    onGenerateAi: () => void
    onApplyProgression: () => void

    renderAiRating: () => React.ReactNode
}

const formatLimit = (limit: number | null | undefined) => (limit == null ? '∞' : limit > 1000 ? '∞' : limit)
const isInsightsExhausted = (entry?: { used: number; limit: number | null }) => !!entry && entry.limit !== null && entry.used >= entry.limit

export const ReportAiSection = ({
    ai,
    aiState,
    credits,
    applyState,
    onGenerateAi,
    onApplyProgression,

    renderAiRating,
}: ReportAiSectionProps) => {
    return (
        <div className="mb-8 p-4 rounded-xl border border-neutral-800 bg-neutral-900/60">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400">IA</div>
                    <div className="flex items-center gap-2">
                        <div className="text-lg font-black text-white">Insights pós-treino</div>
                        {credits?.insights && (
                            <div className={`text-xs px-2 py-0.5 rounded font-mono font-bold ${isInsightsExhausted(credits.insights) ? 'bg-red-500/20 text-red-400' : 'bg-neutral-800 text-neutral-400'}`}>
                                {credits.insights.used}/{formatLimit(credits.insights.limit)}
                            </div>
                        )}
                    </div>
                    <div className="text-xs text-neutral-300">Resumo + progressão + motivação com IA IronTracks</div>
                </div>
                <div className="flex items-center gap-2 w-full md:w-auto">
                    <button
                        type="button"
                        onClick={onGenerateAi}
                        disabled={aiState?.loading}
                        className="min-h-[44px] flex-1 md:flex-none px-4 py-2 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black font-black flex items-center justify-center gap-2 disabled:opacity-60 flex-col leading-none"
                    >
                        <div className="flex items-center gap-2">
                            {aiState?.loading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                            {ai ? 'Regerar' : 'Gerar'}
                        </div>
                        {credits?.insights && (
                            <span className="text-[9px] font-mono opacity-80">
                                ({credits.insights.used}/{formatLimit(credits.insights.limit)})
                            </span>
                        )}
                    </button>

                </div>
            </div>

            {aiState?.error && (
                <div className="mt-3 text-sm font-semibold text-red-300">{aiState?.error || 'Falha ao gerar insights.'}</div>
            )}

            {ai && (
                <div className="mt-4 space-y-3">
                    {renderAiRating()}
                    {!!(ai.metrics && typeof ai.metrics === 'object') && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="bg-neutral-950 rounded-xl border border-neutral-800 p-3">
                                <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-1">Volume total</div>
                                <div className="text-lg font-mono font-bold text-white">
                                    {(() => {
                                        const v = Number((ai.metrics as AnyObj)?.totalVolumeKg || 0)
                                        if (!Number.isFinite(v) || v <= 0) return '—'
                                        return `${v.toLocaleString('pt-BR')}kg`
                                    })()}
                                </div>
                            </div>
                            <div className="bg-neutral-950 rounded-xl border border-neutral-800 p-3">
                                <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-1">Séries concluídas</div>
                                <div className="text-lg font-mono font-bold text-white">
                                    {(() => {
                                        const v = Number((ai.metrics as AnyObj)?.totalSetsDone || 0)
                                        if (!Number.isFinite(v) || v <= 0) return '—'
                                        return v.toString()
                                    })()}
                                </div>
                            </div>
                            <div className="bg-neutral-950 rounded-xl border border-neutral-800 p-3">
                                <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-1">Exercícios</div>
                                <div className="text-lg font-mono font-bold text-white">
                                    {(() => {
                                        const v = Number((ai.metrics as AnyObj)?.totalExercises || 0)
                                        if (!Number.isFinite(v) || v <= 0) return '—'
                                        return v.toString()
                                    })()}
                                </div>
                            </div>
                            <div className="bg-neutral-950 rounded-xl border border-neutral-800 p-3">
                                <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-1">Top exercício</div>
                                <div className="text-xs font-semibold text-neutral-100">
                                    {(() => {
                                        const list = Array.isArray((ai.metrics as AnyObj)?.topExercises) ? ((ai.metrics as AnyObj).topExercises as unknown[]) : []
                                        if (!list.length) return '—'
                                        const first = list[0] && typeof list[0] === 'object' ? list[0] : null
                                        if (!first) return '—'
                                        const f = first as AnyObj
                                        const name = String(f.name || '').trim() || '—'
                                        const v = Number(f.volumeKg || 0)
                                        const volumeLabel = Number.isFinite(v) && v > 0 ? `${v.toLocaleString('pt-BR')}kg` : ''
                                        return volumeLabel ? `${name} • ${volumeLabel}` : name
                                    })()}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="md:col-span-2 bg-neutral-950 rounded-xl border border-neutral-800 p-4">
                            <div className="text-xs font-black uppercase tracking-widest text-neutral-400 mb-2">Resumo</div>
                            <ul className="space-y-2">
                                {(Array.isArray(ai.summary) ? (ai.summary as unknown[]) : []).map((item: unknown, idx: number) => (
                                    <li key={idx} className="text-sm text-neutral-100">• {String(item || '')}</li>
                                ))}
                            </ul>

                            {Array.isArray(ai.highlights) && (ai.highlights as unknown[]).length > 0 && (
                                <div className="mt-4">
                                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400 mb-2">Destaques</div>
                                    <ul className="space-y-2">
                                        {(ai.highlights as unknown[]).map((item: unknown, idx: number) => (
                                            <li key={idx} className="text-sm text-neutral-100">• {String(item || '')}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {Array.isArray(ai.warnings) && (ai.warnings as unknown[]).length > 0 && (
                                <div className="mt-4">
                                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400 mb-2">Atenção</div>
                                    <ul className="space-y-2">
                                        {(ai.warnings as unknown[]).map((item: unknown, idx: number) => (
                                            <li key={idx} className="text-sm text-neutral-100">• {String(item || '')}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>

                        <div className="bg-black rounded-xl p-4 text-white">
                            <div className="text-xs font-black uppercase tracking-widest text-neutral-400 mb-2">Motivação</div>
                            <div className="text-sm font-semibold">{String(ai.motivation || '').trim() || '—'}</div>

                            {Array.isArray(ai.prs) && (ai.prs as unknown[]).length > 0 && (
                                <div className="mt-4">
                                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400 mb-2">PRs</div>
                                    <div className="space-y-2">
                                        {(ai.prs as unknown[]).map((p: unknown, idx: number) => {
                                            const pr = p && typeof p === 'object' ? (p as AnyObj) : ({} as AnyObj)
                                            return (
                                                <div key={idx} className="text-xs text-neutral-200">
                                                    <span className="font-black">{String(pr.exercise || '').trim() || '—'}</span>{' '}
                                                    <span className="text-neutral-400">{String(pr.label || '').trim() ? `(${String(pr.label).trim()})` : ''}</span>{' '}
                                                    <span className="font-semibold">{String(pr.value || '').trim()}</span>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}

                            <div className="mt-4">
                                {aiState?.cached ? (
                                    <div className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-yellow-400">
                                        <Check size={14} /> Salvo no histórico
                                    </div>
                                ) : (
                                    <div className="text-[11px] font-semibold text-neutral-400">Ao gerar, salva no histórico automaticamente.</div>
                                )}
                            </div>
                        </div>

                        {Array.isArray(ai.progression) && (ai.progression as unknown[]).length > 0 && (
                            <div className="md:col-span-3 bg-neutral-950 rounded-xl border border-neutral-800 p-4">
                                <div className="flex items-center justify-between gap-3 mb-3">
                                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Progressão sugerida (próximo treino)</div>
                                    <button
                                        type="button"
                                        onClick={onApplyProgression}
                                        disabled={applyState.status === 'loading'}
                                        className="min-h-[36px] px-3 py-1.5 rounded-full bg-black text-white text-[11px] font-bold uppercase tracking-wide flex items-center gap-2 disabled:opacity-60"
                                    >
                                        {applyState.status === 'loading' ? (
                                            <Loader2 size={14} className="animate-spin" />
                                        ) : (
                                            <Sparkles size={14} />
                                        )}
                                        <span>{applyState.status === 'success' ? 'Aplicado' : 'Aplicar no próximo treino'}</span>
                                    </button>
                                </div>
                                {applyState.status === 'error' && (
                                    <div className="mb-2 text-[11px] font-semibold text-red-300">{applyState.error}</div>
                                )}
                                {applyState.status === 'success' && (
                                    <div className="mb-2 text-[11px] font-semibold text-green-300 flex items-center gap-1">
                                        <Check size={12} />
                                        <span>Sugestões aplicadas no próximo treino.</span>
                                    </div>
                                )}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {(ai.progression as unknown[]).map((rec: unknown, idx: number) => {
                                        const r = rec && typeof rec === 'object' ? (rec as AnyObj) : ({} as AnyObj)
                                        return (
                                            <div key={idx} className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
                                                <div className="text-sm font-black text-neutral-100">{String(r.exercise || '').trim() || '—'}</div>
                                                <div className="text-sm text-neutral-100 mt-1">{String(r.recommendation || '').trim()}</div>
                                                {String(r.reason || '').trim() && (
                                                    <div className="text-xs text-neutral-400 mt-2">{String(r.reason || '').trim()}</div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        {/* ── Pain & Recovery Suggestions ───────────────────────────────── */}
                        {Array.isArray(ai.pain_suggestions) && (ai.pain_suggestions as unknown[]).length > 0 && (
                            <div className="md:col-span-3 rounded-xl border border-red-500/30 bg-red-950/20 p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="text-base">🩹</span>
                                    <div>
                                        <div className="text-xs font-black uppercase tracking-widest text-red-400">Dor &amp; Recuperação</div>
                                        <div className="text-[11px] text-red-300/70">Sugestões da IA com base nas observações de dor reportadas</div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {(ai.pain_suggestions as unknown[]).map((item: unknown, idx: number) => {
                                        const s = item && typeof item === 'object' ? (item as AnyObj) : ({} as AnyObj)
                                        const area = String(s.area || '').trim()
                                        const suggestion = String(s.suggestion || '').trim()
                                        const reason = String(s.reason || '').trim()
                                        if (!suggestion) return null
                                        return (
                                            <div key={idx} className="rounded-xl border border-red-500/20 bg-red-950/30 p-3">
                                                {area && (
                                                    <div className="inline-block mb-1.5 text-[10px] font-black uppercase tracking-widest text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">
                                                        {area}
                                                    </div>
                                                )}
                                                <div className="text-sm text-neutral-100">{suggestion}</div>
                                                {reason && (
                                                    <div className="text-xs text-red-300/60 mt-1.5">{reason}</div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

'use client'

type AnyObj = Record<string, unknown>

interface ReportCheckinPanelProps {
    preCheckin: AnyObj | null
    postCheckin: AnyObj | null
    recommendations: string[]
}

export const ReportCheckinPanel = ({ preCheckin, postCheckin, recommendations }: ReportCheckinPanelProps) => {
    if (!preCheckin && !postCheckin) return null

    return (
        <div className="mb-8 p-4 rounded-xl border border-neutral-800 bg-neutral-900/60">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                    <div className="text-xs font-black uppercase tracking-widest text-neutral-400">Check-in</div>
                    <div className="text-lg font-black text-white">Pré e Pós-treino</div>
                    <div className="text-xs text-neutral-300">Contexto rápido para evolução e ajustes.</div>
                </div>
            </div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                    <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Pré</div>
                    <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Energia</div>
                            <div className="font-black text-white">{preCheckin?.energy != null && String(preCheckin.energy) !== '' ? String(preCheckin.energy) : '—'}</div>
                        </div>
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Dor</div>
                            <div className="font-black text-white">
                                {preCheckin?.soreness != null && String(preCheckin.soreness) !== '' ? String(preCheckin.soreness) : '—'}
                            </div>
                        </div>
                        <div className="col-span-2">
                            <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Tempo disponível</div>
                            <div className="font-black text-white">
                                {preCheckin?.timeMinutes != null && String(preCheckin.timeMinutes) !== '' ? `${String(preCheckin.timeMinutes)} min` : '—'}
                            </div>
                        </div>
                        <div className="col-span-2">
                            <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Observações</div>
                            <div className="text-neutral-200">{preCheckin?.notes ? String(preCheckin.notes) : '—'}</div>
                        </div>
                    </div>
                </div>

                <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                    <div className="text-xs font-black uppercase tracking-widest text-yellow-500">Pós</div>
                    <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">RPE</div>
                            <div className="font-black text-white">{postCheckin?.rpe != null && String(postCheckin.rpe) !== '' ? String(postCheckin.rpe) : '—'}</div>
                        </div>
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Satisfação</div>
                            <div className="font-black text-white">
                                {postCheckin?.satisfaction != null && String(postCheckin.satisfaction) !== '' ? String(postCheckin.satisfaction) : '—'}
                            </div>
                        </div>
                        <div className="col-span-2">
                            <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Dor</div>
                            <div className="font-black text-white">
                                {postCheckin?.soreness != null && String(postCheckin.soreness) !== '' ? String(postCheckin.soreness) : '—'}
                            </div>
                        </div>
                        <div className="col-span-2">
                            <div className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Observações</div>
                            <div className="text-neutral-200">{postCheckin?.notes ? String(postCheckin.notes) : '—'}</div>
                        </div>
                    </div>
                </div>
            </div>
            {recommendations.length ? (
                <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                    <div className="text-xs font-black uppercase tracking-widest text-neutral-300">Recomendações</div>
                    <div className="mt-2 space-y-1 text-sm text-neutral-200">
                        {recommendations.map((r) => (
                            <div key={r}>{r}</div>
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    )
}

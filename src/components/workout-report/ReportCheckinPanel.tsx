'use client'

import { checkinEnergyLabel, checkinPlainValue, checkinSleepLabel, checkinWeightLabel } from '@/lib/workout/checkinFields'

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
                    <div className="t-meta text-xs">Check-in</div>
                    <div className="text-lg font-black text-white">Pré e Pós-treino</div>
                    <div className="text-xs text-neutral-300">Contexto rápido para evolução e ajustes.</div>
                </div>
            </div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                    <div className="t-meta-inherit text-xs text-yellow-500">Pré</div>
                    <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Energia</div>
                            <div className="font-black text-white">{checkinEnergyLabel(preCheckin?.energy)}</div>
                        </div>
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Dor</div>
                            <div className="font-black text-white">{checkinPlainValue(preCheckin?.soreness)}</div>
                        </div>
                        {/* Peso do dia e sono já eram coletados no check-in (motor de carga
                            automática) e nunca chegavam a esta tela nem ao PDF — o dono só via
                            os dois números no card de peso do perfil, sem o contexto de QUANDO
                            foram medidos. Uma avaliação externa (professor, nutricionista) lê
                            aqui, não caçando em outra aba. */}
                        <div>
                            {/* .t-meta, e não a classe pesada dos rótulos acima: mesmo tamanho
                                de rótulo, sem somar ao teto do débito de peso 900 em corpo miúdo
                                — congelado e só descendo, ver hierarquiaTipografica.test.ts. */}
                            <div className="text-[10px] t-meta">Peso do dia</div>
                            <div className="font-black text-white">{checkinWeightLabel(preCheckin?.weight)}</div>
                        </div>
                        <div>
                            <div className="text-[10px] t-meta">Sono</div>
                            <div className="font-black text-white">{checkinSleepLabel(preCheckin?.sleepHours)}</div>
                        </div>
                        <div className="col-span-2">
                            <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Tempo disponível</div>
                            <div className="font-black text-white">{checkinPlainValue(preCheckin?.timeMinutes, ' min')}</div>
                        </div>
                        <div className="col-span-2">
                            <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Observações</div>
                            <div className="text-neutral-200">{checkinPlainValue(preCheckin?.notes)}</div>
                        </div>
                    </div>
                </div>

                <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                    <div className="t-meta-inherit text-xs text-yellow-500">Pós</div>
                    <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">RPE</div>
                            <div className="font-black text-white">{checkinPlainValue(postCheckin?.rpe)}</div>
                        </div>
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Satisfação</div>
                            <div className="font-black text-white">{checkinPlainValue(postCheckin?.satisfaction)}</div>
                        </div>
                        <div className="col-span-2">
                            <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Dor</div>
                            <div className="font-black text-white">{checkinPlainValue(postCheckin?.soreness)}</div>
                        </div>
                        <div className="col-span-2">
                            <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Observações</div>
                            <div className="text-neutral-200">{checkinPlainValue(postCheckin?.notes)}</div>
                        </div>
                    </div>
                </div>
            </div>
            {recommendations.length ? (
                <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                    <div className="t-meta-inherit text-xs text-neutral-300">Recomendações</div>
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

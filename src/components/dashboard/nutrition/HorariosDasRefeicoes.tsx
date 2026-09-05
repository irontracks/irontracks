'use client'

/**
 * HorariosDasRefeicoes — a que horas cada refeição do plano acontece.
 *
 * A edição é por NOME de refeição, não por refeição de um dia: o plano da semana
 * tem ~42 refeições, e um editor com 42 campos não seria preenchido por ninguém.
 * Definir "Café da manhã 07:00" vale nos sete dias — que é como a rotina de quem
 * segue dieta funciona de verdade.
 *
 * O horário não é enfeite: é ele que faz o lembrete existir
 * (`cron/meal-reminders`). Por isso a tela DIZ isso — um campo que liga uma
 * notificação e não avisa vira surpresa no bolso do usuário.
 */

import { useEffect, useMemo, useState } from 'react'
import { Clock, Loader2 } from 'lucide-react'
import { FullscreenPortal } from '@/components/stories/FullscreenPortal'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useBackHandler } from '@/hooks/useBackHandler'
import { backdropProps, dialogProps } from '@/utils/a11y/backdrop'
import { horariosDoPlano, normalizarHorario } from '@/lib/nutrition/mealTimes'
import type { PlanDay } from '@/lib/nutrition/dietPlanShape'

export default function HorariosDasRefeicoes({
    open,
    days,
    onClose,
    onSaved,
}: {
    open: boolean
    days: PlanDay[]
    onClose: () => void
    /** Chamado depois de gravar, para a tela recarregar o plano. */
    onSaved: () => void
}) {
    const linhas = useMemo(() => horariosDoPlano(days), [days])
    const [valores, setValores] = useState<Record<string, string>>({})
    const [salvando, setSalvando] = useState(false)
    const [erro, setErro] = useState<string | null>(null)
    const focusTrapRef = useFocusTrap(open, onClose)
    useBackHandler(open, onClose)

    // Semeia a partir do que está gravado a cada abertura. Sem depender de `open`,
    // uma edição abandonada voltaria na próxima vez como se tivesse sido salva.
    useEffect(() => {
        if (!open) return
        setValores(Object.fromEntries(linhas.map((l) => [l.nome, l.time])))
        setErro(null)
        setSalvando(false)
    }, [open, linhas])

    if (!open) return null

    const salvar = async () => {
        if (salvando) return
        setSalvando(true)
        setErro(null)
        try {
            const times = Object.fromEntries(
                linhas.map((l) => [l.nome, normalizarHorario(valores[l.nome])]),
            )
            const res = await fetch('/api/nutrition/diet-plan/times', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ times }),
            })
            const json = await res.json().catch((): null => null)
            if (!res.ok || !json?.ok) {
                setErro(
                    json?.error === 'rate_limited'
                        ? 'Muitas tentativas seguidas. Espere um minuto.'
                        : 'Não consegui salvar os horários.',
                )
                return
            }
            onSaved()
            onClose()
        } catch {
            setErro('Sem conexão para salvar agora.')
        } finally {
            setSalvando(false)
        }
    }

    return (
        // Portal obrigatório: a Nutrição é um overlay `fixed z-[25]`, e quem nasce
        // dentro dela herda o stacking context — o z-[1600] valeria 25.
        <FullscreenPortal>
            <div
                className="fixed inset-0 z-[1600] flex items-end justify-center sm:items-center"
                {...dialogProps('Horários das refeições')}
            >
                <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" {...backdropProps(onClose)} />
                <div
                    ref={focusTrapRef}
                    className="relative z-10 flex max-h-[92dvh] w-full max-w-md flex-col overflow-y-auto rounded-t-3xl border border-white/[0.08] bg-neutral-950 p-4 pb-safe sm:rounded-3xl"
                >
                    <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h2 className="text-base font-bold text-white">Horários das refeições</h2>
                            <p className="mt-0.5 text-xs text-neutral-400">
                                O horário vale para todos os dias do plano. Você recebe um lembrete na hora.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="tap-44 shrink-0 rounded-xl border border-white/[0.08] px-3 py-2 text-xs font-semibold text-neutral-300 hover:text-white"
                        >
                            Fechar
                        </button>
                    </div>

                    {linhas.length === 0 ? (
                        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-xs text-neutral-400">
                            Este plano ainda não tem refeições.
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            {linhas.map((linha) => (
                                <label
                                    key={linha.nome}
                                    className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
                                >
                                    <span className="min-w-0 truncate text-sm font-semibold text-white">{linha.nome}</span>
                                    <span className="flex shrink-0 items-center gap-2">
                                        <Clock size={14} className="text-neutral-500" aria-hidden="true" />
                                        <input
                                            type="time"
                                            value={valores[linha.nome] ?? ''}
                                            onChange={(e) =>
                                                setValores((v) => ({ ...v, [linha.nome]: e.target.value }))
                                            }
                                            aria-label={`Horário de ${linha.nome}`}
                                            className="rounded-lg border border-neutral-700/50 bg-neutral-800/60 px-2 py-1.5 text-sm tabular-nums text-white"
                                        />
                                    </span>
                                </label>
                            ))}
                        </div>
                    )}

                    {erro && (
                        <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/5 p-2.5 text-[11px] text-red-300">
                            {erro}
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={salvar}
                        disabled={salvando || linhas.length === 0}
                        className="tap-44 mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-yellow-500 px-4 py-3 text-sm font-black text-black transition disabled:opacity-40"
                    >
                        {salvando && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                        {salvando ? 'Salvando...' : 'Salvar horários'}
                    </button>
                    <p className="mt-2 text-center text-[10px] text-neutral-400">
                        Deixe em branco para não ser lembrado daquela refeição.
                    </p>
                </div>
            </div>
        </FullscreenPortal>
    )
}

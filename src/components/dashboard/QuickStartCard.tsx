'use client'

import React, { memo, useCallback, useMemo, useState } from 'react'
import { Dumbbell, Loader2, Play } from 'lucide-react'
import type { DashboardWorkout } from '@/types/dashboard'
import { isWorkoutToday, pickEmphasizedWorkoutIndex } from '@/utils/workout/workoutDay'
import { estimateWorkoutMinutes } from '@/utils/workout/estimateDuration'
import { triggerHaptic } from '@/utils/native/irontracksNative'

type QuickStartCardProps = {
    workouts: DashboardWorkout[]
    onStartSession: (w: DashboardWorkout) => void | boolean | Promise<void | boolean>
    /** Com treino em andamento o card some — quem já está treinando não precisa começar. */
    hasActiveSession?: boolean
}

/**
 * "Treinar agora" — um toque, no topo.
 *
 * O caminho até levantar peso tinha cinco passos: abrir, rolar até a lista,
 * tocar Iniciar, confirmar num modal, preencher o check-in. Strong e Hevy
 * fazem em um. O modal já caiu (sprint 1) e os painéis de dados desceram
 * (sprint 2); este card fecha a conta: a ação primária do app passa a ser a
 * primeira coisa visível, com o treino certo já escolhido.
 *
 * A escolha do treino reusa `pickEmphasizedWorkoutIndex` — o de HOJE pelo dia
 * no título; se nenhum bate, o primeiro da ordem do usuário. Mesma regra do
 * selo HOJE no card, para os dois nunca discordarem na tela.
 */
function QuickStartCardInner({ workouts, onStartSession, hasActiveSession }: QuickStartCardProps) {
    const [iniciando, setIniciando] = useState(false)

    const alvo = useMemo(() => {
        const lista = (Array.isArray(workouts) ? workouts : []).filter((w) => !w?.archived_at)
        if (!lista.length) return null
        const idx = pickEmphasizedWorkoutIndex(lista.map((w) => w?.title))
        return idx >= 0 ? lista[idx] : null
    }, [workouts])

    const iniciar = useCallback(async () => {
        if (!alvo || iniciando) return
        setIniciando(true)
        triggerHaptic('medium').catch(() => { })
        try {
            await onStartSession(alvo)
        } finally {
            // Se a navegação falhar, o botão volta — travado seria pior que repetido.
            setTimeout(() => setIniciando(false), 1200)
        }
    }, [alvo, iniciando, onStartSession])

    if (hasActiveSession || !alvo) return null

    const titulo = String(alvo?.title || 'Treino').trim()
    const ehHoje = isWorkoutToday(titulo)
    // Periodizado sem hidratar tem só a CONTAGEM de exercícios — daí o fallback.
    const listaEx = Array.isArray(alvo?.exercises) ? alvo.exercises : []
    const minutos = estimateWorkoutMinutes(listaEx)
    const exercicios = listaEx.length || Number(alvo?.exercises_count) || 0

    return (
        <div
            className="mb-3 rounded-2xl p-[1px]"
            style={{ background: 'linear-gradient(135deg, rgba(234,179,8,0.35) 0%, rgba(234,179,8,0.06) 60%, rgba(234,179,8,0.22) 100%)' }}
        >
            <div className="rounded-[15px] p-4" style={{ background: 'linear-gradient(160deg, rgba(18,18,18,0.99) 0%, rgba(10,10,10,0.99) 100%)' }}>
                <div className="flex items-center gap-2 mb-1">
                    <Dumbbell className="h-4 w-4 text-yellow-500" aria-hidden="true" />
                    <span className="text-[10px] font-black uppercase tracking-[0.18em] text-yellow-600">
                        {ehHoje ? 'Treino de hoje' : 'Próximo treino'}
                    </span>
                </div>

                <div className="text-white font-black text-lg leading-tight truncate">{titulo}</div>

                {/* Meta discreta: ajuda a decidir sem competir com o título. */}
                <div className="mt-0.5 text-xs text-neutral-500">
                    {exercicios > 0 ? `${exercicios} exercício${exercicios === 1 ? '' : 's'}` : null}
                    {exercicios > 0 && minutos > 0 ? ' · ' : null}
                    {minutos > 0 ? `~${minutos} min` : null}
                </div>

                <button
                    type="button"
                    onClick={iniciar}
                    disabled={iniciando}
                    className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-yellow-500 px-4 py-3.5 text-black font-black text-sm uppercase tracking-wider active:scale-[0.98] transition-transform hover:bg-yellow-400 disabled:opacity-70"
                >
                    {iniciando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-black" />}
                    {iniciando ? 'Abrindo…' : 'Treinar agora'}
                </button>
            </div>
        </div>
    )
}

export const QuickStartCard = memo(QuickStartCardInner)

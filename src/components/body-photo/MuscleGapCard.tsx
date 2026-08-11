'use client'

/**
 * Card do botão "Ajustar treino" — o que fazer com um grupo que a correlação
 * apontou.
 *
 * O conteúdo muda com o TIPO da lacuna, e essa é a razão de o card existir:
 *   missing_pattern → exercícios do catálogo que cobrem o padrão ausente;
 *   low_volume      → subir série no que já se faz, sem exercício novo;
 *   technique       → como executar (volume já está na faixa; mandar treinar
 *                     mais seria repetir o que não funcionou).
 *
 * A justificativa é sempre MECANISMO + o dado do usuário, nunca citação de
 * estudo: referência inventada por modelo soa mais convincente que a real, e
 * este card foi desenhado para não depender de IA nenhuma.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, Dumbbell, Loader2, Play, Plus, X } from 'lucide-react'
import { listActiveWorkouts, type ActiveWorkoutOption } from '@/actions/muscleGap-actions'
import { addExerciseToWorkout } from '@/actions/workoutExercises-actions'
import { fetchMuscleGap, type MuscleGapResponse, type MuscleGapSuggestion } from '@/lib/api/muscleGap'
import { notifyWorkoutsChanged } from '@/utils/workout/persistWorkoutPlan'

interface Props {
    assessmentId: string
    muscleLabel: string
    onClose: () => void
}

const EQUIPMENT_LABEL: Record<string, string> = {
    maquina: 'máquina',
    barra: 'barra',
    halteres: 'halteres',
    cabo: 'cabo',
    peso_corporal: 'peso do corpo',
    elastico: 'elástico',
    banco: 'banco',
    barra_trap: 'barra trap',
    ab_wheel: 'roda abdominal',
}

const SetsBar = ({ value, min, max }: { value: number; min: number; max: number }) => {
    const scale = Math.max(max, value) || 1
    const pct = Math.min(100, (value / scale) * 100)
    const minPct = Math.min(100, (min / scale) * 100)
    const ok = value >= min
    return (
        <div className="mt-2">
            <div className="relative h-1.5 rounded-full bg-neutral-800 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: ok ? '#4ade80' : '#facc15' }} />
                <div className="absolute top-0 bottom-0 w-px bg-neutral-500" style={{ left: `${minPct}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-neutral-400 mt-1">
                <span>{value} séries/sem</span>
                <span>alvo {min}–{max}</span>
            </div>
        </div>
    )
}

export const MuscleGapCard: React.FC<Props> = ({ assessmentId, muscleLabel, onClose }) => {
    const [state, setState] = useState<MuscleGapResponse | null>(null)
    const [loading, setLoading] = useState(true)

    const [workouts, setWorkouts] = useState<ActiveWorkoutOption[]>([])
    const [picking, setPicking] = useState<MuscleGapSuggestion | null>(null)
    /** Treino escolhido aguardando o "sim" — escrever no treino não pode ser 1 toque. */
    const [confirmTarget, setConfirmTarget] = useState<ActiveWorkoutOption | null>(null)
    const [saving, setSaving] = useState(false)
    const [added, setAdded] = useState<string[]>([])
    const [addError, setAddError] = useState('')

    const load = useCallback(async () => {
        try {
            const res = await fetchMuscleGap(assessmentId, muscleLabel)
            setState(res)
        } finally {
            setLoading(false)
        }
    }, [assessmentId, muscleLabel])

    useEffect(() => { void load() }, [load])

    const openPicker = useCallback(async (suggestion: MuscleGapSuggestion) => {
        setAddError('')
        setConfirmTarget(null)
        setPicking(suggestion)
        if (workouts.length) return
        const res = await listActiveWorkouts()
        if (res.ok && res.data) setWorkouts(res.data)
        else setAddError(res.ok ? '' : (res.error || 'Não consegui listar seus treinos.'))
    }, [workouts.length])

    /**
     * Escolher o treino NÃO grava — arma a confirmação.
     *
     * Escrever no treino da pessoa com um toque só é fácil demais de fazer sem
     * querer, ainda mais com a lista de treinos aparecendo logo abaixo do dedo.
     * O passo a mais mostra exatamente O QUE entra e ONDE (pedido do dono).
     */
    const chooseWorkout = useCallback((workout: ActiveWorkoutOption) => {
        setAddError('')
        setConfirmTarget(workout)
    }, [])

    const confirmAdd = useCallback(async () => {
        if (!picking || !confirmTarget) return
        setSaving(true); setAddError('')
        const res = await addExerciseToWorkout({
            workoutId: confirmTarget.id,
            exerciseName: picking.name,
            muscleGroup: state?.diagnosis?.muscleLabel ?? null,
            sets: 3,
            videoUrl: picking.videoUrl,
            patternLabel: picking.patternLabel,
        })
        setSaving(false)
        if (!res.ok) { setAddError(res.error || 'Não consegui adicionar.'); return }
        setAdded((prev) => [...prev, picking.name])
        setPicking(null)
        setConfirmTarget(null)
        // Sem isto o exercício só aparecia depois de FECHAR O APP: a lista de
        // treinos é uma query cacheada e ninguém a invalidava.
        notifyWorkoutsChanged()
    }, [picking, confirmTarget, state])

    const d = state?.diagnosis

    return (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
                <div className="flex items-center gap-2 min-w-0">
                    <Dumbbell className="w-4 h-4 text-purple-300 shrink-0" />
                    <h4 className="text-sm font-black text-white truncate">
                        Ajustar treino · {d?.muscleLabel || muscleLabel}
                    </h4>
                </div>
                <button onClick={onClose} aria-label="Fechar" className="w-7 h-7 rounded-lg border border-neutral-700 text-neutral-400 hover:text-white transition flex items-center justify-center shrink-0">
                    <X className="w-4 h-4" />
                </button>
            </div>

            <div className="p-4 space-y-4">
                {loading ? (
                    <div className="py-6 flex justify-center"><Loader2 className="w-6 h-6 text-purple-300 animate-spin" /></div>
                ) : !state?.ok || !d ? (
                    <p className="text-sm text-red-400">{state?.error || 'Não consegui analisar este grupo.'}</p>
                ) : (
                    <>
                        <div>
                            <SetsBar value={d.setsPerWeek} min={d.targetMin} max={d.targetMax} />
                            {d.coverages.length ? (
                                <div className="mt-3 space-y-1">
                                    {d.coverages.map((c) => (
                                        <div key={c.patternId} className="flex items-center justify-between gap-2 text-[13px]">
                                            <span className={c.sets > 0 ? 'text-neutral-300' : 'text-neutral-400'}>
                                                {c.sets > 0 ? '✓' : '—'} {c.patternLabel}
                                            </span>
                                            <span className="text-neutral-400 shrink-0">
                                                {c.sets > 0 ? `${c.sets} séries` : 'sem estímulo'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : null}
                        </div>

                        {/* Falta padrão → exercícios do catálogo */}
                        {d.kind === 'missing_pattern' ? (
                            <div className="space-y-3">
                                {d.missingPatterns.map((p) => (
                                    <p key={p.id} className="text-[13px] leading-snug text-neutral-300">
                                        <span className="font-bold text-yellow-400">Falta {p.label.toLowerCase()}.</span> {p.why}
                                    </p>
                                ))}
                                <p className="text-[11px] text-neutral-400">
                                    Sugestão: {d.suggestedWeeklySets} séries por semana para começar.
                                </p>

                                {/* Restrição declarada: fica À VISTA junto das sugestões.
                                    O catálogo cobre padrão de movimento, não dor — quem
                                    decide o que a lombar aguenta é você, com o texto na tela. */}
                                {state.restriction ? (
                                    <div className="rounded-xl border p-3" style={{ borderColor: 'rgba(250,204,21,0.25)', background: 'rgba(250,204,21,0.06)' }}>
                                        <p className="text-[12px] font-bold text-yellow-300 flex items-center gap-1.5">
                                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Suas restrições
                                        </p>
                                        <p className="text-[12px] leading-snug text-neutral-300 mt-1">“{state.restriction.text}”</p>
                                        {state.restriction.excluded.length ? (
                                            <p className="text-[11px] text-neutral-400 mt-1.5">
                                                Tirei da lista: {state.restriction.excluded.join(', ')}.
                                            </p>
                                        ) : null}
                                        <p className="text-[11px] text-neutral-400 mt-1.5">
                                            Confira se o que sobrou respeita a sua limitação antes de adicionar.
                                        </p>
                                    </div>
                                ) : null}

                                <div className="space-y-2">
                                    {(state.suggestions ?? []).map((s) => {
                                        const done = added.includes(s.name)
                                        return (
                                            <div key={s.name} className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-bold text-white truncate">{s.name}</p>
                                                        <p className="text-[11px] text-neutral-400">
                                                            {s.equipment.length ? s.equipment.map((e) => EQUIPMENT_LABEL[e] ?? e).join(' · ') : 'sem equipamento definido'}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        {s.videoUrl ? (
                                                            <a href={s.videoUrl} target="_blank" rel="noopener noreferrer"
                                                                className="w-8 h-8 rounded-lg border border-neutral-700 text-neutral-400 hover:text-white transition flex items-center justify-center"
                                                                aria-label={`Ver vídeo de ${s.name}`}>
                                                                <Play className="w-3.5 h-3.5" />
                                                            </a>
                                                        ) : null}
                                                        <button
                                                            onClick={() => openPicker(s)}
                                                            disabled={done}
                                                            className="inline-flex items-center gap-1 min-h-[32px] px-2.5 rounded-lg border text-[12px] font-bold transition active:scale-95 disabled:opacity-60"
                                                            style={done
                                                                ? { background: 'rgba(34,197,94,0.1)', borderColor: 'rgba(34,197,94,0.3)', color: '#4ade80' }
                                                                : { background: 'rgba(168,85,247,0.08)', borderColor: 'rgba(168,85,247,0.3)', color: '#d8b4fe' }}
                                                        >
                                                            {done ? <><Check className="w-3.5 h-3.5" /> Adicionado</> : <><Plus className="w-3.5 h-3.5" /> Adicionar</>}
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Escolha do treino — o card nunca escreve sem passar por aqui */}
                                                {picking?.name === s.name ? (
                                                    <div className="mt-3 pt-3 border-t border-neutral-800 space-y-1.5">
                                                        {confirmTarget ? (
                                                            /* Confirmação: mostra O QUE entra e ONDE antes de gravar. */
                                                            <div className="rounded-xl border p-3" style={{ borderColor: 'rgba(168,85,247,0.3)', background: 'rgba(168,85,247,0.06)' }}>
                                                                <p className="text-[13px] leading-snug text-neutral-200">
                                                                    Adicionar <span className="font-black text-white">{s.name}</span> em{' '}
                                                                    <span className="font-black text-white">{confirmTarget.name}</span>?
                                                                </p>
                                                                <p className="text-[11px] text-neutral-400 mt-1">
                                                                    Entra no fim do treino, com 3 séries em branco.
                                                                </p>
                                                                <div className="flex items-center gap-2 mt-3">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setConfirmTarget(null)}
                                                                        disabled={saving}
                                                                        className="flex-1 min-h-[40px] rounded-lg border border-neutral-700 text-neutral-300 text-[13px] font-bold transition active:scale-95 disabled:opacity-50"
                                                                    >
                                                                        Não
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={confirmAdd}
                                                                        disabled={saving}
                                                                        className="flex-1 min-h-[40px] rounded-lg text-black text-[13px] font-black transition active:scale-95 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                                                                        style={{ background: '#d8b4fe' }}
                                                                    >
                                                                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                                                        {saving ? 'Adicionando…' : 'Sim, adicionar'}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <p className="text-[11px] uppercase tracking-wide font-bold text-neutral-400">
                                                                    Em qual treino? Entra no fim, com 3 séries em branco.
                                                                </p>
                                                                {workouts.length === 0 ? (
                                                                    <p className="text-[13px] text-neutral-400">Nenhum treino ativo encontrado.</p>
                                                                ) : workouts.map((w) => (
                                                                    <button
                                                                        key={w.id}
                                                                        onClick={() => chooseWorkout(w)}
                                                                        disabled={saving}
                                                                        className="w-full flex items-center justify-between gap-2 min-h-[38px] px-3 rounded-lg border border-neutral-700 text-left hover:border-purple-400/40 transition disabled:opacity-50"
                                                                    >
                                                                        <span className="text-[13px] text-neutral-200 truncate">{w.name}</span>
                                                                        <span className="text-[11px] text-neutral-400 shrink-0">{w.exerciseCount} ex.</span>
                                                                    </button>
                                                                ))}
                                                                <button onClick={() => { setPicking(null); setConfirmTarget(null) }} className="text-[12px] text-neutral-400 underline underline-offset-2 mt-1">
                                                                    Cancelar
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                ) : null}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        ) : null}

                        {/* Falta volume → nada de exercício novo */}
                        {d.kind === 'low_volume' ? (
                            <div className="space-y-2">
                                <p className="text-[13px] leading-snug text-neutral-300">
                                    <span className="font-bold text-yellow-400">O que falta é volume.</span>{' '}
                                    Os padrões do grupo já estão cobertos — suba de {d.setsPerWeek} para{' '}
                                    <span className="text-white font-bold">{d.suggestedWeeklySets} séries por semana</span> no que você já faz,
                                    antes de acrescentar exercício novo.
                                </p>
                                {d.coverages.some((c) => c.exercises.length) ? (
                                    <p className="text-[11px] text-neutral-400">
                                        Já no seu treino: {d.coverages.flatMap((c) => c.exercises).slice(0, 4).join(', ')}.
                                    </p>
                                ) : null}
                            </div>
                        ) : null}

                        {/* Execução → como, não quanto */}
                        {d.kind === 'technique' ? (
                            <div className="space-y-2">
                                <p className="text-[13px] leading-snug text-neutral-300">
                                    <span className="font-bold text-yellow-400">Volume não é o gargalo.</span>{' '}
                                    São {d.setsPerWeek} séries por semana, acima do mínimo de {d.targetMin} — e o físico não acompanhou.
                                    Mais série tende a repetir o resultado; o ajuste é de execução.
                                </p>
                                <ul className="space-y-1.5">
                                    {(state.techniqueCues ?? []).map((cue, i) => (
                                        <li key={i} className="flex items-start gap-2 text-[13px] text-neutral-300">
                                            <span className="mt-1 text-purple-300">•</span><span className="leading-snug">{cue}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : null}

                        {d.kind === 'ok' ? (
                            <p className="text-[13px] text-neutral-400">
                                Este grupo está coberto: volume dentro da faixa e todos os padrões com estímulo.
                            </p>
                        ) : null}

                        {addError ? (
                            <div className="flex items-start gap-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2">
                                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                <p className="text-[13px] text-red-300 leading-snug">{addError}</p>
                            </div>
                        ) : null}

                        {added.length ? (
                            <p className="text-[12px] text-emerald-400">
                                {added.join(', ')} {added.length > 1 ? 'foram adicionados' : 'foi adicionado'} — abra o treino para ajustar carga e repetições.
                            </p>
                        ) : null}
                    </>
                )}
            </div>
        </div>
    )
}

/** Seta do botão que abre o card, para o chamador não precisar importar ícone. */
export const MuscleGapToggleIcon = ChevronDown

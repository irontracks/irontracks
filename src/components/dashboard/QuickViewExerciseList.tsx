'use client'

/**
 * Lista de exercícios da visualização rápida do treino, com modo "Organizar".
 *
 * Extraída do DashboardModals (que já é enorme) quando ganhou a reordenação.
 * O visual do modo leitura é o mesmo de antes — número, séries × reps, badges de
 * descanso/método e as notas.
 *
 * Reordenar usa `Reorder` do framer-motion, igual ao modal que organiza a LISTA
 * de treinos (EditWorkoutListModal): mesma gramática de arrastar em duas telas
 * que fazem a mesma coisa, em vez de inventar um segundo jeito.
 *
 * A ordem só vai pro banco no "Salvar" — arrastar mexe num rascunho local, e
 * "Cancelar" devolve a ordem original sem tocar em nada.
 */

import React, { useCallback, useMemo, useState } from 'react'
import { Reorder, useDragControls } from 'framer-motion'
import { AlertTriangle, Check, Clock, Dumbbell, GripVertical, Loader2, ListOrdered, X, Zap } from 'lucide-react'
import { reorderWorkoutExercises } from '@/actions/workoutExercises-actions'

type ExerciseRecord = Record<string, unknown>

interface Props {
    workoutId: string | null
    exercises: ExerciseRecord[]
    /** Treino em execução não pode ser reordenado — os logs são indexados por posição. */
    canReorder: boolean
}

const exerciseKey = (ex: ExerciseRecord, idx: number): string =>
    String(ex?.id ?? `idx-${idx}`)

const ExerciseBody = ({ ex, index }: { ex: ExerciseRecord; index: number }) => {
    const sets = parseInt(String(ex?.sets ?? ex?.numSets ?? '')) || 0
    const reps = String(ex?.reps || '—')
    const rest = ex?.restTime ? `${parseInt(String(ex.restTime))}s` : ex?.rest_time ? `${parseInt(String(ex.rest_time))}s` : null
    const method = String(ex?.method || '')
    const notes = String(ex?.notes || '').trim()
    const isSpecialMethod = method && method.toLowerCase() !== 'normal' && method.toLowerCase() !== ''

    return (
        <div className="pl-3">
            <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-start gap-2.5 min-w-0">
                    <span className="flex-shrink-0 w-5 h-5 rounded-md bg-yellow-500/15 border border-yellow-500/25 flex items-center justify-center text-[10px] font-black text-yellow-400 leading-none mt-0.5">
                        {index + 1}
                    </span>
                    <h4 className="font-bold text-white text-[13.5px] leading-snug">{String(ex?.name || '—')}</h4>
                </div>
                {sets > 0 && (
                    <div className="flex-shrink-0 px-2.5 py-1 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                        <span className="text-[12px] font-black text-yellow-400">{sets} × {reps}</span>
                    </div>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 ml-7">
                {rest && (
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-neutral-800/80 border border-neutral-700/50">
                        <Clock size={10} className="text-yellow-500" />
                        <span className="text-[10.5px] font-bold text-neutral-400">Descanso: {rest}</span>
                    </div>
                )}
                {isSpecialMethod && (
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
                        <Zap size={10} className="text-amber-400" />
                        <span className="text-[10.5px] font-bold text-amber-400">{method}</span>
                    </div>
                )}
            </div>

            {notes && (
                <div className="mt-2.5 ml-7 pl-3 border-l border-yellow-500/20">
                    <p className="text-[11.5px] text-neutral-400 leading-relaxed italic">{notes}</p>
                </div>
            )}
        </div>
    )
}

/** Item arrastável: o drag sai do handle, não do card — senão rolar a lista vira arrastar. */
const SortableExercise = ({ ex, index }: { ex: ExerciseRecord; index: number }) => {
    const controls = useDragControls()
    return (
        <Reorder.Item
            value={ex}
            dragListener={false}
            dragControls={controls}
            className="relative bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4 list-none"
        >
            <div className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full bg-gradient-to-b from-yellow-500/60 to-yellow-500/10 ml-3" />
            <div className="flex items-start gap-2">
                <button
                    type="button"
                    onPointerDown={(e) => controls.start(e)}
                    className="mt-1 p-1.5 -ml-1 rounded-lg text-neutral-500 hover:text-yellow-400 touch-none cursor-grab active:cursor-grabbing"
                    aria-label={`Arrastar ${String(ex?.name || 'exercício')}`}
                >
                    <GripVertical size={16} />
                </button>
                <div className="flex-1 min-w-0">
                    <ExerciseBody ex={ex} index={index} />
                </div>
            </div>
        </Reorder.Item>
    )
}

export const QuickViewExerciseList: React.FC<Props> = ({ workoutId, exercises, canReorder }) => {
    const [organizing, setOrganizing] = useState(false)
    const [draft, setDraft] = useState<ExerciseRecord[]>([])
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    /** Reordenar exige id em TODOS: sem id não há o que mandar pro banco. */
    const allHaveId = useMemo(
        () => exercises.length > 0 && exercises.every((ex) => String(ex?.id || '').trim().length > 0),
        [exercises],
    )
    const reorderEnabled = canReorder && allHaveId && !!workoutId && exercises.length > 1

    const start = useCallback(() => {
        setDraft(exercises)
        setError('')
        setOrganizing(true)
    }, [exercises])

    const cancel = useCallback(() => {
        setOrganizing(false)
        setDraft([])
        setError('')
    }, [])

    const save = useCallback(async () => {
        if (!workoutId) return
        setSaving(true); setError('')
        const res = await reorderWorkoutExercises(workoutId, draft.map((ex) => String(ex.id)))
        setSaving(false)
        if (!res.ok) { setError(res.error || 'Não consegui salvar a ordem.'); return }
        // Mesma invalidação que o resto do app usa depois de escrever em treino —
        // sem isso a nova ordem só apareceria reabrindo o app.
        try { window.dispatchEvent(new CustomEvent('irontracks:workouts-changed')) } catch { /* sem window */ }
        setOrganizing(false)
        setDraft([])
    }, [workoutId, draft])

    const list = organizing ? draft : exercises

    return (
        <div className="px-3 py-2 flex-1 min-h-0 overflow-y-auto space-y-2">
            {exercises.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-neutral-800/60 border border-neutral-700/40 flex items-center justify-center">
                        <Dumbbell size={20} className="text-neutral-600" />
                    </div>
                    <p className="text-neutral-500 text-sm">Este treino não tem exercícios.</p>
                </div>
            )}

            {reorderEnabled && (
                <div className="flex items-center justify-between gap-2 px-1 pb-1">
                    {organizing ? (
                        <>
                            <span className="text-[11px] text-neutral-500">Arraste pelo punho para reordenar.</span>
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={cancel}
                                    disabled={saving}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-neutral-700 text-neutral-300 text-[11px] font-bold transition active:scale-95 disabled:opacity-50"
                                >
                                    <X size={12} /> Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={save}
                                    disabled={saving}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-black text-[11px] font-black bg-yellow-500 transition active:scale-95 disabled:opacity-50"
                                >
                                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Salvar ordem
                                </button>
                            </div>
                        </>
                    ) : (
                        <button
                            type="button"
                            onClick={start}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-neutral-300 hover:text-yellow-400 text-[11px] font-bold uppercase tracking-wide transition active:scale-95"
                        >
                            <ListOrdered size={12} /> Organizar
                        </button>
                    )}
                </div>
            )}

            {error ? (
                <div className="flex items-start gap-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2">
                    <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
                    <p className="text-[12px] text-red-300 leading-snug">{error}</p>
                </div>
            ) : null}

            {organizing ? (
                <Reorder.Group axis="y" values={draft} onReorder={setDraft} className="space-y-2 m-0 p-0">
                    {draft.map((ex, idx) => (
                        <SortableExercise key={exerciseKey(ex, idx)} ex={ex} index={idx} />
                    ))}
                </Reorder.Group>
            ) : (
                list.map((ex, idx) => (
                    <div
                        key={exerciseKey(ex, idx)}
                        className="group relative bg-white/[0.03] border border-white/[0.07] hover:border-yellow-500/20 hover:bg-white/[0.05] rounded-2xl p-4 transition-all duration-200"
                    >
                        <div className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full bg-gradient-to-b from-yellow-500/60 to-yellow-500/10 ml-3" />
                        <ExerciseBody ex={ex} index={idx} />
                    </div>
                ))
            )}
        </div>
    )
}

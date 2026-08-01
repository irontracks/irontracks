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
import { Reorder } from 'framer-motion'
import { AlertTriangle, Check, Clock, Dumbbell, GripVertical, Loader2, ListOrdered, Trash2, X, Zap } from 'lucide-react'
import { deleteWorkoutExercise, reorderWorkoutExercises } from '@/actions/workoutExercises-actions'
import { notifyWorkoutsChanged } from '@/utils/workout/persistWorkoutPlan'

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

/**
 * Item arrastável: o CARD INTEIRO é o alvo do arraste.
 *
 * A primeira versão exigia pegar num punho de 16px — difícil de acertar no dedo
 * e fácil de errar. E, ao segurar, o texto do card era selecionado pelo
 * navegador: as palavras ficavam grifadas e a leitura embolava.
 *
 * Correções, todas necessárias juntas:
 *  - `dragListener` volta ao padrão (card inteiro arrasta);
 *  - `select-none` + `WebkitUserSelect` matam o "grifado" no toque longo;
 *  - `WebkitTouchCallout: none` impede o menu de copiar do iOS;
 *  - `touch-none` entrega o gesto ao drag em vez de disputar com o scroll.
 *    Como só existe no modo Organizar, o scroll normal da lista segue intacto.
 */
const SortableExercise = ({ ex, index }: { ex: ExerciseRecord; index: number }) => (
    <Reorder.Item
        value={ex}
        className="relative bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4 list-none select-none touch-none cursor-grab active:cursor-grabbing active:border-yellow-500/40 active:bg-white/[0.07]"
        style={{ WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
        whileDrag={{ scale: 1.02, zIndex: 10 }}
    >
        <div className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full bg-gradient-to-b from-yellow-500/60 to-yellow-500/10 ml-3" />
        <div className="flex items-start gap-2">
            <span className="mt-1 p-1.5 -ml-1 text-neutral-500" aria-hidden="true">
                <GripVertical size={16} />
            </span>
            <div className="flex-1 min-w-0">
                <ExerciseBody ex={ex} index={index} />
            </div>
        </div>
    </Reorder.Item>
)

export const QuickViewExerciseList: React.FC<Props> = ({ workoutId, exercises, canReorder }) => {
    const [organizing, setOrganizing] = useState(false)
    const [draft, setDraft] = useState<ExerciseRecord[]>([])
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    /** Exclusão pede confirmação no próprio card — é destrutiva e não tem desfazer. */
    const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)
    const [deleting, setDeleting] = useState<string | null>(null)
    const [removed, setRemoved] = useState<string[]>([])

    /** Reordenar exige id em TODOS: sem id não há o que mandar pro banco. */
    const allHaveId = useMemo(
        () => exercises.length > 0 && exercises.every((ex) => String(ex?.id || '').trim().length > 0),
        [exercises],
    )
    const reorderEnabled = canReorder && allHaveId && !!workoutId && exercises.length > 1
    /** Excluir usa a MESMA trava do reordenar (treino não iniciado), mas vale já com 1 exercício. */
    const canDelete = canReorder && !!workoutId && !organizing

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
        notifyWorkoutsChanged()
        setOrganizing(false)
        setDraft([])
    }, [workoutId, draft])

    const remove = useCallback(async (ex: ExerciseRecord) => {
        if (!workoutId) return
        const exId = String(ex?.id || '')
        setDeleting(exId); setError('')
        const res = await deleteWorkoutExercise(workoutId, exId)
        setDeleting(null)
        if (!res.ok) { setError(res.error || 'Não consegui excluir.'); return }
        setRemoved((prev) => [...prev, exId])
        setConfirmingDelete(null)
        notifyWorkoutsChanged()
    }, [workoutId])

    // Some da tela na hora; a lista real chega no refetch disparado acima.
    const visible = useMemo(
        () => (organizing ? draft : exercises).filter((ex) => !removed.includes(String(ex?.id || ''))),
        [organizing, draft, exercises, removed],
    )

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
                            <span className="text-[11px] text-neutral-500">Arraste os cards para reordenar.</span>
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
                <Reorder.Group axis="y" values={draft} onReorder={setDraft} className="space-y-2 m-0 p-0 select-none">
                    {draft.map((ex, idx) => (
                        <SortableExercise key={exerciseKey(ex, idx)} ex={ex} index={idx} />
                    ))}
                </Reorder.Group>
            ) : (
                visible.map((ex, idx) => {
                    const exId = String(ex?.id || '')
                    const confirming = confirmingDelete === exId
                    const isDeleting = deleting === exId
                    return (
                        <div
                            key={exerciseKey(ex, idx)}
                            className="group relative bg-white/[0.03] border border-white/[0.07] hover:border-yellow-500/20 hover:bg-white/[0.05] rounded-2xl p-4 transition-all duration-200"
                        >
                            <div className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full bg-gradient-to-b from-yellow-500/60 to-yellow-500/10 ml-3" />
                            <ExerciseBody ex={ex} index={idx} />

                            {canDelete && exId ? (
                                confirming ? (
                                    <div className="mt-3 ml-3 pl-3 flex items-center gap-2 border-l border-red-500/25">
                                        <p className="text-[12px] text-neutral-300 flex-1">Excluir do treino?</p>
                                        <button
                                            type="button"
                                            onClick={() => setConfirmingDelete(null)}
                                            disabled={isDeleting}
                                            className="px-2.5 py-1 rounded-lg border border-neutral-700 text-neutral-300 text-[11px] font-bold transition active:scale-95 disabled:opacity-50"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => remove(ex)}
                                            disabled={isDeleting}
                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-white text-[11px] font-black transition active:scale-95 disabled:opacity-50"
                                            style={{ background: 'rgba(239,68,68,0.9)' }}
                                        >
                                            {isDeleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />} Excluir
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => { setConfirmingDelete(exId); setError('') }}
                                        className="absolute top-3 right-3 p-1.5 rounded-lg text-neutral-600 hover:text-red-400 transition"
                                        aria-label={`Excluir ${String(ex?.name || 'exercício')} do treino`}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                )
                            ) : null}
                        </div>
                    )
                })
            )}
        </div>
    )
}

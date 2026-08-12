'use client'

/**
 * Lista de exercícios da visualização rápida do treino, com modo "Organizar".
 *
 * Extraída do DashboardModals (que já é enorme) quando ganhou a reordenação.
 * O visual do modo leitura é o mesmo de antes — número, séries × reps, badges de
 * descanso/método e as notas.
 *
 * Reordenar tem DOIS caminhos, de propósito: setas ↑ ↓ (sempre funcionam) e
 * arrastar (`Reorder` do framer-motion, a mesma gramática do modal que organiza
 * a lista de treinos). O arraste sozinho já falhou duas vezes em device real —
 * disputa com o scroll da lista e é difícil de acertar no dedo.
 *
 * Cada movimento PERSISTE na hora. A versão que guardava rascunho e esperava um
 * "Salvar ordem" produziu o relato "organizei e não mudou": nos logs do
 * servidor, a requisição de reordenação nunca chegou.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Reorder, useDragControls } from 'framer-motion'
import { AlertTriangle, Check, ChevronDown, ChevronUp, Clock, Dumbbell, GripVertical, Loader2, ListOrdered, Trash2, Zap } from 'lucide-react'
import { deleteWorkoutExercise, reorderWorkoutExercises } from '@/actions/workoutExercises-actions'
import { notifyWorkoutsChanged } from '@/utils/workout/persistWorkoutPlan'

type ExerciseRecord = Record<string, unknown>

interface Props {
    workoutId: string | null
    exercises: ExerciseRecord[]
    /** Treino em execução não pode ser reordenado — os logs são indexados por posição. */
    canReorder: boolean
    /**
     * Avisa o PAI da nova lista, na hora.
     *
     * Sem isto, "Iniciar treino" partia do objeto que a tela tinha ao abrir: o
     * usuário apagava um exercício, entrava no treino ali mesmo e ele ainda
     * estava lá — o refetch só chegava depois. Quem inicia a sessão precisa da
     * lista que está na TELA, não da que estava no cache.
     */
    onExercisesChange?: (next: ExerciseRecord[]) => void
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

/** Segurar por este tempo arma o arraste. Abaixo disso, o gesto é scroll. */
const LONG_PRESS_MS = 260
/** Mover mais que isso antes de armar = rolagem; cancela o arraste. */
const MOVE_TOLERANCE_PX = 10

/**
 * Item arrastável: o CARD INTEIRO arrasta, mas só depois de SEGURAR.
 *
 * Duas correções empilhadas, cada uma de um relato:
 *
 *  1. punho de 16px era difícil de acertar no dedo → o card todo virou alvo;
 *  2. com o card todo arrastável e `touch-action: none`, a lista PAROU DE
 *     ROLAR — qualquer toque virava arraste. Agora vale o gesto que o usuário
 *     de fato fez: deslizou, rola; segurou ~260ms, arrasta.
 *
 * `touchAction` só vira 'none' DEPOIS de armar; até lá fica 'pan-y' e o
 * navegador cuida do scroll normalmente.
 *
 * `select-none` + WebKit matam o texto grifado ao segurar (o toque longo
 * selecionava as palavras e a leitura embolava).
 */
const SortableExercise = ({ ex, index, total, onMove, onDragDone }: {
    ex: ExerciseRecord
    index: number
    total: number
    onMove: (index: number, direction: -1 | 1) => void
    onDragDone: () => void
}) => {
    const controls = useDragControls()
    const [armed, setArmed] = useState(false)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const startPos = useRef<{ x: number; y: number } | null>(null)

    const clearTimer = useCallback(() => {
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    }, [])

    // Solta o timer se o componente sair antes do long press completar.
    useEffect(() => clearTimer, [clearTimer])

    const onPointerDown = useCallback((e: React.PointerEvent) => {
        const native = e.nativeEvent
        startPos.current = { x: e.clientX, y: e.clientY }
        clearTimer()
        timerRef.current = setTimeout(() => {
            setArmed(true)
            try { navigator.vibrate?.(15) } catch { /* sem haptics */ }
            controls.start(native)
        }, LONG_PRESS_MS)
    }, [controls, clearTimer])

    const onPointerMove = useCallback((e: React.PointerEvent) => {
        if (armed || !startPos.current) return
        const dx = Math.abs(e.clientX - startPos.current.x)
        const dy = Math.abs(e.clientY - startPos.current.y)
        // Moveu antes de armar: é rolagem, não arraste.
        if (dx > MOVE_TOLERANCE_PX || dy > MOVE_TOLERANCE_PX) clearTimer()
    }, [armed, clearTimer])

    const release = useCallback(() => {
        clearTimer()
        setArmed(false)
        startPos.current = null
    }, [clearTimer])

    return (
        <Reorder.Item
            value={ex}
            dragListener={false}
            dragControls={controls}
            onDragEnd={() => { release(); onDragDone() }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={release}
            onPointerCancel={release}
            className={`relative bg-white/[0.03] border rounded-2xl p-4 list-none select-none transition-colors ${armed ? 'border-yellow-500/50 bg-white/[0.07]' : 'border-white/[0.07]'}`}
            style={{
                WebkitUserSelect: 'none',
                WebkitTouchCallout: 'none',
                touchAction: armed ? 'none' : 'pan-y',
                cursor: armed ? 'grabbing' : 'grab',
            }}
            whileDrag={{ scale: 1.03, zIndex: 10 }}
        >
            <div className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full bg-gradient-to-b from-yellow-500/60 to-yellow-500/10 ml-3" />
            <div className="flex items-start gap-2">
                <span className={`mt-1 p-1.5 -ml-1 transition-colors ${armed ? 'text-yellow-400' : 'text-neutral-400'}`} aria-hidden="true">
                    <GripVertical size={16} />
                </span>
                <div className="flex-1 min-w-0">
                    <ExerciseBody ex={ex} index={index} />
                </div>
                {/*
                 * Setas: o caminho que SEMPRE funciona.
                 * Arrastar em WebView disputa com o scroll e falhou duas vezes em
                 * device real. Um toque não tem ambiguidade de gesto — e cada
                 * toque já salva, sem depender de um "confirmar" no fim.
                 * O arraste continua disponível para quem preferir.
                 */}
                <div className="flex flex-col gap-1 shrink-0" onPointerDown={(e) => e.stopPropagation()}>
                    <button
                        type="button"
                        onClick={() => onMove(index, -1)}
                        disabled={index === 0}
                        className="tap-44 w-8 h-8 rounded-lg border border-neutral-700 text-neutral-300 flex items-center justify-center transition active:scale-90 disabled:opacity-25"
                        aria-label={`Mover ${String(ex?.name || 'exercício')} para cima`}
                    >
                        <ChevronUp size={16} />
                    </button>
                    <button
                        type="button"
                        onClick={() => onMove(index, 1)}
                        disabled={index === total - 1}
                        className="tap-44 w-8 h-8 rounded-lg border border-neutral-700 text-neutral-300 flex items-center justify-center transition active:scale-90 disabled:opacity-25"
                        aria-label={`Mover ${String(ex?.name || 'exercício')} para baixo`}
                    >
                        <ChevronDown size={16} />
                    </button>
                </div>
            </div>
        </Reorder.Item>
    )
}

export const QuickViewExerciseList: React.FC<Props> = ({ workoutId, exercises, canReorder, onExercisesChange }) => {
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

    const finish = useCallback(() => {
        setOrganizing(false)
        setDraft([])
        setError('')
    }, [])

    /**
     * Persiste a ordem IMEDIATAMENTE, a cada movimento.
     *
     * A versão anterior guardava um rascunho e dependia de um botão de confirmar no
     * fim — e o relato foi "organizei e não mudou": nos logs, a requisição de
     * reordenação NUNCA chegou ao servidor. Depender de um segundo toque para
     * confirmar é um passo a mais para dar errado. Cada movimento já vale.
     */
    const persistOrder = useCallback(async (next: ExerciseRecord[]) => {
        if (!workoutId) return
        setSaving(true); setError('')
        const res = await reorderWorkoutExercises(workoutId, next.map((ex) => String(ex.id)))
        setSaving(false)
        if (!res.ok) {
            setError(res.error || 'Não consegui salvar a ordem.')
            setDraft(exercises)   // volta ao que o banco tem
            return
        }
        // O pai recebe a ordem nova ANTES do refetch chegar: quem tocar em
        // "Iniciar treino" logo em seguida parte da lista que está na tela.
        onExercisesChange?.(next)
        notifyWorkoutsChanged()
    }, [workoutId, exercises, onExercisesChange])

    /** Move um item uma posição e salva. Setas funcionam em qualquer WebView. */
    const move = useCallback((index: number, direction: -1 | 1) => {
        const target = index + direction
        if (target < 0 || target >= draft.length) return
        const next = [...draft]
        const [item] = next.splice(index, 1)
        next.splice(target, 0, item)
        setDraft(next)
        void persistOrder(next)
    }, [draft, persistOrder])

    /** Fim do arraste: o framer já reordenou o rascunho, aqui só persistimos. */
    const handleDragEnd = useCallback(() => { void persistOrder(draft) }, [draft, persistOrder])

    const remove = useCallback(async (ex: ExerciseRecord) => {
        if (!workoutId) return
        const exId = String(ex?.id || '')
        setDeleting(exId); setError('')
        const res = await deleteWorkoutExercise(workoutId, exId)
        setDeleting(null)
        if (!res.ok) { setError(res.error || 'Não consegui excluir.'); return }
        setRemoved((prev) => [...prev, exId])
        setConfirmingDelete(null)
        // Idem: o "Iniciar treino" daqui não pode levar o exercício que acabou
        // de sair da tela — era esse o relato ("apaguei, entrei no treino e ele
        // ainda estava lá").
        onExercisesChange?.(exercises.filter((e) => String(e?.id || '') !== exId))
        notifyWorkoutsChanged()
    }, [workoutId, exercises, onExercisesChange])

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
                    <p className="text-neutral-400 text-sm">Este treino não tem exercícios.</p>
                </div>
            )}

            {reorderEnabled && (
                <div className="flex items-center justify-between gap-2 px-1 pb-1">
                    {organizing ? (
                        <>
                            <span className="text-[11px] text-neutral-400">
                                {saving ? 'Salvando…' : 'Use ↑ ↓ para mover. Salva sozinho.'}
                            </span>
                            <button
                                type="button"
                                onClick={finish}
                                disabled={saving}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-black text-[11px] font-black bg-yellow-500 transition active:scale-95 disabled:opacity-50"
                            >
                                {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Concluir
                            </button>
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
                        <SortableExercise key={exerciseKey(ex, idx)} ex={ex} index={idx} total={draft.length} onMove={move} onDragDone={handleDragEnd} />
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

                            {/* Excluir fica no RODAPÉ do card, nunca sobreposto: em absolute
                                no topo direito ele caía em cima do badge "4 × 10-12". */}
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
                                    <div className="mt-2 ml-7 pl-3 flex justify-end">
                                        <button
                                            type="button"
                                            onClick={() => { setConfirmingDelete(exId); setError('') }}
                                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-neutral-400 hover:text-red-400 transition active:scale-95"
                                            aria-label={`Excluir ${String(ex?.name || 'exercício')} do treino`}
                                        >
                                            <Trash2 size={12} /> Excluir
                                        </button>
                                    </div>
                                )
                            ) : null}
                        </div>
                    )
                })
            )}
        </div>
    )
}

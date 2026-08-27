'use client'

import React, { useState, useRef, useCallback } from 'react'
import { Share2, Pencil, Trash2, Loader2, Undo2, MoreHorizontal, ChevronLeft, Play } from 'lucide-react'
import type { DashboardWorkout } from '@/types/dashboard'
import { isPeriodizedWorkoutFullyLoaded } from '@/hooks/usePeriodizedWorkouts'
import { pluralize } from '@/utils/format/plural'
import { estimateWorkoutMinutes, countTotalSets } from '@/utils/workout/estimateDuration'

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

type MaybePromise<T> = T | Promise<T>

type PendingActionType = 'open' | 'start' | 'restore' | 'share' | 'duplicate' | 'edit' | 'delete'

interface WorkoutCardProps {
  workout: DashboardWorkout
  idx: number
  density: 'compact' | 'comfortable'
  isPeriodized: boolean
  /** Treino cujo dia (prefixo do título: "SEG · …") bate com hoje. */
  isToday?: boolean
  /** Card com o CTA em destaque (sólido dourado). Os demais ficam outline. */
  emphasizeCta?: boolean
  /**
   * Este é o treino que está rodando agora.
   *
   * Sem isto o card dizia "INICIAR TREINO" mesmo com a sessão em andamento e o
   * descanso correndo no rodapé (visto no simulador em 09/08/2026): quem voltava
   * ao dashboard não tinha como saber onde retomar, e o único aviso vinha depois
   * do toque, no diálogo que oferece DESCARTAR o treino.
   */
  isInProgress?: boolean
  onQuickView: (w: DashboardWorkout) => void
  onStartSession: (w: DashboardWorkout) => MaybePromise<void | boolean>
  onRestoreWorkout?: (w: DashboardWorkout) => MaybePromise<void>
  onShareWorkout: (w: DashboardWorkout) => MaybePromise<void>
  onEditWorkout: (w: DashboardWorkout) => MaybePromise<void>
  onDeleteWorkout: (id?: string, title?: string) => MaybePromise<void>
  onLoadFullWorkout: (id: string) => Promise<DashboardWorkout | null>
  onPeriodizedError: (msg: string) => void
  onPeriodizedWorkoutLoaded: (full: DashboardWorkout) => void
}

// ────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────

const accentColors = [
  { border: 'border-yellow-500', gradient: 'from-yellow-500/5' },
  { border: 'border-orange-500', gradient: 'from-orange-500/5' },
  { border: 'border-amber-500', gradient: 'from-amber-500/5' },
  { border: 'border-amber-600', gradient: 'from-amber-600/5' },
]

// ────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────

function WorkoutCardInner({
  workout: w,
  idx,
  density,
  isPeriodized,
  isToday = false,
  emphasizeCta = false,
  isInProgress = false,
  onQuickView,
  onStartSession,
  onRestoreWorkout,
  onShareWorkout,
  onEditWorkout,
  onDeleteWorkout,
  onLoadFullWorkout,
  onPeriodizedError,
  onPeriodizedWorkoutLoaded,
}: WorkoutCardProps) {
  const [pendingAction, setPendingAction] = useState<{ type: PendingActionType } | null>(null)
  /** Segundo nível das ações do card — guarda a exclusão atrás de um toque. */
  const [maisAberto, setMaisAberto] = useState(false)
  const isMountedRef = useRef(true)
  React.useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  const accent = accentColors[idx % accentColors.length]
  const isActive = false // FUTURE: connect to active session state
  const showToday = isToday && !w?.archived_at
  const solidCta = emphasizeCta && !w?.archived_at

  // Meta do card (#5): exercícios sempre; duração/séries quando os exercícios já
  // estão hidratados (periodizados só-com-contagem não têm → ficam ocultos).
  const exercisesArr = Array.isArray(w?.exercises) ? w.exercises : []
  const exercisesCount = Number.isFinite(Number(w?.exercises_count))
    ? Math.max(0, Math.floor(Number(w.exercises_count)))
    : exercisesArr.length
  const estMinutes = estimateWorkoutMinutes(exercisesArr)
  const totalSets = countTotalSets(exercisesArr)
  const workoutKey = String(w?.id || idx)
  const isBusy = !!pendingAction

  const runAction = useCallback(
    async (type: PendingActionType, fn: () => MaybePromise<void | boolean | DashboardWorkout | null>) => {
      if (pendingAction) return
      setPendingAction({ type })
      try {
        await fn()
      } catch {
        // noop
      } finally {
        if (isMountedRef.current) setPendingAction(null)
      }
    },
    [pendingAction],
  )

  const isActionBusy = (type: PendingActionType) => pendingAction?.type === type

  const handleClick = () => {
    if (isBusy) return
    if (isPeriodized && !isPeriodizedWorkoutFullyLoaded(w)) {
      runAction('open', async () => {
        const id = String(w?.id || '').trim()
        const full = await onLoadFullWorkout(id)
        if (!full) {
          onPeriodizedError('Não foi possível carregar os detalhes desse treino.')
          return
        }
        if (!Array.isArray(full?.exercises) || full.exercises.length === 0) {
          onPeriodizedError('Esse treino está sem exercícios. Refaça a periodização para recriar os treinos.')
          return
        }
        onPeriodizedWorkoutLoaded(full)
        onQuickView(full)
      })
      return
    }
    onQuickView(w)
  }

  const handleStart = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (w?.archived_at) {
      if (typeof onRestoreWorkout !== 'function') return
      await runAction('restore', () => onRestoreWorkout?.(w))
      return
    }
    await runAction('start', async () => {
      if (isPeriodized && !isPeriodizedWorkoutFullyLoaded(w)) {
        const id = String(w?.id || '').trim()
        const full = await onLoadFullWorkout(id)
        if (!full) {
          onPeriodizedError('Não foi possível carregar os detalhes desse treino.')
          return
        }
        if (!Array.isArray(full?.exercises) || full.exercises.length === 0) {
          onPeriodizedError('Esse treino está sem exercícios. Refaça a periodização para recriar os treinos.')
          return
        }
        onPeriodizedWorkoutLoaded(full)
        await onStartSession(full)
        return
      }
      await onStartSession(w)
    })
  }

  return (
    <div
      key={workoutKey}
      role="button"
      tabIndex={0}
      className={[
        'rounded-xl p-4 border-l-4 transition-all group relative overflow-hidden cursor-pointer shadow-sm shadow-black/30',
        `bg-gradient-to-r ${accent.gradient} via-neutral-800/80 to-neutral-800`,
        accent.border,
        isActive ? 'ring-2 ring-green-500/60' : '',
        showToday ? 'ring-1 ring-yellow-400/60 shadow-[0_0_24px_rgba(234,179,8,0.18)]' : '',
        density === 'compact' ? 'p-3' : 'p-4',
      ].join(' ')}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick() }}
    >
      <div className="relative z-10">
        {isActive && (
          <div className="absolute -top-1 -left-1 w-3 h-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
          </div>
        )}
        {showToday && (
          <span className="inline-flex items-center gap-1.5 mb-1.5 px-2 py-0.5 rounded-full bg-yellow-400 text-black text-[10px] font-black uppercase tracking-wider shadow-[0_0_12px_rgba(234,179,8,0.5)]">
            <span className="w-1.5 h-1.5 rounded-full bg-black/70 animate-pulse" /> HOJE
          </span>
        )}
        {/* Sem `uppercase`: o nome do treino é o que o olho procura na lista, e
            caixa alta custa ~12% mais largura — com os 160px reservados à
            direita para os botões de ação, títulos como "SEG · Upper B - Peito
            + Braços" quebravam em duas linhas. A assinatura visual do app é o
            PESO (font-black), não a caixa; ela continua intacta. Labels curtos
            (HOJE, ARQUIVADO) seguem em caixa alta, que é onde ela funciona. */}
        {/* `pr-16` (64px) e não mais `pr-40` (160px): o bloco de ações fechado
            passou a ser um único botão de 44pt. São ~96px devolvidos ao nome do
            treino — o dado que o olho procura ao varrer a lista. */}
        <h3 className="font-black text-white text-base mb-0.5 pr-16 leading-tight line-clamp-2">{String(w?.title || 'Treino')}</h3>
        {/* WCAG 1.4.3 AA — neutral-500 sobre dark falha contraste 4.5:1 */}
        {/* Sem `pr-40` aqui: esta linha fica ABAIXO do bloco de ações, então os
            160px reservados só serviam para estrangular o texto — a meta
            quebrava em duas linhas e deixava o separador "·" órfão no fim da
            primeira. O padding é necessário no título (que corre ao lado dos
            botões), não aqui. */}
        <p className="text-[11px] text-neutral-400 font-mono mb-3 flex flex-wrap items-center gap-x-1.5">
          <span>{pluralize(exercisesCount, 'exercício')}</span>
          {estMinutes > 0 && (<><span className="text-neutral-400" aria-hidden>·</span><span>~{estMinutes} min</span></>)}
          {totalSets > 0 && (<><span className="text-neutral-400" aria-hidden>·</span><span>{pluralize(totalSets, 'série', 'séries')}</span></>)}
        </p>
        {w?.archived_at ? (
          <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-300 bg-neutral-900/60 border border-neutral-700 px-2 py-1 rounded-lg mb-2">
            ARQUIVADO
          </div>
        ) : null}

        <div className="flex gap-2 mt-2">
          <button
            onClick={handleStart}
            data-tour="workout-start"
            disabled={isBusy || (Boolean(w?.archived_at) && typeof onRestoreWorkout !== 'function')}
            className={[
              'relative z-30 flex-1 py-2.5 rounded-xl flex items-center justify-center gap-2 font-black text-sm transition-all active:scale-95 touch-manipulation disabled:opacity-60',
              solidCta
                ? 'btn-gold-animated !text-black border border-yellow-500/40'
                : 'text-yellow-400 hover:text-yellow-300 border border-yellow-500/40 hover:border-yellow-500/70 hover:bg-yellow-500/5',
            ].join(' ')}
          >
            {w?.archived_at ? (
              isActionBusy('restore') ? (
                <>
                  <Loader2 size={16} className={`animate-spin ${solidCta ? 'text-black' : 'text-yellow-500'}`} /> RESTAURANDO...
                </>
              ) : (
                <>
                  <Undo2 size={16} /> RESTAURAR
                </>
              )
            ) : isActionBusy('start') ? (
              <>
                <Loader2 size={16} className={`animate-spin ${solidCta ? 'text-black' : 'text-yellow-500'}`} /> INICIANDO...
              </>
            ) : (
              <>
                {/* O ícone acompanha o FUNDO, como o rótulo. Era um SVG com fill
                    dourado fixo: sobre o `btn-gold-animated` media 1,19:1 no pico do
                    gradiente e sumia ciclicamente — lia como falha de render. O `id`
                    do gradiente também se repetia uma vez por card da lista. */}
                <Play size={18} className={solidCta ? 'fill-black text-black' : 'fill-yellow-400 text-yellow-400'} /> {isInProgress ? 'CONTINUAR TREINO' : 'INICIAR TREINO'}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Ações do card.
          A EXCLUSÃO não fica mais lado a lado com compartilhar e editar: era um
          alvo de 44pt, do mesmo tamanho e da mesma cor das ações reversíveis, a
          um polegar de distância — com a mão suada, na academia, apagar o treino
          errado custava caro. Agora exige tocar "⋯" primeiro; um toque a mais é
          barato quando a ação não tem volta. */}
      <div className="absolute top-2 right-2 flex gap-1 opacity-100 transition-opacity z-20 bg-neutral-900/90 rounded-lg p-1 border border-white/5 md:opacity-0 md:group-hover:opacity-100">
        {/* FECHADO = só "⋯". Antes eram três botões de 44pt sempre visíveis:
            148px de bloco, que obrigavam o título a reservar `pr-40` (160px) e
            faziam TODO nome de treino quebrar em duas linhas — três de três nos
            cards medidos no aparelho. O nome é lido em 100% das visitas;
            compartilhar e editar são ocasionais. Otimizar a largura para a ação
            rara, e cobrar do dado principal, é a troca errada.
            Os 44pt de alvo de toque continuam — o que sai são botões, não área
            clicável de cada um. */}
        {!maisAberto ? (
          <button
            onClick={(e) => { e.stopPropagation(); setMaisAberto(true) }}
            disabled={isBusy}
            aria-label="Ações do treino"
            aria-expanded={false}
            className="w-11 h-11 flex items-center justify-center shrink-0 hover:bg-black/50 rounded text-neutral-400 hover:text-white disabled:opacity-60"
          >
            {isBusy ? <Loader2 size={14} className="text-yellow-500 animate-spin" /> : <MoreHorizontal size={14} />}
          </button>
        ) : (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); setMaisAberto(false) }}
              aria-label="Voltar"
              className="w-11 h-11 flex items-center justify-center shrink-0 hover:bg-black/50 rounded text-neutral-400 hover:text-white"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={async (e) => { e.stopPropagation(); await runAction('share', () => onShareWorkout(w)) }}
              disabled={isBusy}
              aria-label="Compartilhar treino"
              className="w-11 h-11 flex items-center justify-center shrink-0 hover:bg-black/50 rounded text-neutral-400 hover:text-white disabled:opacity-60"
            >
              {isActionBusy('share') ? <Loader2 size={14} className="text-yellow-500 animate-spin" /> : <Share2 size={14} />}
            </button>
            <button
              onClick={async (e) => { e.stopPropagation(); await runAction('edit', () => onEditWorkout(w)) }}
              disabled={isBusy}
              aria-label="Editar treino"
              className="w-11 h-11 flex items-center justify-center shrink-0 hover:bg-black/50 rounded text-neutral-400 hover:text-white disabled:opacity-60"
            >
              {isActionBusy('edit') ? <Loader2 size={14} className="text-yellow-500 animate-spin" /> : <Pencil size={14} />}
            </button>
            <button
              onClick={async (e) => { e.stopPropagation(); setMaisAberto(false); await runAction('delete', () => onDeleteWorkout(w?.id, w?.title)) }}
              disabled={isBusy}
              aria-label="Excluir treino"
              className="h-11 px-3 flex items-center gap-1.5 shrink-0 rounded bg-red-500/10 border border-red-500/30 text-red-300 hover:bg-red-500/20 disabled:opacity-60"
            >
              {isActionBusy('delete') ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              <span className="text-[11px] font-black uppercase tracking-wider">Excluir</span>
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// React.memo com comparador raso pelas props que de fato mudam o render.
// Sem isso, todo card re-renderizava sempre que o pai (StudentDashboard) mexia
// em qualquer state interno (busy flags, modais abertos, etc).
export const WorkoutCard = React.memo(WorkoutCardInner, (a, b) =>
  a.workout === b.workout &&
  a.idx === b.idx &&
  a.density === b.density &&
  a.isPeriodized === b.isPeriodized &&
  a.isToday === b.isToday &&
  a.emphasizeCta === b.emphasizeCta &&
  // Sem esta linha o memo segura o card no rótulo antigo: começar ou encerrar
  // um treino não re-renderizaria a lista, e "continuar" nunca apareceria.
  a.isInProgress === b.isInProgress &&
  a.onQuickView === b.onQuickView &&
  a.onStartSession === b.onStartSession &&
  a.onRestoreWorkout === b.onRestoreWorkout &&
  a.onShareWorkout === b.onShareWorkout &&
  a.onEditWorkout === b.onEditWorkout &&
  a.onDeleteWorkout === b.onDeleteWorkout &&
  a.onLoadFullWorkout === b.onLoadFullWorkout &&
  a.onPeriodizedError === b.onPeriodizedError &&
  a.onPeriodizedWorkoutLoaded === b.onPeriodizedWorkoutLoaded
)

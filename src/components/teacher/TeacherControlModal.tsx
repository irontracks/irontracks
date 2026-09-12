'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, Loader2, Gamepad2, Save, Plus, Minus, Check } from 'lucide-react'
import { useTeacherControl } from '@/hooks/useTeacherControl'
import {
  descansoAoConcluir,
  pularDescanso,
  descansoEmAndamento,
  descansoNaTela,
  iniciarSerieRemota,
  segundosAlemDoPlanejado,
  segundosRestantes,
} from '@/lib/workout/descansoRemoto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActiveWorkoutSession, Exercise } from '@/types/app'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

function getExercises(session: ActiveWorkoutSession | null): Exercise[] {
  const exs = (session?.workout as Record<string, unknown> | null)?.exercises
  return Array.isArray(exs) ? (exs as Exercise[]) : []
}

function getSetsCount(ex: Exercise): number {
  return Number(ex.sets) || 0
}

interface LogEntry {
  done?: boolean
  weight?: string
  reps?: string
  rpe?: number | null
}

function getLog(session: ActiveWorkoutSession | null, exIdx: number, setIdx: number): LogEntry {
  const raw = session?.logs?.[`${exIdx}-${setIdx}`]
  if (!isRecord(raw)) return {}
  return {
    done: Boolean(raw.done),
    weight: String(raw.weight ?? ''),
    reps: String(raw.reps ?? ''),
    rpe: raw.rpe != null ? Number(raw.rpe) : null,
  }
}

const RPE_OPTS = [6, 7, 7.5, 8, 8.5, 9, 9.5, 10]

/**
 * Barra do descanso do ALUNO, vista e controlada pelo professor.
 *
 * Pedido do dono: "aparece pra mim também, e eu posso pular o descanso como se
 * fosse ele — caso eu queira que naquela série não tenha tanto descanso".
 *
 * O contador vive aqui e não no modal inteiro de propósito: um ticker de 1 s no
 * componente de cima re-renderizaria a lista inteira de exercícios a cada
 * segundo — e esta tela acabou de sair de um bug de "pisca a cada 5 segundos".
 */
function BarraDeDescansoRemoto({
  timerTargetTime,
  onPular,
  onIniciar,
}: {
  timerTargetTime: unknown
  onPular: () => void
  onIniciar: () => void
}) {
  const [agora, setAgora] = useState(() => Date.now())
  const naTela = descansoNaTela(timerTargetTime)

  useEffect(() => {
    if (!naTela) return
    const id = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(id)
  }, [naTela, timerTargetTime])

  // ⚠️ A barra vive enquanto o ALVO existir, não enquanto ele estiver no
  // futuro. Com o auto-start desligado — que é como o dono treina — o descanso
  // do aluno vence e a tela dele FICA aberta em tempo extra, esperando o START.
  // Sumir no vencimento tirava o professor da tela exatamente no instante em
  // que ele precisa agir; era o buraco que este pedido abriu.
  if (!naTela) return null

  const correndo = descansoEmAndamento(timerTargetTime, agora)
  const segundos = correndo ? segundosRestantes(timerTargetTime, agora) : segundosAlemDoPlanejado(timerTargetTime, agora)
  const mm = Math.floor(segundos / 60)
  const ss = segundos % 60
  const relogio = `${correndo ? '' : '+'}${mm}:${ss < 10 ? '0' : ''}${ss}`

  return (
    <div
      className="flex flex-col gap-2.5 rounded-2xl px-3 py-2.5"
      style={{ background: 'rgba(234,179,8,0.10)', border: '1px solid rgba(234,179,8,0.30)' }}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[9px] font-black uppercase tracking-widest text-amber-300/80">
            {correndo ? 'Descanso do aluno' : 'Descanso terminou'}
          </div>
          <div className="font-mono font-black tabular-nums text-2xl leading-none text-amber-300 mt-0.5">
            {relogio}
          </div>
        </div>
        <button
          type="button"
          onClick={onPular}
          className="tap-44 shrink-0 text-[12px] font-black px-3 py-2 rounded-xl active:scale-95 transition-transform"
          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff' }}
          aria-label="Pular o descanso do aluno"
        >
          Pular descanso
        </button>
      </div>

      {/* START ▶ — o MESMO botão que o aluno tem na tela do descanso, com o
          mesmo nome. É a ação primária (dourada): encerra o descanso e começa a
          contagem da série. "Pular descanso" fica ao lado como o atalho que só
          fecha, sem carimbar nada. */}
      <button
        type="button"
        onClick={onIniciar}
        className="tap-44 w-full py-2.5 rounded-xl text-black font-black text-sm bg-gradient-to-r from-yellow-500 to-amber-400 shadow-lg shadow-yellow-900/30 active:scale-[0.98] transition-transform"
        aria-label="Iniciar a série do aluno"
      >
        START ▶
      </button>
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface TeacherControlModalProps {
  supabase: SupabaseClient
  studentUserId: string
  studentName: string
  getAuthHeaders: () => Promise<Record<string, string>>
  onClose: () => void
}

// ─── Set row ─────────────────────────────────────────────────────────────────

function SetRow({
  exIdx,
  setIdx,
  session,
  reps: defaultReps,
  restTime,
  temProxima,
  onPatch,
}: {
  exIdx: number
  setIdx: number
  session: ActiveWorkoutSession | null
  reps: string | number | null
  /** Descanso configurado no exercício (s) — dispara no aparelho do aluno. */
  restTime: unknown
  temProxima: boolean
  onPatch: (
    updater: (prev: ActiveWorkoutSession) => ActiveWorkoutSession,
    opts?: { imediato?: boolean },
  ) => void
}) {
  const log = getLog(session, exIdx, setIdx)

  const update = useCallback((field: keyof LogEntry, value: unknown) => {
    onPatch(prev => {
      const prevLog = isRecord(prev?.logs?.[`${exIdx}-${setIdx}`])
        ? (prev.logs![`${exIdx}-${setIdx}`] as Record<string, unknown>)
        : {}
      return {
        ...prev,
        logs: {
          ...(prev.logs ?? {}),
          [`${exIdx}-${setIdx}`]: { ...prevLog, [field]: value },
        },
      }
    })
  }, [exIdx, setIdx, onPatch])

  /**
   * Concluir a série e, quando for o caso, DISPARAR o descanso no aparelho do
   * aluno (pedido do dono). O alvo do timer viaja no próprio state da sessão —
   * o app dele aplica updates vindos de outro aparelho e a barra abre lá.
   *
   * ⚠️ `Date.now()` fica AQUI, no handler, e nunca dentro do updater: com o
   * flush imediato o updater é aplicado duas vezes (uma para a UI, outra para
   * o que vai ao servidor), e um relógio lido lá dentro daria dois instantes
   * diferentes — o professor veria um descanso e o aluno, outro.
   */
  const toggleDone = () => {
    const proximoDone = !log.done
    const agoraMs = Date.now()
    const descanso = proximoDone
      ? descansoAoConcluir({
        restTime,
        key: `${exIdx}-${setIdx}`,
        nextKey: temProxima ? `${exIdx}-${setIdx + 1}` : null,
        agoraMs,
      })
      : null

    onPatch(prev => {
      const prevLog = isRecord(prev?.logs?.[`${exIdx}-${setIdx}`])
        ? (prev.logs![`${exIdx}-${setIdx}`] as Record<string, unknown>)
        : {}
      const base = {
        ...prev,
        logs: {
          ...(prev.logs ?? {}),
          [`${exIdx}-${setIdx}`]: { ...prevLog, done: proximoDone },
        },
      }
      return (descanso ? { ...base, ...descanso } : base) as ActiveWorkoutSession
    }, { imediato: Boolean(descanso) })
  }

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl transition-all ${log.done ? 'opacity-70' : ''}`}
      style={{
        background: log.done ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${log.done ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)'}`,
      }}
    >
      {/* Número da série — INDICADOR, não controle.
          ⚠️ Ele já foi o único jeito de concluir a série: um toggle escondido
          atrás de um número, sem rótulo nem affordance. O dono controlou um
          treino inteiro preenchendo peso/reps/RPE nas quatro séries e nenhuma
          ficou concluída — ele não tinha como adivinhar que o "1" era botão.
          A ação agora tem nome e coluna própria ("Feito", à direita). */}
      <div
        className="w-7 h-7 flex-shrink-0 rounded-lg flex items-center justify-center font-black text-[11px]"
        style={{
          background: log.done ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.08)',
          color: log.done ? '#22c55e' : 'rgba(255,255,255,0.5)',
          border: `1px solid ${log.done ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.1)'}`,
        }}
        aria-hidden="true"
      >
        {log.done ? '✓' : String(setIdx + 1)}
      </div>

      {/* Weight — sem type="number": num WebView (locale != pt-BR) ele bloqueia a
          vírgula. O valor é string e é parseado depois (parseTrainingNumber). */}
      <input
        inputMode="decimal"
        placeholder="Kg"
        value={log.weight ?? ''}
        onChange={e => update('weight', e.target.value)}
        className="flex-1 min-w-0 rounded-lg px-2 py-1 text-center text-sm font-bold text-white placeholder-white/20 focus:outline-none"
        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
        aria-label="Peso (kg)"
      />

      {/* Reps — idem: sem type="number" (string parseada depois). */}
      <input
        inputMode="numeric"
        placeholder={defaultReps != null ? String(defaultReps) : 'Reps'}
        value={log.reps ?? ''}
        onChange={e => update('reps', e.target.value)}
        className="flex-1 min-w-0 rounded-lg px-2 py-1 text-center text-sm font-bold text-white placeholder-white/20 focus:outline-none"
        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
        aria-label="Repetições"
      />

      {/* RPE mini-picker */}
      <select
        value={log.rpe != null ? String(log.rpe) : ''}
        onChange={e => update('rpe', e.target.value ? Number(e.target.value) : null)}
        className="flex-shrink-0 rounded-lg px-1 py-1 text-xs font-bold text-white focus:outline-none"
        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', width: 60 }}
        aria-label="RPE"
      >
        <option value="">RPE</option>
        {RPE_OPTS.map(r => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>

      {/* Concluir — a ação que faltava ter NOME.
          Sem `done` a série não entra no volume, no motor de carga nem no
          relatório do aluno: o professor anotava tudo e o treino continuava
          valendo zero. Toggle (e não só marcar) porque errar a série é comum e
          desfazer não pode exigir o aluno. */}
      <button
        type="button"
        onClick={toggleDone}
        aria-pressed={Boolean(log.done)}
        aria-label={log.done ? `Desfazer série ${setIdx + 1}` : `Concluir série ${setIdx + 1}`}
        className="tap-44 w-9 h-9 flex-shrink-0 rounded-lg flex items-center justify-center transition-all active:scale-95"
        style={{
          background: log.done ? 'rgba(34,197,94,0.22)' : 'rgba(255,255,255,0.06)',
          color: log.done ? '#22c55e' : 'rgba(255,255,255,0.45)',
          border: `1px solid ${log.done ? 'rgba(34,197,94,0.45)' : 'rgba(255,255,255,0.12)'}`,
        }}
      >
        <Check size={16} strokeWidth={3} />
      </button>
    </div>
  )
}

// ─── Exercise card ────────────────────────────────────────────────────────────

function ExerciseCard({
  ex,
  exIdx,
  session,
  onPatch,
}: {
  ex: Exercise
  exIdx: number
  session: ActiveWorkoutSession | null
  onPatch: (updater: (prev: ActiveWorkoutSession) => ActiveWorkoutSession) => void
}) {
  const setsCount = getSetsCount(ex)

  const adjustSets = useCallback((delta: number) => {
    onPatch(prev => {
      const prevExs = getExercises(prev)
      const updated = [...prevExs]
      const n = Math.max(1, (Number(updated[exIdx]?.sets) || 0) + delta)
      updated[exIdx] = { ...updated[exIdx], sets: n }
      return {
        ...prev,
        workout: {
          ...(prev.workout as Record<string, unknown>),
          exercises: updated,
        },
      }
    })
  }, [exIdx, onPatch])

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      {/* Exercise header */}
      <div className="flex items-center gap-3 px-3 py-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-white truncate">{ex.name || 'Exercício'}</p>
          {ex.restTime != null && Number(ex.restTime) > 0 && (
            <p className="text-[10px] text-white/55 mt-0.5">{Number(ex.restTime)}s descanso</p>
          )}
        </div>
        {/* Adjust sets */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => adjustSets(-1)}
            className="tap-44 w-7 h-7 rounded-lg flex items-center justify-center text-white/50 active:scale-95 transition-all"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
            aria-label="Remover série"
          >
            <Minus size={12} />
          </button>
          <span className="text-xs font-black text-white/60 w-8 text-center">{setsCount}x</span>
          <button
            type="button"
            onClick={() => adjustSets(1)}
            className="tap-44 w-7 h-7 rounded-lg flex items-center justify-center text-white/50 active:scale-95 transition-all"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
            aria-label="Adicionar série"
          >
            <Plus size={12} />
          </button>
        </div>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-5 gap-2 px-3 pb-1.5">
        <div className="text-[9px] font-black uppercase tracking-widest text-white/55 text-center">Série</div>
        <div className="text-[9px] font-black uppercase tracking-widest text-white/55 text-center">Kg</div>
        <div className="text-[9px] font-black uppercase tracking-widest text-white/55 text-center">Reps</div>
        <div className="text-[9px] font-black uppercase tracking-widest text-white/55 text-center">RPE</div>
        <div className="text-[9px] font-black uppercase tracking-widest text-white/55 text-center">Feito</div>
      </div>

      {/* Set rows */}
      <div className="flex flex-col gap-1.5 px-3 pb-3">
        {Array.from({ length: setsCount }, (_, i) => (
          <SetRow
            key={i}
            restTime={ex.restTime}
            temProxima={i < setsCount - 1}
            exIdx={exIdx}
            setIdx={i}
            session={session}
            reps={ex.reps}
            onPatch={onPatch}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TeacherControlModal({
  supabase,
  studentUserId,
  studentName,
  getAuthHeaders,
  onClose,
}: TeacherControlModalProps) {
  const { session, isLoading, isSaving, sessionEnded, patchState } = useTeacherControl(
    supabase,
    studentUserId,
    getAuthHeaders,
  )

  const [releasing, setReleasing] = useState(false)

  // Auto-close when the student finishes / cancels the workout
  useEffect(() => {
    if (sessionEnded) onClose()
  }, [sessionEnded, onClose])

  const handleRelease = useCallback(async () => {
    setReleasing(true)
    try {
      const headers = await getAuthHeaders()
      await fetch(`/api/teacher/control/${studentUserId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ action: 'release' }),
      })
      onClose()
    } finally {
      setReleasing(false)
    }
  }, [studentUserId, getAuthHeaders, onClose])

  /**
   * START ▶ — encerra o descanso e inicia a contagem da série no aluno.
   *
   * ⚠️ `Date.now()` fica AQUI, fora do updater: com o flush imediato o updater
   * roda duas vezes (uma para a UI, outra para o servidor) e um relógio lido lá
   * dentro carimbaria dois instantes diferentes nos dois aparelhos.
   */
  const iniciarSerie = useCallback(() => {
    const agoraMs = Date.now()
    patchState(
      prev => ({ ...prev, ...iniciarSerieRemota(prev, agoraMs) }) as ActiveWorkoutSession,
      { imediato: true },
    )
  }, [patchState])

  const exercises = getExercises(session)
  const workoutTitle = String(
    (session?.workout as Record<string, unknown> | null)?.title ??
    (session?.workout as Record<string, unknown> | null)?.name ??
    'Treino'
  )

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      className="fixed inset-0 z-[200] flex flex-col overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, rgba(5,12,8,0.99) 0%, rgba(3,8,5,0.99) 100%)',
        // Distinct green border to make it obvious this is the teacher's control view
        boxShadow: 'inset 0 0 0 2px rgba(34,197,94,0.4)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 pb-3 flex-shrink-0"
        style={{
          paddingTop: 'max(env(safe-area-inset-top, 0px), 16px)',
          borderBottom: '1px solid rgba(34,197,94,0.15)',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          className="w-11 h-11 rounded-xl flex items-center justify-center text-neutral-400 active:scale-95 transition-all"
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
          aria-label="Voltar"
        >
          <ChevronLeft size={18} />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <Gamepad2 size={13} className="text-green-400 flex-shrink-0" />
            <p className="text-xs font-black text-green-400 uppercase tracking-wider truncate">
              Controlando: {studentName}
            </p>
          </div>
          <p className="text-sm font-black text-white truncate">{workoutTitle}</p>
        </div>

        {/* Status indicators */}
        {isSaving && (
          <Save size={14} className="text-green-400/60 animate-pulse flex-shrink-0" />
        )}

        <button
          type="button"
          onClick={handleRelease}
          disabled={releasing}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition-all active:scale-95 disabled:opacity-60"
          style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}
        >
          {releasing ? <Loader2 size={12} className="animate-spin" /> : null}
          Encerrar
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-white/55">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Carregando treino...</span>
          </div>
        ) : exercises.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-white/55">Nenhum exercício neste treino</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Hint */}
            <p className="text-[10px] font-bold text-green-400/50 text-center uppercase tracking-widest">
              🎮 Você está no controle — todas as alterações são aplicadas ao aluno em tempo real
            </p>

            <BarraDeDescansoRemoto
              timerTargetTime={(session as unknown as { timerTargetTime?: unknown } | null)?.timerTargetTime}
              onPular={() => patchState(prev => ({ ...prev, ...pularDescanso() }) as ActiveWorkoutSession, { imediato: true })}
              onIniciar={iniciarSerie}
            />

            {exercises.map((ex, exIdx) => (
              <ExerciseCard
                key={exIdx}
                ex={ex}
                exIdx={exIdx}
                session={session}
                onPatch={patchState}
              />
            ))}

            {/* Bottom spacer */}
            <div style={{ height: 'max(env(safe-area-inset-bottom, 0px), 16px)' }} />
          </div>
        )}
      </div>
    </motion.div>
  )
}

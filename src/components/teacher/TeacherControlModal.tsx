'use client'

import { useCallback, useEffect, useState } from 'react'
import { logWarnRemote } from '@/lib/logger'
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
import { resumoDoControle, formatarDuracaoCurta } from '@/lib/workout/resumoDoControle'
import { setsCountOfExercise } from '@/lib/workout/deferredExercises'
import { rotuloDoMetodoDaSerie } from '@/components/workout/helpers/rotuloDoMetodoDaSerie'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActiveWorkoutSession, Exercise } from '@/types/app'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

function getExercises(session: ActiveWorkoutSession | null): Exercise[] {
  const exs = (session?.workout as Record<string, unknown> | null)?.exercises
  return Array.isArray(exs) ? (exs as Exercise[]) : []
}

/**
 * ⚠️ Quantas séries o exercício tem — pela MESMA conta do app do aluno.
 *
 * Era `Number(ex.sets) || 0`, só o cabeçalho. Série acrescentada no meio da
 * sessão vive em `setDetails` e o cabeçalho não acompanha: ela simplesmente não
 * aparecia para o professor, e o progresso contava um total menor que o do
 * aluno. `setsCountOfExercise` é o `max` dos dois, e é o que o resto do app usa.
 */
function getSetsCount(ex: Exercise): number {
  return setsCountOfExercise(ex)
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
    /* ⚠️ STICKY, nunca `fixed`. A barra precisa continuar alcançável com o
       professor rolado no 8º exercício — antes ela nascia no topo da lista e
       o START ficava fora da tela justamente quando o aluno estava parado
       esperando. `fixed` aqui seria pior que o problema: o modal é um
       `motion.div` com `transform`, que vira containing block, então a faixa
       ancoraria no modal e viajaria na animação — além de repetir a classe de
       defeito das faixas fixas do treino ativo (guard barrasDoTopoTreino).
       `-mx-4 px-4` sangra até a borda do scroller (que tem px-4), senão os
       cards passariam por 16px vivos de cada lado; o fundo é OPACO com blur
       porque translúcido deixaria os cards legíveis por baixo do relógio. */
    <div
      className="sticky top-0 z-20 -mx-4 px-4 pt-3 pb-3 flex flex-col gap-2.5"
      style={{
        background: 'rgba(15,15,14,0.94)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(234,179,8,0.30)',
      }}
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

/**
 * Progresso · tempo · exercício da vez — a primeira linha do painel.
 *
 * ⚠️ O ticker de 1 min vive AQUI, não no modal: um `setInterval` no componente
 * de cima re-renderizaria a lista inteira de exercícios, e esta tela já saiu de
 * um bug de "pisca a cada 5 segundos". Mesmo motivo da BarraDeDescansoRemoto —
 * e note o minuto (não o segundo): o número exibido só muda de minuto em
 * minuto, então acordar a cada segundo seria 60× de render para nada.
 *
 * O relógio entra por `agora` e o resto sai de `resumoDoControle`, que é puro.
 */
function ResumoDoControle({ session }: { session: ActiveWorkoutSession | null }) {
  const [agora, setAgora] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const resumo = resumoDoControle(session, agora)
  if (resumo.total === 0) return null

  const duracao = formatarDuracaoCurta(resumo.minutosDesdeInicio)
  const exercicios = getExercises(session)
  const nomeAtual =
    resumo.exercicioAtualIdx != null
      ? String(exercicios[resumo.exercicioAtualIdx]?.name ?? '').trim()
      : ''

  return (
    <div
      className="rounded-2xl px-3 py-2.5 flex flex-col gap-1"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <div className="flex items-baseline gap-2">
        <span className="font-black tabular-nums text-white text-lg leading-none">
          {resumo.feitas}
          <span className="text-white/55 text-sm">/{resumo.total}</span>
        </span>
        <span className="t-meta-inherit text-white/55">séries anotadas</span>
        {duracao && (
          <span className="ml-auto text-[11px] font-bold text-white/55 tabular-nums">
            {/* Tempo de PAREDE. O cronômetro do aluno desconta pausa e gap de
                background, que não viajam no state — prometer "tempo de treino"
                aqui mostraria um número que não bate com o aparelho dele. */}
            desde o início · {duracao}
          </span>
        )}
      </div>

      {nomeAtual && (
        <p className="text-[11px] text-white/70 truncate">
          <span className="text-white/55">Agora:</span> {nomeAtual}
        </p>
      )}
    </div>
  )
}

/**
 * "Da última vez" — o que o aluno fez neste exercício na sessão passada.
 *
 * Uma chamada por abertura do painel, com a lista de exercícios do treino de
 * hoje; o servidor resume e devolve só `{ weight, reps, rpe }` por série. O
 * histórico cru dessa conta chega a 1,9 MB no aluno mais antigo — buscá-lo
 * inteiro dentro de um modal aberto durante o treino seria o engorda-payload
 * que este repo já desfez uma vez.
 *
 * Falha é SILENCIOSA na tela de propósito (o painel funciona sem o watermark),
 * mas nunca silenciosa no log: sem `logWarnRemote` uma rota quebrada viraria
 * "o professor continua anotando às cegas" sem ninguém saber.
 */
function useUltimaVezDoAluno(
  studentUserId: string,
  exercises: readonly Exercise[],
  getAuthHeaders: () => Promise<Record<string, string>>,
) {
  const [ultimaVez, setUltimaVez] = useState<Record<string, Record<number, { weight: number | null; reps: number | null; rpe: number | null }>>>({})

  // Chave estável: só refaz a busca quando a LISTA de exercícios muda de fato.
  // Sem isto, cada patch de série (que recria `session.workout`) dispararia uma
  // busca nova — o mesmo defeito de identidade derivada que fez o modal de
  // nutrição metralhar o Supabase.
  const chave = exercises.map(e => String(e?.name ?? '')).join('|')

  useEffect(() => {
    const nomes = chave.split('|').map(n => n.trim()).filter(Boolean)
    if (!studentUserId || nomes.length === 0) return
    let vivo = true

    const buscar = async () => {
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`/api/teacher/student-history/${studentUserId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({
            exercicios: nomes.slice(0, 40),
            series: exercises.slice(0, 40).map(e => setsCountOfExercise(e)),
          }),
        })
        if (!res.ok) {
          logWarnRemote('teacher.control.history-failed', 'histórico do aluno não carregou', { status: res.status })
          return
        }
        const json = await res.json() as { ok?: boolean; ultimaVez?: Record<string, Record<number, { weight: number | null; reps: number | null; rpe: number | null }>> }
        if (vivo && json?.ok && json.ultimaVez) setUltimaVez(json.ultimaVez)
      } catch (e) {
        logWarnRemote('teacher.control.history-error', 'erro de rede no histórico do aluno', { erro: String(e) })
      }
    }
    void buscar()
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentUserId, chave, getAuthHeaders])

  return ultimaVez
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
  ex,
  setsCount,
  ultimaVez,
  restTime,
  temProxima,
  onPatch,
}: {
  exIdx: number
  setIdx: number
  session: ActiveWorkoutSession | null
  reps: string | number | null
  /** O exercício inteiro — o método da série sai dele + do log. */
  ex: Exercise
  setsCount: number
  /** O que o aluno fez nesta série da última vez (ou `null` sem histórico). */
  ultimaVez: { weight: number | null; reps: number | null; rpe: number | null } | null
  /** Descanso configurado no exercício (s) — dispara no aparelho do aluno. */
  restTime: unknown
  temProxima: boolean
  onPatch: (
    updater: (prev: ActiveWorkoutSession) => ActiveWorkoutSession,
    opts?: { imediato?: boolean },
  ) => void
}) {
  const log = getLog(session, exIdx, setIdx)

  /**
   * ⚠️ O rótulo sai do log CRU, não do `log` reconstruído acima: `getLog` monta
   * um objeto só com done/weight/reps/rpe e DESCARTA `per_set_method`, que é
   * justamente o campo que vence tudo na decisão do método. Passar o objeto
   * magro faria a série que o aluno escolheu como Drop aparecer como Normal.
   */
  const metodo = rotuloDoMetodoDaSerie(
    ex,
    setIdx,
    session?.logs?.[`${exIdx}-${setIdx}`],
    setsCount,
  )

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

      {/* Método da série. Só aparece quando NÃO é Normal — etiqueta em toda
          linha viraria papel de parede e o professor pararia de ler. O painel
          não desenha o método (os 12 renderers avançados exigem os providers do
          treino): ele DIZ qual é, que é o que faltava para o coach saber que
          aquela série é um Drop e não uma série comum. */}
      {metodo && (
        <span
          className="flex-shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold leading-none max-w-[72px] truncate"
          style={{
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.75)',
          }}
          title={metodo}
        >
          {metodo}
        </span>
      )}

      {/* Weight — sem type="number": num WebView (locale != pt-BR) ele bloqueia a
          vírgula. O valor é string e é parseado depois (parseTrainingNumber). */}
      <input
        inputMode="decimal"
        /* O placeholder é o peso da ÚLTIMA VEZ, não um "Kg" genérico: é a mesma
           referência que o aluno tem no campo dele, e sem ela o professor
           anotava sem saber com quanto o aluno fez na semana passada. */
        placeholder={ultimaVez?.weight != null ? String(ultimaVez.weight) : 'Kg'}
        value={log.weight ?? ''}
        onChange={e => update('weight', e.target.value)}
        className="flex-1 min-w-0 rounded-lg px-2 py-1 text-center text-sm font-bold text-white placeholder-white/20 focus:outline-none"
        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
        aria-label="Peso (kg)"
      />

      {/* Reps — idem: sem type="number" (string parseada depois). */}
      <input
        inputMode="numeric"
        /* Reps: a última vez vence o alvo do plano — é o que ele de fato fez. */
        placeholder={ultimaVez?.reps != null ? String(ultimaVez.reps) : defaultReps != null ? String(defaultReps) : 'Reps'}
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
  ultimaVezDoExercicio,
  onPatch,
}: {
  ex: Exercise
  exIdx: number
  session: ActiveWorkoutSession | null
  /** Watermark por índice de série — o que o aluno fez da última vez. */
  ultimaVezDoExercicio: Record<number, { weight: number | null; reps: number | null; rpe: number | null }> | null
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
            ex={ex}
            setsCount={setsCount}
            ultimaVez={ultimaVezDoExercicio?.[i] ?? null}
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
  const [erroAoEncerrar, setErroAoEncerrar] = useState<string | null>(null)

  // Auto-close when the student finishes / cancels the workout
  useEffect(() => {
    if (sessionEnded) onClose()
  }, [sessionEnded, onClose])

  /**
   * Encerrar o controle.
   *
   * ⚠️ A resposta é CONFERIDA. Antes o `fetch` era disparado e a tela fechava
   * de qualquer jeito: se a rota falhasse, o professor saía achando que tinha
   * devolvido o treino e o app do aluno continuava com as escritas locais
   * suprimidas (`suppressLocalWrites`) — ou seja, o aluno anotava e nada
   * gravava, sem erro nenhum. Falhou, a tela fica e diz.
   */
  const handleRelease = useCallback(async () => {
    setReleasing(true)
    setErroAoEncerrar(null)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch(`/api/teacher/control/${studentUserId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ action: 'release' }),
      })
      if (!res.ok) {
        logWarnRemote('teacher.control.release-failed', 'encerrar controle falhou', { status: res.status })
        setErroAoEncerrar('Não consegui encerrar. Tente de novo.')
        return
      }
      onClose()
    } catch (e) {
      logWarnRemote('teacher.control.release-error', 'erro de rede ao encerrar controle', { erro: String(e) })
      setErroAoEncerrar('Sem conexão. Tente de novo.')
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
  const ultimaVez = useUltimaVezDoAluno(studentUserId, exercises, getAuthHeaders)
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
        background: 'linear-gradient(180deg, rgba(21,21,20,0.99) 0%, rgba(15,15,14,0.99) 100%)',
        /* ⚠️ A moldura era VERDE — o mesmo verde da série concluída, com outro
           alpha. Sinal e enfeite disputando o pigmento: quem olhava de relance
           via verde por toda parte e a conclusão deixava de saltar. Hoje o
           chrome é NEUTRO e o modo é dito por agrupamento + rótulo no
           cabeçalho (que não rola). Verde aqui é só concluído. */
        boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.14)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 pb-3 flex-shrink-0"
        style={{
          paddingTop: 'max(env(safe-area-inset-top, 0px), 16px)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
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
            <Gamepad2 size={13} className="text-white/70 flex-shrink-0" />
            <p className="t-meta-inherit text-white/70 truncate">
              Controlando: {studentName}
            </p>
          </div>
          <p className="text-sm font-black text-white truncate">{workoutTitle}</p>
        </div>

        {/* Status indicators */}
        {isSaving && (
          <Save size={14} className="text-white/50 animate-pulse flex-shrink-0" />
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

      {/* Falha ao encerrar não pode ser silenciosa: sair achando que devolveu o
          treino deixa o aluno anotando sem gravar (as escritas locais dele
          ficam suprimidas enquanto o controle estiver ativo). */}
      {erroAoEncerrar && (
        <p role="alert" className="px-4 pb-2 text-[11px] font-bold text-red-300">
          {erroAoEncerrar}
        </p>
      )}

      {/* Conteúdo rolável.
          ⚠️ SEM `py-4` aqui: padding no topo de um contêiner que hospeda bloco
          `sticky` vira FRESTA — o conteúdo rola à vista naqueles 16px, entre o
          cabeçalho e a barra grudada (a mesma lição do painel admin). O respiro
          foi para o wrapper de baixo. `overflow-x-hidden` é obrigatório porque
          a barra sangra com `-mx-4`. */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4">
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
          /* `pb-4` e não `py-4`: o respiro de CIMA é do próprio bloco sticky
             (pt-3), senão volta a fresta descrita acima.
             A faixa "🎮 Você está no controle — todas as alterações são
             aplicadas ao aluno em tempo real" foi REMOVIDA daqui: era a quarta
             vez que o app dizia o mesmo fato (moldura + ícone no cabeçalho +
             título + frase), ocupava a primeira dobra o treino inteiro e
             repetia até o ícone. Um fato, um lugar — quem diz isso agora é o
             cabeçalho, que não rola. */
          <div className="flex flex-col gap-4 pb-4">
            <ResumoDoControle session={session} />

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
                ultimaVezDoExercicio={ultimaVez[String(ex?.name ?? '')] ?? null}
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

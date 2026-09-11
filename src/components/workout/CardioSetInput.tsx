import React, { useState, useRef, useCallback, useEffect } from 'react'
import { flushSync } from 'react-dom'
import { Check, Play, Satellite, Repeat, AlertTriangle } from 'lucide-react'
import { isIndoorCardioName } from '@/utils/cardio/outdoorCardio'
import { RunningTimerCard } from './RunningTimerCard'
import { useWorkoutContext } from './WorkoutContext'
import { UnknownRecord } from './types'
import { parseTrainingNumber } from '@/utils/trainingNumber'
import { decidirBlocoAutomatico, proximoBlocoComecaEmMs } from '@/lib/workout/cardioChain'
import {
  fraseDoBloco,
  fraseDoMarco,
  marcoDeVozMinutos,
  segundosJaFeitos,
} from '@/lib/workout/vozDoCardio'
import { falar } from '@/lib/voz'
import { EVENTOS_TREINO, rastrearTreino } from '@/lib/workout/telemetriaTreino'

type Props = {
  ex: UnknownRecord
  exIdx: number
  setIdx: number
  setsCount?: number
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

// Esteira / treadmill: único cardio que ganha o campo de inclinação (%). Bike,
// corrida na rua etc. mostram só tempo + intensidade.
const TREADMILL_REGEX = /\b(esteira|treadmill)\b/i

/** Teto do re-agendamento enquanto o bloco espera a vez (ver o efeito abaixo). */
const RECHECAGEM_MAX_MS = 30_000

/**
 * Input de série para exercícios de cardio (method === 'Cardio').
 * Em vez de PESO/REPS/RPE, mostra Tempo + Intensidade (+ Inclinação na esteira)
 * e um botão START que roda a contagem regressiva do tempo alvo — espelhando a
 * mecânica do PlankSetInput (mesmo timer/Live Activity, só que kind: 'cardio').
 *
 * Com `settings.cardioAutoChain` ligado, os blocos se encadeiam: ao concluir um,
 * o próximo recebe em `autoStartAtMs` o instante em que deve começar, e arranca
 * sozinho. A aritmética disso é pura e mora em `lib/workout/cardioChain.ts` —
 * aqui ficam só os efeitos colaterais (gravar log, ligar cronômetro).
 */
export const CardioSetInput: React.FC<Props> = ({ ex, exIdx, setIdx, setsCount }) => {
  const {
    getLog, updateLog, startTimer, getPlannedSet, setCollapsed, openCardioGps,
    settings, toggleCardioAutoChain,
  } = useWorkoutContext()

  const restTime = parseTrainingNumber(ex?.restTime ?? (ex as Record<string, unknown>)?.rest_time) ?? 0
  const name = String(ex?.name ?? '').trim()
  const isTreadmill = TREADMILL_REGEX.test(name)

  const key = `${exIdx}-${setIdx}`
  const minutesInputId = `cardio-minutes-${key}`
  const speedInputId = `cardio-speed-${key}`
  const inclineInputId = `cardio-incline-${key}`
  const log = getLog(key)

  const plannedSet = getPlannedSet(ex as Parameters<typeof getPlannedSet>[0], setIdx) as UnknownRecord | null
  const cfgRaw = plannedSet ? (plannedSet.advanced_config ?? plannedSet.advancedConfig ?? null) : null
  const cfg = isObj(cfgRaw) ? cfgRaw : null

  // ── Encadeamento automático ────────────────────────────────────────────────
  const autoChainOn = Boolean((settings as Record<string, unknown> | null)?.cardioAutoChain)
  const proximoPlanejado = getPlannedSet(ex as Parameters<typeof getPlannedSet>[0], setIdx + 1)
  const temProximoBloco = Boolean(proximoPlanejado) || (setsCount != null && setIdx + 1 < setsCount)
  const proximaKey = `${exIdx}-${setIdx + 1}`
  /** Carimbo deixado pelo bloco anterior: quando ESTE bloco deve começar. */
  const autoStartAtMs =
    typeof log.autoStartAtMs === 'number' && Number.isFinite(log.autoStartAtMs) ? log.autoStartAtMs : 0
  const foiReconstruido = Boolean(log.autoChainReconstruido)

  // ── Voz ────────────────────────────────────────────────────────────────────
  // O intervalo é do EXERCÍCIO inteiro, não deste bloco: quem está na esteira
  // acompanha um relógio só. Ver `lib/workout/vozDoCardio.ts`.
  const vozIntervaloMin = (() => {
    const n = Number((settings as Record<string, unknown> | null)?.cardioVozIntervaloMin)
    return Number.isFinite(n) && n > 0 ? n : 0
  })()
  const vozLigada = vozIntervaloMin > 0
  /** Segundos já gravados nos blocos ANTERIORES deste mesmo exercício. */
  const segundosDosBlocosAnteriores = (() => {
    if (setIdx <= 0) return 0
    const anteriores: unknown[] = []
    for (let i = 0; i < setIdx; i += 1) anteriores.push(getLog(`${exIdx}-${i}`))
    return segundosJaFeitos(anteriores)
  })()
  const ultimoMarcoRef = useRef<number>(0)
  // A telemetria da voz é UMA por exercício: o que se mede é "fala neste
  // aparelho?", e a primeira tentativa já responde. Um evento por marco viraria
  // ruído — trinta linhas por cardio de meia hora.
  const jaReportouVozRef = useRef(false)

  /** Fala e, na primeira vez do exercício, registra o DESFECHO (não o pedido). */
  const falarComRelato = useCallback((texto: string) => {
    if (jaReportouVozRef.current) { falar(texto); return }
    jaReportouVozRef.current = true
    falar(texto, {
      aoResolver: (resultado, detalhe) => {
        rastrearTreino(EVENTOS_TREINO.vozDoCardio, {
          resultado,
          detalhe: detalhe || undefined,
          intervaloMin: vozIntervaloMin,
        })
      },
    })
  }, [vozIntervaloMin])

  const plannedDurationSec =
    log.durationSeconds != null && Number.isFinite(Number(log.durationSeconds))
      ? Number(log.durationSeconds)
      : plannedSet?.durationSeconds != null && Number.isFinite(Number(plannedSet.durationSeconds))
        ? Number(plannedSet.durationSeconds)
        : null

  const initialMinutes =
    plannedDurationSec != null && plannedDurationSec > 0
      ? String(Math.round((plannedDurationSec / 60) * 10) / 10)
      : ''
  const initialSpeed =
    log.speed != null && log.speed !== '' ? String(log.speed) : cfg?.speed != null ? String(cfg.speed) : ''
  const initialIncline =
    log.incline != null && log.incline !== '' ? String(log.incline) : cfg?.incline != null ? String(cfg.incline) : ''

  const [minutes, setMinutes] = useState(initialMinutes)
  const [speed, setSpeed] = useState(initialSpeed)
  const [incline, setIncline] = useState(initialIncline)
  const [isRunning, setIsRunning] = useState(false)
  const [startedAtMs, setStartedAtMs] = useState(0)
  /** A cadeia parou aqui: o fim deste bloco passou faz tempo demais para deduzir. */
  const [autoExpirado, setAutoExpirado] = useState(false)
  const startedAtRef = useRef<number>(0)
  // Trava anti-duplo-toque (~400ms), igual aos sets normais/plank.
  const lastToggleRef = useRef<number>(0)

  const inputBase =
    'w-full bg-black/40 border border-neutral-700/80 rounded-xl px-3 py-2 text-[16px] text-white outline-none focus:ring-1 ring-yellow-500 focus:border-yellow-500/50'

  const collapseAndScroll = useCallback((delay: number) => {
    setTimeout(() => {
      try {
        flushSync(() => {
          setCollapsed?.((prev: Set<number>) => {
            const next = new Set(prev)
            next.add(exIdx)
            return next
          })
        })
        const firstSetOfNext = document.querySelector<HTMLElement>(`[data-set-first="${exIdx + 1}"]`)
        const nextCard = document.querySelector<HTMLElement>(`[data-exercise-idx="${exIdx + 1}"]`)
        const target = firstSetOfNext ?? nextCard
        target?.scrollIntoView({ behavior: 'instant', block: 'start' })
      } catch { /* silenced */ }
    }, delay)
  }, [setCollapsed, exIdx])

  const maybeCollapseIfLastSet = useCallback(() => {
    if (setsCount != null && setIdx === setsCount - 1) {
      collapseAndScroll(600)
    }
  }, [setsCount, setIdx, collapseAndScroll])

  // Tempo alvo em segundos (limitado a 1..7200s pra não criar um timer absurdo).
  const targetSeconds = (() => {
    const m = Number(minutes)
    if (!Number.isFinite(m) || m <= 0) return 0
    return Math.min(7200, Math.max(1, Math.round(m * 60)))
  })()
  const canStart = targetSeconds > 0

  // Grava a série de cardio. `durationSec` = tempo efetivamente feito.
  //
  // `terminouEmMs` existe por causa da reconstrução: quando o app volta de um
  // congelamento, o bloco terminou no PASSADO, e usar `Date.now()` gravaria
  // como descanso todo o tempo em que a tela ficou apagada — o mesmo defeito
  // que `handleStartFromRestTimer` já corrige com `restoredExpiredAtMs`.
  const commitLog = useCallback(
    (durationSec: number, opts?: { terminouEmMs?: number; reconstruido?: boolean }) => {
      const agoraMs = Date.now()
      const fimMs = opts?.terminouEmMs != null && opts.terminouEmMs > 0 ? opts.terminouEmMs : agoraMs
      const reconstruido = opts?.reconstruido === true
      updateLog(key, {
        durationSeconds: durationSec,
        speed: parseTrainingNumber(speed) ?? null,
        incline: isTreadmill ? (parseTrainingNumber(incline) ?? null) : null,
        weight: null,
        reps: null,
        done: true,
        restStartMs: restTime > 0 && !reconstruido ? fimMs : null,
        // Marca a conclusão DEDUZIDA. A tela precisa dizer que este número não
        // foi medido com alguém olhando — ver o aviso âmbar mais abaixo.
        ...(reconstruido ? { autoChainReconstruido: true } : {}),
      })
      if (reconstruido) {
        rastrearTreino(EVENTOS_TREINO.blocoAutomatico, { bloco: setIdx + 1, reconstruido: true })
      }
      // Carimba o próximo bloco: é ele quem decide o que fazer com o horário.
      if (autoChainOn && temProximoBloco) {
        updateLog(proximaKey, { autoStartAtMs: proximoBlocoComecaEmMs(fimMs, restTime) })
      }
      // Encadeia o descanso configurado (paridade com plank/sets normais). Num
      // bloco reconstruído o descanso também já passou — abrir a barra agora
      // seria cronometrar um intervalo que acabou faz minutos.
      if (restTime > 0 && !reconstruido) {
        startTimer(restTime, {
          kind: 'rest',
          key,
          nextKey: temProximoBloco ? proximaKey : null,
          restStartedAtMs: fimMs,
        })
      }
      maybeCollapseIfLastSet()
    },
    [
      key, updateLog, speed, incline, isTreadmill, restTime, startTimer, maybeCollapseIfLastSet,
      autoChainOn, temProximoBloco, proximaKey, setIdx,
    ],
  )

  /**
   * Liga o cronômetro deste bloco. `desdeMs` permite arrancar com o relógio já
   * correndo — é o que faz o encadeamento não perder os segundos gastos entre a
   * conclusão do bloco anterior e o render deste.
   */
  const iniciarCronometro = useCallback((desdeMs: number, automatico = false) => {
    startedAtRef.current = desdeMs
    setStartedAtMs(desdeMs)
    setIsRunning(true)
    // Só anuncia o bloco quando ele trocou SOZINHO. Quem tocou em "Iniciar"
    // acabou de ler na tela o que vem — repetir em voz alta é ruído.
    if (automatico) {
      rastrearTreino(EVENTOS_TREINO.blocoAutomatico, { bloco: setIdx + 1, reconstruido: false })
    }
    if (automatico && vozLigada) {
      falarComRelato(fraseDoBloco({
        numero: setIdx + 1,
        duracaoSegundos: targetSeconds,
        velocidade: speed,
        unidadeEhKmH: isTreadmill,
      }))
    }
    const restantes = Math.max(1, targetSeconds - Math.floor((Date.now() - desdeMs) / 1000))
    startTimer(restantes, {
      kind: 'cardio',
      key,
      exerciseName: name,
      // `finalDurationSeconds` chega quando o usuário encerra pela barra do
      // cronômetro antes da meta — grava o tempo REAL, não o planejado.
      onComplete: (finalDurationSeconds?: number) => {
        const done = Number.isFinite(finalDurationSeconds) && Number(finalDurationSeconds) > 0
          ? Math.round(Number(finalDurationSeconds))
          : targetSeconds
        commitLog(done)
        setIsRunning(false)
      },
    })
  }, [targetSeconds, startTimer, key, name, commitLog, vozLigada, setIdx, speed, isTreadmill, falarComRelato])

  const handleStart = useCallback(() => {
    if (Date.now() - lastToggleRef.current < 400) return
    if (!canStart) return
    lastToggleRef.current = Date.now()
    iniciarCronometro(Date.now())
  }, [canStart, iniciarCronometro])

  const done = !!log.done

  // ── O efeito que faz a cadeia andar ────────────────────────────────────────
  //
  // Precisa rodar ANTES do `return` do cronômetro (Rules of Hooks) e não pode
  // ler `Date.now()` no corpo do componente — por isso a decisão inteira sai de
  // `decidirBlocoAutomatico`, chamada de dentro do efeito.
  //
  // O re-agendamento tem teto (`RECHECAGEM_MAX_MS`) de propósito: um
  // `setTimeout` de 15 min não sobrevive ao congelamento do WebView, e ao
  // acordar precisamos reavaliar logo em vez de esperar um timer morto.
  const decidirRef = useRef<() => void>(() => { })
  useEffect(() => {
    if (!autoChainOn || done || isRunning || autoStartAtMs <= 0 || targetSeconds <= 0) return
    let cancelado = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const aplicar = () => {
      if (cancelado) return
      const decisao = decidirBlocoAutomatico({ autoStartAtMs, targetSeconds, agoraMs: Date.now() })
      if (decisao.acao === 'aguardar') {
        timer = setTimeout(aplicar, Math.min(decisao.emMs, RECHECAGEM_MAX_MS))
        return
      }
      if (decisao.acao === 'iniciar') {
        iniciarCronometro(decisao.startedAtMs, true)
        return
      }
      if (decisao.acao === 'concluir') {
        commitLog(decisao.duracaoSegundos, {
          terminouEmMs: decisao.terminouEmMs,
          reconstruido: decisao.reconstruido,
        })
        return
      }
      if (decisao.acao === 'expirado') setAutoExpirado(true)
    }

    decidirRef.current = aplicar
    aplicar()
    return () => {
      cancelado = true
      if (timer) clearTimeout(timer)
    }
  }, [autoChainOn, done, isRunning, autoStartAtMs, targetSeconds, iniciarCronometro, commitLog])

  // Voltar do background é o caso que o `setTimeout` acima NÃO cobre: ele não
  // roda enquanto o WebView está suspenso. Reavaliar no `visibilitychange` é o
  // que transforma o carimbo em decisão assim que a tela acende.
  useEffect(() => {
    if (!autoChainOn) return
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') decidirRef.current?.()
    }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => document.removeEventListener('visibilitychange', aoVoltar)
  }, [autoChainOn])

  // ── A voz dos marcos de tempo ──────────────────────────────────────────────
  // Um tique de 1 s só enquanto ESTE bloco roda e só com a voz ligada. O marco
  // sai do TOTAL do exercício (blocos anteriores + decorrido daqui), nunca do
  // relógio deste bloco — senão "cinco minutos" seria dito uma vez por bloco.
  useEffect(() => {
    if (!vozLigada || !isRunning) return
    // Semeia com o marco que os blocos anteriores JÁ alcançaram: sem isso, o
    // bloco 2 reanunciaria o "5 minutos" que o bloco 1 acabou de falar.
    const jaAlcancado = marcoDeVozMinutos(segundosDosBlocosAnteriores, vozIntervaloMin, 0)
    if (jaAlcancado != null && jaAlcancado > ultimoMarcoRef.current) {
      ultimoMarcoRef.current = jaAlcancado
    }
    const id = setInterval(() => {
      const decorrido = Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000))
      const total = segundosDosBlocosAnteriores + decorrido
      const marco = marcoDeVozMinutos(total, vozIntervaloMin, ultimoMarcoRef.current)
      if (marco == null) return
      ultimoMarcoRef.current = marco
      falarComRelato(fraseDoMarco(marco))
    }, 1000)
    return () => clearInterval(id)
  }, [vozLigada, isRunning, vozIntervaloMin, segundosDosBlocosAnteriores, falarComRelato])

  const handleStop = useCallback(() => {
    if (Date.now() - lastToggleRef.current < 400) return
    lastToggleRef.current = Date.now()
    const elapsedSec = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000))
    commitLog(elapsedSec)
    setIsRunning(false)
  }, [commitLog])

  // "Concluir sem cronômetro": o usuário fez o cardio no próprio aparelho e só
  // quer registrar o tempo alvo, sem esperar a contagem no app.
  const handleLogNow = useCallback(() => {
    if (Date.now() - lastToggleRef.current < 400) return
    if (!canStart) return
    lastToggleRef.current = Date.now()
    commitLog(targetSeconds)
  }, [canStart, targetSeconds, commitLog])

  const loggedDuration =
    typeof log.durationSeconds === 'number' && log.durationSeconds > 0 ? log.durationSeconds : null
  const doneSummary = (() => {
    const parts: string[] = []
    if (loggedDuration != null) {
      const min = Math.round((loggedDuration / 60) * 10) / 10
      parts.push(`${min} min`)
    }
    if (log.speed != null && log.speed !== '') parts.push(`${log.speed} km/h`)
    if (isTreadmill && log.incline != null && log.incline !== '') parts.push(`${log.incline}%`)
    return parts.join(' • ')
  })()

  if (isRunning) {
    return (
      <RunningTimerCard
        setIdx={setIdx}
        label="Cardio"
        startedAtMs={startedAtMs}
        targetSeconds={targetSeconds}
        onStop={handleStop}
      />
    )
  }

  const containerClass = done
    ? 'rounded-xl border px-3 py-2.5 bg-emerald-950/30 border-emerald-500/30 space-y-2'
    : 'rounded-xl border px-3 py-2.5 bg-neutral-900/50 border-neutral-800/80 space-y-2'
  const badgeClass = done
    ? 'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center font-black text-[11px] bg-emerald-500 text-black'
    : 'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center font-black text-[11px] bg-yellow-500 text-black'
  const gridCols = isTreadmill ? 'grid-cols-3' : 'grid-cols-2'
  // `openCardioGps` só vem do contexto quando o painel de GPS não está visível.
  const showGpsShortcut = Boolean(openCardioGps) && setIdx === 0 && !isIndoorCardioName(name)
  // O encadeamento só existe entre blocos — oferecê-lo num cardio de série única
  // seria um interruptor que não liga nada. Fica no PRIMEIRO bloco: é onde a
  // pessoa está olhando quando decide como o exercício vai rodar.
  const showAutoChainToggle = Boolean(toggleCardioAutoChain) && setIdx === 0 && temProximoBloco && !done

  return (
    <div className={containerClass}>
      <div className="flex items-center gap-2">
        <div className={badgeClass}>{done ? <Check size={12} /> : setIdx + 1}</div>
        <div className={`flex-1 grid ${gridCols} gap-1.5 min-w-0`}>
          <div>
            <label
              htmlFor={minutesInputId}
              className="text-[10px] uppercase tracking-widest text-neutral-400 font-bold mb-0.5 flex items-end leading-tight h-[2.6em]"
            >
              Tempo (min)
            </label>
            <input
              id={minutesInputId}
              aria-label="Tempo em minutos"
              inputMode="decimal"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className={inputBase}
              placeholder="min"
            />
          </div>
          <div>
            <label
              htmlFor={speedInputId}
              className="text-[10px] uppercase tracking-widest text-neutral-400 font-bold mb-0.5 flex items-end leading-tight h-[2.6em]"
            >
              {isTreadmill ? 'Veloc. (km/h)' : 'Intensidade'}
            </label>
            <input
              id={speedInputId}
              aria-label={isTreadmill ? 'Velocidade em km/h' : 'Intensidade'}
              inputMode="decimal"
              value={speed}
              onChange={(e) => setSpeed(e.target.value)}
              className={inputBase}
              placeholder={isTreadmill ? 'km/h' : 'nível'}
            />
          </div>
          {isTreadmill && (
            <div>
              <label
                htmlFor={inclineInputId}
                className="text-[10px] uppercase tracking-widest text-neutral-400 font-bold mb-0.5 flex items-end leading-tight h-[2.6em]"
              >
                Inclin. (%)
              </label>
              <input
                id={inclineInputId}
                aria-label="Inclinação em porcentagem"
                inputMode="decimal"
                value={incline}
                onChange={(e) => setIncline(e.target.value)}
                className={inputBase}
                placeholder="%"
              />
            </div>
          )}
        </div>
      </div>

      {done ? (
        <div className="space-y-1.5">
          <div className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl font-black text-sm bg-emerald-500/20 border border-emerald-500/40 text-emerald-300">
            <Check size={16} />
            Concluído{doneSummary ? ` (${doneSummary})` : ''}
          </div>
          {foiReconstruido && (
            <div className="flex items-start gap-1.5 text-[11px] font-bold text-amber-300/90 px-1">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <span>Concluído automaticamente pelo tempo planejado — a tela estava desligada.</span>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          {autoExpirado && (
            <div className="flex items-start gap-1.5 text-[11px] font-bold text-amber-300/90 px-1">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <span>Este bloco ficou parado tempo demais. Confira o tempo e conclua você mesmo.</span>
            </div>
          )}
          <button
            type="button"
            onClick={handleStart}
            disabled={!canStart}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl font-black text-sm bg-yellow-500 text-black disabled:bg-neutral-800 disabled:text-neutral-600 transition-all duration-200"
          >
            <Play size={16} />
            Iniciar {canStart ? `(${Math.round((targetSeconds / 60) * 10) / 10} min)` : ''}
          </button>
          <button
            type="button"
            onClick={handleLogNow}
            disabled={!canStart}
            className="w-full text-center text-[12px] font-bold text-neutral-400 disabled:text-neutral-700 py-1"
          >
            Concluir sem cronômetro
          </button>
          {showAutoChainToggle && (
            <button
              type="button"
              onClick={() => toggleCardioAutoChain?.(!autoChainOn)}
              aria-pressed={autoChainOn}
              className={`w-full inline-flex items-center justify-center gap-1.5 text-[12px] font-bold py-1 active:scale-95 transition-transform ${autoChainOn ? 'text-yellow-500' : 'text-neutral-400'}`}
            >
              <Repeat size={13} />
              {autoChainOn ? 'Blocos em sequência: ligado' : 'Encadear blocos automaticamente'}
            </button>
          )}
          {/* Porta de entrada do GPS quando o painel não está no topo. Só na
              primeira série (não repetir 4×) e nunca em máquina parada. */}
          {showGpsShortcut && (
            <button
              type="button"
              onClick={() => openCardioGps?.()}
              className="w-full inline-flex items-center justify-center gap-1.5 text-[12px] font-bold text-emerald-400/90 py-1 active:scale-95 transition-transform"
            >
              <Satellite size={13} />
              Rastrear percurso com GPS
            </button>
          )}
        </div>
      )}
    </div>
  )
}

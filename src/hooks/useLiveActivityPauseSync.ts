/**
 * @module useLiveActivityPauseSync
 *
 * Mantém o cronômetro da Live Activity (ilha dinâmica + tela bloqueada) igual ao
 * do app.
 *
 * O relógio de lá é `Text(timerInterval:)`: o SISTEMA conta sozinho a partir de
 * uma data, sem saber o que é pausa. O app mostrava "PAUSADO 56:07" e a ilha
 * seguia subindo (relatado pelo dono em 07/08/2026). E não é só a pausa manual —
 * `WorkoutTimerProvider` também desconta gaps longos de background, que a
 * contagem de parede da ilha ignora do mesmo jeito.
 *
 * Por isso o sync manda o `elapsedSeconds` do app (a verdade) em dois momentos:
 *   • toda troca de pausa → congela ou re-ancora;
 *   • uma vez no início → ancora a activity recém-criada, corrigindo a diferença
 *     herdada de uma sessão restaurada.
 *
 * O que NÃO faz: mandar update a cada tique. ActivityKit limita ~120 updates/h e
 * o relógio corrente já é desenhado pelo sistema — só a âncora precisa viajar.
 */
'use client'

import { useEffect, useRef } from 'react'
import { setWorkoutLiveActivityPaused } from '@/utils/native/irontracksNative'

/** Espera a Live Activity nascer antes da âncora inicial. O start é assíncrono e
 *  pode aguardar o bridge do Capacitor (até ~5 s de polling no
 *  `useWorkoutLiveActivity`); ancorar antes disso não encontraria activity
 *  nenhuma e o ajuste se perderia em silêncio. */
const INITIAL_ANCHOR_DELAY_MS = 6000

/** Abaixo disto a diferença é ruído de arredondamento — não vale um update. */
const ANCHOR_TOLERANCE_SEC = 5

export function useLiveActivityPauseSync({
  isPaused,
  elapsedSeconds,
  startedAtMs,
}: {
  isPaused: boolean
  elapsedSeconds: number
  /** Início do treino (ms). Usado só para medir a divergência inicial. */
  startedAtMs: number
}): void {
  // `elapsedSeconds` muda a cada segundo. Ele entra por ref, e NÃO nas deps, pra
  // o efeito disparar na troca de pausa — não uma vez por tique. Refs atualizadas
  // por effect espelho (escrever durante o render é impuro; mesmo padrão de
  // `useUnreadBadges`), e declaradas ANTES dos efeitos que as leem.
  const elapsedRef = useRef(elapsedSeconds)
  const startedAtRef = useRef(startedAtMs)
  useEffect(() => { elapsedRef.current = elapsedSeconds }, [elapsedSeconds])
  useEffect(() => { startedAtRef.current = startedAtMs }, [startedAtMs])

  const skipFirstRef = useRef(true)

  useEffect(() => {
    // No mount não há transição para espelhar: quem cuida do estado inicial é o
    // efeito de âncora abaixo.
    if (skipFirstRef.current) {
      skipFirstRef.current = false
      return
    }
    void setWorkoutLiveActivityPaused(isPaused, elapsedRef.current)
  }, [isPaused])

  useEffect(() => {
    // A divergência herdada é medida NO MOUNT, não quando o envio acontece: ela não
    // muda com o passar do tempo (parede e cronômetro andam juntos enquanto o
    // treino corre), e medir depois confundiria a própria espera com divergência.
    const startedAt = startedAtRef.current
    if (!Number.isFinite(startedAt) || startedAt <= 0) return
    const wallSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
    if (Math.abs(wallSeconds - elapsedRef.current) <= ANCHOR_TOLERANCE_SEC) return
    // Sessão restaurada: a activity nasce com o tempo de parede cheio. Ancora uma
    // vez, com o valor do app no instante do envio.
    const timer = setTimeout(() => {
      void setWorkoutLiveActivityPaused(false, elapsedRef.current)
    }, INITIAL_ANCHOR_DELAY_MS)
    return () => clearTimeout(timer)
  }, [])
}

'use client'

import React from 'react'
import { Mic, Square } from 'lucide-react'
import { useWorkoutContext, useWorkoutLogs } from './WorkoutContext'
import { useDitadoDaSerie } from './hooks/useDitadoDaSerie'
import { resolverSerieAlvoDaVoz } from '@/lib/workout/serieAlvoDaVoz'
import { sessaoEhPropria } from '@/lib/workout/sessionOwnership'

/* ──────────────────────────────────────────────────────────────────────────
 * Botão de voz por EXERCÍCIO (não por série) — pedido do dono, 19/09/2026.
 * Plano completo: `docs/plans/voz-na-serie.md`.
 *
 * ## Por que "por exercício" e não "por série"
 *
 * Medido: um microfone de 36px na linha da série tira 28% da largura dos
 * campos peso/reps/RPE no iPhone comum, deixando o RPE com ~23px — não cabe
 * "8,5". O botão por exercício sai de cima do grid da série inteiramente.
 *
 * ## Por que a série alvo precisa ser calculada e MOSTRADA antes de ouvir
 *
 * A combinação de decisões do dono ("por exercício" + "não conclui
 * automaticamente") exige que o alvo ANDE a cada ditado — senão ditar duas
 * vezes seguidas sobrescreve a mesma série em silêncio (ver
 * `serieAlvoDaVoz.ts`). Dizer "vai para a série 2" antes de gravar é o que
 * torna esse comportamento visível em vez de uma mágica que erra.
 *
 * ## Por que este componente não aparece no card do parceiro
 *
 * Mesma regra do `ExerciseChatButton`: `ExerciseCard` é compartilhado com o
 * Modo Spotter (`PartnerExerciseOverlay`), e escrever no log de OUTRA pessoa
 * a partir da MINHA fala seria gravar dado do parceiro como se fosse ação
 * dele. `sessaoEhPropria` é o mesmo discriminador que a conversa de IA usa
 * (extraído para `sessionOwnership.ts` justamente por este botão).
 * ────────────────────────────────────────────────────────────────────────── */

interface VoiceExerciseButtonProps {
  exIdx: number
}

export default function VoiceExerciseButton({ exIdx }: VoiceExerciseButtonProps) {
  const { session, exercises, updateLog } = useWorkoutContext()
  const logs = useWorkoutLogs()

  // `ultimoResultado` expira sozinho (ver `useDitadoDaSerie` — a janela vive
  // lá, não aqui: manter dois estados temporizados em sincronia entre hook e
  // componente é o tipo de duplicação que diverge em silêncio). `erro` fica
  // visível até a próxima tentativa, que o substitui ou o limpa.
  const { gravando, erro, permissaoNegada, ultimoResultado, iniciar, parar } = useDitadoDaSerie({
    exercises, logs, exIdx, updateLog,
  })

  if (!sessaoEhPropria(session)) return null

  const alvo = resolverSerieAlvoDaVoz(exercises, logs, exIdx, null)
  const rotuloSerie = alvo !== null ? `${alvo + 1}ª série` : null

  const aria = gravando
    ? 'Parar ditado'
    : rotuloSerie
      ? `Ditar peso, reps e RPE por voz — vai preencher a ${rotuloSerie}`
      : 'Ditar peso, reps e RPE por voz'

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          try { e.preventDefault(); e.stopPropagation() } catch { /* teste sem evento sintético */ }
          if (gravando) parar()
          else iniciar()
        }}
        aria-label={aria}
        title={aria}
        className={[
          'tap-44 h-9 w-9 inline-flex items-center justify-center rounded-xl border transition-colors active:scale-95 flex-shrink-0',
          gravando
            ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400 animate-pulse'
            : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-yellow-400 hover:bg-neutral-800',
        ].join(' ')}
      >
        {gravando ? <Square size={13} aria-hidden="true" /> : <Mic size={15} aria-hidden="true" />}
      </button>

      {gravando && rotuloSerie && (
        <div
          role="status"
          className="absolute top-full right-0 mt-1 z-20 whitespace-nowrap rounded-lg bg-neutral-900 border border-yellow-500/40 px-2 py-1 text-[10px] font-bold text-yellow-300"
        >
          Ouvindo para a {rotuloSerie}…
        </div>
      )}

      {!gravando && (permissaoNegada || erro) && (
        <div
          role="status"
          className="absolute top-full right-0 mt-1 z-20 max-w-[220px] rounded-lg bg-neutral-900 border border-amber-500/40 px-2 py-1 text-[10px] font-semibold text-amber-300"
        >
          {permissaoNegada ? 'Permissão de microfone negada.' : erro}
        </div>
      )}

      {!gravando && !erro && ultimoResultado && (
        <div
          role="status"
          className={[
            'absolute top-full right-0 mt-1 z-20 whitespace-nowrap rounded-lg border px-2 py-1 text-[10px] font-bold',
            ultimoResultado.entendeu
              ? 'bg-neutral-900 border-emerald-500/40 text-emerald-300'
              : 'bg-neutral-900 border-amber-500/40 text-amber-300',
          ].join(' ')}
        >
          {ultimoResultado.entendeu
            ? `Preenchi a ${ultimoResultado.serie}ª série`
            : 'Não entendi — tenta de novo'}
        </div>
      )}
    </div>
  )
}

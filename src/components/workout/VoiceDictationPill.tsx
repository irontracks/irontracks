'use client'

import React from 'react'
import { Mic, Square } from 'lucide-react'
import { useWorkoutContext, useWorkoutLogs } from './WorkoutContext'
import { useDitadoDaSerie } from './hooks/useDitadoDaSerie'
import { resolverSerieAlvoDaVoz } from '@/lib/workout/serieAlvoDaVoz'
import { REPS_PARA_CONFERIR } from '@/lib/workout/falaDaSerie'

/* ──────────────────────────────────────────────────────────────────────────
 * O GATILHO do ditado — um ícone na linha do FINALIZAR.
 *
 * ## Como ele encolheu (19/09/2026, o dono vendo no aparelho)
 *
 * Nasceu como uma FAIXA de largura quase inteira, com o microfone e o alvo
 * escrito ("Supino · 2ª série"). Olhando na tela, o dono cortou: *"não
 * preciso, deixa só o microfone, só o ícone — aí ele pode ficar na linha do
 * finalizar deixando a tela mais limpa"*. É a mesma régua que esvaziou este
 * rodapé em 18/08/2026: **peso de superfície proporcional à frequência de
 * uso**, e o alvo escrito era informação permanente para uma ação pontual.
 *
 * ## O que NÃO se perdeu junto com o texto
 *
 * O alvo continua sendo dito — só deixou de ocupar a tela em repouso:
 *  • no `aria-label`, para quem usa leitor de tela;
 *  • num balão TRANSITÓRIO, que aparece enquanto ouve e ao terminar
 *    ("Preenchi a 2ª série", "Não entendi", "100 reps — confere?").
 *
 * Um gatilho que nunca diz onde escreveu pediria fé; um que diz o tempo todo
 * cobra espaço permanente. O balão só existe quando há o que dizer.
 *
 * ## Por que continua dentro do `WorkoutFooter`
 *
 * O rodapé já resolve a convivência com a barra do descanso (sobe por
 * `--it-rest-bar-h`). Uma barra fixa própria repetiria de fora o bug que já
 * deixou o FINALIZAR inalcançável — z-index não resolve disputa de espaço.
 * ────────────────────────────────────────────────────────────────────────── */

export default function VoiceDictationPill() {
  const { vozLigada, exercises, currentExerciseIdx, updateLog } = useWorkoutContext()
  const logs = useWorkoutLogs()

  const exIdx = Number.isFinite(currentExerciseIdx) ? Number(currentExerciseIdx) : 0
  const { gravando, erro, permissaoNegada, ultimoResultado, iniciar, parar } = useDitadoDaSerie({
    exercises, logs, exIdx, updateLog,
  })

  if (!vozLigada) return null

  const exArr = Array.isArray(exercises) ? exercises : []
  const ex = exArr[exIdx] as { name?: unknown } | undefined
  const nome = String(ex?.name ?? '').trim()
  const alvo = resolverSerieAlvoDaVoz(exercises, logs, exIdx, null)
  const rotuloSerie = alvo !== null ? `${alvo + 1}ª série` : null

  // O alvo sai da tela, mas não do app: quem usa leitor de tela continua
  // ouvindo onde o ditado vai cair antes de tocar.
  const aria = gravando
    ? 'Parar o ditado'
    : rotuloSerie
      ? `Ditar peso, reps e RPE — vai preencher a ${rotuloSerie}${nome ? ` de ${nome}` : ''}`
      : 'Ditar peso, reps e RPE'

  /** Balão transitório: só existe quando há algo a dizer. */
  const aviso = (() => {
    if (permissaoNegada) return { texto: 'Permissão de microfone negada', tom: 'alerta' as const }
    if (erro) return { texto: erro, tom: 'alerta' as const }
    if (gravando) return { texto: rotuloSerie ? `Ouvindo — ${rotuloSerie}` : 'Ouvindo…', tom: 'ativo' as const }
    if (ultimoResultado && !ultimoResultado.entendeu) {
      return { texto: 'Não entendi — tenta de novo', tom: 'alerta' as const }
    }
    if (ultimoResultado?.entendeu) {
      // Reps implausível não bloqueia, mas PEDE conferência — decisão do dono
      // depois de falar "100 repetições" por engano.
      if (ultimoResultado.repsSuspeita !== undefined) {
        return { texto: `${ultimoResultado.repsSuspeita} reps — confere?`, tom: 'alerta' as const }
      }
      return { texto: `Preenchi a ${ultimoResultado.serie}ª série`, tom: 'ok' as const }
    }
    return null
  })()

  const corDoBalao =
    aviso?.tom === 'alerta' ? 'border-amber-500/40 text-amber-300'
      : aviso?.tom === 'ok' ? 'border-emerald-500/40 text-emerald-300'
        : 'border-yellow-500/40 text-yellow-300'

  return (
    <div className="relative pointer-events-auto">
      {aviso && (
        <div
          role="status"
          className={`absolute bottom-full right-0 mb-2 whitespace-nowrap rounded-lg border bg-neutral-900/95 px-2.5 py-1.5 text-[11px] font-bold shadow-lg shadow-black/50 backdrop-blur ${corDoBalao}`}
        >
          {aviso.texto}
        </div>
      )}

      <button
        type="button"
        onClick={() => { if (gravando) parar(); else iniciar() }}
        aria-label={aria}
        title={aria}
        className={[
          // Mesma altura do FINALIZAR ao lado (h-9 + alvo de 44pt pelo ::after),
          // para os dois lerem como uma fileira, não como dois tamanhos.
          'tap-44 h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-full border shadow-lg shadow-black/50 backdrop-blur transition-all duration-300 active:scale-95',
          gravando
            ? 'bg-yellow-500/25 border-yellow-500/60 text-yellow-300 animate-pulse'
            // Neutro em repouso, como o FINALIZAR enquanto há série pendente:
            // o dourado sólido é da ação primária, e ditar não é ela.
            : 'bg-neutral-900/90 border-neutral-700/70 text-neutral-300 hover:border-yellow-500/40 hover:text-yellow-400',
        ].join(' ')}
      >
        {gravando ? <Square size={13} aria-hidden="true" /> : <Mic size={15} aria-hidden="true" />}
      </button>
    </div>
  )
}

/** Reexport para quem só quer o limiar (testes/telas de ajuda). */
export { REPS_PARA_CONFERIR }

'use client'

import React from 'react'
import { Mic, Square, X } from 'lucide-react'
import { useWorkoutContext, useWorkoutLogs } from './WorkoutContext'
import { useDitadoDaSerie } from './hooks/useDitadoDaSerie'
import { resolverSerieAlvoDaVoz } from '@/lib/workout/serieAlvoDaVoz'
import { REPS_PARA_CONFERIR } from '@/lib/workout/falaDaSerie'

/* ──────────────────────────────────────────────────────────────────────────
 * O GATILHO do ditado — a faixa que acompanha a rolagem.
 *
 * Mora DENTRO do `WorkoutFooter`, não como barra fixa própria. Isso não é
 * detalhe de organização: o rodapé do treino já resolve a convivência com a
 * barra do descanso (sobe por `--it-rest-bar-h`), e uma SEGUNDA barra fixa
 * repetiria de fora o bug que já deixou o FINALIZAR inalcançável — "duas
 * barras disputam o mesmo espaço físico, e z-index não resolve".
 *
 * ## O alvo é o exercício da VEZ, não onde o modo foi ligado
 *
 * `currentExerciseIdx` é a resposta que o app JÁ dá para "onde o usuário
 * está": `focoAposSerieConcluida` a move sozinha quando uma série é
 * concluída, a tira de navegação a veste de dourado e a Live Activity a
 * anuncia na tela bloqueada. Inventar um segundo conceito de "onde estou"
 * faria as duas superfícies discordarem — e o usuário rolaria dois
 * exercícios para ditar no errado.
 *
 * ## Por que a faixa DIZ o alvo
 *
 * Com a tela rolada o card não está à vista. Um gatilho que não diz onde vai
 * escrever pede fé; dizer "Supino · 2ª série" antes de ouvir é o que torna o
 * alvo automático verificável — a mesma razão pela qual o botão da primeira
 * versão já dizia isso no `aria-label`.
 * ────────────────────────────────────────────────────────────────────────── */

export default function VoiceDictationPill() {
  const { vozLigada, setVozLigada, exercises, currentExerciseIdx, updateLog } = useWorkoutContext()
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

  const aria = gravando
    ? 'Parar o ditado'
    : rotuloSerie
      ? `Ditar peso, reps e RPE — vai preencher a ${rotuloSerie}${nome ? ` de ${nome}` : ''}`
      : 'Ditar peso, reps e RPE'

  // Mensagem de estado — uma linha só, sempre no mesmo lugar, para o olho não
  // precisar procurar. Prioridade: erro > resultado > alvo.
  const linhaDeEstado = (() => {
    if (permissaoNegada) return { texto: 'Permissão de microfone negada', tom: 'alerta' as const }
    if (erro) return { texto: erro, tom: 'alerta' as const }
    if (gravando) return { texto: 'Ouvindo…', tom: 'ativo' as const }
    if (ultimoResultado && !ultimoResultado.entendeu) {
      return { texto: 'Não entendi — tenta de novo', tom: 'alerta' as const }
    }
    if (ultimoResultado?.entendeu) {
      // Reps implausível não bloqueia, mas PEDE conferência: decisão do dono
      // depois de falar "100 repetições" por engano (19/09/2026). Bloquear
      // quebraria quem faz série longa de verdade (abdominal, cardio).
      if (ultimoResultado.repsSuspeita !== undefined) {
        return { texto: `Preenchi ${ultimoResultado.repsSuspeita} reps — confere?`, tom: 'alerta' as const }
      }
      return { texto: `Preenchi a ${ultimoResultado.serie}ª série`, tom: 'ok' as const }
    }
    return { texto: nome ? `${nome} · ${rotuloSerie ?? ''}`.trim() : (rotuloSerie ?? ''), tom: 'neutro' as const }
  })()

  const corDaLinha =
    linhaDeEstado.tom === 'alerta' ? 'text-amber-300'
      : linhaDeEstado.tom === 'ok' ? 'text-emerald-300'
        : linhaDeEstado.tom === 'ativo' ? 'text-yellow-300'
          : 'text-neutral-300'

  return (
    <div className="pointer-events-auto mb-2 flex items-center gap-2 rounded-2xl border border-neutral-700/70 bg-neutral-900/95 px-2 py-2 shadow-lg shadow-black/50 backdrop-blur">
      <button
        type="button"
        onClick={() => { if (gravando) parar(); else iniciar() }}
        aria-label={aria}
        title={aria}
        className={[
          'tap-44 h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-xl border transition-colors active:scale-95',
          gravando
            ? 'bg-yellow-500/25 border-yellow-500/60 text-yellow-300 animate-pulse'
            : 'bg-yellow-500 border-yellow-400 text-black',
        ].join(' ')}
      >
        {gravando ? <Square size={15} aria-hidden="true" /> : <Mic size={17} aria-hidden="true" />}
      </button>

      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
          Ditar na
        </p>
        <p className={`truncate text-xs font-bold ${corDaLinha}`} role="status">
          {linhaDeEstado.texto || '—'}
        </p>
      </div>

      <button
        type="button"
        onClick={() => { if (gravando) parar(); setVozLigada(false) }}
        aria-label="Desligar o preenchimento por voz"
        title="Desligar o preenchimento por voz"
        className="tap-44 h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-xl border border-neutral-700 bg-black/30 text-neutral-400 transition-colors hover:text-white active:scale-95"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  )
}

/** Reexport para quem só quer o limiar (testes/telas de ajuda). */
export { REPS_PARA_CONFERIR }

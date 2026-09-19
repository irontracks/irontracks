'use client'

import React from 'react'
import { Mic, MicOff } from 'lucide-react'
import { useWorkoutContext } from './WorkoutContext'
import { sessaoEhPropria } from '@/lib/workout/sessionOwnership'

/* ──────────────────────────────────────────────────────────────────────────
 * INTERRUPTOR do ditado por voz — liga/desliga, não dita.
 *
 * ## Por que ele deixou de ditar (19/09/2026)
 *
 * Na primeira versão este botão era o gatilho: tocava, falava, ele preenchia.
 * Relato do dono no uso real: *"conforme você vai descendo e concluindo as
 * séries o botão fica fixo e vai subindo com a tela"* — o botão mora no
 * cabeçalho do card, então rolar até as séries de baixo levava o microfone
 * junto, embora seja ali que ele é preciso.
 *
 * A separação foi ideia dele: **este botão liga o MODO**, e quem dita é uma
 * faixa no rodapé (`VoiceDictationPill`), que acompanha a rolagem e mira no
 * exercício da VEZ (`currentExerciseIdx`).
 *
 * ## Por que o estado é da SESSÃO e não do card
 *
 * Todos os cards refletem o mesmo interruptor — ligar em um liga em todos.
 * Um estado por card faria o rodapé perguntar "ligado por quem?", e a
 * resposta mudaria conforme a rolagem.
 *
 * ## Por que continua em cada card, e não num lugar só
 *
 * Decisão do dono na mesma conversa. Ligar é ação rara (uma vez por treino),
 * e o custo de tê-lo aqui é um ícone que já existia; o ganho é não precisar
 * procurar um menu com a mão suada no meio da série.
 *
 * Some na sessão do parceiro pelo mesmo discriminador da conversa de IA —
 * ver `sessionOwnership.ts`.
 * ────────────────────────────────────────────────────────────────────────── */

export default function VoiceExerciseButton() {
  const { session, vozLigada, setVozLigada } = useWorkoutContext()

  if (!sessaoEhPropria(session)) return null

  const aria = vozLigada
    ? 'Desligar o preenchimento por voz'
    : 'Ligar o preenchimento por voz (peso, reps e RPE)'

  return (
    <button
      type="button"
      onClick={(e) => {
        try { e.preventDefault(); e.stopPropagation() } catch { /* teste sem evento sintético */ }
        setVozLigada(!vozLigada)
      }}
      aria-pressed={vozLigada}
      aria-label={aria}
      title={aria}
      className={[
        'tap-44 h-9 w-9 inline-flex items-center justify-center rounded-xl border transition-colors active:scale-95 flex-shrink-0',
        vozLigada
          ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400'
          : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-yellow-400 hover:bg-neutral-800',
      ].join(' ')}
    >
      {vozLigada ? <Mic size={15} aria-hidden="true" /> : <MicOff size={15} aria-hidden="true" />}
    </button>
  )
}

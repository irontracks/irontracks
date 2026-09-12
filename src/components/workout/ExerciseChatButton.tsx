'use client'

import React, { useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { MessageCircleQuestion } from 'lucide-react'
import { useWorkoutContext } from './WorkoutContext'
import { enderecoDaConversa } from '@/lib/workout/exerciseChatThread'
import ExerciseChatModal from './ExerciseChatModal'

/* ──────────────────────────────────────────────────────────────────────────
 * O gatilho da conversa de IA sobre este exercício.
 *
 * ## Ele NÃO aparece para todo mundo que vê o card
 *
 * `ExerciseCard` é renderizado em três lugares, e um deles — o Modo Spotter
 * (`PartnerExerciseOverlay`) — mostra o exercício do PARCEIRO. A conversa é do
 * DONO da sessão: gravá-la ali carimbaria o meu `user_id` com o `started_at`
 * dela, e o pedido do dono é explícito (a conversa não aparece para quem só
 * está acompanhando). Quem decide é `enderecoDaConversa`, que devolve `null`
 * quando a sessão não é própria — e sem endereço não existe thread a abrir.
 *
 * ## Por que ele não é mais um ícone de IA igual ao do lado
 *
 * A vizinha imediata na barra é a troca de exercício (`AIExerciseSwap`), um
 * `RefreshCw` ÂMBAR. Esta aqui é um balão de pergunta NEUTRO: silhueta
 * diferente, cor diferente, e os `aria-label` dizem coisas distintas
 * ("Sugerir exercícios alternativos" × "Tirar dúvida sobre este exercício").
 * Neutro e não dourado de propósito — o dourado é a ação primária do card, que
 * é concluir a série; e não violeta, que é a cor do que a MÁQUINA decidiu (a
 * RESPOSTA da IA veste violeta lá dentro; o botão que o usuário aciona, não).
 *
 * ## Montagem condicional
 *
 * O modal só monta aberto. Os hooks dele vão à rede (GET da thread) e rodam
 * ANTES de qualquer `return null` — montá-lo sempre daria uma consulta por
 * card de exercício a cada abertura do treino.
 * ────────────────────────────────────────────────────────────────────────── */

interface ExerciseChatButtonProps {
  exerciseName: string
  exerciseIndex: number
}

export default function ExerciseChatButton({
  exerciseName,
  exerciseIndex,
}: ExerciseChatButtonProps) {
  const { session } = useWorkoutContext()
  const [aberto, setAberto] = useState(false)

  const abrir = useCallback((e: React.MouseEvent) => {
    // O card inteiro é um `role="button"` que recolhe o exercício.
    try {
      e.preventDefault()
      e.stopPropagation()
    } catch {
      /* ambientes de teste sem evento sintético completo */
    }
    setAberto(true)
  }, [])

  const fechar = useCallback(() => setAberto(false), [])

  const endereco = enderecoDaConversa(session)
  if (!endereco) return null

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="tap-44 h-9 w-9 inline-flex items-center justify-center rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-yellow-400 hover:bg-neutral-800 transition-colors active:scale-95 flex-shrink-0"
        title="Tirar dúvida sobre este exercício"
        aria-label="Tirar dúvida sobre este exercício"
      >
        <MessageCircleQuestion size={15} aria-hidden="true" />
      </button>

      {/* Portal para o document.body: o <ActiveWorkout> é `fixed inset-0 z-[50]`
          e cria um CONTEXTO DE EMPILHAMENTO — sem sair dele, nenhum z interno
          vence a barra do descanso (z-[2100]), que ficaria por cima do campo de
          escrever. Mesma razão do <Modals /> portalado. */}
      {aberto && typeof document !== 'undefined'
        ? createPortal(
            <ExerciseChatModal
              endereco={endereco}
              exIdx={exerciseIndex}
              exerciseName={exerciseName}
              onFechar={fechar}
            />,
            document.body,
          )
        : null}
    </>
  )
}

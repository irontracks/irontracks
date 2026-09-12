'use client'
import React from 'react'
import { MACHINE_ACCENT } from '@/lib/design/machineAccent'
import {
  EXERCISE_CHAT_SUMMARY_LABEL,
  nomeDivergenteDoResumo,
  type ExerciseChatSummaryView,
} from '@/lib/workout/exerciseChatSummary'

/**
 * O resumo que a IA escreveu sobre ESTE exercício, no relatório em tela.
 *
 * Veste o VIOLETA da máquina (`lib/design/machineAccent`), a mesma cor da nota
 * do motor de carga: o texto não foi escrito pelo aluno nem é medição do app —
 * é saída de IA, e a cor diz isso antes de qualquer rótulo ser lido. Dourado
 * aqui roubaria a cor da ação.
 *
 * ⚠️ Sem resumo NÃO desenha nada — nem moldura, nem "sem resumo". A maioria
 * das sessões não tem conversa nenhuma, e um bloco vazio em todos os cards
 * transformaria o normal em falha aparente.
 */
export function ReportChatSummaryBlock({
  item,
  exerciseName,
}: {
  item?: ExerciseChatSummaryView | null
  exerciseName?: unknown
}) {
  if (!item || !item.summary) return null
  const outroNome = nomeDivergenteDoResumo(item, exerciseName)
  return (
    <div className={`mt-3 border-l-2 pl-3 py-1 ${MACHINE_ACCENT.rule}`}>
      <div className={`text-[10px] t-meta-inherit ${MACHINE_ACCENT.text}`}>
        🧠 {EXERCISE_CHAT_SUMMARY_LABEL}
      </div>
      {/* O exercício foi trocado depois da conversa: dizer sobre o que a IA
          falou é o que impede o resumo de virar mentira sobre outro aparelho. */}
      {outroNome && (
        <div className="mt-0.5 text-[11px] text-neutral-400">sobre &ldquo;{outroNome}&rdquo;</div>
      )}
      <p className="mt-1 whitespace-pre-line text-xs leading-snug text-neutral-200">{item.summary}</p>
    </div>
  )
}

export default ReportChatSummaryBlock

import { escapeHtml } from '@/utils/escapeHtml'
import {
  EXERCISE_CHAT_SUMMARY_LABEL,
  nomeDivergenteDoResumo,
  type ExerciseChatSummaryView,
} from '@/lib/workout/exerciseChatSummary'

/** O violeta da máquina (`lib/design/machineAccent`) em hex — o PDF não tem Tailwind. */
const COR_DA_MAQUINA = '#c4b5fd'

/**
 * O resumo da IA daquele exercício no PDF — **só texto**.
 *
 * A conversa e a mídia ficam no app (a URL assinada expira e o PDF é para
 * durar); o que o avaliador externo — professor, fisioterapeuta, médico —
 * precisa ler é a conclusão, ao lado das séries.
 *
 * Irmão de `ReportChatSummaryBlock` (tela): as duas superfícies leem a MESMA
 * estrutura e decidem a divergência de nome pela MESMA função. Mexeu num,
 * mexa no outro — é a regra desta pasta desde a seção de check-in.
 *
 * Sem resumo devolve string vazia: nada é desenhado.
 */
export function buildChatSummaryHtml(
  item: ExerciseChatSummaryView | null | undefined,
  exerciseName?: unknown,
): string {
  const texto = String(item?.summary || '').trim()
  if (!item || !texto) return ''
  const outroNome = nomeDivergenteDoResumo(item, exerciseName)
  const sobre = outroNome
    ? `<span style="color:#a3a3a3;font-size:10px"> &middot; sobre &ldquo;${escapeHtml(outroNome)}&rdquo;</span>`
    : ''
  return `
    <div style="margin-top:10px;border-left:2px solid rgba(167,139,250,.35);padding:4px 0 4px 10px">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:${COR_DA_MAQUINA};font-weight:600">
        🧠 ${escapeHtml(EXERCISE_CHAT_SUMMARY_LABEL)}${sobre}
      </div>
      <div style="margin-top:3px;font-size:12px;line-height:1.45;color:#e5e5e5;white-space:pre-line">${escapeHtml(texto)}</div>
    </div>`
}

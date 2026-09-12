import { normalizeExerciseKey } from '@/utils/report/formatters'

/**
 * O RESUMO que a IA escreveu no chat de um exercício, na forma única que a
 * TELA do relatório (`ReportExerciseCard`) e o PDF (`buildHtml`) consomem.
 *
 * Por que uma forma só: são DOIS geradores de relatório, e a regra deste repo é
 * explícita — mexeu num, cheque o outro. Quando os dois leem a MESMA estrutura
 * normalizada, campo novo (ou campo que muda de nome) chega aos dois de uma vez
 * em vez de divergir em silêncio, que foi o que já custou 14 renderers aqui.
 *
 * ⚠️ **Ausência é o caso NORMAL.** A feature nasceu em 12/09/2026: treino antigo
 * não tem conversa, e quem não perguntou nada à IA também não tem. Nada aqui
 * devolve mensagem de erro nem bloco vazio — sem resumo, as duas superfícies
 * simplesmente não desenham nada.
 */
export type ExerciseChatSummaryView = {
  /** Índice do exercício na sessão — é a chave que liga o resumo ao card. */
  exerciseIndex: number
  /** Nome do exercício NO MOMENTO da conversa (pode ter sido trocado depois). */
  exerciseName: string
  summary: string
  createdAt: string | null
}

/** Teto de exibição: o resumo é um parágrafo, não um laudo. */
export const EXERCISE_CHAT_SUMMARY_MAX_CHARS = 1200

/** Rótulo do bloco — o mesmo na tela e no PDF, de propósito. */
export const EXERCISE_CHAT_SUMMARY_LABEL = 'Resumo da IA'

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * Normaliza o que veio da rota (camelCase) ou direto do banco (snake_case).
 * Linha sem resumo é DESCARTADA: um bloco "Resumo da IA" vazio afirma que a IA
 * respondeu algo quando ela não respondeu.
 */
export function parseExerciseChatSummaries(raw: unknown): ExerciseChatSummaryView[] {
  if (!Array.isArray(raw)) return []
  const out: ExerciseChatSummaryView[] = []
  for (const item of raw) {
    if (!isRecord(item)) continue
    const idxRaw = item.exerciseIndex ?? item.exercise_index
    const idx = typeof idxRaw === 'number' ? idxRaw : Number(String(idxRaw ?? '').trim())
    if (!Number.isInteger(idx) || idx < 0) continue
    const summary = String(item.summary ?? '').trim().slice(0, EXERCISE_CHAT_SUMMARY_MAX_CHARS)
    if (!summary) continue
    const nome = item.exerciseName ?? item.exercise_name
    const criadoEm = item.createdAt ?? item.created_at
    out.push({
      exerciseIndex: idx,
      exerciseName: String(nome ?? '').trim(),
      summary,
      createdAt: criadoEm ? String(criadoEm) : null,
    })
  }
  return out
}

/**
 * Um resumo por exercício. O banco garante (UNIQUE user_id + session_started_at
 * + exercise_index); aqui o primeiro vence, para o caso de a lista chegar com
 * lixo repetido de duas sessões do mesmo treino.
 */
export function groupExerciseChatSummariesByIndex(
  raw: unknown,
): Record<number, ExerciseChatSummaryView> {
  const mapa: Record<number, ExerciseChatSummaryView> = {}
  for (const item of parseExerciseChatSummaries(raw)) {
    if (!mapa[item.exerciseIndex]) mapa[item.exerciseIndex] = item
  }
  return mapa
}

/**
 * O nome sob o qual a conversa aconteceu, QUANDO ele não é o nome do card.
 *
 * Trocar o exercício no meio do treino mantém o índice e muda o nome (o mesmo
 * motivo pelo qual a rota do chat devolve `nomeAnterior`). Atribuir o texto ao
 * exercício novo seria a IA falando de um aparelho que o aluno não usou —
 * esconder o resumo seria perder dado. Então ele aparece, declarando sobre o
 * que foi escrito. Devolve `null` quando batem, que é o caso normal.
 */
export function nomeDivergenteDoResumo(
  item: ExerciseChatSummaryView | null | undefined,
  exerciseName: unknown,
): string | null {
  const doResumo = String(item?.exerciseName || '').trim()
  if (!doResumo) return null
  const doCard = String(exerciseName ?? '').trim()
  if (!doCard) return null
  return normalizeExerciseKey(doResumo) === normalizeExerciseKey(doCard) ? null : doResumo
}

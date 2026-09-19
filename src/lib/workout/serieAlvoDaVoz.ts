/**
 * @module serieAlvoDaVoz
 *
 * QUAL série do exercício recebe o que a voz ditou.
 *
 * Nasce de uma combinação de decisões do dono que, juntas, produzem um
 * requisito que nenhuma delas dizia sozinha (registrado em
 * `docs/plans/voz-na-serie.md`, seção 9): o botão vive no CARD DO EXERCÍCIO
 * (não por série) e a fala NUNCA conclui a série sozinha. Se o alvo fosse "a
 * primeira série não concluída", ditar duas vezes seguidas escreveria SEMPRE
 * na mesma série — sem conclusão automática, ela continua pendente, e a
 * segunda ditada sobrescreveria a primeira em silêncio.
 *
 * A regra: o alvo é a primeira série que ainda NÃO tem `reps` (o sinal mais
 * confiável de "o usuário já registrou o que fez aqui" — reps nunca vem do
 * motor de carga automática, só de digitação ou de voz) e que não está
 * concluída (`done === true`, mesmo sem reps — ver a nota sobre séries
 * concluídas sem reps em `CLAUDE.md`). Dito duas vezes, anda para a série
 * seguinte a cada vez.
 *
 * `"série 2: …"` vence o automático — é o único jeito de corrigir uma série
 * anterior sem reabrir o card.
 */
import { setsCountOfExercise } from './deferredExercises'

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

const temTexto = (v: unknown): boolean => String(v ?? '').trim().length > 0

/** Esta série já tem reps registradas pelo usuário (bilateral ou uni). */
const temRepsRegistradas = (log: Record<string, unknown>): boolean =>
  temTexto(log.reps) || temTexto(log.L_reps) || temTexto(log.R_reps)

/**
 * Índice (0-based) da série que deve receber os dados ditados, ou `null`
 * quando o exercício não tem série nenhuma.
 *
 * `serieFalada` é 1-based (como as pessoas contam) e, se válida, VENCE o
 * cálculo automático.
 */
export function resolverSerieAlvoDaVoz(
  exercises: unknown,
  logs: unknown,
  exIdx: number,
  serieFalada?: number | null,
): number | null {
  const arr = Array.isArray(exercises) ? exercises : []
  const total = setsCountOfExercise(arr[exIdx])
  if (total <= 0) return null

  if (Number.isInteger(serieFalada) && (serieFalada as number) >= 1 && (serieFalada as number) <= total) {
    return (serieFalada as number) - 1
  }

  const logsRec = isRecord(logs) ? logs : {}
  for (let i = 0; i < total; i++) {
    const log = logsRec[`${exIdx}-${i}`]
    const rec = isRecord(log) ? log : {}
    if (rec.done === true) continue
    if (temRepsRegistradas(rec)) continue
    return i
  }
  // Todas as séries já têm reps (ou estão concluídas): não há candidata óbvia.
  // Devolver a ÚLTIMA é o palpite mais provável (quem dita de novo geralmente
  // está corrigindo o que acabou de fazer), mas o CHAMADOR decide se avisa o
  // usuário — este módulo só calcula.
  return total - 1
}

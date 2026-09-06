/**
 * isLogDone — a série deste log foi FEITA?
 *
 * FONTE ÚNICA. Até 06/09/2026 a mesma pergunta era respondida em SETE lugares
 * (`reportMetrics` ×2, `setVolume.isWorkingSet`, `setCompletion.isSetCompleted`,
 * `useWorkoutDeload`, `periodization`, `periodizationCreate`), com a MESMA
 * heurística: *log sem o campo `done` conta como feito*. Ela era correta quando
 * nasceu — um log só existia se o usuário tocasse na série.
 *
 * O motor de carga automática quebrou essa premissa: ele grava
 * `{ weight, weightSource: 'auto' }` em TODA série renderizada ao abrir o treino,
 * sem `done` e sem reps. Medido em produção (auditoria da tela do treino ativo):
 * uma sessão com **1 série feita** saiu no relatório como **"97% · 29/30 séries
 * completas"**, e `reportMeta.totals.setsDone` foi gravado como 29. Na conta do
 * dono, 72 séries-fantasma em 8 de 21 sessões (30 dias).
 *
 * Só UM dos sete lugares já sabia disso — o deload (`isEnginePrefillOnly`),
 * que exige as TRÊS condições: peso do motor, nenhuma rep, nenhum `done`.
 * É essa regra que vira fonte única. Ela é deliberadamente estreita: um usuário
 * que digitou reps e não tocou em Concluir continua contando, como sempre contou
 * (31 logs assim em jul–ago/2026, e 249 logs legados sem `done` de jan–ago).
 */
import { isRecord } from '@/utils/guards'

const temValor = (v: unknown): boolean => {
  if (v === null || v === undefined || v === '') return false
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n > 0 : String(v).trim() !== ''
}

/** O campo `done` cru, aceitando as grafias que já existiram no JSON. */
const doneBruto = (log: Record<string, unknown>): unknown =>
  log.done ?? log.isDone ?? log.completed ?? null

/**
 * Log que só tem o PREFILL do motor de carga: peso `auto`, nenhuma rep (em
 * nenhum lado) e nenhum `done`. É uma série que o usuário NÃO fez — o app só
 * escreveu a sugestão nela.
 */
export function isEnginePrefillOnly(log: unknown): boolean {
  if (!isRecord(log)) return false
  if (String(log.weightSource ?? '').toLowerCase() !== 'auto') return false
  if (doneBruto(log) != null) return false
  return !temValor(log.reps) && !temValor(log.L_reps) && !temValor(log.R_reps)
}

/**
 * A série foi feita?
 *  - `done` explícito manda (aceita boolean e a string "true" — o log passa por
 *    serialização JSON em `workouts.notes`);
 *  - sem `done`: legado conta como feito, EXCETO o prefill do motor.
 */
export function isLogDone(log: unknown): boolean {
  if (!isRecord(log)) return false
  const raw = doneBruto(log)
  if (raw != null) return raw === true || String(raw).toLowerCase() === 'true'
  return !isEnginePrefillOnly(log)
}

/**
 * @module staleSession
 *
 * Decide o que fazer com uma sessão de treino RESTAURADA do armazenamento local.
 *
 * Por que existe: a sessão ativa é persistida em DOIS lugares com regras que
 * divergiram. O IndexedDB expira sozinho em 24 h (`MAX_SESSION_AGE_MS` em
 * `lib/offline/activeSessionPersistence.ts`), mas o `localStorage` — que é quem
 * de fato manda o app abrir direto no treino (`useLocalPersistence` faz
 * `setView('active')` e `useSessionSync` hidrata) — NÃO tinha limite nenhum.
 *
 * Resultado, medido no teste de 10 passos de 15/08/2026: um treino aberto na
 * segunda e nunca finalizado reabre o app dentro dele na quarta, sem aviso e
 * sem escolha. Se o usuário finalizar, a sessão de segunda entra no histórico
 * com a data de quarta — e a DURAÇÃO alimenta a estimativa de calorias
 * (`getEpocFactor` em `utils/calories/metEstimate.ts`), então o número falso
 * não fica só no card do treino: vai para o relatório, o PDF e a aba Nutrição.
 *
 * O que este módulo NÃO resolve (já estava resolvido, não reimplementar): o
 * cronômetro inflar com o tempo fora do app. `computeRecoveryPauseMs` +
 * o listener de `visibilitychange` no `WorkoutTimerContext` já descontam
 * qualquer gap acima de `LONG_GAP_MS` (20 min). O problema aqui é OUTRO — é a
 * sessão velha ser retomada em silêncio, não o tempo dela ser contado errado.
 *
 * Três faixas, medidas a partir da ÚLTIMA ATIVIDADE conhecida:
 *   fresh   — retoma direto, como sempre foi.
 *   stale   — retoma, mas o app PERGUNTA antes (continuar ou descartar).
 *   expired — não retoma; o snapshot é descartado.
 */

/** Sem atividade por mais que isto, o app pergunta antes de retomar. */
export const SESSION_STALE_MS = 4 * 60 * 60 * 1000 // 4 h

/**
 * Sem atividade por mais que isto, o snapshot é descartado sem perguntar.
 *
 * Casado de propósito com `MAX_SESSION_AGE_MS` do IndexedDB: eram os dois
 * armazenamentos da MESMA sessão discordando sobre quando ela morre.
 */
export const SESSION_EXPIRED_MS = 24 * 60 * 60 * 1000 // 24 h

export type RestoredSessionVerdict = 'fresh' | 'stale' | 'expired'

/**
 * Última atividade conhecida da sessão, em ms.
 *
 * `savedAt` é o instante da última gravação (o usuário estava mexendo).
 * Quando ele falta — snapshot antigo, gravado antes do campo existir —, o
 * `startedAt` responde por ele: é o único carimbo de tempo que sobra, e uma
 * sessão sem gravação nenhuma desde o início não teve atividade depois dela.
 *
 * O MAIOR dos dois, nunca o primeiro que aparecer: um `savedAt` corrompido
 * (zero, negativo, NaN) faria toda sessão parecer velhíssima e o app passaria
 * a descartar treino em andamento — falha muito pior que a que isto conserta.
 */
export const lastActivityMs = (savedAtMs: unknown, startedAtMs: unknown): number => {
  const saved = Number(savedAtMs)
  const started = Number(startedAtMs)
  const validSaved = Number.isFinite(saved) && saved > 0 ? saved : 0
  const validStarted = Number.isFinite(started) && started > 0 ? started : 0
  return Math.max(validSaved, validStarted)
}

/**
 * Classifica uma sessão restaurada pela idade da última atividade.
 *
 * Sem carimbo de tempo NENHUM (as duas datas ausentes ou inválidas) devolve
 * `fresh`: não dá para provar que a sessão é velha, e na dúvida o app preserva
 * o treino do usuário. Perder série registrada é dano irreversível; retomar uma
 * sessão velha demais é só um incômodo.
 */
export const classifyRestoredSession = (params: {
  savedAtMs: unknown
  startedAtMs: unknown
  nowMs: number
}): RestoredSessionVerdict => {
  const { savedAtMs, startedAtMs, nowMs } = params
  const last = lastActivityMs(savedAtMs, startedAtMs)
  if (last <= 0) return 'fresh'
  if (!Number.isFinite(nowMs)) return 'fresh'

  const age = nowMs - last
  // Idade negativa = relógio do aparelho andou para trás (fuso, ajuste manual,
  // sincronização de NTP). Não é sessão velha — tratar como fresca.
  if (age <= 0) return 'fresh'
  if (age > SESSION_EXPIRED_MS) return 'expired'
  if (age > SESSION_STALE_MS) return 'stale'
  return 'fresh'
}

/** Texto do aviso mostrado quando a sessão é retomada em `stale`. */
export const staleSessionAgeLabel = (ageMs: number): string => {
  const hours = Math.floor(ageMs / (60 * 60 * 1000))
  if (hours < 1) return 'há menos de 1 hora'
  if (hours === 1) return 'há 1 hora'
  if (hours < 24) return `há ${hours} horas`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'há 1 dia' : `há ${days} dias`
}

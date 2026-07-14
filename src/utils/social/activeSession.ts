/**
 * Fonte única de "está treinando AGORA".
 *
 * Duas armadilhas que este módulo existe pra fechar:
 *
 * 1. **Presença ≠ treino.** O `online_users` do Redis (rota `presence/ping`) só
 *    diz que o app foi ABERTO — e o próprio ping admite que o iOS desperta o
 *    WebView em background fetch/push silenciosa sem o usuário tocar em nada.
 *    Usar isso como "Treinando Agora" mostrava gente treinando às 5h da manhã
 *    sem ter treino nenhum. A verdade está em `active_workout_sessions`.
 *
 * 2. **Sessão ativa não expira sozinha.** A linha só é deletada no finish/discard;
 *    quem fecha o app no meio do treino deixa um zumbi para sempre (havia linha
 *    de abril "treinando" há 3 meses). Todo consumidor precisa cortar por frescor
 *    do `updated_at`.
 *
 * A janela é generosa de propósito: o heartbeat do `useSessionSync` roda a cada
 * 30s mas **só faz upsert se o estado mudou** — descanso longo, app em background
 * ou um set demorado não avançam o `updated_at`. 45min mata o zumbi sem derrubar
 * quem está de fato treinando.
 */

export const ACTIVE_SESSION_STALE_MS = 45 * 60 * 1000

/** `true` se a sessão deu sinal de vida dentro da janela de frescor. */
export function isSessionFresh(updatedAt: unknown, nowMs: number = Date.now()): boolean {
  const ms = toMs(updatedAt)
  if (ms == null) return false
  const age = nowMs - ms
  // Relógio adiantado do cliente não deve ressuscitar nem matar a sessão.
  if (age < 0) return true
  return age <= ACTIVE_SESSION_STALE_MS
}

/** Corte ISO pra usar direto num `.gte('updated_at', ...)`. */
export function activeSessionCutoffIso(nowMs: number = Date.now()): string {
  return new Date(nowMs - ACTIVE_SESSION_STALE_MS).toISOString()
}

function toMs(v: unknown): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const ms = new Date(String(v)).getTime()
  return Number.isFinite(ms) ? ms : null
}

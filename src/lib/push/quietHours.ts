/**
 * "Não perturbar" (quiet hours): janela em que NENHUM push é entregue na tela
 * bloqueada. As notificações in-app (sino) continuam aparecendo — igual ao master
 * switch. Avaliado no horário de Brasília (America/Sao_Paulo), como o resto do app.
 *
 * Puro e testável: `isInQuietWindow`/`isUserInQuietHours` recebem a hora, e o
 * sender injeta a hora BRT atual via `brtHour()`.
 */
const BRT_HOUR_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  hour12: false,
})

/** Hora atual (0–23) em Brasília. */
export function brtHour(d: Date = new Date()): number {
  const h = Number(BRT_HOUR_FMT.format(d))
  return Number.isFinite(h) ? h % 24 : 0
}

const clampHour = (v: unknown, fallback: number): number => {
  if (v == null || v === '') return fallback // Number(null)=0, não NaN — guarda antes
  const n = Math.floor(Number(v))
  return Number.isFinite(n) && n >= 0 && n <= 23 ? n : fallback
}

/**
 * A hora está na janela [start, end)? Trata a janela que cruza a meia-noite
 * (ex.: 22 → 7). start === end ⇒ janela vazia (nunca silencia).
 */
export function isInQuietWindow(hour: number, start: number, end: number): boolean {
  if (start === end) return false
  if (start < end) return hour >= start && hour < end
  return hour >= start || hour < end // cruza a meia-noite
}

/** As preferências do usuário indicam "não perturbar" AGORA (na hora BRT dada)? */
export function isUserInQuietHours(
  prefs: Record<string, unknown> | null | undefined,
  hour: number = brtHour(),
): boolean {
  if (!prefs || prefs.quietHoursEnabled !== true) return false
  const start = clampHour(prefs.quietHoursStart, 22)
  const end = clampHour(prefs.quietHoursEnd, 7)
  return isInQuietWindow(hour, start, end)
}

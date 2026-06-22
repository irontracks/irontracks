/**
 * Cliente para o agendamento de push de fim de descanso (QStash, via backend).
 *
 * Usado quando o app vai pro background com um descanso ativo: agenda no
 * backend um push que ACORDA o celular + finaliza a Live Activity no fim do
 * descanso. Ao voltar ao foreground / pular / terminar, cancela.
 *
 * Tudo degrada suave (try/catch) — falha aqui nunca quebra o timer.
 */

export async function scheduleRestEndPush(
  activityId: string,
  endMs: number,
  title: string,
  body: string,
): Promise<string | null> {
  try {
    const res = await fetch('/api/rest/schedule-push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ activityId, endMs, title, body }),
    })
    const json = await res.json().catch(() => ({}))
    return (json && typeof json === 'object' && typeof json.scheduleId === 'string') ? json.scheduleId : null
  } catch {
    return null
  }
}

export async function cancelRestEndPush(scheduleId: string): Promise<void> {
  if (!scheduleId) return
  try {
    await fetch('/api/rest/cancel-push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scheduleId }),
    })
  } catch {
    /* noop */
  }
}

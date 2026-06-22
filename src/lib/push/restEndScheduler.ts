import { Client } from '@upstash/qstash'
import { env } from '@/utils/env'

/**
 * Agendamento (com atraso) do push de "fim de descanso" via QStash.
 *
 * Necessário porque o serverless não "espera" 30–120s. Quando o app vai pro
 * background com um descanso ativo, o cliente agenda aqui um disparo para o
 * `endDate`; o QStash chama `/api/rest/fire` nesse instante, que envia um push
 * remoto que ACORDA o celular + finaliza a Live Activity. Se o usuário voltar
 * ao app / pular / terminar antes, o agendamento é cancelado.
 */

const PROD_URL = 'https://irontracks.com.br'

function appUrl(): string {
  const fromEnv = String(process.env.APP_BASE_URL || '').replace(/\/$/, '')
  return fromEnv || PROD_URL
}

function client(): Client | null {
  const token = String(env.qstash.token || '').trim()
  return token ? new Client({ token }) : null
}

export type RestFirePayload = {
  userId: string
  activityId: string
  kind: 'rest'
  title: string
  body: string
}

/**
 * Agenda o push de fim de descanso. `delaySeconds` é quanto falta até o fim.
 * Retorna o messageId (para cancelar) ou null se o QStash não estiver
 * configurado / falhar (degrada suave — o app não quebra).
 */
export async function scheduleRestEndPush(
  payload: RestFirePayload,
  delaySeconds: number,
): Promise<string | null> {
  const c = client()
  if (!c) return null
  const delay = Math.max(1, Math.min(900, Math.round(delaySeconds)))
  try {
    const res = await c.publishJSON({
      url: `${appUrl()}/api/rest/fire`,
      body: payload,
      delay,
      retries: 1,
    })
    const r = Array.isArray(res) ? res[0] : res
    return (r as { messageId?: string } | undefined)?.messageId ?? null
  } catch {
    return null
  }
}

/** Cancela um push agendado (usuário voltou ao app / pulou / terminou antes). */
export async function cancelRestEndPush(messageId: string): Promise<boolean> {
  const c = client()
  if (!c || !messageId) return false
  try {
    await c.messages.cancel(messageId)
    return true
  } catch {
    return false
  }
}

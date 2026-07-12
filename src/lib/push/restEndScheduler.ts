import { Client } from '@upstash/qstash'
import { env } from '@/utils/env'
import { logError } from '@/lib/logger'

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
  if (!c) {
    // Sem isto, um QSTASH_TOKEN ausente desativa TODO o push agendado de fim
    // de descanso 100% silenciosamente (logWarn é no-op em produção).
    logError('rest-push', new Error('QSTASH_TOKEN ausente — push agendado de fim de descanso desativado'))
    return null
  }
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
  } catch (e) {
    logError('rest-push', e)
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
  } catch (e) {
    // L4: não engolir silenciosamente — um cancel falho faz o push de fim de descanso
    // disparar mesmo o usuário já tendo voltado. Vai pro Sentry via logError.
    logError('rest-push', e instanceof Error ? e : new Error(`Falha ao cancelar push de fim de descanso: ${String(e)}`))
    return false
  }
}

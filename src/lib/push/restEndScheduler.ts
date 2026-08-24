import { Client } from '@upstash/qstash'
import { env } from '@/utils/env'
import { logError, logWarnRemote } from '@/lib/logger'

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

/**
 * O QStash responde 404 quando a mensagem **não está mais na fila** — ou seja,
 * já foi entregue (o descanso acabou antes de o usuário voltar) ou já havia
 * sido cancelada. Não é falha: não existe ação possível nem nada a consertar.
 *
 * Tratar isso como erro custou ruído no Sentry (24/08/2026, `rest-push:
 * {"error":"message msg_... not found"}` com stack de 7 linhas) e, pior,
 * misturava o caso inofensivo com os que IMPORTAM — rede fora, token inválido,
 * QStash caído —, em que o push realmente vai disparar com o usuário de volta
 * no app.
 */
export function isAlreadyGoneCancel(e: unknown): boolean {
  const status = Number((e as { status?: unknown })?.status)
  if (status === 404) return true
  const msg = (e instanceof Error ? e.message : String(e ?? '')).toLowerCase()
  return msg.includes('not found')
}

/** Cancela um push agendado (usuário voltou ao app / pulou / terminou antes). */
export async function cancelRestEndPush(messageId: string): Promise<boolean> {
  const c = client()
  if (!c || !messageId) return false
  try {
    await c.messages.cancel(messageId)
    return true
  } catch (e) {
    // Mensagem já entregue/inexistente: registra como WARNING (segue pesquisável
    // no Sentry, e a contagem ainda mede quantos descansos terminam antes de o
    // usuário voltar) — mas não é exception.
    if (isAlreadyGoneCancel(e)) {
      logWarnRemote('rest-push', 'cancelamento de push já entregue/inexistente', { messageId })
      return false
    }
    // L4: não engolir silenciosamente — um cancel falho faz o push de fim de descanso
    // disparar mesmo o usuário já tendo voltado. Vai pro Sentry via logError.
    logError('rest-push', e instanceof Error ? e : new Error(`Falha ao cancelar push de fim de descanso: ${String(e)}`))
    return false
  }
}

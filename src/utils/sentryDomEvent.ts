/**
 * @module sentryDomEvent
 *
 * Torna LEGÍVEL no Sentry a Promise rejeitada com um DOM `Event`.
 *
 * Sem isto o issue chega assim (caso real, 24/08/2026, produção, iPhone):
 *
 *     Event `Event` (type=error) captured as promise rejection
 *     transaction: /dashboard   ·   handled: no   ·   sem stack
 *
 * Não diz o que falhou, nem qual recurso, nem de onde — e o app inteiro é
 * `/dashboard` (SPA), então a transaction também não ajuda. O `Event` não tem
 * mensagem nem pilha, mas tem ALVO: `describeDomEvent` tira dele a tag, a URL e
 * o `MediaError`.
 *
 * **O agrupamento é por ALVO, não pela URL** (`fingerprint`): uma imagem de
 * avatar que falha para 300 usuários é UM issue, não 300.
 *
 * ⚠️ No iOS/WebKit o `hint.originalException` às vezes não é populado em
 * unhandled rejections (o mesmo motivo do fallback que já existia no
 * `beforeSend`). Aí não há alvo para extrair; ainda assim marcamos a tag
 * `dom_event_rejection`, senão o caso fica sem como ser filtrado no painel.
 */
import { describeDomEvent, domEventErrorTitle, shortenResourceUrl } from '@/utils/domEventError'

/** Shape mínimo do evento do Sentry — evita acoplar o módulo aos tipos do SDK. */
type SentryEventLike = {
  exception?: { values?: Array<{ type?: string; value?: string }> }
  tags?: Record<string, unknown>
  extra?: Record<string, unknown>
  fingerprint?: string[]
}

const REJECTION_MARK = 'captured as promise rejection'

/** O SDK gera este título quando o `reason` da rejeição não é um `Error`. */
export function isNonErrorRejectionEvent(event: SentryEventLike): boolean {
  const values = event?.exception?.values
  if (!Array.isArray(values)) return false
  return values.some((v) => typeof v?.value === 'string' && v.value.includes(REJECTION_MARK))
}

/**
 * Enriquece o evento **no lugar** e devolve `true` quando reconheceu o caso.
 * Nunca lança: roda dentro do `beforeSend`, e um throw aqui derrubaria o envio
 * de TODOS os erros — inclusive os que importam.
 */
export function enrichDomEventRejection(event: SentryEventLike, originalException: unknown): boolean {
  try {
    if (!event || typeof event !== 'object') return false

    const info = describeDomEvent(originalException)
    if (!info) {
      // Sem alvo: só marca, para o issue ser encontrável no painel.
      if (!isNonErrorRejectionEvent(event)) return false
      event.tags = { ...(event.tags || {}), dom_event_rejection: 'sem-alvo' }
      return true
    }

    const title = domEventErrorTitle(info)
    const values = event.exception?.values
    if (Array.isArray(values) && values.length > 0) {
      // Só o título muda; `type` fica como o SDK deixou para não mascarar a origem.
      values[0].value = title
    }

    event.tags = {
      ...(event.tags || {}),
      dom_event_rejection: info.target,
      dom_event_type: info.type,
    }
    event.extra = {
      ...(event.extra || {}),
      domEventTarget: info.target,
      // URL inteira só no `extra`: no título ela estoura a linha e pode carregar
      // query com token (o scrub roda depois, mas o fingerprint não passa por lá).
      domEventSrc: info.src,
      domEventReason: info.reason,
    }
    // Agrupa por ALVO + host/arquivo. Sem isto, cada URL vira um issue novo.
    event.fingerprint = ['dom-event-rejection', info.target, shortenResourceUrl(info.src) || 'sem-url']
    return true
  } catch {
    return false
  }
}

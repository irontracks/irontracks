/**
 * O tradutor do DOM `Event` que chegou como motivo de rejeição, e o
 * enriquecimento que o `beforeSend` do Sentry aplica em cima dele.
 *
 * Origem: issue de produção em 24/08/2026 — "Event `Event` (type=error)
 * captured as promise rejection" em `/dashboard`, iPhone/WKWebView, sem stack.
 * O título não dizia o que falhou; estes casos travam o que ele passa a dizer.
 */
import { describe, it, expect } from 'vitest'
import {
  describeDomEvent,
  domEventErrorTitle,
  domEventUserMessage,
  isDomEventLike,
  shortenResourceUrl,
} from '../domEventError'
import { enrichDomEventRejection, isNonErrorRejectionEvent } from '../sentryDomEvent'

/** Um Event de verdade não existe em ambiente node — este é o shape que chega. */
const imgErrorEvent = (src: string) => ({
  type: 'error',
  isTrusted: true,
  target: { tagName: 'IMG', src, constructor: { name: 'HTMLImageElement' } },
})

describe('isDomEventLike', () => {
  it('reconhece o evento e recusa o resto', () => {
    expect(isDomEventLike(imgErrorEvent('https://x.com/a.png'))).toBe(true)
    expect(isDomEventLike(new Error('boom'))).toBe(false)
    expect(isDomEventLike('erro')).toBe(false)
    expect(isDomEventLike(null)).toBe(false)
    expect(isDomEventLike({ message: 'sem type' })).toBe(false)
  })

  it('um Error com campo `type` continua sendo Error, não evento', () => {
    const err = Object.assign(new Error('boom'), { type: 'error', target: {} })
    expect(isDomEventLike(err)).toBe(false)
  })
})

describe('describeDomEvent', () => {
  it('tira do alvo a tag e a URL', () => {
    const info = describeDomEvent(imgErrorEvent('https://res.cloudinary.com/it/avatar.png'))
    expect(info).toEqual({ type: 'error', target: 'IMG', src: 'https://res.cloudinary.com/it/avatar.png', reason: '' })
  })

  it('num <video> prefere `currentSrc` — é o arquivo que o navegador tentou', () => {
    const info = describeDomEvent({
      type: 'error',
      target: { tagName: 'VIDEO', src: 'playlist', currentSrc: 'https://cdn.x/story.mp4', error: { code: 4 } },
    })
    expect(info?.src).toBe('https://cdn.x/story.mp4')
    expect(info?.reason).toBe('MEDIA_ERR_SRC_NOT_SUPPORTED')
  })

  it('alvo sem tagName cai no nome do construtor (FileReader, XHR, IDB)', () => {
    const info = describeDomEvent({ type: 'error', target: { constructor: { name: 'FileReader' } } })
    expect(info?.target).toBe('FileReader')
  })

  it('evento sem alvo não inventa nada', () => {
    expect(describeDomEvent({ type: 'error', isTrusted: true })).toEqual({
      type: 'error',
      target: 'desconhecido',
      src: '',
      reason: '',
    })
  })
})

describe('shortenResourceUrl', () => {
  it('reduz a host/arquivo — a URL inteira estoura o título e pode levar token', () => {
    expect(shortenResourceUrl('https://res.cloudinary.com/it/img/upload/v1/avatar.png?token=abc')).toBe(
      'res.cloudinary.com/avatar.png'
    )
    expect(shortenResourceUrl('data:image/png;base64,AAAA')).toBe('data:')
    expect(shortenResourceUrl('blob:https://irontracks.com.br/uuid')).toBe('blob:')
    expect(shortenResourceUrl('')).toBe('')
  })
})

describe('domEventErrorTitle', () => {
  it('diz o alvo e o recurso, no lugar de "Event (type=error)"', () => {
    const info = describeDomEvent(imgErrorEvent('https://res.cloudinary.com/it/avatar.png'))!
    expect(domEventErrorTitle(info)).toBe('Falha de recurso (IMG) · res.cloudinary.com/avatar.png')
  })

  it('inclui o motivo do MediaError quando existe', () => {
    const info = describeDomEvent({
      type: 'error',
      target: { tagName: 'VIDEO', currentSrc: 'https://cdn.x/story.mp4', error: { code: 2 } },
    })!
    expect(domEventErrorTitle(info)).toContain('MEDIA_ERR_NETWORK')
  })
})

describe('domEventUserMessage', () => {
  it('sem nada concreto a dizer, devolve vazio (o app não abre modal inútil)', () => {
    const info = describeDomEvent({ type: 'error', isTrusted: true })!
    expect(domEventUserMessage(info)).toBe('')
  })

  it('com recurso identificado, a mensagem é acionável — e nunca "[object Event]"', () => {
    const info = describeDomEvent(imgErrorEvent('https://res.cloudinary.com/it/avatar.png'))!
    const msg = domEventUserMessage(info)
    expect(msg).toContain('res.cloudinary.com/avatar.png')
    expect(msg).not.toContain('[object')
  })
})

describe('enrichDomEventRejection (beforeSend do Sentry)', () => {
  const sentryEvent = () => ({
    exception: { values: [{ type: 'Event', value: 'Event `Event` (type=error) captured as promise rejection' }] },
  })

  it('reescreve o título e agrupa por ALVO, não por URL', () => {
    const a = sentryEvent()
    const b = sentryEvent()
    enrichDomEventRejection(a, imgErrorEvent('https://res.cloudinary.com/it/u1.png'))
    enrichDomEventRejection(b, imgErrorEvent('https://res.cloudinary.com/it/u1.png'))

    expect(a.exception.values[0].value).toBe('Falha de recurso (IMG) · res.cloudinary.com/u1.png')
    expect((a as { fingerprint?: string[] }).fingerprint).toEqual(['dom-event-rejection', 'IMG', 'res.cloudinary.com/u1.png'])
    // Mesmo alvo e mesmo arquivo → mesmo issue, para 1 ou 300 usuários.
    expect((a as { fingerprint?: string[] }).fingerprint).toEqual((b as { fingerprint?: string[] }).fingerprint)
  })

  it('a URL completa vai para `extra`, fora do título e do fingerprint', () => {
    const ev = sentryEvent() as ReturnType<typeof sentryEvent> & { extra?: Record<string, unknown>; fingerprint?: string[] }
    enrichDomEventRejection(ev, imgErrorEvent('https://res.cloudinary.com/it/u.png?token=segredo'))
    expect(ev.extra?.domEventSrc).toBe('https://res.cloudinary.com/it/u.png?token=segredo')
    expect(ev.exception.values[0].value).not.toContain('token=segredo')
    expect(ev.fingerprint?.join('|')).not.toContain('token=segredo')
  })

  it('WebKit sem `originalException`: marca a tag para o caso ser filtrável', () => {
    const ev = sentryEvent() as ReturnType<typeof sentryEvent> & { tags?: Record<string, unknown> }
    expect(enrichDomEventRejection(ev, undefined)).toBe(true)
    expect(ev.tags?.dom_event_rejection).toBe('sem-alvo')
    // Sem alvo não há o que reescrever — o título original fica.
    expect(ev.exception.values[0].value).toContain('captured as promise rejection')
  })

  it('não encosta em erro normal', () => {
    const ev = { exception: { values: [{ type: 'TypeError', value: 'x is not a function' }] } }
    expect(enrichDomEventRejection(ev, new TypeError('x is not a function'))).toBe(false)
    expect(ev.exception.values[0].value).toBe('x is not a function')
  })

  it('nunca lança — um throw aqui derrubaria o envio de TODOS os erros', () => {
    const hostil = { get exception(): never { throw new Error('boom') } }
    expect(() => enrichDomEventRejection(hostil as never, imgErrorEvent('https://x/a.png'))).not.toThrow()
    expect(enrichDomEventRejection(null as never, null)).toBe(false)
  })

  it('isNonErrorRejectionEvent reconhece só o título do SDK', () => {
    expect(isNonErrorRejectionEvent(sentryEvent())).toBe(true)
    expect(isNonErrorRejectionEvent({ exception: { values: [{ value: 'boom' }] } })).toBe(false)
    expect(isNonErrorRejectionEvent({})).toBe(false)
  })
})

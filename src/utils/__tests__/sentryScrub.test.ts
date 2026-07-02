import { describe, it, expect } from 'vitest'
import { scrubSentryEvent } from '@/utils/sentryScrub'
import type { ErrorEvent } from '@sentry/nextjs'

const ev = (partial: unknown): ErrorEvent => partial as ErrorEvent

describe('scrubSentryEvent', () => {
  it('redige token em variável local aninhada (body.access_token)', () => {
    const event = ev({
      exception: {
        values: [{
          value: 'boom',
          stacktrace: { frames: [{ vars: { body: { access_token: 'abc123secretxyz', foo: 'bar' } } }] },
        }],
      },
    })
    scrubSentryEvent(event)
    const vars = event.exception!.values![0].stacktrace!.frames![0].vars as { body: Record<string, unknown> }
    expect(vars.body.access_token).toBe('[redacted]')
    expect(vars.body.foo).toBe('bar')
  })

  it('redige refresh_token no topo dos vars', () => {
    const event = ev({ exception: { values: [{ stacktrace: { frames: [{ vars: { refresh_token: 'zzz999', n: 42 } }] } }] } })
    scrubSentryEvent(event)
    const vars = event.exception!.values![0].stacktrace!.frames![0].vars as Record<string, unknown>
    expect(vars.refresh_token).toBe('[redacted]')
    expect(vars.n).toBe(42)
  })

  it('redige JWT na mensagem de exceção', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abcDEFghijKLM'
    const event = ev({ exception: { values: [{ value: `falhou com ${jwt} no meio` }] } })
    scrubSentryEvent(event)
    expect(event.exception!.values![0].value).not.toContain(jwt)
    expect(event.exception!.values![0].value).toContain('[redacted-jwt]')
  })

  it('redige Bearer e access_token=... na mensagem', () => {
    const event = ev({ exception: { values: [{ value: 'Authorization: Bearer abcdef1234567890 e access_token=segredo12345' }] } })
    scrubSentryEvent(event)
    const v = event.exception!.values![0].value as string
    expect(v).toContain('[redacted]')
    expect(v).not.toContain('abcdef1234567890')
    expect(v).not.toContain('segredo12345')
  })

  it('redige data sensível de breadcrumb', () => {
    const event = ev({ breadcrumbs: [{ message: 'req', data: { password: 'p@ss', ok: true } }] })
    scrubSentryEvent(event)
    const data = event.breadcrumbs![0].data as Record<string, unknown>
    expect(data.password).toBe('[redacted]')
    expect(data.ok).toBe(true)
  })

  it('não quebra em evento vazio/malformado e retorna o evento', () => {
    expect(() => scrubSentryEvent(ev({}))).not.toThrow()
    const e = ev({ exception: { values: [{}] } })
    expect(scrubSentryEvent(e)).toBe(e)
  })
})

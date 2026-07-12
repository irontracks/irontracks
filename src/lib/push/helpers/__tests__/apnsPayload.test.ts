import { describe, it, expect } from 'vitest'
import { isSilentApnsPush, buildApnsAps } from '../apnsPayload'

const OPTS = { notifType: '', wakesScreen: false, hasRichImage: false }

describe('isSilentApnsPush', () => {
  it('clear-badge (content-available + título/corpo vazios) é silencioso', () => {
    expect(isSilentApnsPush('', '', { __badge: 0, 'content-available': 1 })).toBe(true)
  })
  it('título/corpo vazios sem content-available também é silencioso', () => {
    expect(isSilentApnsPush('  ', '', {})).toBe(true)
  })
  it('notificação normal NÃO é silenciosa', () => {
    expect(isSilentApnsPush('Novo treino', 'Bora!', { type: 'message' })).toBe(false)
  })
})

describe('buildApnsAps — M1 (silencioso de verdade)', () => {
  it('clear-badge: content-available no aps, SEM alert/sound', () => {
    const aps = buildApnsAps('', '', { __badge: 0, 'content-available': 1 }, OPTS)
    expect(aps['content-available']).toBe(1)
    expect(aps.alert).toBeUndefined()
    expect(aps.sound).toBeUndefined()
  })
  it('silencioso sem __badge não mexe no badge', () => {
    const aps = buildApnsAps('', '', {}, OPTS)
    expect(aps['content-available']).toBe(1)
    expect('badge' in aps).toBe(false)
  })
})

describe('buildApnsAps — H2 (badge respeita __badge explícito)', () => {
  it('clear-badge zera o badge (0, não 1)', () => {
    const aps = buildApnsAps('', '', { __badge: 0, 'content-available': 1 }, OPTS)
    expect(aps.badge).toBe(0)
  })
  it('push normal com __badge:5 usa 5', () => {
    const aps = buildApnsAps('Oi', 'Corpo', { __badge: 5 }, OPTS)
    expect(aps.badge).toBe(5)
  })
  it('push normal sem __badge cai no default 1', () => {
    const aps = buildApnsAps('Oi', 'Corpo', {}, OPTS)
    expect(aps.badge).toBe(1)
  })
})

describe('buildApnsAps — caminho normal intacto', () => {
  it('monta alert/sound/interruption-level e mutable-content quando wakesScreen', () => {
    const aps = buildApnsAps('T', 'B', { type: 'message' }, { notifType: 'message', wakesScreen: true, hasRichImage: false })
    expect(aps.alert).toEqual({ title: 'T', body: 'B' })
    expect(aps.sound).toBe('default')
    expect(aps['interruption-level']).toBe('time-sensitive')
    expect(aps['mutable-content']).toBe(1)
  })
  it('tipo passivo (story_like) vira interruption-level active', () => {
    const aps = buildApnsAps('T', 'B', {}, { notifType: 'story_like', wakesScreen: false, hasRichImage: false })
    expect(aps['interruption-level']).toBe('active')
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { matchFavoriteGym, SAME_GYM_RADIUS_METERS } from '../matchGym'
import { reportGeofenceArrival } from '@/lib/gps/reportGeofenceArrival'

vi.mock('@/lib/logger', () => ({ logWarnRemote: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }))

/**
 * "Auto Check-in" que nunca fez check-in (03/08/2026).
 *
 * O geofence do iOS guarda a academia favorita em `user_settings.preferences`;
 * `gym_checkins` referencia `user_gyms` por FK. Os dois cadastros nunca
 * conversaram, então chegar na academia só mandava uma notificação: o geofence
 * estava ATIVO e `gym_checkins` tinha ZERO linhas em toda a produção — e o Mapa
 * de Treinos ficava vazio para todo mundo em consequência.
 */

const CURITIBA = { lat: -25.4284, lng: -49.2733 }
/** ~120 m ao norte: dentro do raio de "mesma academia". */
const NEARBY = { latitude: -25.4273, longitude: -49.2733 }
/** ~1,3 km: outra academia. */
const FAR = { latitude: -25.4400, longitude: -49.2733 }

describe('matchFavoriteGym — proximidade manda, nome desempata', () => {
  it('casa a academia dentro do raio', () => {
    const rows = [{ id: 'g1', name: 'Smart Fit', ...NEARBY }]
    expect(matchFavoriteGym(rows, { name: 'Qualquer nome', ...CURITIBA })?.id).toBe('g1')
  })

  it('entre duas dentro do raio, escolhe a MAIS PRÓXIMA', () => {
    const rows = [
      { id: 'longe', name: 'A', latitude: -25.4267, longitude: -49.2733 },
      { id: 'perto', name: 'B', latitude: -25.4285, longitude: -49.2733 },
    ]
    expect(matchFavoriteGym(rows, { name: 'A', ...CURITIBA })?.id).toBe('perto')
  })

  it('proximidade ganha do nome — o nome do favorito é digitado à mão e vive errado', () => {
    // Caso real: o favorito ficou salvo como "Minha academia" (fallback de quem
    // não digitou nada). Casar por nome criaria uma academia duplicada a 100 m.
    const rows = [{ id: 'g1', name: 'Smart Fit Água Verde', ...NEARBY }]
    expect(matchFavoriteGym(rows, { name: 'Minha academia', ...CURITIBA })?.id).toBe('g1')
  })

  it('academia longe NÃO casa, mesmo com nome idêntico — é outra filial', () => {
    const rows = [{ id: 'g1', name: 'Smart Fit', ...FAR }]
    expect(matchFavoriteGym(rows, { name: 'Outra coisa', ...CURITIBA })).toBeNull()
  })

  it('nome idêntico casa quando NENHUMA coordenada serve (academia salva sem lat/lng)', () => {
    const rows = [{ id: 'g1', name: 'Smart  FIT', latitude: null, longitude: null }]
    expect(matchFavoriteGym(rows, { name: 'smart fit', ...CURITIBA })?.id).toBe('g1')
  })

  it('nome compara sem acento e sem espaço duplicado', () => {
    const rows = [{ id: 'g1', name: 'Academia Água Verde', latitude: null, longitude: null }]
    expect(matchFavoriteGym(rows, { name: 'academia  agua verde', ...CURITIBA })?.id).toBe('g1')
  })

  it('sem nada que corresponda devolve null — o chamador cria a academia', () => {
    expect(matchFavoriteGym([], { name: 'Smart Fit', ...CURITIBA })).toBeNull()
    expect(matchFavoriteGym([{ id: 'g1', name: 'Outra', ...FAR }], { name: 'Smart Fit', ...CURITIBA })).toBeNull()
  })

  it('linhas sem id são ignoradas (não viram gym_id inválido no check-in)', () => {
    const rows = [{ id: '', name: 'Smart Fit', ...NEARBY }] as { id: string; name: string; latitude: number; longitude: number }[]
    expect(matchFavoriteGym(rows, { name: 'Smart Fit', ...CURITIBA })).toBeNull()
  })

  it('favorito sem coordenada válida não casa nada por proximidade', () => {
    const rows = [{ id: 'g1', name: 'Smart Fit', ...NEARBY }]
    expect(matchFavoriteGym(rows, { name: 'Smart Fit', lat: NaN, lng: NaN })).toBeNull()
  })

  it('o raio é maior que o do geofence — as duas coordenadas vêm de fontes diferentes', () => {
    // O favorito é capturado por GPS dentro do prédio; a academia do Perfil vem do
    // endereço do Google Places (fachada). Apertar isso pro raio do geofence (120 m)
    // faria a mesma academia virar duas.
    expect(SAME_GYM_RADIUS_METERS).toBeGreaterThan(120)
  })
})

describe('reportGeofenceArrival — nunca lança, sempre reporta', () => {
  beforeEach(() => { vi.unstubAllGlobals() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('posta na rota do geofence com o favorito', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await reportGeofenceArrival({ name: 'Smart Fit', lat: -25.42, lng: -49.27 })

    expect(result.ok).toBe(true)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/gps/geofence-checkin')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ name: 'Smart Fit', latitude: -25.42, longitude: -49.27 })
  })

  it('servidor recusando não vira exceção (rodamos dentro de listeners)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429, json: async () => ({ ok: false }) })))
    await expect(reportGeofenceArrival({ name: 'Smart Fit', lat: -25.42, lng: -49.27 })).resolves.toEqual({ ok: false })
  })

  it('falha de rede não vira exceção', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    await expect(reportGeofenceArrival({ name: 'Smart Fit', lat: -25.42, lng: -49.27 })).resolves.toEqual({ ok: false })
  })

  it('favorito incompleto nem chega a bater na rota', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await reportGeofenceArrival({ name: '', lat: -25.42, lng: -49.27 })
    await reportGeofenceArrival(null)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('duplicata do servidor é sucesso — os dois caminhos de chegada podem coincidir', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, duplicate: true }) })))
    await expect(reportGeofenceArrival({ name: 'Smart Fit', lat: -25.42, lng: -49.27 }))
      .resolves.toMatchObject({ ok: true, duplicate: true })
  })
})

describe('source-guard: a fiação existe (algoritmo certo com ninguém ligando não vale nada)', () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  const shell = strip(readFileSync('src/app/(app)/dashboard/IronTracksAppClientImpl.tsx', 'utf8'))
  const route = strip(readFileSync('src/app/api/gps/geofence-checkin/route.ts', 'utf8'))

  it('a chegada com o app aberto grava o check-in', () => {
    expect(shell).toMatch(/reportGeofenceArrival\(favoriteGym\)/)
    const hook = shell.slice(shell.indexOf('useGymGeofence({'), shell.indexOf('const {\n        profileIncomplete'))
    expect(hook).toMatch(/handleGymArrival\(\)/)
  })

  it('o toque na notificação (app fechado) também grava', () => {
    // Dentro do onPushNavigate que já existe — um segundo listener do MESMO evento
    // deixaria ambíguo qual bloco o guard do pushDeepLink está lendo.
    const handler = shell.slice(
      shell.indexOf('const onPushNavigate'),
      shell.indexOf("removeEventListener('irontracks:push:navigate'"),
    )
    expect(handler).toMatch(/detail\?\.type === 'gym_geofence'/)
    expect(handler).toMatch(/handleGymArrival\(\)/)
  })

  it('a rota resolve a academia em vez de exigir gym_id que o geofence não tem', () => {
    expect(route).toMatch(/matchFavoriteGym\(/)
    expect(route).toMatch(/from\('user_gyms'\)/)
    expect(route).toMatch(/from\('gym_checkins'\)/)
  })

  it('a rota mantém a janela anti-duplicata da rota irmã', () => {
    expect(route).toMatch(/DUPLICATE_WINDOW_MS/)
    expect(route).toMatch(/duplicate: true/)
    expect(route).toMatch(/checkRateLimitAsync\(/)
  })
})

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { countUnreadSinceCleared } from '@/lib/push/badgeCount'

/**
 * Sintoma que originou tudo (07/08/2026): o ícone do app ficava com "32" preso.
 * O badge só era zerado quando o usuário abria o sino dentro do app; quem só
 * entrava e treinava carregava o número pra sempre.
 *
 * Conserto em duas metades — as duas precisam de guard:
 *   1. device: `SceneDelegate` zera o ícone a cada ativação (Swift, cobertura por
 *      source-guard abaixo — jsdom não roda Swift);
 *   2. servidor: o badge é RECALCULADO a cada push como "todas as não lidas", então
 *      sem `badge_cleared_at` o 32 voltaria como 33 na notificação seguinte.
 */
describe('countUnreadSinceCleared', () => {
  const U = 'user-1'

  it('sem marca de abertura, conta todas as não lidas (comportamento antigo)', () => {
    const rows = [
      { user_id: U, created_at: '2026-08-01T10:00:00Z' },
      { user_id: U, created_at: '2026-08-02T10:00:00Z' },
    ]
    expect(countUnreadSinceCleared(rows, new Map()).get(U)).toBe(2)
    expect(countUnreadSinceCleared(rows, new Map([[U, null]])).get(U)).toBe(2)
  })

  it('ignora as notificações anteriores à última abertura do app', () => {
    const rows = [
      { user_id: U, created_at: '2026-08-01T10:00:00Z' },
      { user_id: U, created_at: '2026-08-02T10:00:00Z' },
      { user_id: U, created_at: '2026-08-06T23:00:00Z' }, // chegou depois
    ]
    const cleared = new Map([[U, '2026-08-05T00:00:00Z']])
    expect(countUnreadSinceCleared(rows, cleared).get(U)).toBe(1)
  })

  it('a notificação exatamente no instante da abertura não conta de novo', () => {
    const marca = '2026-08-05T00:00:00Z'
    const out = countUnreadSinceCleared([{ user_id: U, created_at: marca }], new Map([[U, marca]]))
    expect(out.get(U)).toBeUndefined()
  })

  it('usuário que já viu tudo some do mapa (o caller cai no fallback, não em 32)', () => {
    const rows = [{ user_id: U, created_at: '2026-08-01T10:00:00Z' }]
    expect(countUnreadSinceCleared(rows, new Map([[U, '2026-08-05T00:00:00Z']])).size).toBe(0)
  })

  it('conta por usuário, sem misturar as marcas de abertura', () => {
    const rows = [
      { user_id: 'a', created_at: '2026-08-01T10:00:00Z' },
      { user_id: 'b', created_at: '2026-08-01T10:00:00Z' },
    ]
    const cleared = new Map([['a', '2026-08-05T00:00:00Z']])
    const out = countUnreadSinceCleared(rows, cleared)
    expect(out.get('a')).toBeUndefined()
    expect(out.get('b')).toBe(1)
  })

  it('data ilegível conta — perder o aviso é pior que repetir o número', () => {
    const cleared = new Map([[U, '2026-08-05T00:00:00Z']])
    expect(countUnreadSinceCleared([{ user_id: U, created_at: null }], cleared).get(U)).toBe(1)
    expect(countUnreadSinceCleared([{ user_id: U, created_at: 'xx' }], cleared).get(U)).toBe(1)
    expect(countUnreadSinceCleared([{ user_id: U, created_at: '2026-08-01T10:00:00Z' }], new Map([[U, 'xx']])).get(U)).toBe(1)
  })

  it('entrada vazia/nula não explode', () => {
    expect(countUnreadSinceCleared(null, new Map()).size).toBe(0)
    expect(countUnreadSinceCleared(undefined, new Map()).size).toBe(0)
    expect(countUnreadSinceCleared([{ user_id: '' }], new Map()).size).toBe(0)
  })
})

/**
 * Fiação — o erro nº 3 do CLAUDE.md (algoritmo certo, coletor certo, ninguém
 * ligando os dois). Sem estas duas asserções, `apns.ts` podia voltar a contar
 * todas as não lidas com os testes acima verdes.
 */
describe('apns.ts — o badge usa a marca de abertura', () => {
  const code = readFileSync(join(__dirname, '..', 'apns.ts'), 'utf8')
  const executavel = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

  it('busca badge_cleared_at em user_settings', () => {
    expect(executavel).toMatch(/from\(\s*['"]user_settings['"]\s*\)/)
    expect(executavel).toContain('badge_cleared_at')
  })

  it('delega a contagem para countUnreadSinceCleared', () => {
    expect(executavel).toContain('countUnreadSinceCleared(')
  })

  it('seleciona created_at das notificações — sem ele o filtro é cego', () => {
    expect(executavel).toMatch(/from\(\s*['"]notifications['"]\s*\)\s*\.select\(\s*['"]user_id,\s*created_at['"]/)
  })
})

/**
 * Metade nativa. jsdom não executa Swift, então o guard é textual — e mira no
 * erro real: `sceneDidBecomeActive` tem um `guard !pluginRegistered else { return }`
 * logo no início. Zerar o badge DEPOIS desse guard funcionaria só no primeiro
 * launch do app e nunca mais — exatamente o bug que se quer evitar.
 */
describe('SceneDelegate.swift — o ícone zera em toda ativação', () => {
  const swift = readFileSync(
    join(__dirname, '..', '..', '..', '..', 'ios', 'App', 'App', 'SceneDelegate.swift'),
    'utf8',
  )

  it('zera o badge dentro de sceneDidBecomeActive', () => {
    const corpo = swift.slice(swift.indexOf('func sceneDidBecomeActive'))
    expect(corpo).toContain('clearIconBadge()')
  })

  it('a chamada vem ANTES do guard de registro do plugin', () => {
    const corpo = swift.slice(swift.indexOf('func sceneDidBecomeActive'))
    const chamada = corpo.indexOf('clearIconBadge()')
    const guarda = corpo.indexOf('guard !pluginRegistered')
    expect(chamada).toBeGreaterThan(-1)
    expect(guarda).toBeGreaterThan(-1)
    expect(chamada).toBeLessThan(guarda)
  })

  it('tem fallback para iOS < 16 (deployment target do projeto é 15.0)', () => {
    expect(swift).toContain('setBadgeCount(0')
    expect(swift).toContain('applicationIconBadgeNumber = 0')
  })
})

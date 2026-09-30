import { beforeEach, describe, expect, it, vi } from 'vitest'
import { APP_PLANS, TEACHER_TIERS } from './fixtures'

/**
 * `lerPlanosPublicos`: a leitura que alimenta a landing.
 *
 * O que trava aqui: (1) o supabase-js NÃO lança em erro de leitura — devolve
 * `{ error }` — e a função precisa olhar; (2) falha nunca derruba a página
 * (devolve null); (3) depois de uma leitura boa, falha passageira serve o valor
 * guardado; (4) 10 min de cache evitam duas consultas por visita.
 */

type Resposta = { data: unknown; error: unknown }
const respostas: Record<string, Resposta> = {}
const chamadas: { tabela: string; passos: string[] }[] = []
const criados: { url: string; key: string }[] = []
const logError = vi.fn()

function construtor(tabela: string) {
  const passos: string[] = []
  chamadas.push({ tabela, passos })
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'in', 'eq', 'order']) {
    b[m] = (...args: unknown[]) => {
      passos.push(`${m}:${JSON.stringify(args)}`)
      return b
    }
  }
  b.then = (resolve: (r: Resposta) => unknown) => resolve(respostas[tabela])
  return b
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: (url: string, key: string) => {
    criados.push({ url, key })
    return { from: (t: string) => construtor(t) }
  },
}))
vi.mock('@/utils/env', () => ({ env: { supabase: { url: 'https://x.supabase.co', anonKey: 'chave-anonima' } } }))
vi.mock('@/lib/logger', () => ({ logError: (...a: unknown[]) => logError(...a) }))

async function carregar() {
  vi.resetModules()
  return await import('../lerPublicos')
}

beforeEach(() => {
  chamadas.length = 0
  criados.length = 0
  logError.mockClear()
  respostas.app_plans = { data: APP_PLANS.filter((p) => p.status === 'active'), error: null }
  respostas.teacher_tiers = { data: TEACHER_TIERS, error: null }
})

describe('lerPlanosPublicos', () => {
  it('monta os planos a partir das duas tabelas', async () => {
    const { lerPlanosPublicos } = await carregar()
    const r = await lerPlanosPublicos(1_000)
    expect(r?.vip.map((p) => p.tier)).toEqual(['start', 'pro', 'elite'])
    expect(r?.professores).toHaveLength(5)
    expect(logError).not.toHaveBeenCalled()
  })

  it('usa a chave ANÔNIMA, sem sessão — preço público não precisa de service role', async () => {
    const { lerPlanosPublicos } = await carregar()
    await lerPlanosPublicos(1_000)
    expect(criados).toEqual([{ url: 'https://x.supabase.co', key: 'chave-anonima' }])
  })

  it('pede os seis planos VIP por NOME e só o que está ativo', async () => {
    const { lerPlanosPublicos } = await carregar()
    await lerPlanosPublicos(1_000)
    const planos = chamadas.find((c) => c.tabela === 'app_plans')!.passos.join(' ')
    for (const id of ['vip_start', 'vip_pro', 'vip_elite', 'vip_start_annual', 'vip_pro_annual', 'vip_elite_annual']) {
      expect(planos).toContain(`"${id}"`)
    }
    expect(planos).toContain('eq:["status","active"]')
    const tiers = chamadas.find((c) => c.tabela === 'teacher_tiers')!.passos.join(' ')
    expect(tiers).toContain('eq:["is_active",true]')
  })

  it('erro de LEITURA (que o supabase-js devolve, não lança) vira null + logError', async () => {
    respostas.app_plans = { data: null, error: { message: 'permission denied', code: '42501' } }
    const { lerPlanosPublicos } = await carregar()
    expect(await lerPlanosPublicos(1_000)).toBeNull()
    expect(logError).toHaveBeenCalledTimes(1)
    expect(logError.mock.calls[0][0]).toBe('landing.planos-publicos')
    // a causa REAL (permission denied), não o "incompleto" que viria de ignorar o erro
    expect(logError.mock.calls[0][1]).toMatchObject({ message: 'permission denied', code: '42501' })
  })

  it('erro na tabela de professores também derruba (não mostra metade)', async () => {
    respostas.teacher_tiers = { data: null, error: { message: 'boom' } }
    const { lerPlanosPublicos } = await carregar()
    expect(await lerPlanosPublicos(1_000)).toBeNull()
  })

  it('tabela incompleta (falta um plano VIP) vira null, não preço pela metade', async () => {
    respostas.app_plans = { data: APP_PLANS.filter((p) => p.id !== 'vip_elite' && p.status === 'active'), error: null }
    const { lerPlanosPublicos } = await carregar()
    expect(await lerPlanosPublicos(1_000)).toBeNull()
    expect(logError).toHaveBeenCalledTimes(1)
  })

  it('cache: a segunda leitura dentro de 10 min não vai ao banco', async () => {
    const { lerPlanosPublicos, PLANOS_TTL_MS } = await carregar()
    await lerPlanosPublicos(1_000)
    const antes = chamadas.length
    await lerPlanosPublicos(1_000 + PLANOS_TTL_MS - 1)
    expect(chamadas.length).toBe(antes)
    await lerPlanosPublicos(1_000 + PLANOS_TTL_MS + 1)
    expect(chamadas.length).toBeGreaterThan(antes)
  })

  it('falha passageira DEPOIS de uma leitura boa serve o valor guardado', async () => {
    const { lerPlanosPublicos, PLANOS_TTL_MS } = await carregar()
    const boa = await lerPlanosPublicos(1_000)
    respostas.app_plans = { data: null, error: { message: 'timeout' } }
    const depois = await lerPlanosPublicos(1_000 + PLANOS_TTL_MS + 5)
    expect(depois).toEqual(boa)
    expect(logError).toHaveBeenCalledTimes(1)
  })

  it('depois de uma falha com valor guardado, só tenta de novo em ~1 min (não a cada visita)', async () => {
    const { lerPlanosPublicos, PLANOS_TTL_MS } = await carregar()
    await lerPlanosPublicos(1_000)
    respostas.app_plans = { data: null, error: { message: 'timeout' } }
    const t0 = 1_000 + PLANOS_TTL_MS + 5
    await lerPlanosPublicos(t0)
    const consultas = chamadas.length
    await lerPlanosPublicos(t0 + 30_000)
    expect(chamadas.length).toBe(consultas)
    await lerPlanosPublicos(t0 + 61_000)
    expect(chamadas.length).toBeGreaterThan(consultas)
  })
})

describe('lerTiersProfessorPublicos — a página do professor lê SÓ teacher_tiers', () => {
  it('devolve os cinco níveis ordenados, sem tocar em app_plans', async () => {
    respostas.app_plans = { data: null, error: { message: 'app_plans fora do ar' } }
    const { lerTiersProfessorPublicos } = await carregar()
    const r = await lerTiersProfessorPublicos(1_000)
    expect(r?.map((t) => t.chave)).toEqual(['free', 'starter', 'pro', 'elite', 'unlimited'])
    expect(chamadas.map((c) => c.tabela)).toEqual(['teacher_tiers'])
    expect(logError).not.toHaveBeenCalled()
  })

  it('usa a chave anônima e pede só o nível ativo', async () => {
    const { lerTiersProfessorPublicos } = await carregar()
    await lerTiersProfessorPublicos(1_000)
    expect(criados).toEqual([{ url: 'https://x.supabase.co', key: 'chave-anonima' }])
    expect(chamadas[0].passos.join(' ')).toContain('eq:["is_active",true]')
  })

  it('erro de leitura vira null + logError (a página some com a seção)', async () => {
    respostas.teacher_tiers = { data: null, error: { message: 'permission denied' } }
    const { lerTiersProfessorPublicos } = await carregar()
    expect(await lerTiersProfessorPublicos(1_000)).toBeNull()
    expect(logError.mock.calls[0][0]).toBe('para-professores.tiers-publicos')
    // O que vai ao Sentry é a causa REAL, não o "lista vazia" que viria de ignorar o erro:
    expect(logError.mock.calls[0][1]).toMatchObject({ message: 'permission denied' })
  })

  it('tabela sem nenhum nível ativo também vira null — lista vazia não é preço', async () => {
    respostas.teacher_tiers = { data: [], error: null }
    const { lerTiersProfessorPublicos } = await carregar()
    expect(await lerTiersProfessorPublicos(1_000)).toBeNull()
    expect(logError).toHaveBeenCalledTimes(1)
  })

  it('cache de 10 min e valor guardado em falha passageira', async () => {
    const { lerTiersProfessorPublicos, PLANOS_TTL_MS } = await carregar()
    const boa = await lerTiersProfessorPublicos(1_000)
    const antes = chamadas.length
    await lerTiersProfessorPublicos(1_000 + PLANOS_TTL_MS - 1)
    expect(chamadas.length).toBe(antes)
    respostas.teacher_tiers = { data: null, error: { message: 'timeout' } }
    const depois = await lerTiersProfessorPublicos(1_000 + PLANOS_TTL_MS + 5)
    expect(depois).toEqual(boa)
  })

  it('o cache dos professores é INDEPENDENTE do cache do VIP', async () => {
    const { lerPlanosPublicos, lerTiersProfessorPublicos } = await carregar()
    await lerPlanosPublicos(1_000)
    chamadas.length = 0
    await lerTiersProfessorPublicos(1_001) // não pode reaproveitar o guardado do VIP
    expect(chamadas.map((c) => c.tabela)).toEqual(['teacher_tiers'])
  })
})

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { normalizePresenceIds, sameIdList, keepIfUnchanged } from '../useCommunityData'

/**
 * Guard de regressão de performance da comunidade.
 *
 * Sintoma: o poll de presença (`setInterval(loadPresence, 30_000)`) chamava
 * `setTrainingNowIds(ids)` / `setOnlineIds(ids)` com um ARRAY NOVO a cada tick,
 * mesmo quando ninguém entrava ou saía. Array novo = estado novo = re-render do
 * CommunityClient inteiro (e, sem a memo do FeedCard, dos 20+ cards do feed).
 *
 * A trava tem duas partes: normalizar (a ordem crua do servidor não é garantida
 * — `/api/social/training-now` não tem `.order()`) e só então comparar,
 * devolvendo o array ANTERIOR quando o conteúdo é o mesmo.
 */
describe('normalizePresenceIds', () => {
  it('remove o próprio usuário, vazios e duplicados', () => {
    expect(normalizePresenceIds(['b', 'a', '', '  ', 'a', 'me', null, undefined], 'me')).toEqual(['a', 'b'])
  })

  it('ordena — respostas com a mesma gente em ordem diferente viram a MESMA lista', () => {
    const t1 = normalizePresenceIds(['u3', 'u1', 'u2'], 'me')
    const t2 = normalizePresenceIds(['u2', 'u3', 'u1'], 'me')
    expect(t1).toEqual(t2)
    expect(sameIdList(t1, t2)).toBe(true)
  })

  it('aguenta payload não-array (rota fora do ar / json quebrado)', () => {
    expect(normalizePresenceIds(null, 'me')).toEqual([])
    expect(normalizePresenceIds({ oops: true }, 'me')).toEqual([])
  })

  it('faz trim dos ids antes de comparar', () => {
    expect(normalizePresenceIds([' u1 ', 'u1'], 'me')).toEqual(['u1'])
  })
})

describe('keepIfUnchanged', () => {
  it('preserva a IDENTIDADE do array quando o conteúdo não mudou (não re-renderiza)', () => {
    const prev = ['a', 'b']
    const next = ['a', 'b']
    expect(keepIfUnchanged(prev, next)).toBe(prev)
  })

  it('devolve a lista nova quando alguém entra', () => {
    const prev = ['a']
    const next = ['a', 'b']
    expect(keepIfUnchanged(prev, next)).toBe(next)
  })

  it('devolve a lista nova quando alguém sai', () => {
    const prev = ['a', 'b']
    const next = ['b']
    expect(keepIfUnchanged(prev, next)).toBe(next)
  })

  it('lista vazia estável continua a mesma referência', () => {
    const prev: string[] = []
    expect(keepIfUnchanged(prev, [])).toBe(prev)
  })

  it('sameIdList é posicional — por isso a normalização ordena antes', () => {
    expect(sameIdList(['a', 'b'], ['b', 'a'])).toBe(false)
    expect(sameIdList(normalizePresenceIds(['a', 'b'], ''), normalizePresenceIds(['b', 'a'], ''))).toBe(true)
  })
})

/**
 * Source-guard da fiação: as funções puras acima não protegem nada se o hook
 * voltar a chamar `setTrainingNowIds(ids)` direto.
 */
describe('useCommunityData — fiação do poll de presença', () => {
  const src = readFileSync('src/app/(app)/community/useCommunityData.ts', 'utf8')

  const pollBlock = (() => {
    const start = src.indexOf('const loadPresence = async ()')
    expect(start).toBeGreaterThan(-1)
    const end = src.indexOf('setInterval(loadPresence', start)
    expect(end).toBeGreaterThan(start)
    return src.slice(start, end)
  })()

  it('ambos os setState passam por keepIfUnchanged', () => {
    expect(pollBlock).toMatch(/setTrainingNowIds\(\(prev\) => keepIfUnchanged\(prev, ids\)\)/)
    expect(pollBlock).toMatch(/setOnlineIds\(\(prev\) => keepIfUnchanged\(prev, ids\)\)/)
  })

  it('os ids são normalizados antes de comparar (sem sort, a comparação é inútil)', () => {
    expect(pollBlock).toMatch(/normalizePresenceIds\(/)
  })

  it('o efeito do poll depende só de userId — `profiles` recriaria o setInterval a cada carga', () => {
    const depsAt = src.indexOf('}, [', src.indexOf('setInterval(loadPresence'))
    expect(src.slice(depsAt, depsAt + 24)).toMatch(/^\}, \[userId\]\)/)
  })

  it('trainingNowProfiles é derivado (useMemo), não um setState dentro do poll', () => {
    expect(src).toMatch(/const trainingNowProfiles = useMemo\(/)
    expect(src).not.toMatch(/setTrainingNowProfiles\(/)
  })
})

/**
 * As rotas do aluno: `/api/medications` (CRUD) e `/api/medications/intakes`
 * ("Tomei" / "Desfazer").
 *
 * Fronteiras que não podem cair:
 *  - "Tomei" e "Desfazer" só valem para HOJE (BRT) → 409 `dia_virou`;
 *  - a tomada precisa ser de uma dose que existe (horário em `times` + remédio vale
 *    hoje) → 400 `horario_invalido`;
 *  - escrita em remédio filtra por `user_id`; erro de banco NUNCA vira 200;
 *  - o limite de 30 remédios é 409.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextResponse } from 'next/server'

type Op = [string, unknown[]]
type Chamada = { table: string; ops: Op[] }
type Resposta = { data?: unknown; error?: unknown; count?: number | null }

const chamadas: Chamada[] = []
let resolver: (c: Chamada) => Resposta = () => ({ data: null, error: null })
const ACOES = ['select', 'insert', 'update', 'delete', 'upsert']
const acaoDe = (c: Chamada) => c.ops.map(([m]) => m).find((m) => ACOES.includes(m)) ?? ''

const clienteFalso = {
  from(table: string) {
    const chamada: Chamada = { table, ops: [] }
    chamadas.push(chamada)
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'gte', 'lte', 'not', 'order', 'limit']) {
      chain[m] = (...args: unknown[]) => { chamada.ops.push([m, args]); return chain }
    }
    const resolve = async () => resolver(chamada)
    chain.maybeSingle = async () => { chamada.ops.push(['maybeSingle', []]); return resolve() }
    chain.single = async () => { chamada.ops.push(['single', []]); return resolve() }
    ;(chain as { then?: unknown }).then = (ok: (v: unknown) => void, ko: (e: unknown) => void) =>
      resolve().then(ok, ko)
    return chain
  },
}

const requireUser = vi.fn()
vi.mock('@/utils/auth/route', () => ({ requireUser: () => requireUser() }))
const rateLimit = vi.fn(async () => ({ allowed: true, retryAfterSeconds: 1 }))
vi.mock('@/utils/rateLimit', () => ({ checkRateLimitAsync: (...a: unknown[]) => rateLimit(...(a as [])) }))
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarn: vi.fn(), logWarnRemote: vi.fn() }))

import { GET, POST, PATCH, DELETE } from '../route'
import { POST as TOMEI, DELETE as DESFAZER } from '../intakes/route'

const U = 'aluno-1'
const ID = '11111111-1111-4111-8111-111111111111'
// Sábado 03/10/2026, 12:00 em BRT.
const AGORA = new Date('2026-10-03T15:00:00Z')
const HOJE = '2026-10-03'
const ONTEM = '2026-10-02'

const json = (method: string, body: unknown) =>
  new Request('http://x/api/medications', { method, body: JSON.stringify(body) })

const filtros = (c: Chamada) => c.ops.filter(([m]) => m === 'eq').map(([, a]) => a as [string, unknown])
const chamadasDe = (table: string, acao: string) =>
  chamadas.filter((c) => c.table === table && acaoDe(c) === acao)

const remedio = (extra: Record<string, unknown> = {}) => ({
  id: ID,
  user_id: U,
  name: 'Losartana',
  dose: '50 mg',
  times: ['08:00', '20:00'],
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  start_date: '2026-10-01',
  end_date: null,
  notes: null,
  active: true,
  created_at: '2026-10-01T12:00:00Z',
  ...extra,
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AGORA)
  chamadas.length = 0
  resolver = () => ({ data: null, error: null })
  rateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 1 })
  requireUser.mockResolvedValue({ ok: true, user: { id: U, email: 'a@x.com' }, supabase: clienteFalso })
})
afterEach(() => vi.useRealTimers())

describe('autenticação e rate limit (todas as rotas)', () => {
  const naoAutenticado = () =>
    requireUser.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 }),
    })

  it('não autenticado → 401 em todos os métodos, sem tocar no banco', async () => {
    naoAutenticado()
    const corpo = { medicationId: ID, time: '08:00', dateKey: HOJE }
    const respostas = await Promise.all([
      GET(),
      POST(json('POST', {})),
      PATCH(json('PATCH', {})),
      DELETE(json('DELETE', {})),
      TOMEI(json('POST', corpo)),
      DESFAZER(json('DELETE', corpo)),
    ])
    expect(respostas.map((r) => r.status)).toEqual([401, 401, 401, 401, 401, 401])
    expect(chamadas).toHaveLength(0)
  })

  it('rate limit estourado → 429 com Retry-After', async () => {
    rateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 42 })
    const res = await POST(json('POST', { name: 'x', times: ['08:00'] }))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('42')
    expect(chamadas).toHaveLength(0)
  })
})

describe('GET /api/medications', () => {
  it('devolve remédios, tomadas de HOJE, today e hasCoach', async () => {
    resolver = (c) => {
      if (c.table === 'medications') return { data: [remedio()] }
      if (c.table === 'medication_intakes') return { data: [{ id: 'i1', medication_id: ID, date: HOJE, scheduled_time: '08:00' }] }
      if (c.table === 'students') return { data: { id: 's1' } }
      return { data: null }
    }
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, today: HOJE, hasCoach: true })
    expect(body.medications).toHaveLength(1)
    expect(body.intakes).toHaveLength(1)

    const [tomadas] = chamadasDe('medication_intakes', 'select')
    expect(tomadas.ops).toContainEqual(['gte', ['date', HOJE]])
    expect(tomadas.ops).toContainEqual(['lte', ['date', HOJE]])
    expect(filtros(tomadas)).toContainEqual(['user_id', U])
  })

  it('hasCoach = false quando não há vínculo OU quando a leitura falha (não derruba a lista)', async () => {
    resolver = (c) => (c.table === 'students' ? { data: null } : { data: [] })
    expect((await (await GET()).json()).hasCoach).toBe(false)

    resolver = (c) => (c.table === 'students' ? { data: { id: 's1' }, error: { message: 'rls' } } : { data: [] })
    const res = await GET()
    expect(res.status).toBe(200)
    expect((await res.json()).hasCoach).toBe(false)
  })

  it('erro de banco na lista → 500 genérico, sem vazar a mensagem', async () => {
    resolver = (c) => (c.table === 'medications' ? { data: null, error: { message: 'relation "medications" does not exist' } } : { data: [] })
    const res = await GET()
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('relation')
  })
})

describe('POST /api/medications', () => {
  it('cria e devolve a linha; created_by/updated_by = o próprio aluno', async () => {
    resolver = (c) => (acaoDe(c) === 'select' ? { count: 0 } : { data: remedio() })
    const res = await POST(json('POST', { name: 'Losartana', dose: '50 mg', times: ['8:00', '20:00'] }))
    expect(res.status).toBe(200)
    expect((await res.json()).medication.id).toBe(ID)
    const [ins] = chamadasDe('medications', 'insert')
    const payload = ins.ops.find(([m]) => m === 'insert')![1][0] as Record<string, unknown>
    expect(payload).toMatchObject({ user_id: U, created_by: U, updated_by: U, times: ['08:00', '20:00'] })
  })

  it('⚠️ 31º remédio → 409 `limite_atingido`, nada gravado', async () => {
    resolver = (c) => (acaoDe(c) === 'select' ? { count: 30 } : { data: remedio() })
    const res = await POST(json('POST', { name: 'X', times: ['08:00'] }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('limite_atingido')
    expect(chamadasDe('medications', 'insert')).toHaveLength(0)
  })

  it('⚠️ erro de banco na escrita NÃO vira 200', async () => {
    resolver = (c) =>
      acaoDe(c) === 'select' ? { count: 0 } : { data: null, error: { code: '42501', message: 'new row violates row-level security policy' } }
    const res = await POST(json('POST', { name: 'X', times: ['08:00'] }))
    expect(res.status).toBe(500)
    const corpo = await res.json()
    expect(corpo.ok).toBe(false)
    expect(JSON.stringify(corpo)).not.toContain('row-level')
  })

  it.each([
    ['sem nome', { times: ['08:00'] }],
    ['sem horário válido', { name: 'X', times: ['25:99'] }],
    ['fim antes do início', { name: 'X', times: ['08:00'], startDate: '2026-10-10', endDate: '2026-10-01' }],
    ['corpo que não é objeto', 'lixo'],
  ])('corpo inválido (%s) → 400 e nenhuma chamada ao banco', async (_nome, corpo) => {
    const res = await POST(json('POST', corpo))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_request')
    expect(chamadas).toHaveLength(0)
  })
})

describe('PATCH /api/medications', () => {
  it('⚠️ atualiza filtrando por id E user_id da sessão — o corpo não escolhe o dono', async () => {
    resolver = () => ({ data: remedio() })
    const res = await PATCH(json('PATCH', { id: ID, name: 'Novo', user_id: 'outro-aluno' }))
    expect(res.status).toBe(200)
    const [escrita] = chamadasDe('medications', 'update')
    expect(filtros(escrita)).toContainEqual(['user_id', U])
    expect(filtros(escrita)).not.toContainEqual(['user_id', 'outro-aluno'])
    const colunas = escrita.ops.find(([m]) => m === 'update')![1][0] as Record<string, unknown>
    expect(colunas).toEqual({ updated_by: U, name: 'Novo' })
  })

  it('id de outra pessoa / inexistente → 404', async () => {
    resolver = () => ({ data: null })
    const res = await PATCH(json('PATCH', { id: ID, name: 'x' }))
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('nao_encontrado')
  })

  it('fim anterior ao início GRAVADO → 400 `datas_invalidas`', async () => {
    resolver = () => ({ data: remedio({ start_date: '2026-10-10' }) })
    const res = await PATCH(json('PATCH', { id: ID, endDate: '2026-10-05' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('datas_invalidas')
    expect(chamadasDe('medications', 'update')).toHaveLength(0)
  })

  it('⚠️ erro de banco no UPDATE NÃO vira 200', async () => {
    resolver = (c) => (acaoDe(c) === 'update' ? { data: null, error: { message: 'boom' } } : { data: remedio() })
    expect((await PATCH(json('PATCH', { id: ID, name: 'x' }))).status).toBe(500)
  })

  it('id que não é uuid → 400', async () => {
    expect((await PATCH(json('PATCH', { id: 'abc', name: 'x' }))).status).toBe(400)
    expect(chamadas).toHaveLength(0)
  })
})

describe('DELETE /api/medications', () => {
  it('⚠️ apaga filtrando por id E user_id', async () => {
    resolver = () => ({ data: [{ id: ID }] })
    const res = await DELETE(json('DELETE', { id: ID }))
    expect(res.status).toBe(200)
    const [del] = chamadasDe('medications', 'delete')
    expect(filtros(del)).toContainEqual(['id', ID])
    expect(filtros(del)).toContainEqual(['user_id', U])
  })

  it('zero linhas → 404; erro de banco → 500; corpo inválido → 400', async () => {
    resolver = () => ({ data: [] })
    expect((await DELETE(json('DELETE', { id: ID }))).status).toBe(404)
    resolver = () => ({ data: null, error: { message: 'boom' } })
    expect((await DELETE(json('DELETE', { id: ID }))).status).toBe(500)
    expect((await DELETE(json('DELETE', {}))).status).toBe(400)
  })
})

describe('POST /api/medications/intakes ("Tomei")', () => {
  const tomei = (extra: Record<string, unknown> = {}) =>
    TOMEI(json('POST', { medicationId: ID, time: '08:00', dateKey: HOJE, ...extra }))

  const bancoComRemedio = (med = remedio()) => {
    resolver = (c) => {
      if (c.table === 'medications') return { data: med }
      if (c.table === 'medication_intakes' && acaoDe(c) === 'select')
        return { data: { id: 'i1', medication_id: ID, user_id: U, date: HOJE, scheduled_time: '08:00', recorded_by: U } }
      return { data: null }
    }
  }

  it('grava por INSERT que ignora duplicata (nunca DO UPDATE) e devolve a linha relida', async () => {
    bancoComRemedio()
    const res = await tomei()
    expect(res.status).toBe(200)
    expect((await res.json()).intake.scheduled_time).toBe('08:00')

    const [up] = chamadasDe('medication_intakes', 'upsert')
    const [row, opts] = up.ops.find(([m]) => m === 'upsert')![1] as [Record<string, unknown>, Record<string, unknown>]
    expect(opts).toEqual({ onConflict: 'medication_id,date,scheduled_time', ignoreDuplicates: true })
    expect(row).toMatchObject({ medication_id: ID, user_id: U, date: HOJE, scheduled_time: '08:00', recorded_by: U })
  })

  it('normaliza o horário ("8:00" → "08:00") antes de comparar e gravar', async () => {
    bancoComRemedio()
    const res = await tomei({ time: '8:00' })
    expect(res.status).toBe(200)
    const [up] = chamadasDe('medication_intakes', 'upsert')
    const [row] = up.ops.find(([m]) => m === 'upsert')![1] as [Record<string, unknown>]
    expect(row.scheduled_time).toBe('08:00')
  })

  it('⚠️ dia que NÃO é hoje → 409 `dia_virou`, sem consultar nem gravar nada', async () => {
    bancoComRemedio()
    const res = await tomei({ dateKey: ONTEM })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('dia_virou')
    expect(chamadas).toHaveLength(0)
  })

  it('dia futuro também → 409 `dia_virou`', async () => {
    bancoComRemedio()
    expect((await tomei({ dateKey: '2026-10-04' })).status).toBe(409)
    expect(chamadas).toHaveLength(0)
  })

  it('⚠️ horário que NÃO está em `times` → 400 `horario_invalido`, nada gravado', async () => {
    bancoComRemedio()
    const res = await tomei({ time: '09:30' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('horario_invalido')
    expect(chamadasDe('medication_intakes', 'upsert')).toHaveLength(0)
  })

  it('horário em formato inválido → 400', async () => {
    bancoComRemedio()
    expect((await tomei({ time: 'cedo' })).status).toBe(400)
    expect(chamadasDe('medication_intakes', 'upsert')).toHaveLength(0)
  })

  it.each([
    ['pausado', { active: false }],
    ['ainda não começou', { start_date: '2026-10-05' }],
    ['já terminou', { end_date: '2026-10-02' }],
    ['hoje (sábado) fora dos dias da semana', { weekdays: [0, 1, 2, 3, 4, 5] }],
  ])('⚠️ remédio que não vale hoje (%s) → 400 `horario_invalido`', async (_nome, extra) => {
    bancoComRemedio(remedio(extra))
    const res = await tomei()
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('horario_invalido')
    expect(chamadasDe('medication_intakes', 'upsert')).toHaveLength(0)
  })

  it('o remédio é buscado SÓ no nome do usuário da sessão (id de outra pessoa → 404)', async () => {
    resolver = () => ({ data: null })
    const res = await tomei()
    expect(res.status).toBe(404)
    const [busca] = chamadasDe('medications', 'select')
    expect(filtros(busca)).toContainEqual(['user_id', U])
    expect(chamadasDe('medication_intakes', 'upsert')).toHaveLength(0)
  })

  it('⚠️ erro de banco no INSERT da tomada NÃO vira 200', async () => {
    resolver = (c) => {
      if (c.table === 'medications') return { data: remedio() }
      return { data: null, error: { message: 'boom' } }
    }
    const res = await tomei()
    expect(res.status).toBe(500)
    expect((await res.json()).ok).toBe(false)
  })

  it('gravou mas a releitura não achou a linha → 500, não sucesso', async () => {
    resolver = (c) => (c.table === 'medications' ? { data: remedio() } : { data: null })
    expect((await tomei()).status).toBe(500)
  })

  it('corpo inválido → 400 sem tocar no banco', async () => {
    expect((await TOMEI(json('POST', { medicationId: 'x', time: '08:00', dateKey: HOJE }))).status).toBe(400)
    expect((await TOMEI(json('POST', { medicationId: ID, time: '08:00', dateKey: 'hoje' }))).status).toBe(400)
    expect(chamadas).toHaveLength(0)
  })
})

describe('DELETE /api/medications/intakes ("Desfazer")', () => {
  const desfazer = (extra: Record<string, unknown> = {}) =>
    DESFAZER(json('DELETE', { medicationId: ID, time: '08:00', dateKey: HOJE, ...extra }))

  it('apaga por (medication_id, user_id, date, scheduled_time)', async () => {
    const res = await desfazer({ time: '8:00' })
    expect(res.status).toBe(200)
    const [del] = chamadasDe('medication_intakes', 'delete')
    expect(filtros(del)).toEqual(
      expect.arrayContaining([
        ['medication_id', ID],
        ['user_id', U],
        ['date', HOJE],
        ['scheduled_time', '08:00'],
      ]),
    )
  })

  it('⚠️ dia que NÃO é hoje → 409 `dia_virou`, nada apagado', async () => {
    const res = await desfazer({ dateKey: ONTEM })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('dia_virou')
    expect(chamadas).toHaveLength(0)
  })

  it('⚠️ erro de banco no DELETE NÃO vira 200', async () => {
    resolver = () => ({ data: null, error: { message: 'boom' } })
    expect((await desfazer()).status).toBe(500)
  })

  it('corpo inválido → 400', async () => {
    expect((await DESFAZER(json('DELETE', {}))).status).toBe(400)
    expect(chamadas).toHaveLength(0)
  })
})

/**
 * `/api/teacher/medications` — o professor vê e edita os remédios do aluno vinculado.
 *
 * Fronteiras que não podem cair:
 *  - sem vínculo (`canCoachStudent` falso) → 403 em TODOS os métodos, e nem o núcleo
 *    nem o aviso são tocados;
 *  - o cliente é o da SESSÃO (a RLS `is_teacher_of` é a segunda trava), nunca o
 *    service-role;
 *  - o aviso `medication_updated` sai só depois de escrita CONFIRMADA, e a falha do
 *    aviso não derruba a resposta;
 *  - toda escrita carrega `.eq('user_id', studentId)`;
 *  - o GET traz a adesão dos últimos 7 dias BRT.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextResponse } from 'next/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

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

const requireRole = vi.fn()
vi.mock('@/utils/auth/route', () => ({ requireRole: (...a: unknown[]) => requireRole(...a) }))
const podeOrientar = vi.fn(async (..._a: unknown[]) => true)
vi.mock('@/utils/auth/studentAccess', () => ({ canCoachStudent: (...a: unknown[]) => podeOrientar(...a) }))
const rateLimit = vi.fn(async (..._a: unknown[]) => ({ allowed: true, retryAfterSeconds: 1 }))
vi.mock('@/utils/rateLimit', () => ({ checkRateLimitAsync: (...a: unknown[]) => rateLimit(...a) }))
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarn: vi.fn(), logWarnRemote: vi.fn() }))

const avisar = vi.fn(async (..._a: unknown[]) => ({ ok: true, notified: true }))
vi.mock('@/lib/notifications/coachChangeNotice', () => ({ notifyCoachChange: (...a: unknown[]) => avisar(...a) }))
vi.mock('@vercel/functions', () => ({ waitUntil: vi.fn() }))

// O service-role NÃO pode ser usado por esta rota: se alguém trocar o cliente da
// sessão pelo admin, este mock registra.
const adminChamado = vi.fn()
vi.mock('@/utils/supabase/admin', () => ({
  createAdminClient: () => { adminChamado(); return clienteFalso },
}))

import { GET, POST, PATCH, DELETE } from '../route'

const PROF = 'prof-1'
const STUDENT = '22222222-2222-4222-8222-222222222222'
const ID = '11111111-1111-4111-8111-111111111111'
// Sábado 03/10/2026, 12:00 em BRT.
const AGORA = new Date('2026-10-03T15:00:00Z')

const req = (method: string, body: unknown) =>
  new Request('http://x/api/teacher/medications', { method, body: JSON.stringify(body) })
const getReq = (studentId?: string) =>
  new Request(`http://x/api/teacher/medications${studentId === undefined ? '' : `?studentId=${studentId}`}`)

const filtros = (c: Chamada) => c.ops.filter(([m]) => m === 'eq').map(([, a]) => a as [string, unknown])
const chamadasDe = (table: string, acao: string) =>
  chamadas.filter((c) => c.table === table && acaoDe(c) === acao)

const remedio = (extra: Record<string, unknown> = {}) => ({
  id: ID,
  user_id: STUDENT,
  name: 'Losartana',
  dose: '50 mg',
  times: ['08:00'],
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  start_date: '2026-10-01',
  end_date: null,
  notes: null,
  active: true,
  created_at: '2026-10-01T12:00:00Z',
  ...extra,
})

/** Um pedido válido por método — usado pelos testes que valem para os quatro. */
const PEDIDOS: Array<[string, () => Promise<Response>]> = [
  ['GET', () => GET(getReq(STUDENT))],
  ['POST', () => POST(req('POST', { studentId: STUDENT, name: 'Losartana', times: ['08:00'] }))],
  ['PATCH', () => PATCH(req('PATCH', { studentId: STUDENT, id: ID, name: 'Outro' }))],
  ['DELETE', () => DELETE(req('DELETE', { studentId: STUDENT, id: ID }))],
]

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AGORA)
  chamadas.length = 0
  resolver = () => ({ data: null, error: null })
  podeOrientar.mockReset().mockResolvedValue(true)
  rateLimit.mockReset().mockResolvedValue({ allowed: true, retryAfterSeconds: 1 })
  avisar.mockReset().mockResolvedValue({ ok: true, notified: true })
  adminChamado.mockReset()
  requireRole.mockReset().mockResolvedValue({
    ok: true,
    user: { id: PROF, email: 'prof@x.com' },
    supabase: clienteFalso,
    role: 'teacher',
  })
})
afterEach(() => vi.useRealTimers())

describe('autorização', () => {
  it.each(PEDIDOS)('⚠️ %s sem vínculo com o aluno → 403, sem tocar no banco nem avisar', async (_m, chamar) => {
    podeOrientar.mockResolvedValue(false)
    const res = await chamar()
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('forbidden')
    expect(chamadas, 'nenhuma chamada ao núcleo/banco').toHaveLength(0)
    expect(avisar).not.toHaveBeenCalled()
  })

  it.each(PEDIDOS)('%s confere o vínculo com o professor e o aluno CERTOS', async (_m, chamar) => {
    await chamar()
    expect(podeOrientar).toHaveBeenCalledWith({ id: PROF, email: 'prof@x.com' }, STUDENT)
  })

  it.each(PEDIDOS)('%s por quem não é professor/admin → barrado, sem vínculo e sem banco', async (_m, chamar) => {
    requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 }),
    })
    const res = await chamar()
    expect(res.status).toBe(403)
    expect(podeOrientar).not.toHaveBeenCalled()
    expect(chamadas).toHaveLength(0)
    expect(avisar).not.toHaveBeenCalled()
  })

  it.each(PEDIDOS)('%s sem login → 401 repassado', async (_m, chamar) => {
    requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 }),
    })
    expect((await chamar()).status).toBe(401)
    expect(chamadas).toHaveLength(0)
  })

  it('só professor e admin passam pelo portão de papel', async () => {
    await GET(getReq(STUDENT))
    expect(requireRole).toHaveBeenCalledWith(['admin', 'teacher'])
  })

  it('rate limit estourado → 429 com Retry-After, sem escrever nem avisar', async () => {
    rateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 42 })
    for (const [, chamar] of PEDIDOS) {
      const res = await chamar()
      expect(res.status).toBe(429)
      expect(res.headers.get('Retry-After')).toBe('42')
    }
    expect(chamadas).toHaveLength(0)
    expect(avisar).not.toHaveBeenCalled()
    const chave = String(rateLimit.mock.calls[0][0])
    expect(chave).toBe(`teacher-medications:${PROF}`)
  })
})

describe('studentId inválido → 400', () => {
  it('GET: ausente ou não-uuid', async () => {
    for (const ruim of [undefined, '', 'aluno-1', '123']) {
      const res = await GET(getReq(ruim))
      expect(res.status).toBe(400)
    }
    expect(podeOrientar).not.toHaveBeenCalled()
    expect(chamadas).toHaveLength(0)
  })

  it.each([
    ['POST', () => POST(req('POST', { studentId: 'aluno-1', name: 'X', times: ['08:00'] }))],
    ['POST sem studentId', () => POST(req('POST', { name: 'X', times: ['08:00'] }))],
    ['PATCH', () => PATCH(req('PATCH', { studentId: 'aluno-1', id: ID, name: 'X' }))],
    ['DELETE', () => DELETE(req('DELETE', { studentId: 'aluno-1', id: ID }))],
    ['DELETE sem corpo objeto', () => DELETE(req('DELETE', 'lixo'))],
  ])('%s', async (_n, chamar) => {
    const res = await chamar()
    expect(res.status).toBe(400)
    expect(podeOrientar).not.toHaveBeenCalled()
    expect(chamadas).toHaveLength(0)
    expect(avisar).not.toHaveBeenCalled()
  })

  it('corpo de remédio inválido (sem horário válido) → 400 antes de qualquer vínculo ou banco', async () => {
    const res = await POST(req('POST', { studentId: STUDENT, name: 'X', times: ['25:99'] }))
    expect(res.status).toBe(400)
    expect(chamadas).toHaveLength(0)
  })
})

describe('GET — remédios + adesão dos últimos 7 dias BRT', () => {
  it('lê o ALUNO (não o professor) e pede de hoje-6 até hoje, inclusivo', async () => {
    resolver = (c) =>
      c.table === 'medications'
        ? { data: [remedio()] }
        : { data: [{ id: 'i1', medication_id: ID, date: '2026-10-02', scheduled_time: '08:00' }] }
    const res = await GET(getReq(STUDENT))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.medications).toHaveLength(1)
    expect(body.intakes).toHaveLength(1)

    const [tomadas] = chamadasDe('medication_intakes', 'select')
    // Hoje (03/10) e os 6 dias anteriores = 27/09 … 03/10.
    expect(tomadas.ops).toContainEqual(['gte', ['date', '2026-09-27']])
    expect(tomadas.ops).toContainEqual(['lte', ['date', '2026-10-03']])
    expect(filtros(tomadas)).toContainEqual(['user_id', STUDENT])
    const [lista] = chamadasDe('medications', 'select')
    expect(filtros(lista)).toContainEqual(['user_id', STUDENT])
  })

  it('o intervalo acompanha o dia BRT, não o UTC (01:00 UTC ainda é o dia anterior em Brasília)', async () => {
    vi.setSystemTime(new Date('2026-10-03T01:00:00Z')) // 02/10 22:00 BRT
    await GET(getReq(STUDENT))
    const [tomadas] = chamadasDe('medication_intakes', 'select')
    expect(tomadas.ops).toContainEqual(['gte', ['date', '2026-09-26']])
    expect(tomadas.ops).toContainEqual(['lte', ['date', '2026-10-02']])
  })

  it('erro de banco → 500 genérico, sem vazar a mensagem', async () => {
    resolver = (c) =>
      c.table === 'medications'
        ? { data: null, error: { message: 'relation "medications" does not exist' } }
        : { data: [] }
    const res = await GET(getReq(STUDENT))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('relation')
  })

  it('leitura NÃO avisa o aluno', async () => {
    await GET(getReq(STUDENT))
    expect(avisar).not.toHaveBeenCalled()
  })
})

describe('escrita bem-sucedida avisa o aluno (medication_updated)', () => {
  it('POST: cria para o ALUNO, autor = professor, e avisa', async () => {
    resolver = (c) => (acaoDe(c) === 'select' ? { count: 0 } : { data: remedio() })
    const res = await POST(req('POST', { studentId: STUDENT, name: 'Losartana', dose: '50 mg', times: ['8:00'] }))
    expect(res.status).toBe(200)
    expect((await res.json()).medication.id).toBe(ID)

    const [ins] = chamadasDe('medications', 'insert')
    const payload = ins.ops.find(([m]) => m === 'insert')![1][0] as Record<string, unknown>
    expect(payload).toMatchObject({ user_id: STUDENT, created_by: PROF, updated_by: PROF, times: ['08:00'] })
    expect(payload).not.toHaveProperty('studentId')

    expect(avisar).toHaveBeenCalledTimes(1)
    expect(avisar).toHaveBeenCalledWith({
      studentUserId: STUDENT,
      kind: 'medication_updated',
      origem: 'medication_edit',
    })
  })

  it('PATCH: filtra por id E user_id do aluno, e avisa', async () => {
    resolver = (c) => (acaoDe(c) === 'update' ? { data: remedio({ name: 'Outro' }) } : { data: remedio() })
    const res = await PATCH(req('PATCH', { studentId: STUDENT, id: ID, name: 'Outro' }))
    expect(res.status).toBe(200)
    const [upd] = chamadasDe('medications', 'update')
    expect(filtros(upd)).toEqual(expect.arrayContaining([['id', ID], ['user_id', STUDENT]]))
    const colunas = upd.ops.find(([m]) => m === 'update')![1][0] as Record<string, unknown>
    expect(colunas).toMatchObject({ name: 'Outro', updated_by: PROF })
    expect(colunas).not.toHaveProperty('studentId')
    expect(colunas).not.toHaveProperty('id')
    expect(avisar).toHaveBeenCalledTimes(1)
    expect(avisar.mock.calls[0][0]).toMatchObject({ studentUserId: STUDENT, kind: 'medication_updated' })
  })

  it('DELETE: filtra por id E user_id do aluno, e avisa', async () => {
    resolver = () => ({ data: [{ id: ID }] })
    const res = await DELETE(req('DELETE', { studentId: STUDENT, id: ID }))
    expect(res.status).toBe(200)
    const [del] = chamadasDe('medications', 'delete')
    expect(filtros(del)).toEqual(expect.arrayContaining([['id', ID], ['user_id', STUDENT]]))
    expect(avisar).toHaveBeenCalledTimes(1)
    expect(avisar.mock.calls[0][0]).toMatchObject({ studentUserId: STUDENT, kind: 'medication_updated' })
  })
})

describe('⚠️ escrita que FALHOU não avisa o aluno', () => {
  it('POST: erro de banco → 500 e nenhum aviso', async () => {
    resolver = (c) =>
      acaoDe(c) === 'select'
        ? { count: 0 }
        : { data: null, error: { code: '42501', message: 'new row violates row-level security policy' } }
    const res = await POST(req('POST', { studentId: STUDENT, name: 'X', times: ['08:00'] }))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('row-level')
    expect(avisar).not.toHaveBeenCalled()
  })

  it('POST: 31º remédio → 409 `limite_atingido` e nenhum aviso', async () => {
    resolver = (c) => (acaoDe(c) === 'select' ? { count: 30 } : { data: remedio() })
    const res = await POST(req('POST', { studentId: STUDENT, name: 'X', times: ['08:00'] }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('limite_atingido')
    expect(avisar).not.toHaveBeenCalled()
  })

  it('PATCH: remédio de outro aluno / inexistente → 404 e nenhum aviso', async () => {
    resolver = () => ({ data: null })
    const res = await PATCH(req('PATCH', { studentId: STUDENT, id: ID, name: 'X' }))
    expect(res.status).toBe(404)
    expect(avisar).not.toHaveBeenCalled()
  })

  it('PATCH: fim antes do início gravado → 400 e nenhum aviso', async () => {
    resolver = () => ({ data: remedio({ start_date: '2026-10-10' }) })
    const res = await PATCH(req('PATCH', { studentId: STUDENT, id: ID, endDate: '2026-10-01' }))
    expect(res.status).toBe(400)
    expect(avisar).not.toHaveBeenCalled()
  })

  it('PATCH: erro de banco na escrita → 500 e nenhum aviso', async () => {
    resolver = (c) => (acaoDe(c) === 'update' ? { data: null, error: { message: 'boom' } } : { data: remedio() })
    const res = await PATCH(req('PATCH', { studentId: STUDENT, id: ID, name: 'X' }))
    expect(res.status).toBe(500)
    expect(avisar).not.toHaveBeenCalled()
  })

  it('DELETE: zero linhas apagadas → 404 e nenhum aviso', async () => {
    resolver = () => ({ data: [] })
    const res = await DELETE(req('DELETE', { studentId: STUDENT, id: ID }))
    expect(res.status).toBe(404)
    expect(avisar).not.toHaveBeenCalled()
  })

  it('DELETE: erro de banco → 500 e nenhum aviso', async () => {
    resolver = () => ({ data: null, error: { message: 'boom' } })
    const res = await DELETE(req('DELETE', { studentId: STUDENT, id: ID }))
    expect(res.status).toBe(500)
    expect(avisar).not.toHaveBeenCalled()
  })
})

describe('o aviso é best-effort', () => {
  it('⚠️ falha do aviso (promise rejeitada) não derruba a escrita já gravada', async () => {
    avisar.mockRejectedValue(new Error('push fora do ar'))
    resolver = (c) => (acaoDe(c) === 'select' ? { count: 0 } : { data: remedio() })
    const res = await POST(req('POST', { studentId: STUDENT, name: 'X', times: ['08:00'] }))
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
    // deixa o `.catch` do aviso rodar: nenhuma rejeição pode escapar.
    await Promise.resolve()
  })

  it('o aviso vai para o waitUntil (não bloqueia a resposta)', async () => {
    const { waitUntil } = await import('@vercel/functions')
    vi.mocked(waitUntil).mockClear()
    resolver = () => ({ data: [{ id: ID }] })
    await DELETE(req('DELETE', { studentId: STUDENT, id: ID }))
    expect(waitUntil).toHaveBeenCalledTimes(1)
  })
})

describe('⚠️ cliente da SESSÃO, nunca service-role', () => {
  it.each(PEDIDOS)('%s não cria o client admin (a RLS is_teacher_of segue valendo)', async (_m, chamar) => {
    resolver = (c) => (acaoDe(c) === 'select' ? { count: 0, data: remedio() } : { data: [remedio()] })
    await chamar()
    expect(adminChamado).not.toHaveBeenCalled()
    expect(chamadas.length, 'o núcleo usou o client da sessão').toBeGreaterThan(0)
  })

  it('source-guard: a rota não importa nem chama createAdminClient', () => {
    const fonte = readFileSync(join(process.cwd(), 'src/app/api/teacher/medications/route.ts'), 'utf8')
    const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
    expect(codigo).not.toMatch(/createAdminClient|supabase\/admin/)
  })

  it('source-guard: o professor não ganha rota de "Tomei" (só o aluno registra tomada)', () => {
    const fonte = readFileSync(join(process.cwd(), 'src/app/api/teacher/medications/route.ts'), 'utf8')
    const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
    expect(codigo).not.toMatch(/\.from\(\s*['"]medication_intakes['"]\s*\)/)
    expect(codigo).not.toMatch(/insert|upsert/)
  })
})

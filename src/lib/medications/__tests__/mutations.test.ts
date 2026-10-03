/**
 * O núcleo de medicamentos (compartilhado por aluno e professor).
 *
 * O que estes testes travam, e por quê:
 *  - toda escrita numa linha existente leva `.eq('user_id', ...)` — o professor tem
 *    policy para escrever em QUALQUER aluno vinculado, e sem o filtro um `id` de
 *    outra pessoa passaria por aqui;
 *  - o supabase-js não lança em erro de escrita: `{ error }` vira falha tipada,
 *    nunca sucesso;
 *  - o teto de 30 remédios e a conferência início × fim contra a linha gravada.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  createMedicationCore,
  deleteMedicationCore,
  listIntakesCore,
  listMedicationsCore,
  updateMedicationCore,
} from '../mutations'
import { MedicationInputSchema, MedicationPatchSchema } from '@/schemas/medications'

type Op = [string, unknown[]]
type Chamada = { table: string; ops: Op[] }
type Resposta = { data?: unknown; error?: unknown; count?: number | null }

const chamadas: Chamada[] = []
let resolver: (c: Chamada) => Resposta = () => ({ data: null, error: null })

const ACOES = ['select', 'insert', 'update', 'delete', 'upsert']

/** Client falso encadeável: registra cada chamada e resolve pelo `resolver` do teste. */
function clienteFalso(): SupabaseClient {
  return {
    from(table: string) {
      const chamada: Chamada = { table, ops: [] }
      chamadas.push(chamada)
      const chain: Record<string, unknown> = {}
      const metodos = [
        'select', 'insert', 'update', 'delete', 'upsert',
        'eq', 'gte', 'lte', 'not', 'order', 'limit',
      ]
      for (const m of metodos) {
        chain[m] = (...args: unknown[]) => {
          chamada.ops.push([m, args])
          return chain
        }
      }
      const resolve = async () => resolver(chamada)
      chain.maybeSingle = async () => { chamada.ops.push(['maybeSingle', []]); return resolve() }
      chain.single = async () => { chamada.ops.push(['single', []]); return resolve() }
      ;(chain as { then?: unknown }).then = (ok: (v: unknown) => void, ko: (e: unknown) => void) =>
        resolve().then(ok, ko)
      return chain
    },
  } as unknown as SupabaseClient
}

const acaoDe = (c: Chamada) => c.ops.map(([m]) => m).find((m) => ACOES.includes(m)) ?? ''
const filtros = (c: Chamada) => c.ops.filter(([m]) => m === 'eq').map(([, a]) => a as [string, unknown])
const chamadasDe = (table: string, acao: string) =>
  chamadas.filter((c) => c.table === table && acaoDe(c) === acao)

const U = 'aluno-1'
const ATOR = 'prof-9'
const ID = '11111111-1111-4111-8111-111111111111'

const linha = (extra: Record<string, unknown> = {}) => ({
  id: ID,
  user_id: U,
  name: 'Losartana',
  dose: '50 mg',
  times: ['08:00'],
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  start_date: '2026-10-01',
  end_date: null,
  notes: null,
  active: true,
  ...extra,
})

const entrada = (extra: Record<string, unknown> = {}) =>
  MedicationInputSchema.parse({ name: 'Losartana', dose: '50 mg', times: ['8:00'], startDate: '2026-10-01', ...extra })

beforeEach(() => {
  chamadas.length = 0
  resolver = () => ({ data: null, error: null })
})

describe('createMedicationCore', () => {
  it('grava camelCase → snake_case com created_by/updated_by do ATOR e user_id do dono', async () => {
    resolver = (c) => (acaoDe(c) === 'select' ? { count: 3 } : { data: linha() })
    const r = await createMedicationCore(clienteFalso(), U, entrada({ endDate: '2026-12-31' }), ATOR)
    expect(r.ok).toBe(true)
    const [ins] = chamadasDe('medications', 'insert')
    const payload = ins.ops.find(([m]) => m === 'insert')![1][0] as Record<string, unknown>
    expect(payload).toMatchObject({
      user_id: U,
      name: 'Losartana',
      dose: '50 mg',
      times: ['08:00'],
      start_date: '2026-10-01',
      end_date: '2026-12-31',
      active: true,
      created_by: ATOR,
      updated_by: ATOR,
    })
  })

  it('⚠️ recusa o 31º remédio com `limite_atingido` e NÃO grava nada', async () => {
    resolver = (c) => (acaoDe(c) === 'select' ? { count: 30 } : { data: linha() })
    const r = await createMedicationCore(clienteFalso(), U, entrada(), U)
    expect(r).toEqual({ ok: false, code: 'limite_atingido' })
    expect(chamadasDe('medications', 'insert')).toHaveLength(0)
  })

  it('aceita o 30º (29 existentes)', async () => {
    resolver = (c) => (acaoDe(c) === 'select' ? { count: 29 } : { data: linha() })
    const r = await createMedicationCore(clienteFalso(), U, entrada(), U)
    expect(r.ok).toBe(true)
  })

  it('⚠️ erro do INSERT não vira sucesso (supabase-js não lança)', async () => {
    resolver = (c) =>
      acaoDe(c) === 'select' ? { count: 0 } : { data: null, error: { code: '23514', message: 'check violation' } }
    const r = await createMedicationCore(clienteFalso(), U, entrada(), U)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('database_error')
  })

  it('erro na CONTAGEM também falha — não presume "zero existentes"', async () => {
    resolver = () => ({ count: null, error: { message: 'boom' } })
    const r = await createMedicationCore(clienteFalso(), U, entrada(), U)
    expect(r.ok).toBe(false)
    expect(chamadasDe('medications', 'insert')).toHaveLength(0)
  })
})

describe('updateMedicationCore', () => {
  it('⚠️ lê a linha E atualiza SEMPRE com .eq(\'user_id\', dono)', async () => {
    resolver = (c) => ({ data: linha(), error: null, ...(acaoDe(c) === 'update' ? { data: linha({ name: 'Novo' }) } : {}) })
    const r = await updateMedicationCore(clienteFalso(), U, ID, MedicationPatchSchema.parse({ name: 'Novo' }), ATOR)
    expect(r.ok).toBe(true)

    const [leitura] = chamadasDe('medications', 'select')
    expect(filtros(leitura)).toContainEqual(['id', ID])
    expect(filtros(leitura)).toContainEqual(['user_id', U])

    const [escrita] = chamadasDe('medications', 'update')
    expect(filtros(escrita)).toContainEqual(['id', ID])
    expect(filtros(escrita)).toContainEqual(['user_id', U])
  })

  it('grava updated_by do ator e SÓ as colunas que vieram no patch', async () => {
    resolver = () => ({ data: linha() })
    await updateMedicationCore(clienteFalso(), U, ID, MedicationPatchSchema.parse({ active: false }), ATOR)
    const [escrita] = chamadasDe('medications', 'update')
    const colunas = escrita.ops.find(([m]) => m === 'update')![1][0] as Record<string, unknown>
    expect(colunas).toEqual({ updated_by: ATOR, active: false })
  })

  it('`null` apaga (dose/fim/notas); ausente não mexe', async () => {
    resolver = () => ({ data: linha() })
    await updateMedicationCore(
      clienteFalso(), U, ID,
      MedicationPatchSchema.parse({ dose: '', endDate: null, notes: null }), ATOR,
    )
    const [escrita] = chamadasDe('medications', 'update')
    const colunas = escrita.ops.find(([m]) => m === 'update')![1][0] as Record<string, unknown>
    expect(colunas).toEqual({ updated_by: ATOR, dose: null, end_date: null, notes: null })
  })

  it('id inexistente / de outra pessoa → `nao_encontrado` e nenhuma escrita', async () => {
    resolver = () => ({ data: null })
    const r = await updateMedicationCore(clienteFalso(), U, ID, MedicationPatchSchema.parse({ name: 'x' }), ATOR)
    expect(r).toEqual({ ok: false, code: 'nao_encontrado' })
    expect(chamadasDe('medications', 'update')).toHaveLength(0)
  })

  it('⚠️ só o FIM no patch é conferido contra o INÍCIO gravado → `datas_invalidas`', async () => {
    resolver = () => ({ data: linha({ start_date: '2026-10-10' }) })
    const r = await updateMedicationCore(
      clienteFalso(), U, ID, MedicationPatchSchema.parse({ endDate: '2026-10-05' }), ATOR,
    )
    expect(r).toEqual({ ok: false, code: 'datas_invalidas' })
    expect(chamadasDe('medications', 'update')).toHaveLength(0)
  })

  it('só o INÍCIO no patch, depois do fim gravado → `datas_invalidas`', async () => {
    resolver = () => ({ data: linha({ end_date: '2026-10-05' }) })
    const r = await updateMedicationCore(
      clienteFalso(), U, ID, MedicationPatchSchema.parse({ startDate: '2026-10-20' }), ATOR,
    )
    expect(r).toEqual({ ok: false, code: 'datas_invalidas' })
  })

  it('fim IGUAL ao início é válido (inclusivo)', async () => {
    resolver = () => ({ data: linha({ start_date: '2026-10-10' }) })
    const r = await updateMedicationCore(
      clienteFalso(), U, ID, MedicationPatchSchema.parse({ endDate: '2026-10-10' }), ATOR,
    )
    expect(r.ok).toBe(true)
  })

  it('⚠️ erro do UPDATE não vira sucesso', async () => {
    resolver = (c) => (acaoDe(c) === 'update' ? { data: null, error: { message: 'rls' } } : { data: linha() })
    const r = await updateMedicationCore(clienteFalso(), U, ID, MedicationPatchSchema.parse({ name: 'x' }), ATOR)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('database_error')
  })

  it('UPDATE que não devolve linha (sumiu no meio) → `nao_encontrado`, não sucesso', async () => {
    resolver = (c) => (acaoDe(c) === 'update' ? { data: null } : { data: linha() })
    const r = await updateMedicationCore(clienteFalso(), U, ID, MedicationPatchSchema.parse({ name: 'x' }), ATOR)
    expect(r).toEqual({ ok: false, code: 'nao_encontrado' })
  })

  it('erro na LEITURA da linha atual também falha', async () => {
    resolver = () => ({ data: null, error: { message: 'boom' } })
    const r = await updateMedicationCore(clienteFalso(), U, ID, MedicationPatchSchema.parse({ name: 'x' }), ATOR)
    expect(r.ok).toBe(false)
    expect(chamadasDe('medications', 'update')).toHaveLength(0)
  })
})

describe('deleteMedicationCore', () => {
  it('⚠️ apaga com .eq(\'id\') E .eq(\'user_id\', dono)', async () => {
    resolver = () => ({ data: [{ id: ID }] })
    const r = await deleteMedicationCore(clienteFalso(), U, ID)
    expect(r.ok).toBe(true)
    const [del] = chamadasDe('medications', 'delete')
    expect(filtros(del)).toContainEqual(['id', ID])
    expect(filtros(del)).toContainEqual(['user_id', U])
  })

  it('zero linhas apagadas → `nao_encontrado`', async () => {
    resolver = () => ({ data: [] })
    expect(await deleteMedicationCore(clienteFalso(), U, ID)).toEqual({ ok: false, code: 'nao_encontrado' })
  })

  it('⚠️ erro do DELETE não vira sucesso', async () => {
    resolver = () => ({ data: null, error: { message: 'boom' } })
    const r = await deleteMedicationCore(clienteFalso(), U, ID)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('database_error')
  })
})

describe('leituras', () => {
  it('listMedicationsCore filtra pelo dono', async () => {
    resolver = () => ({ data: [linha()] })
    const r = await listMedicationsCore(clienteFalso(), U)
    expect(r.ok && r.data).toHaveLength(1)
    expect(filtros(chamadas[0])).toContainEqual(['user_id', U])
  })

  it('listMedicationsCore: erro vira falha, e dado nulo vira lista vazia', async () => {
    resolver = () => ({ data: null, error: { message: 'x' } })
    expect((await listMedicationsCore(clienteFalso(), U)).ok).toBe(false)
    resolver = () => ({ data: null })
    const r = await listMedicationsCore(clienteFalso(), U)
    expect(r).toEqual({ ok: true, data: [] })
  })

  it('listIntakesCore filtra pelo dono e pelo intervalo (inclusivo)', async () => {
    resolver = () => ({ data: [] })
    await listIntakesCore(clienteFalso(), U, '2026-10-01', '2026-10-07')
    const ops = chamadas[0].ops
    expect(filtros(chamadas[0])).toContainEqual(['user_id', U])
    expect(ops).toContainEqual(['gte', ['date', '2026-10-01']])
    expect(ops).toContainEqual(['lte', ['date', '2026-10-07']])
  })

  it('listIntakesCore: erro vira falha', async () => {
    resolver = () => ({ data: null, error: { message: 'x' } })
    expect((await listIntakesCore(clienteFalso(), U, 'a', 'b')).ok).toBe(false)
  })
})

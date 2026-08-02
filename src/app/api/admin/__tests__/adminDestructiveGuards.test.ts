/**
 * Guards das rotas administrativas DESTRUTIVAS.
 *
 * Contexto: o mapa de cobertura (2026-07-28) apontou 15 das 46 rotas de admin
 * sem teste, incluindo as que apagam dado de terceiro em cascata
 * (`workouts/delete-any`, `students/delete`) e a que revoga acesso pago
 * (`vip/revoke`). São ações que ninguém desfaz com Ctrl+Z.
 *
 * Este arquivo tem duas camadas:
 *  • source-guard de CLASSE — toda rota de admin que chama `.delete()` precisa
 *    exigir papel admin antes de instanciar o client de service-role;
 *  • testes de comportamento das duas rotas mais perigosas.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const ADMIN_DIR = path.join(ROOT, 'src/app/api/admin')

/** Todos os route.ts sob /api/admin, recursivo. */
function listAdminRoutes(dir = ADMIN_DIR): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listAdminRoutes(full))
    else if (entry.name === 'route.ts') out.push(full)
  }
  return out
}

const adminRoutes = listAdminRoutes()
const destructive = adminRoutes.filter((f) => {
  const src = fs.readFileSync(f, 'utf-8')
  return src.includes('.delete()')
})

describe('rotas admin — autorização', () => {
  it('a varredura encontra as rotas (sanidade)', () => {
    expect(adminRoutes.length).toBeGreaterThanOrEqual(40)
    expect(destructive.length).toBeGreaterThanOrEqual(4)
  })

  // Duas exigências diferentes, porque nem toda rota sob /api/admin usa poder
  // de admin: `workouts/templates-list` lê os PRÓPRIOS templates com o client
  // do usuário (RLS aplicada), e exigir papel ali seria rigor sem ganho. O
  // corte real é o service-role: quem instancia `createAdminClient` ignora RLS
  // e por isso precisa provar o papel.
  const usesServiceRole = (file: string) => fs.readFileSync(file, 'utf-8').includes('createAdminClient(')
  const serviceRoleRoutes = adminRoutes.filter(usesServiceRole)
  const userScopedRoutes = adminRoutes.filter((f) => !usesServiceRole(f))

  it.each(serviceRoleRoutes.map((f) => [path.relative(ROOT, f), f] as const))(
    '%s usa service-role, então exige papel',
    (_rel, file) => {
      const src = fs.readFileSync(file, 'utf-8')
      expect(src).toMatch(/requireRoleOrBearer|requireRole\(|requireAdmin|resolveRoleByUser/)
    },
  )

  it.each(userScopedRoutes.map((f) => [path.relative(ROOT, f), f] as const))(
    '%s não usa service-role, mas exige sessão',
    (_rel, file) => {
      const src = fs.readFileSync(file, 'utf-8')
      expect(src).toMatch(/auth\.getUser|requireRole/)
    },
  )

  it.each(destructive.map((f) => [path.relative(ROOT, f), f] as const))(
    '%s autoriza ANTES de tocar em dados',
    (_rel, file) => {
      const src = fs.readFileSync(file, 'utf-8')
      const authIdx = src.search(/requireRoleOrBearer|requireRole\(|requireAdmin|resolveRoleByUser/)
      expect(authIdx).toBeGreaterThan(-1)
      // O que não pode é ler/escrever tabela antes de autorizar. Instanciar o
      // client antes é aceitável — `students/delete` faz isso justamente para
      // validar o Bearer com `admin.auth.getUser`, sem tocar em dado nenhum.
      const firstDataOp = src.indexOf('.from(')
      if (firstDataOp > -1) expect(authIdx).toBeLessThan(firstDataOp)
    },
  )
})

// ── Comportamento: delete-any ────────────────────────────────────────────────

vi.mock('@/utils/auth/route', () => ({ requireRoleOrBearer: vi.fn() }))
vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/workoutSync', () => ({ deleteTemplateFromSubscribers: vi.fn(async () => {}) }))
vi.mock('@/lib/logger', () => ({ logWarn: vi.fn(), logError: vi.fn(), logInfo: vi.fn() }))
vi.mock('@/utils/cache', () => ({ cacheDelete: vi.fn(async () => {}) }))

import { NextResponse } from 'next/server'
import { requireRoleOrBearer } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { POST as deleteAny } from '../workouts/delete-any/route'
import { POST as vipRevoke } from '../vip/revoke/route'

const ADMIN_USER = { id: 'admin-1', email: 'admin@irontracks.com.br' }

function allowAdmin() {
  vi.mocked(requireRoleOrBearer).mockResolvedValue({
    ok: true, user: ADMIN_USER,
  } as unknown as Awaited<ReturnType<typeof requireRoleOrBearer>>)
}

function denyAdmin(status = 403) {
  vi.mocked(requireRoleOrBearer).mockResolvedValue({
    ok: false,
    response: NextResponse.json({ ok: false, error: 'forbidden' }, { status }),
  } as unknown as Awaited<ReturnType<typeof requireRoleOrBearer>>)
}

type Op = { table: string; op: 'select' | 'delete' | 'update' | 'insert'; payload?: Record<string, unknown> }

function makeAdmin(rows: Record<string, unknown> = {}) {
  const ops: Op[] = []

  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {}
    const self = () => chain
    chain.select = vi.fn(() => { ops.push({ table, op: 'select' }); return chain })
    chain.eq = vi.fn(async function (this: unknown) { return { data: rows[table] ?? null, error: null } }) as unknown as () => unknown
    // `.eq()` precisa ser encadeável E awaitable — devolve um proxy com ambos.
    chain.eq = vi.fn(() => {
      const term: Record<string, unknown> = {}
      term.maybeSingle = vi.fn(async () => ({ data: rows[table] ?? null, error: null }))
      term.select = vi.fn(() => term)
      term.eq = vi.fn(() => term)
      ;(term as unknown as PromiseLike<unknown>).then = ((resolve: (v: unknown) => unknown) =>
        resolve({ data: rows[table] ?? null, error: null })) as PromiseLike<unknown>['then']
      return term
    })
    chain.maybeSingle = vi.fn(async () => ({ data: rows[table] ?? null, error: null }))
    chain.delete = vi.fn(() => {
      ops.push({ table, op: 'delete' })
      const term: Record<string, unknown> = {}
      term.eq = vi.fn(async () => ({ error: null }))
      term.in = vi.fn(async () => ({ error: null }))
      return term
    })
    chain.update = vi.fn((payload: Record<string, unknown>) => {
      ops.push({ table, op: 'update', payload })
      const term: Record<string, unknown> = {}
      term.eq = vi.fn(async () => ({ error: null }))
      return term
    })
    chain.insert = vi.fn(async (payload: Record<string, unknown>) => {
      ops.push({ table, op: 'insert', payload })
      return { error: null }
    })
    return chain
  })

  return { client: { from } as unknown as ReturnType<typeof createAdminClient>, ops }
}

const post = (url: string, body: unknown) =>
  new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

const deleteBody = { id: 'workout-1', confirm: true, reason: 'spam denunciado pelo suporte' }

describe('admin/workouts/delete-any', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('não-admin → resposta do guard, sem tocar em nada', async () => {
    denyAdmin()
    const { client, ops } = makeAdmin({ workouts: { id: 'workout-1', user_id: 'u1', created_by: 'u1' } })
    vi.mocked(createAdminClient).mockReturnValue(client)

    const res = await deleteAny(post('https://x/api/admin/workouts/delete-any', deleteBody))

    expect(res.status).toBe(403)
    expect(ops).toHaveLength(0)
  })

  it('sem confirm → 400 e nada é apagado', async () => {
    allowAdmin()
    const { client, ops } = makeAdmin({ workouts: { id: 'workout-1' } })
    vi.mocked(createAdminClient).mockReturnValue(client)

    const res = await deleteAny(post('https://x/api/admin/workouts/delete-any', { ...deleteBody, confirm: false }))

    expect(res.status).toBe(400)
    expect(ops.filter((o) => o.op === 'delete')).toHaveLength(0)
  })

  it('sem justificativa → 400', async () => {
    allowAdmin()
    const { client, ops } = makeAdmin({ workouts: { id: 'workout-1' } })
    vi.mocked(createAdminClient).mockReturnValue(client)

    const res = await deleteAny(post('https://x/api/admin/workouts/delete-any', { id: 'workout-1', confirm: true, reason: '' }))

    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(ops.filter((o) => o.op === 'delete')).toHaveLength(0)
  })

  it('treino inexistente → 404 sem apagar', async () => {
    allowAdmin()
    const { client, ops } = makeAdmin({})
    vi.mocked(createAdminClient).mockReturnValue(client)

    const res = await deleteAny(post('https://x/api/admin/workouts/delete-any', deleteBody))

    expect(res.status).toBe(404)
    expect(ops.filter((o) => o.op === 'delete')).toHaveLength(0)
  })

  it('apaga na ordem filhos → pai (sets, exercises, workout)', async () => {
    allowAdmin()
    const { client, ops } = makeAdmin({
      workouts: { id: 'workout-1', user_id: 'u1', created_by: 'u1', is_template: false },
      exercises: [{ id: 'ex-1' }],
    })
    vi.mocked(createAdminClient).mockReturnValue(client)

    const res = await deleteAny(post('https://x/api/admin/workouts/delete-any', deleteBody))

    expect(res.status).toBe(200)
    const deletes = ops.filter((o) => o.op === 'delete').map((o) => o.table)
    // Filhos antes do pai: inverter isso deixaria séries e exercícios órfãos.
    expect(deletes).toEqual(['sets', 'exercises', 'workouts'])
  })

  // Achado da varredura: a rota exigia justificativa e a descartava. `vip/revoke`
  // já gravava trilha; esta não. Apagar treino alheio sem registro de quem e por
  // quê é o tipo de coisa que só se descobre quando alguém reclama.
  it('registra a exclusão em audit_events com autor e justificativa', async () => {
    allowAdmin()
    const { client, ops } = makeAdmin({
      workouts: { id: 'workout-1', user_id: 'vitima-1', created_by: 'vitima-1', is_template: false },
      exercises: [],
    })
    vi.mocked(createAdminClient).mockReturnValue(client)

    await deleteAny(post('https://x/api/admin/workouts/delete-any', deleteBody))

    const audit = ops.find((o) => o.table === 'audit_events' && o.op === 'insert')
    expect(audit, 'nenhuma trilha de auditoria gravada').toBeTruthy()
    expect(audit?.payload).toMatchObject({
      actor_id: ADMIN_USER.id,
      actor_role: 'admin',
      action: 'admin_workout_delete_any',
      entity_id: 'workout-1',
    })
    expect((audit?.payload?.metadata as Record<string, unknown>)?.reason).toBe(deleteBody.reason)
  })
})

describe('admin/vip/revoke', () => {
  beforeEach(() => { vi.clearAllMocks() })

  const ENT = '11111111-1111-4111-8111-111111111111'

  it('não-admin não revoga', async () => {
    denyAdmin()
    const { client, ops } = makeAdmin({ user_entitlements: { id: ENT, user_id: 'u1', status: 'active' } })
    vi.mocked(createAdminClient).mockReturnValue(client)

    const res = await vipRevoke(post('https://x/api/admin/vip/revoke', { entitlement_id: ENT }))

    expect(res.status).toBe(403)
    expect(ops).toHaveLength(0)
  })

  it('entitlement inexistente → 404', async () => {
    allowAdmin()
    const { client, ops } = makeAdmin({})
    vi.mocked(createAdminClient).mockReturnValue(client)

    const res = await vipRevoke(post('https://x/api/admin/vip/revoke', { entitlement_id: ENT }))

    expect(res.status).toBe(404)
    expect(ops.filter((o) => o.op === 'update')).toHaveLength(0)
  })

  it('revoga encerrando a validade agora, sem apagar o registro', async () => {
    allowAdmin()
    const { client, ops } = makeAdmin({ user_entitlements: { id: ENT, user_id: 'u1', plan_id: 'p1', status: 'active' } })
    vi.mocked(createAdminClient).mockReturnValue(client)

    const res = await vipRevoke(post('https://x/api/admin/vip/revoke', { entitlement_id: ENT }))

    expect(res.status).toBe(200)
    const upd = ops.find((o) => o.table === 'user_entitlements' && o.op === 'update')
    expect(upd?.payload).toMatchObject({ status: 'cancelled' })
    expect(upd?.payload?.valid_until).toBeTruthy()
    // Revogar é encerrar validade, nunca DELETE — o histórico de cobrança fica.
    expect(ops.filter((o) => o.op === 'delete')).toHaveLength(0)
  })

  it('grava trilha de auditoria com o admin que revogou', async () => {
    allowAdmin()
    const { client, ops } = makeAdmin({ user_entitlements: { id: ENT, user_id: 'u1', plan_id: 'p1', status: 'active' } })
    vi.mocked(createAdminClient).mockReturnValue(client)

    await vipRevoke(post('https://x/api/admin/vip/revoke', { entitlement_id: ENT }))

    const audit = ops.find((o) => o.table === 'audit_events')
    expect(audit?.payload).toMatchObject({ actor_id: ADMIN_USER.id, action: 'vip_revoke', entity_id: 'u1' })
  })

  it('id que não é uuid é recusado pelo schema', async () => {
    allowAdmin()
    const { client, ops } = makeAdmin({})
    vi.mocked(createAdminClient).mockReturnValue(client)

    const res = await vipRevoke(post('https://x/api/admin/vip/revoke', { entitlement_id: 'nao-é-uuid' }))

    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(ops.filter((o) => o.op === 'update')).toHaveLength(0)
  })
})

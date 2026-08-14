import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * Guards da auditoria de billing do professor:
 *  ALTA — forja de cobrança: revoga INSERT/UPDATE/DELETE de authenticated/anon em
 *         student_charges/student_subscriptions (escritas legítimas são service-role);
 *         + hardening: revoga escrita de authenticated em teachers.
 *  MÉDIA — simulate-teacher-payment concede plano real sem pagamento: gate de ambiente
 *          bloqueia em produção sem opt-in explícito.
 */
describe('migration teacher_billing_forge_lockdown', () => {
  const dir = 'supabase/migrations'
  const file = readdirSync(dir).find((f) => f.includes('teacher_billing_forge_lockdown'))

  it('existe no repo', () => {
    expect(file).toBeTruthy()
  })

  const sql = file ? readFileSync(path.join(dir, file), 'utf8') : ''

  it('revoga escrita de authenticated/anon em student_charges e student_subscriptions', () => {
    expect(sql).toMatch(/revoke insert, update, delete on public\.student_charges from authenticated, anon/i)
    expect(sql).toMatch(/revoke insert, update, delete on public\.student_subscriptions from authenticated, anon/i)
  })

  it('revoga escrita de authenticated/anon em teachers', () => {
    expect(sql).toMatch(/revoke insert, update, delete, truncate on public\.teachers from authenticated, anon/i)
  })
})

/**
 * ── Estado FINAL das migrations (C4, auditoria de cobranças 2026-08-14) ──────
 * O describe acima confere que o lockdown de julho EXISTE — e foi exatamente por
 * isso que a regressão passou despercebida: a consolidação de RLS de 02/08
 * recriou as policies de escrita DEPOIS, com este arquivo verde. Aqui o vetor é
 * fechado pela raiz: reconstruímos a ÚLTIMA PALAVRA de todas as migrations, em
 * ordem, e exigimos que student_charges/student_subscriptions terminem sem
 * policy de escrita e sem GRANT de escrita client reintroduzido após o revoke.
 * Escrita financeira é exclusiva do service-role (rotas server com admin client).
 */
const FINANCE_TABLES = ['student_charges', 'student_subscriptions'] as const
type FinanceTable = (typeof FINANCE_TABLES)[number]

function stripSqlComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')
}

type WriteState = {
  policies: Map<string, string>
  grants: { authenticated: boolean; anon: boolean }
}

function computeFinalWriteState(): Record<FinanceTable, WriteState> {
  const dir = 'supabase/migrations'
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  const state = Object.fromEntries(
    FINANCE_TABLES.map((t) => [t, { policies: new Map(), grants: { authenticated: false, anon: false } }]),
  ) as Record<FinanceTable, WriteState>

  const isFinanceTable = (t: string): t is FinanceTable =>
    (FINANCE_TABLES as readonly string[]).includes(t)

  for (const f of files) {
    const sql = stripSqlComments(readFileSync(path.join(dir, f), 'utf8'))
    for (const raw of sql.split(';')) {
      const stmt = raw.replace(/\s+/g, ' ').trim()
      if (!stmt) continue

      const created = stmt.match(/^create policy\s+(?:"([^"]+)"|(\S+))\s+on\s+(?:public\.)?(\w+)/i)
      if (created) {
        const table = created[3]
        if (isFinanceTable(table)) {
          const name = created[1] ?? created[2]
          // Sem cláusula FOR, o default do Postgres é ALL — conta como escrita.
          const cmd = (stmt.match(/\bfor\s+(select|insert|update|delete|all)\b/i)?.[1] ?? 'all').toLowerCase()
          if (cmd !== 'select') state[table].policies.set(name, `${f} (for ${cmd})`)
        }
        continue
      }

      const dropped = stmt.match(/^drop policy\s+(?:if exists\s+)?(?:"([^"]+)"|(\S+))\s+on\s+(?:public\.)?(\w+)/i)
      if (dropped) {
        const table = dropped[3]
        if (isFinanceTable(table)) state[table].policies.delete(dropped[1] ?? dropped[2])
        continue
      }

      const grantish = stmt.match(/^(grant|revoke)\b(.+?)\bon\s+(?:table\s+)?(?:public\.)?(\w+)\s+(?:to|from)\s+(.+)$/i)
      if (grantish) {
        const table = grantish[3]
        if (!isFinanceTable(table)) continue
        const privs = grantish[2].toLowerCase()
        if (!/\binsert\b|\bupdate\b|\bdelete\b|\ball\b/.test(privs)) continue
        const roles = grantish[4].toLowerCase()
        const value = grantish[1].toLowerCase() === 'grant'
        if (/\bauthenticated\b|\bpublic\b/.test(roles)) state[table].grants.authenticated = value
        if (/\banon\b|\bpublic\b/.test(roles)) state[table].grants.anon = value
      }
    }
  }
  return state
}

describe('estado final das migrations — escrita client em cobranças de aluno', () => {
  const state = computeFinalWriteState()

  it.each(FINANCE_TABLES)('%s termina SEM policy de escrita (insert/update/delete/all)', (table) => {
    // Se isto falhou, alguma migration recriou policy de escrita nessas tabelas
    // sem uma migration posterior dropando — é o mesmo vetor da forja de julho.
    expect(Array.from(state[table].policies.entries())).toEqual([])
  })

  it.each(FINANCE_TABLES)('%s termina SEM grant de escrita para authenticated/anon', (table) => {
    expect(state[table].grants).toEqual({ authenticated: false, anon: false })
  })
})

describe('simulate-teacher-payment — gate de ambiente', () => {
  const src = readFileSync('src/app/api/admin/simulate-teacher-payment/route.ts', 'utf8')

  it('bloqueia em produção sem ALLOW_SIMULATE_TEACHER_PAYMENT=true', () => {
    expect(src).toMatch(/NODE_ENV\s*===\s*'production'\s*&&\s*process\.env\.ALLOW_SIMULATE_TEACHER_PAYMENT\s*!==\s*'true'/)
    expect(src).toMatch(/disabled_in_production/)
  })

  it('mantém o gate admin-only (requireRole)', () => {
    expect(src).toMatch(/requireRole\(\['admin'\]\)/)
  })
})

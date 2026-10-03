import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Source-guard das migrations de medicamentos (03/10/2026).
 *
 * Dado de SAÚDE (LGPD art. 11). As defesas que importam moram no SQL, e o SQL só
 * roda em produção — então o que dá para travar no CI é o TEXTO executável:
 * RLS ligada, `anon` sem grant (o default ACL do schema `public` concede tudo a
 * anon em tabela nova), tomadas sem UPDATE, FK composta (tomada não aponta para
 * remédio de outro usuário) e o cron chamando `net.http_get` com o segredo certo.
 *
 * Os comentários `--` são removidos antes de casar: a documentação das migrations
 * cita exatamente os padrões proibidos ("extensions.http_get", "FOR UPDATE") e o
 * guard acusaria a própria explicação.
 */
const ROOT = path.resolve(__dirname, '../../../..')
const semComentarios = (rel: string) =>
  fs
    .readFileSync(path.join(ROOT, rel), 'utf8')
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n')
    .replace(/\s+/g, ' ')
    .toLowerCase()

const M1 = 'supabase/migrations/20261003120000_medications.sql'
const M2 = 'supabase/migrations/20261003120100_medication_reminders_pg_cron.sql'

/** Cada `create policy ...;` do SQL, como texto. */
const policies = (sql: string) => sql.match(/create policy [^;]*;/g) ?? []

describe('migration dos medicamentos (M1)', () => {
  const sql = semComentarios(M1)

  it('liga RLS nas duas tabelas', () => {
    expect(sql).toContain('alter table public.medications enable row level security')
    expect(sql).toContain('alter table public.medication_intakes enable row level security')
  })

  it('tira TUDO de anon nas duas tabelas (o default ACL do schema concede tudo)', () => {
    expect(sql).toMatch(/revoke all on public\.medications from anon/)
    expect(sql).toMatch(/revoke all on public\.medication_intakes from anon/)
  })

  it('dá CRUD só a authenticated', () => {
    expect(sql).toMatch(/grant select, insert, update, delete on public\.medications to authenticated/)
    expect(sql).toMatch(/grant select, insert, update, delete on public\.medication_intakes to authenticated/)
    expect(sql).not.toMatch(/to anon\b/)
  })

  it('NÃO dá UPDATE em medication_intakes: tomada se registra ou se desfaz', () => {
    const doIntakes = policies(sql).filter((p) => p.includes('on public.medication_intakes'))
    expect(doIntakes.length).toBeGreaterThanOrEqual(3)
    for (const p of doIntakes) expect(p, p).not.toMatch(/for update|for all/)
  })

  it('só o dono grava/desfaz tomada; leitura segue a regra do remédio', () => {
    const doIntakes = policies(sql).filter((p) => p.includes('on public.medication_intakes'))
    const escrita = doIntakes.filter((p) => /for (insert|delete)/.test(p))
    expect(escrita).toHaveLength(2)
    for (const p of escrita) {
      expect(p, p).toContain('user_id = (select auth.uid())')
      expect(p, p).not.toContain('is_teacher_of')
      expect(p, p).not.toContain('is_admin')
    }
    const leitura = doIntakes.filter((p) => p.includes('for select'))
    expect(leitura).toHaveLength(1)
    expect(leitura[0]).toContain('public.is_teacher_of(user_id)')
  })

  it('medications tem os 4 comandos, com a regra dono/professor/admin', () => {
    const doRemedio = policies(sql).filter((p) => p.includes('on public.medications '))
    for (const cmd of ['select', 'insert', 'update', 'delete']) {
      expect(doRemedio.some((p) => p.includes(`for ${cmd}`)), `falta policy de ${cmd}`).toBe(true)
    }
    for (const p of doRemedio) {
      expect(p, p).toContain('user_id = (select auth.uid())')
      expect(p, p).toContain('public.is_teacher_of(user_id)')
      expect(p, p).toContain('(select public.is_admin())')
    }
    // UPDATE precisa de USING e WITH CHECK, senão o professor poderia mover a linha para outro usuário.
    const upd = doRemedio.find((p) => p.includes('for update')) ?? ''
    expect(upd).toContain('using (')
    expect(upd).toContain('with check (')
  })

  it('nenhuma policy aberta (using true / with check true)', () => {
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/)
    expect(sql).not.toMatch(/with check\s*\(\s*true\s*\)/)
    // e toda policy é para authenticated, nunca para anon/public
    for (const p of policies(sql)) expect(p, p).toContain('to authenticated')
  })

  it('FK composta (medication_id, user_id): a tomada não aponta para remédio de outro usuário', () => {
    expect(sql).toMatch(
      /foreign key \(medication_id, user_id\) references public\.medications \(id, user_id\) on delete cascade/,
    )
    expect(sql).toMatch(/unique \(id, user_id\)/)
  })

  it('o trigger de updated_at fixa search_path vazio e fecha o grant', () => {
    expect(sql).toMatch(/function public\.medications_touch_updated_at\(\) returns trigger language plpgsql set search_path = ''/)
    expect(sql).toContain('revoke all on function public.medications_touch_updated_at() from public')
    expect(sql).toContain('revoke all on function public.medications_touch_updated_at() from anon')
    expect(sql).toMatch(/before update on public\.medications/)
  })

  it('created_by/updated_by/recorded_by são SET NULL: professor que apaga a conta não leva o dado do aluno', () => {
    for (const col of ['created_by', 'updated_by', 'recorded_by']) {
      expect(sql, col).toMatch(new RegExp(`${col} uuid references auth\\.users \\(id\\) on delete set null`))
    }
    expect(sql).toMatch(/user_id uuid not null references auth\.users \(id\) on delete cascade/)
  })

  it('o dia da dose é coluna date, não derivado de timestamp', () => {
    expect(sql).toMatch(/date date not null/)
    expect(sql).toMatch(/unique \(medication_id, date, scheduled_time\)/)
  })
})

describe('migration do cron dos medicamentos (M2)', () => {
  const sql = semComentarios(M2)

  it('chama net.http_get — nunca extensions.http_get (função inexistente, falha em silêncio)', () => {
    expect(sql).toContain('net.http_get(')
    expect(sql).not.toContain('extensions.http_get')
  })

  it('lê o segredo de public.cron_secrets, com fallback ao Vault', () => {
    expect(sql).toContain('public.cron_secrets')
    expect(sql).toContain('vault.decrypted_secrets')
  })

  it('só chama a rota quando existe segredo (senão são 288 requisições/dia com 403)', () => {
    expect(sql).toContain('where s.secret is not null')
  })

  it('agenda a cada 5 minutos o job certo, de forma idempotente', () => {
    expect(sql).toMatch(/cron\.unschedule\(jobid\) from cron\.job where jobname = 'medication-reminders'/)
    expect(sql).toMatch(/cron\.schedule\( 'medication-reminders', '\*\/5 \* \* \* \*'/)
    expect(sql).toContain('https://irontracks.com.br/api/cron/medication-reminders')
  })
})

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * Guards da 1ª onda da auditoria de UX/performance:
 *  - RLS initplan: envolve auth.uid()/is_admin() em (select ...) → avalia 1×/query;
 *  - FKs indexadas + dedup de índices duplicados;
 *  - bug N3: o botão "Estimar com IA" da nutrição nunca aparecia (startsWith com dois-pontos).
 */
const dir = 'supabase/migrations'
const readMig = (needle: string) => {
  const f = readdirSync(dir).find((x) => x.includes(needle))
  return f ? readFileSync(path.join(dir, f), 'utf8') : ''
}

describe('migration perf_rls_initplan_wrap_auth_calls', () => {
  const sql = readMig('perf_rls_initplan_wrap_auth_calls')
  it('envolve chamadas em (select ...) via regexp com fronteira e protege já-embrulhados', () => {
    expect(sql).toMatch(/regexp_replace\(v_qual, FUNCTION_PATTERN, '\\1\(select \\2\(\)\)', 'g'\)/)
    expect(sql).toMatch(/current_user_is_admin\|is_admin/) // ordem: função externa antes da interna
    expect(sql).toMatch(/§U§/) // sentinela anti double-wrap
  })
})

describe('migration perf_fk_indexes_and_dedup_indexes', () => {
  const sql = readMig('perf_fk_indexes_and_dedup_indexes')
  it('cria índices nas FKs quentes', () => {
    expect(sql).toMatch(/create index if not exists idx_invites_from_uid on public\.invites \(from_uid\)/i)
    expect(sql).toMatch(/create index if not exists idx_workout_set_logs_exercise_id/i)
  })
  it('dropa os índices duplicados exatos', () => {
    expect(sql).toMatch(/drop index if exists public\.idx_device_push_tokens_user\b/i)
    expect(sql).toMatch(/drop index if exists public\.foods_taco_food_key_idx/i)
  })
})

describe('bug N3 — botão "Estimar com IA" aparece', () => {
  const src = readFileSync('src/components/dashboard/nutrition/NutritionMixer.tsx', 'utf8')
  it('a condição casa o erro real "Não reconheci esse alimento." (sem dois-pontos)', () => {
    expect(src).toMatch(/String\(error\)\.startsWith\('Não reconheci'\)/)
    expect(src).not.toMatch(/startsWith\('Não reconheci:'\)/)
  })
})

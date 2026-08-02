import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * Guard do CRÍTICO da área de professor: o trigger de vínculo de students descarta o user_id
 * vindo do cliente para caller autenticado NÃO-admin — impede forjar
 * students{user_id: vítima, teacher_id: self} e ler treino/saúde da vítima.
 * Prova empírica (produção, rollback): forge_ok 1->0, workouts_vis 114->0; legítimo intacto.
 */
describe('migration fix_students_link_forge_strip_client_user_id', () => {
  const dir = 'supabase/migrations'
  const file = readdirSync(dir).find((f) => f.includes('fix_students_link_forge_strip_client_user_id'))
  const sql = file ? readFileSync(path.join(dir, file), 'utf8') : ''

  it('existe e recria o trigger de whitelist', () => {
    expect(file).toBeTruthy()
    expect(sql).toMatch(/create or replace function public\.link_student_profile_from_whitelist/i)
  })

  it('zera NEW.user_id para caller autenticado não-admin (anti-forja)', () => {
    expect(sql).toMatch(/auth\.uid\(\) IS NOT NULL/i)
    expect(sql).toMatch(/NOT EXISTS \(SELECT 1 FROM public\.profiles p WHERE p\.id = auth\.uid\(\) AND p\.role = 'admin'\)/i)
    expect(sql).toMatch(/NEW\.user_id := NULL/i)
  })

  it('mantém a resolução por email (fluxo legítimo)', () => {
    expect(sql).toMatch(/FROM auth\.users u\s*\n\s*WHERE lower\(trim\(u\.email\)\) = v_email/i)
    expect(sql).toMatch(/NEW\.user_id := v_uid/i)
  })
})

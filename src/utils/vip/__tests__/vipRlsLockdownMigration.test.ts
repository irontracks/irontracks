import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * Regression guard for the VIP RLS lockdown (migration lock_down_vip_self_grant_and_usage,
 * 2026-07-11). A auditoria encontrou duas brechas exploráveis por qualquer usuário
 * autenticado:
 *   1. app_subscriptions: INSERT próprio (plan_id='vip_elite') → VIP Elite vitalício sem pagar.
 *   2. vip_usage_daily: UPDATE próprio → zerar cotas de IA (teto anti-abuso do Gemini).
 *
 * A correção removeu as policies de escrita e revogou os grants de anon/authenticated,
 * mantendo só SELECT (a escrita legítima passa por service_role e RPCs SECURITY DEFINER).
 * Este guard garante que a migration continue no repo com as travas — se alguém a apagar
 * ou reintroduzir uma policy de escrita pro cliente, o teste quebra.
 *
 * NOTA: isto valida a INTENÇÃO versionada em SQL, não o estado ao vivo do banco. É a
 * camada barata de defesa; a verificação real do banco é feita manualmente na auditoria.
 */
describe('migration lock_down_vip_self_grant_and_usage', () => {
  const dir = 'supabase/migrations'
  const file = readdirSync(dir).find((f) => f.includes('lock_down_vip_self_grant_and_usage'))

  it('existe no diretório de migrations', () => {
    expect(file, 'migration de lockdown de VIP sumiu do repo').toBeTruthy()
  })

  const sql = file ? readFileSync(path.join(dir, file), 'utf8') : ''

  it('remove a policy de self-insert de app_subscriptions', () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS app_subscriptions_insert_own ON public\.app_subscriptions/i)
  })

  it('revoga escrita de anon/authenticated em app_subscriptions', () => {
    expect(sql).toMatch(/REVOKE\s+INSERT,\s*UPDATE,\s*DELETE,\s*TRUNCATE\s+ON\s+public\.app_subscriptions\s+FROM\s+anon,\s*authenticated/i)
  })

  it('remove as policies de escrita própria de vip_usage_daily', () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS vip_usage_daily_update_own ON public\.vip_usage_daily/i)
  })

  it('revoga escrita de anon/authenticated em vip_usage_daily', () => {
    expect(sql).toMatch(/REVOKE\s+INSERT,\s*UPDATE,\s*DELETE,\s*TRUNCATE\s+ON\s+public\.vip_usage_daily\s+FROM\s+anon,\s*authenticated/i)
  })

  it('NÃO reintroduz nenhuma policy/grant de escrita pro cliente nessas tabelas', () => {
    // A migration só pode conter DROP POLICY e REVOKE — nunca CREATE POLICY ... FOR
    // INSERT/UPDATE nem GRANT INSERT/UPDATE pra anon/authenticated.
    expect(sql).not.toMatch(/CREATE POLICY[\s\S]*for\s+(insert|update)/i)
    expect(sql).not.toMatch(/GRANT\s+[^;]*\b(INSERT|UPDATE)\b[^;]*\bTO\s+(anon|authenticated)/i)
  })
})

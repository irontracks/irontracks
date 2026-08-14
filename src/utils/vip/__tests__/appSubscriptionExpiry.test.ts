import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Regression guard for the app_subscriptions legacy fallback in getVipPlanLimits.
 *
 * Bug (fixed 2026-07-11, PR #303): o passo 3 (fallback app_subscriptions) filtrava
 * só por `status in ('active','past_due','trialing')`, sem checar a expiração. Uma
 * linha presa em status='active' com o período já vencido concedia VIP para sempre
 * — foi o agravante que tornava permanente o self-grant de app_subscriptions
 * (migration lock_down_vip_self_grant_and_usage) e mantinha assinaturas vencidas
 * como VIP indevidamente.
 *
 * O fallback agora precisa filtrar current_period_end como o passo 2 (entitlement)
 * já faz com valid_until: aceita nulo (assinatura manual sem período) OU >= agora.
 */
describe('getVipPlanLimits — app_subscriptions fallback filtra expiração', () => {
  const src = readFileSync('src/utils/vip/limits.ts', 'utf8')
  // Recorta só o bloco da query do fallback (do .from('app_subscriptions') até o
  // .maybeSingle()), pra não confundir com a query do entitlement (passo 2).
  const appSubBlock = (() => {
    const start = src.indexOf(".from('app_subscriptions')")
    expect(start).toBeGreaterThan(-1)
    const end = src.indexOf('.maybeSingle()', start)
    expect(end).toBeGreaterThan(start)
    return src.slice(start, end)
  })()

  it('seleciona current_period_end (sem a coluna não dá pra filtrar expiração)', () => {
    expect(appSubBlock).toMatch(/\.select\(\s*['"][^'"]*current_period_end[^'"]*['"]\s*\)/)
  })

  it('aplica o filtro .or de current_period_end (nulo OU >= agora)', () => {
    expect(appSubBlock).toMatch(
      /\.or\(\s*`current_period_end\.is\.null,current_period_end\.gte\.\$\{\s*nowIso\s*\}`\s*\)/,
    )
  })

  it('usa o ISO cru (nowIso), nunca safePg — safePg corromperia os milissegundos', () => {
    expect(appSubBlock).not.toMatch(/current_period_end\.gte\.\$\{\s*safePg/)
    expect(appSubBlock).toMatch(/current_period_end\.gte\.\$\{\s*nowIso\s*\}/)
  })

  it('mantém o filtro de status ativo junto do de expiração (defesa em camadas)', () => {
    expect(appSubBlock).toMatch(/\.in\(\s*['"]status['"],\s*\[[^\]]*['"]active['"]/)
  })

  // C1 (auditoria 14/08/2026): a assinatura recorrente de PROFESSOR mora em
  // app_subscriptions com plan_id NULL (tier em metadata.tier_key — migration
  // 20260814150500). Linha sem plano NÃO é VIP; sem o filtro, a linha de
  // professor mais recente rouba o limit(1) e derruba para free um VIP legado
  // válido que estivesse atrás dela.
  it('exclui linhas sem plano (assinatura de professor nunca entra na resolução VIP)', () => {
    expect(appSubBlock).toMatch(/\.not\(\s*['"]plan_id['"],\s*['"]is['"],\s*null\s*\)/)
  })
})

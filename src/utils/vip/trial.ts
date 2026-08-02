/**
 * Trial de 14 dias do VIP Pro — Fase 1 da tração (02/08/2026, aprovado pelo dono).
 *
 * A evidência que motivou: o único usuário com acesso pleno real usa o app
 * intensamente (202 ações VIP/30d), e pagantes orgânicos são ZERO. Ninguém
 * compra o que nunca provou — e não existia nenhum caminho para provar.
 *
 * Regras:
 * - UMA vez por usuário, para sempre. Qualquer linha em `user_entitlements`
 *   (ativa, expirada, revogada) desqualifica — quem já teve acesso não é
 *   virgem de VIP, e re-conceder viraria loop de trial infinito.
 * - Admin/teacher ficam de fora: já têm Elite por role.
 * - Expira sozinho: `getVipPlanLimits` já filtra `valid_until` — nenhum cron
 *   novo, nenhuma revogação manual.
 * - Escrita via service-role, como TODA escrita de entitlement (a regra de
 *   segurança de jul/2026: o client autenticado só tem SELECT).
 */
import { createAdminClient } from '@/utils/supabase/admin'
import { logError } from '@/lib/logger'

export const TRIAL_PLAN_ID = 'vip_pro'
export const TRIAL_DAYS = 14
export const TRIAL_PROVIDER = 'trial'

/**
 * Concede o trial se — e só se — o usuário nunca teve entitlement nenhum.
 * Nunca lança: falhar aqui não pode quebrar o bootstrap do app.
 *
 * @returns true se concedeu agora; false se já tinha algo (ou falhou).
 */
export async function maybeGrantTrial(userId: string): Promise<boolean> {
    const uid = String(userId || '').trim()
    if (!uid) return false

    try {
        const admin = createAdminClient()

        // Papel: admin/teacher já são Elite por role — trial só sujaria a tabela.
        const { data: profile } = await admin
            .from('profiles').select('role').eq('id', uid).maybeSingle()
        const role = String((profile as { role?: string } | null)?.role || '').toLowerCase()
        if (role === 'admin' || role === 'teacher') return false

        // QUALQUER linha desqualifica — inclusive expirada ou revogada.
        const { data: existing, error: exErr } = await admin
            .from('user_entitlements').select('id').eq('user_id', uid).limit(1)
        if (exErr) {
            logError('vip:trial', exErr, { stage: 'check' })
            return false
        }
        if (Array.isArray(existing) && existing.length > 0) return false

        const now = new Date()
        const until = new Date(now.getTime() + TRIAL_DAYS * 86_400_000)
        const { error: insErr } = await admin.from('user_entitlements').insert({
            user_id: uid,
            plan_id: TRIAL_PLAN_ID,
            status: 'active',
            provider: TRIAL_PROVIDER,
            valid_from: now.toISOString(),
            valid_until: until.toISOString(),
        })
        if (insErr) {
            logError('vip:trial', insErr, { stage: 'insert' })
            return false
        }

        // Trilha persistente: "quem ganhou trial e quando" responde-se no banco,
        // não em log que expira. `actor` system — não há humano na ação.
        try {
            await admin.from('audit_events').insert({
                actor_id: null,
                actor_email: null,
                actor_role: 'system',
                action: 'vip_trial_granted',
                entity_type: 'user_entitlement',
                entity_id: uid,
                metadata: { plan_id: TRIAL_PLAN_ID, days: TRIAL_DAYS, valid_until: until.toISOString() },
            })
        } catch { /* auditoria não pode custar o trial */ }

        return true
    } catch (e) {
        logError('vip:trial', e)
        return false
    }
}

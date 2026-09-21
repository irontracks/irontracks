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
 * - **Só quem se cadastrou a partir de `TRIAL_SIGNUP_CUTOFF`.**
 *
 * ⚠️ A DATA DE CORTE existe por um acidente medido em 16/08/2026. O CHECK de
 * `user_entitlements.provider` nunca aceitou `'trial'`, então de 02/08 a 16/08
 * TODA concessão morreu em 23514 e o erro foi engolido pelo `logError` daqui.
 * No dia em que o CHECK for corrigido, esta função passaria a conceder a quem
 * "nunca teve entitlement" — e isso não são só os novatos: eram **48 contas**,
 * a maioria veterana de meses. Seriam 48 acessos Pro simultâneos (wizard,
 * exames, nutrição por IA) numa chave Gemini paga e compartilhada com
 * produção, sem ninguém ter orçado. O corte preserva o propósito do trial
 * (provar valor a quem CHEGA) sem abrir a base inteira de uma vez.
 *
 * A dívida com quem recebeu o e-mail prometendo os 14 dias antes do corte foi
 * paga à mão (decisão do dono, 16/08/2026) — não por esta função.
 *
 * ⚠️ **Segundo acidente, medido em 21/09/2026 — a data de cadastro nunca veio.**
 * `public.profiles` NÃO TEM coluna `created_at` (quem tem é `auth.users`). O
 * `select('role, created_at')` original não checava `error`: a busca falhava
 * em silêncio, `row` virava `null`/`undefined`, `signupMs` virava `NaN`, e a
 * trava de segurança ("sem carimbo → não concede") negava o trial SEMPRE,
 * pra TODO MUNDO — não só quem se cadastrou antes do corte. Medido: **5 de 5
 * pessoas cadastradas desde 16/08/2026 nunca receberam entitlement nenhum**.
 * O trial nunca funcionou de verdade depois de "corrigido". Hoje a data vem
 * de `auth.users` via `admin.auth.admin.getUserById`, que é a fonte real.
 * - Expira sozinho: `getVipPlanLimits` já filtra `valid_until` — nenhum cron
 *   novo, nenhuma revogação manual.
 * - Escrita via service-role, como TODA escrita de entitlement (a regra de
 *   segurança de jul/2026: o client autenticado só tem SELECT).
 */
import { createAdminClient } from '@/utils/supabase/admin'
import { logError } from '@/lib/logger'

export const TRIAL_PLAN_ID = 'vip_pro'
/**
 * Só cadastros a partir daqui ganham trial automático. Ver o bloco ⚠️ acima —
 * sem isto, corrigir o CHECK do banco viraria concessão em massa retroativa.
 */
export const TRIAL_SIGNUP_CUTOFF = '2026-08-16T00:00:00.000Z'
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
        // `public.profiles` não tem `created_at` (é `auth.users` quem tem) — as
        // duas consultas rodam em PARALELO, e o `error` de cada uma é checado:
        // silenciar isso foi o que apagou o trial de todo mundo de 16/08 a
        // 21/09/2026 (ver a nota ⚠️ no cabeçalho do arquivo).
        const [profileRes, authRes] = await Promise.all([
            admin.from('profiles').select('role').eq('id', uid).maybeSingle(),
            admin.auth.admin.getUserById(uid),
        ])
        if (profileRes.error) {
            logError('vip:trial', profileRes.error, { stage: 'profile' })
            return false
        }
        if (authRes.error) {
            logError('vip:trial', authRes.error, { stage: 'auth_user' })
            return false
        }
        // Perfil ausente é situação anormal (todo cadastro cria uma linha em
        // `profiles`) — na dúvida, mesma trava conservadora do resto da função.
        if (!profileRes.data) return false
        const role = String(profileRes.data.role || '').toLowerCase()
        if (role === 'admin' || role === 'teacher') return false

        // Cadastro anterior ao corte não ganha trial automático. Sem carimbo de
        // cadastro o veredito é NÃO conceder: o erro barato é a pessoa não
        // ganhar (dá para conceder à mão); o caro é abrir acesso pago em massa
        // sem ninguém ter decidido.
        const createdAt = authRes.data?.user?.created_at
        const signupMs = createdAt ? Date.parse(String(createdAt)) : NaN
        if (!Number.isFinite(signupMs) || signupMs < Date.parse(TRIAL_SIGNUP_CUTOFF)) return false

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

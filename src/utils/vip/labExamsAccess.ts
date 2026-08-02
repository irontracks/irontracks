/**
 * Acesso a exames laboratoriais: VIP — ou o PRIMEIRO exame grátis.
 *
 * Fase 1 da tração (02/08/2026, aprovado pelo dono). A tese: exames + protocolo
 * é a feature mais premium do app e ninguém compra o que nunca provou. O
 * primeiro exame vira demonstração — a pessoa sobe o PDF, vê os marcadores e o
 * protocolo; o SEGUNDO exige VIP.
 *
 * As três rotas do fluxo usam este helper (create, extract, protocol). A regra
 * do "um" difere de propósito:
 * - `create`: grátis só com ZERO exames — é a porta de entrada;
 * - `extract`/`protocol`: grátis com ATÉ UM exame — são etapas do processamento
 *   do exame que o create já deixou entrar. Sem esse `<= 1`, o free subiria o
 *   arquivo e travaria na análise, que é exatamente a parte que demonstra valor.
 *
 * A cota VIP continua sendo debitada só de quem é VIP — o exame-demonstração
 * não consome metering de ninguém.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { checkVipFeatureAccess } from '@/utils/vip/limits'
import { logError } from '@/lib/logger'

export type LabExamsAccessReason = 'vip' | 'first_free' | 'denied'

export interface LabExamsAccess {
    allowed: boolean
    reason: LabExamsAccessReason
    tier: string
}

export async function checkLabExamsAccess(
    supabase: SupabaseClient,
    userId: string,
    stage: 'create' | 'process',
): Promise<LabExamsAccess> {
    // VIP primeiro: é o caminho comum e o único que deve gastar metering.
    const vip = await checkVipFeatureAccess(supabase, userId, 'lab_exams', { meter: true })
    if (vip.allowed) return { allowed: true, reason: 'vip', tier: vip.tier }

    try {
        const { count, error } = await supabase
            .from('lab_exams')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
        if (error) throw error

        const n = Number(count ?? 0)
        const limite = stage === 'create' ? 0 : 1
        if (n <= limite) return { allowed: true, reason: 'first_free', tier: vip.tier }
    } catch (e) {
        // Contagem falhou → nega. Falhar ABERTO aqui daria exames Gemini
        // ilimitados de graça num soluço do banco.
        logError('vip:lab-exams-access', e, { stage })
    }

    return { allowed: false, reason: 'denied', tier: vip.tier }
}

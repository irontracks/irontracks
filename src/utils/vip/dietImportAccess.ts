/**
 * Acesso ao import de dieta por foto/PDF: VIP — ou a PRIMEIRA por nossa conta.
 *
 * Mesma tese já aprovada para a ficha de treino (`workoutImportAccess.ts`) e
 * para o exame-demonstração: ler papel é o trabalho chato que o app tira da
 * frente do usuário, e ninguém assina o que nunca viu funcionar.
 *
 * ⚠️ **O import por JSON continua GRÁTIS e sem limite** — ele não gasta IA
 * nenhuma (parsing local). O gate existe só aqui, onde cada extração é uma
 * chamada paga ao Gemini com um PDF inteiro dentro.
 *
 * A contagem sai de `audit_events` em vez de tabela própria: o registro já é
 * útil por si (quantos usam, com que frequência) e evita uma migration para
 * guardar um contador.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { checkVipFeatureAccess } from '@/utils/vip/limits'
import { logError } from '@/lib/logger'

/** Ação registrada em `audit_events` a cada extração concluída. */
export const ACAO_IMPORT_DIETA = 'diet_photo_import'

export interface AcessoAoImportDeDieta {
    allowed: boolean
    reason: 'vip' | 'first_free' | 'denied'
    tier: string
}

export async function checkDietImportAccess(
    supabase: SupabaseClient,
    userId: string,
): Promise<AcessoAoImportDeDieta> {
    // VIP primeiro: caminho comum e o único que gasta metering. A
    // demonstração não consome cota de ninguém.
    const vip = await checkVipFeatureAccess(supabase, userId, 'analytics', { meter: true })
    if (vip.allowed) return { allowed: true, reason: 'vip', tier: vip.tier }

    try {
        const { count, error } = await supabase
            .from('audit_events')
            .select('id', { count: 'exact', head: true })
            .eq('action', ACAO_IMPORT_DIETA)
            .eq('entity_id', userId)
        if (error) throw error
        if (Number(count ?? 0) === 0) return { allowed: true, reason: 'first_free', tier: vip.tier }
    } catch (e) {
        // Falha ao CONTAR não pode virar acesso liberado — seria um bypass do
        // gate por indisponibilidade do banco.
        logError('vip:diet-import-access', e)
    }
    return { allowed: false, reason: 'denied', tier: vip.tier }
}

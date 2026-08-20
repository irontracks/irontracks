/**
 * Acesso ao import de treino por foto/PDF: VIP — ou a PRIMEIRA ficha grátis.
 *
 * Mesma tese do exame-demonstração (`labExamsAccess.ts`), aprovada pelo dono em
 * 19/08/2026: ler ficha de papel é o trabalho chato que o app tira da frente do
 * usuário, e ninguém assina o que nunca viu funcionar. A primeira importação é
 * por nossa conta; a segunda exige VIP.
 *
 * A regra do "um" difere por etapa, de propósito — e é a mesma armadilha que o
 * lab-exams documentou:
 * - `create`: grátis só com ZERO imports — é a porta de entrada;
 * - `process`: grátis com ATÉ UM import — a extração é a etapa que o create já
 *   deixou entrar. Sem esse `<= 1`, o free subiria a foto e travaria justamente
 *   na parte que demonstra o valor.
 *
 * Cota VIP só é debitada de quem é VIP: a ficha-demonstração não consome
 * metering de ninguém.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { checkVipFeatureAccess } from '@/utils/vip/limits'
import { logError } from '@/lib/logger'

export type WorkoutImportAccessReason = 'vip' | 'first_free' | 'denied'

export interface WorkoutImportAccess {
    allowed: boolean
    reason: WorkoutImportAccessReason
    tier: string
}

export async function checkWorkoutImportAccess(
    supabase: SupabaseClient,
    userId: string,
    stage: 'create' | 'process',
): Promise<WorkoutImportAccess> {
    // VIP primeiro: caminho comum e o único que gasta metering.
    const vip = await checkVipFeatureAccess(supabase, userId, 'analytics', { meter: true })
    if (vip.allowed) return { allowed: true, reason: 'vip', tier: vip.tier }

    try {
        const { count, error } = await supabase
            .from('workout_photo_imports')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
        if (error) throw error

        const n = Number(count ?? 0)
        const limite = stage === 'create' ? 0 : 1
        if (n <= limite) return { allowed: true, reason: 'first_free', tier: vip.tier }
    } catch (e) {
        // Contagem falhou → nega. Falhar ABERTO daria leitura de ficha por
        // Gemini ilimitada e de graça num soluço do banco.
        logError('vip:workout-import-access', e, { stage })
    }

    return { allowed: false, reason: 'denied', tier: vip.tier }
}

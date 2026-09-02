/**
 * POST /api/push/badge-seen
 *
 * Chamada quando o usuário ABRE o app (cold start ou volta do background).
 * Grava `user_settings.badge_cleared_at = now()`.
 *
 * O número no ícone é zerado pelo lado nativo (`SceneDelegate.clearIconBadge`),
 * mas o badge é RECALCULADO pelo servidor a cada push como "todas as não
 * lidas" — então, sem este marcador, o 32 zerado no device voltava como 33 na
 * notificação seguinte. Com ele, `sendPushToUsers` conta só as não lidas
 * criadas DEPOIS desta marca.
 *
 * Não marca nada como lido: o sino dentro do app continua com o indicador de
 * não lidas até o usuário abrir a central de notificações.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { logError } from '@/lib/logger'
import { respondDbError } from '@/utils/api/dbError'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    // Upsert só das duas colunas — `preferences` NÃO entra no payload, senão o
    // ON CONFLICT DO UPDATE sobrescreveria as preferências do usuário com `{}`.
    const { error } = await supabase
      .from('user_settings')
      .upsert({ user_id: user.id, badge_cleared_at: new Date().toISOString() }, { onConflict: 'user_id' })

    if (error) {
      logError('api:push/badge-seen', error)
      return respondDbError('api:push:badge-seen', error, 500)
    }

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    logError('api:push/badge-seen', e)
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

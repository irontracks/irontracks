/**
 * POST /api/push/register
 *
 * Stores a device push token for the authenticated user.
 * Called by usePushNotifications.ts on every app open after
 * Capacitor obtains the APNs / FCM registration token.
 *
 * Upserts on (token) primary key — safe to call repeatedly.
 * Updates last_seen_at so the 90-day cleanup job doesn't remove active tokens.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { respondDbError } from '@/utils/api/dbError'
import { checkRateLimitAsync } from '@/utils/rateLimit'
import { parseJsonBody } from '@/utils/zod'
import { z } from 'zod'

/** Token de push (APNs 64 hex; FCM até ~200) + plataforma + device. Tolerante ao
 *  que o app já manda; o teto de tamanho é o que importa — token é PK. */
const BodySchema = z
  .object({
    token: z.string().trim().min(1).max(512).optional(),
    platform: z.string().trim().max(20).optional(),
    deviceId: z.string().trim().max(200).optional(),
    device_id: z.string().trim().max(200).optional(),
  })
  .strip()

const normalizeToken = (v: unknown) => String(v ?? '').trim()

const normalizePlatform = (v: unknown): 'ios' | 'android' | 'web' => {
  const s = String(v ?? '').trim().toLowerCase()
  if (s === 'ios' || s === 'android' || s === 'web') return s
  return 'ios'
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    // Auditoria 01/09/2026: era a única rota autenticada de escrita sem limite e
    // sem schema — um cliente em loop encheria `device_push_tokens` à vontade.
    const rl = await checkRateLimitAsync(`push:register:${user.id}`, 20, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsed = await parseJsonBody(request, BodySchema)
    if (parsed.response || !parsed.data) {
      return parsed.response ?? NextResponse.json({ ok: false, error: 'Invalid input' }, { status: 400 })
    }
    const body = parsed.data

    const token = normalizeToken(body.token)
    const platform = normalizePlatform(body.platform)
    const deviceId = String(body.deviceId ?? body.device_id ?? '').trim()

    if (!token) {
      return NextResponse.json({ ok: false, error: 'missing token' }, { status: 400 })
    }

    const admin = createAdminClient()

    // IDOR guard: um push token pertence a UM device. Como a gravação usa
    // service-role (RLS off) e o upsert resolve conflito por PK 'token', um
    // usuário podia reivindicar o token já registrado por OUTRO usuário,
    // sequestrando/derrubando as notificações da vítima. Rejeita o conflito de
    // dono diferente (auditoria 2026-06-27). Caso de device compartilhado entre
    // contas exige que o dono anterior remova o token primeiro.
    const { data: existingToken } = await admin
      .from('device_push_tokens')
      .select('user_id')
      .eq('token', token)
      .maybeSingle()
    if (existingToken && existingToken.user_id && existingToken.user_id !== user.id) {
      return NextResponse.json({ ok: false, error: 'token_owned_by_another_user' }, { status: 409 })
    }

    const { error } = await admin
      .from('device_push_tokens')
      .upsert(
        {
          token,
          user_id: user.id,
          platform,
          device_id: deviceId || null,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'token' },
      )

    if (error) {
      return respondDbError('push:register', error, 500)
    }

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

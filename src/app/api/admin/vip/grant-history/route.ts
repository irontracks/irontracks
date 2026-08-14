import { NextResponse } from 'next/server'
import { respondInternalError } from '@/utils/api/internalError'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRoleOrBearer } from '@/utils/auth/route'
import { parseSearchParams } from '@/utils/zod'
import { respondDbError } from '@/utils/api/dbError'

const QuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strip()

export async function GET(req: Request) {
  try {
    const auth = await requireRoleOrBearer(req, ['admin'])
    if (!auth.ok) return auth.response

    const parsed = parseSearchParams(req, QuerySchema)
    if (parsed.response) return parsed.response
    const { limit } = parsed.data!

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('audit_events')
      .select('id, created_at, actor_id, actor_email, actor_role, action, entity_type, entity_id, metadata')
      .eq('action', 'vip_trial_grant')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) return respondDbError('admin:vip:grant-history', error)

    const rows = data || []

    // ── Estado ATUAL de cada usuário do log ────────────────────────────────
    // O histórico sozinho responde "o que eu dei", não "o que está valendo".
    // Derivar o vencimento de `created_at + days` seria inventar um fato: um
    // caso real desta base recebeu 30 dias em 22/06 e o entitlement venceu em
    // 22/07, mas há outros com TRÊS registros simultâneos (um válido até 2027,
    // um vencido há 96 dias, um inativo) — a conta pelo log erraria os três.
    //
    // A verdade mora em `user_entitlements.valid_until`, que é como o VIP
    // expira de fato (ver getVipPlanLimits). Buscamos o vigente de cada usuário
    // numa query só, e o cliente não calcula nada.
    const userIds = [...new Set(rows.map((r) => String(r?.entity_id || '')).filter(Boolean))]
    const estadoPorUsuario: Record<string, { validUntil: string | null; status: string; planId: string }> = {}

    if (userIds.length) {
      const { data: ents } = await admin
        .from('user_entitlements')
        .select('user_id, plan_id, status, valid_until')
        .in('user_id', userIds)

      for (const e of ents || []) {
        const uid = String(e?.user_id || '')
        if (!uid) continue
        const atual = estadoPorUsuario[uid]
        // `valid_until` nulo = sem prazo: vence qualquer data.
        const semPrazo = !e?.valid_until
        const maisLonge =
          !atual ||
          (atual.validUntil !== null && (semPrazo || String(e.valid_until) > atual.validUntil))
        if (maisLonge) {
          estadoPorUsuario[uid] = {
            validUntil: semPrazo ? null : String(e.valid_until),
            status: String(e?.status || ''),
            planId: String(e?.plan_id || ''),
          }
        }
      }
    }

    const enriquecidas = rows.map((r) => ({
      ...r,
      vigente: estadoPorUsuario[String(r?.entity_id || '')] ?? null,
    }))

    return NextResponse.json({ ok: true, rows: enriquecidas })
  } catch (e: unknown) {
    return respondInternalError('api:admin:vip:grant-history', e)
  }
}

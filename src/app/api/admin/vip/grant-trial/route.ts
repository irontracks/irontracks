import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole, requireRoleWithBearer } from '@/utils/auth/route'
import { parseJsonBody } from '@/utils/zod'
import { getErrorMessage } from '@/utils/errorMessage'
import { logWarn } from '@/lib/logger'
import { cacheDelete } from '@/utils/cache'

const GrantSchema = z
  .object({
    user_id: z.string().uuid().optional(),
    email: z.string().email().optional(),
    plan_id: z.enum(['vip_start', 'vip_pro', 'vip_elite']),
    days: z.coerce.number().int().min(1).max(365),
  })
  .strip()

const BodySchema = z
  .object({
    grants: z.array(GrantSchema).min(1).max(50),
  })
  .strip()

export async function POST(req: Request) {
  try {
    let auth = await requireRole(['admin'])
    if (!auth.ok) {
      auth = await requireRoleWithBearer(req, ['admin'])
      if (!auth.ok) return auth.response
    }

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!
    const grants = Array.isArray(body?.grants) ? body.grants : []
    if (!grants.length) return NextResponse.json({ ok: false, error: 'invalid_grants' }, { status: 400 })

    const admin = createAdminClient()
    const actorId = String(auth.user?.id || '').trim() || null
    const actorEmail = String(auth.user?.email || '').trim() || null
    const now = new Date()
    const results: Array<Record<string, unknown>> = []
    let created = 0
    let updated = 0

    for (const g of grants) {
      try {
        const email = String(g.email || '').trim().toLowerCase()
        let userId = String(g.user_id || '').trim()
        if (!userId && email) {
          const { data: profile } = await admin.from('profiles').select('id, email').ilike('email', email).maybeSingle()
          userId = String(profile?.id || '').trim()
        }
        if (!userId) {
          results.push({ ok: false, error: 'user_not_found', email: email || null, user_id: null, plan_id: g.plan_id, days: g.days })
          continue
        }

        const validFrom = now.toISOString()
        const validUntil = new Date(now.getTime() + Number(g.days) * 24 * 60 * 60 * 1000).toISOString()

        const { data: existing } = await admin
          .from('user_entitlements')
          .select('id, plan_id, provider, valid_until, status')
          .eq('user_id', userId)
          .in('status', ['active', 'trialing', 'past_due'])
          .order('valid_until', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle()

        const existingValidUntil = existing?.valid_until ? new Date(String(existing.valid_until)).getTime() : 0
        const nextValidUntilMs = Math.max(existingValidUntil, new Date(validUntil).getTime())

        if (existing?.id && String(existing.provider || '') === 'admin_grant' && String(existing.plan_id || '') === g.plan_id) {
          const { error: upErr } = await admin
            .from('user_entitlements')
            .update({
              valid_until: new Date(nextValidUntilMs).toISOString(),
              current_period_end: new Date(nextValidUntilMs).toISOString(),
            })
            .eq('id', existing.id)
          if (upErr) {
            results.push({ ok: false, error: upErr.message, user_id: userId, email: email || null, plan_id: g.plan_id, days: g.days })
            continue
          }
          try {
            await admin.from('audit_events').insert({
              actor_id: actorId,
              actor_email: actorEmail,
              actor_role: 'admin',
              action: 'vip_trial_grant',
              entity_type: 'user',
              entity_id: userId,
              metadata: { plan_id: g.plan_id, days: g.days, valid_until: new Date(nextValidUntilMs).toISOString(), email: email || null, action: 'extended' },
            })
          } catch (e) { logWarn('admin/vip/grant-trial', 'Failed to write audit_events (extended)', e) }
          updated += 1
          await Promise.all([
            cacheDelete(`vip:access:${userId}`).catch(() => {}),
            cacheDelete(`dashboard:bootstrap:${userId}`).catch(() => {}),
          ])
          results.push({ ok: true, action: 'extended', user_id: userId, email: email || null, plan_id: g.plan_id, days: g.days, valid_until: new Date(nextValidUntilMs).toISOString() })
          continue
        }

        const { error: insErr } = await admin
          .from('user_entitlements')
          .insert({
            user_id: userId,
            plan_id: g.plan_id,
            status: 'active',
            provider: 'admin_grant',
            provider_subscription_id: null,
            current_period_start: validFrom,
            current_period_end: validUntil,
            valid_from: validFrom,
            valid_until: validUntil,
            metadata: { source: 'admin_panel', days: g.days },
          })
        if (insErr) {
          results.push({ ok: false, error: insErr.message, user_id: userId, email: email || null, plan_id: g.plan_id, days: g.days })
          continue
        }
        try {
          await admin.from('audit_events').insert({
            actor_id: actorId,
            actor_email: actorEmail,
            actor_role: 'admin',
            action: 'vip_trial_grant',
            entity_type: 'user',
            entity_id: userId,
            metadata: { plan_id: g.plan_id, days: g.days, valid_until: validUntil, email: email || null, action: 'created' },
          })
        } catch (e) { logWarn('admin/vip/grant-trial', 'Failed to write audit_events (created)', e) }
        created += 1
        await Promise.all([
          cacheDelete(`vip:access:${userId}`).catch(() => {}),
          cacheDelete(`dashboard:bootstrap:${userId}`).catch(() => {}),
        ])
        results.push({ ok: true, action: 'created', user_id: userId, email: email || null, plan_id: g.plan_id, days: g.days, valid_until: validUntil })
      } catch (e: unknown) {
        results.push({ ok: false, error: getErrorMessage(e) || String(e), user_id: g.user_id || null, email: g.email || null, plan_id: g.plan_id, days: g.days })
      }
    }

    return NextResponse.json({ ok: true, created, updated, results })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}

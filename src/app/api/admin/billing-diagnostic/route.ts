/**
 * GET /api/admin/billing-diagnostic
 *
 * Returns a health-check report on every moving part of the teacher billing
 * pipeline. Used by the "Diagnóstico de Cobrança" panel inside SystemTab so an
 * admin can answer "is the system actually ready to charge teachers?" with one
 * click instead of grepping logs.
 *
 * Checks performed (each runs independently — failures are isolated, the report
 * always returns a complete shape):
 *
 *   1. teacher_tiers — exactly 5 active rows (free/starter/pro/elite/unlimited)
 *      with prices matching the landing page (0/49/97/179/249).
 *   2. MercadoPago credentials — token present, calls /users/me to verify
 *      identity + live_mode flag (production vs sandbox).
 *   3. CRON_SECRET, APP_BASE_URL, MARKETPLACE_PLATFORM_FEE_PERCENT — present?
 *   4. Existing data — count of teachers per plan_status, count of historical
 *      teacher_plan invoices.
 *
 * Read-only and idempotent. Safe to call repeatedly. Admin-only.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole } from '@/utils/auth/route'
import { mercadopagoRequest } from '@/lib/mercadopago'
import { env } from '@/utils/env'
import { getErrorMessage } from '@/utils/errorMessage'
import { logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

interface CheckResult<T = unknown> {
  ok: boolean
  message: string
  data?: T
}

const EXPECTED_TIERS = [
  { tier_key: 'free',      price_cents: 0,     max_students: 2   },
  { tier_key: 'starter',   price_cents: 4900,  max_students: 15  },
  { tier_key: 'pro',       price_cents: 9700,  max_students: 40  },
  { tier_key: 'elite',     price_cents: 17900, max_students: 100 },
  { tier_key: 'unlimited', price_cents: 24900, max_students: 0   },
]

interface MpUser {
  id?: number | string
  nickname?: string
  country_id?: string
  site_status?: string
  status?: { site_status?: string }
}

export async function GET() {
  try {
    const auth = await requireRole(['admin'])
    if (!auth.ok) return auth.response

    const admin = createAdminClient()
    const checks: Record<string, CheckResult> = {}

    // ── Check 1: teacher_tiers schema + values ──────────────────────────
    try {
      const { data: tiers, error } = await admin
        .from('teacher_tiers')
        .select('tier_key, name, price_cents, max_students, is_active, sort_order')
        .order('sort_order', { ascending: true })

      if (error) {
        checks.teacher_tiers = { ok: false, message: error.message }
      } else if (!Array.isArray(tiers) || tiers.length === 0) {
        checks.teacher_tiers = { ok: false, message: 'Tabela teacher_tiers vazia ou inacessível.' }
      } else {
        const mismatches: string[] = []
        for (const expected of EXPECTED_TIERS) {
          const actual = tiers.find((t) => String(t.tier_key) === expected.tier_key)
          if (!actual) {
            mismatches.push(`Falta tier "${expected.tier_key}"`)
          } else {
            if (Number(actual.price_cents) !== expected.price_cents) {
              mismatches.push(`${expected.tier_key}: preço ${actual.price_cents} ≠ esperado ${expected.price_cents}`)
            }
            if (Number(actual.max_students) !== expected.max_students) {
              mismatches.push(`${expected.tier_key}: max_students ${actual.max_students} ≠ esperado ${expected.max_students}`)
            }
            if (!actual.is_active) {
              mismatches.push(`${expected.tier_key}: is_active=false`)
            }
          }
        }
        checks.teacher_tiers = mismatches.length === 0
          ? { ok: true, message: `Todos os 5 tiers conferem.`, data: { count: tiers.length, tiers } }
          : { ok: false, message: mismatches.join('; '), data: { tiers } }
      }
    } catch (e) {
      checks.teacher_tiers = { ok: false, message: getErrorMessage(e) }
    }

    // ── Check 2: MercadoPago token + identity ──────────────────────────
    try {
      const tokenSet = !!env.mercadopago.accessToken.trim()
      if (!tokenSet) {
        checks.mercadopago = { ok: false, message: 'MERCADOPAGO_ACCESS_TOKEN não setado.' }
      } else {
        const tokenPrefix = env.mercadopago.accessToken.slice(0, 8)
        const isProdToken = tokenPrefix.startsWith('APP_USR-')
        const isTestToken = tokenPrefix.startsWith('TEST-')
        try {
          const user = await mercadopagoRequest<MpUser>({ method: 'GET', path: '/users/me' })
          const siteStatus = user?.status?.site_status ?? user?.site_status ?? 'unknown'
          checks.mercadopago = {
            ok: isProdToken && siteStatus !== 'deactive',
            message: isProdToken
              ? `Conta produção ativa: ${user?.nickname ?? user?.id ?? '?'} (${user?.country_id ?? '?'})`
              : isTestToken
                ? '⚠️ Token é SANDBOX (TEST-) — cobranças reais não vão funcionar.'
                : `Prefix do token desconhecido: ${tokenPrefix}…`,
            data: {
              token_prefix: tokenPrefix,
              is_production: isProdToken,
              is_sandbox: isTestToken,
              user_id: user?.id ?? null,
              nickname: user?.nickname ?? null,
              country_id: user?.country_id ?? null,
              site_status: siteStatus,
            },
          }
        } catch (mpErr) {
          checks.mercadopago = { ok: false, message: `MP API rejeitou: ${getErrorMessage(mpErr)}` }
        }
      }
    } catch (e) {
      checks.mercadopago = { ok: false, message: getErrorMessage(e) }
    }

    // ── Check 3: env vars ───────────────────────────────────────────────
    const envChecks: Array<{ key: string; required: boolean; description: string }> = [
      { key: 'MERCADOPAGO_ACCESS_TOKEN', required: true,  description: 'Token de API do Mercado Pago' },
      { key: 'MERCADOPAGO_WEBHOOK_SECRET', required: true,  description: 'Secret para validar webhooks' },
      { key: 'MERCADOPAGO_PIX_KEY',     required: false, description: 'Chave PIX (opcional)' },
      { key: 'CRON_SECRET',             required: true,  description: 'Auth dos cron jobs do Vercel' },
      { key: 'APP_BASE_URL',            required: true,  description: 'URL pública para back_url do MP' },
      { key: 'MARKETPLACE_PLATFORM_FEE_PERCENT', required: false, description: 'Fee % (default 10)' },
    ]
    const envStatus: Record<string, { present: boolean; required: boolean; description: string }> = {}
    let envAllOk = true
    for (const ec of envChecks) {
      const val = (process.env[ec.key] || '').trim()
      const present = val.length > 0
      envStatus[ec.key] = { present, required: ec.required, description: ec.description }
      if (ec.required && !present) envAllOk = false
    }
    checks.env_vars = {
      ok: envAllOk,
      message: envAllOk
        ? 'Todas as env vars obrigatórias presentes.'
        : 'Faltam env vars obrigatórias — confira no Vercel.',
      data: envStatus,
    }

    // ── Check 4: existing data ──────────────────────────────────────────
    try {
      const { data: teacherRows } = await admin
        .from('teachers')
        .select('plan_tier_key, plan_status')
        .limit(2000)
      const counter: Record<string, number> = {}
      let totalTeachers = 0
      for (const t of teacherRows ?? []) {
        const k = `${String(t.plan_tier_key || '?')}:${String(t.plan_status || '?')}`
        counter[k] = (counter[k] ?? 0) + 1
        totalTeachers++
      }

      const { count: invoiceCount } = await admin
        .from('app_payments')
        .select('id', { count: 'exact', head: true })
        .filter('raw->>scope', 'eq', 'teacher_plan')

      checks.data = {
        ok: true,
        message: `${totalTeachers} professor(es), ${invoiceCount ?? 0} fatura(s) histórica(s).`,
        data: {
          total_teachers: totalTeachers,
          breakdown: counter,
          historical_invoices: invoiceCount ?? 0,
        },
      }
    } catch (e) {
      checks.data = { ok: false, message: getErrorMessage(e) }
    }

    const allOk = Object.values(checks).every((c) => c.ok)
    return NextResponse.json({
      ok: true,
      ready_to_charge: allOk,
      checks,
      timestamp: new Date().toISOString(),
    })
  } catch (e) {
    logError('admin:billing-diagnostic', e)
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}

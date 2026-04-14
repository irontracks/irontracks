import { NextResponse } from 'next/server'
import { hasValidInternalSecret, requireRole } from '@/utils/auth/route'
import { cacheGet, cacheSet } from '@/utils/cache'
import { getErrorMessage } from '@/utils/errorMessage'
import { env } from '@/utils/env'

export const dynamic = 'force-dynamic'

const DEFAULT_PLATFORM_FEE_PERCENT = 15

const parsePlatformFeePercent = () => {
  const n = env.features.marketplaceFeePercent
  if (Number.isFinite(n) && n >= 0 && n <= 99.99) return { value: n, source: 'env' as const }
  return { value: DEFAULT_PLATFORM_FEE_PERCENT, source: 'default' as const }
}

export async function GET(req: Request) {
  try {
    if (!hasValidInternalSecret(req)) {
      const auth = await requireRole(['admin'])
      if (!auth.ok) return auth.response
    }

    const cacheKey = 'marketplace:health'
    const cached = await cacheGet<Record<string, unknown>>(cacheKey, (v) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null))
    if (cached) return NextResponse.json(cached)

    const fee = parsePlatformFeePercent()
    const asaasBaseUrl = env.asaas.baseUrl.trim()
    const asaasUserAgent = env.asaas.userAgent.trim()
    const asaasApiKey = env.asaas.apiKey.trim()

    const baseEnv = asaasBaseUrl.includes('sandbox') ? ('sandbox' as const) : ('production' as const)
    const keyEnv = asaasApiKey.startsWith('aact_hmlg_') ? ('sandbox' as const) : asaasApiKey.startsWith('aact_prod_') ? ('production' as const) : ('unknown' as const)
    const asaasEnvironmentMismatch = keyEnv !== 'unknown' && keyEnv !== baseEnv
    const payload = {
      ok: true,
      asaas_api_key_configured: !!asaasApiKey,
      asaas_webhook_secret_configured: !!env.asaas.webhookSecret.trim(),
      asaas_base_url: asaasBaseUrl,
      asaas_user_agent_configured: !!asaasUserAgent,
      asaas_base_environment: baseEnv,
      asaas_key_environment: keyEnv,
      asaas_environment_mismatch: asaasEnvironmentMismatch,
      supabase_service_role_configured: !!env.supabase.serviceRoleKey.trim(),
      platform_fee_percent: fee.value,
      platform_fee_source: fee.source,
    }

    await cacheSet(cacheKey, payload, 120)
    return NextResponse.json(payload)
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}

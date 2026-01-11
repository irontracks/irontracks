import { NextResponse } from 'next/server'
import { hasValidInternalSecret, requireRole } from '@/utils/auth/route'

export const dynamic = 'force-dynamic'

const DEFAULT_PLATFORM_FEE_PERCENT = 15

const parsePlatformFeePercent = () => {
  const raw = (process.env.MARKETPLACE_PLATFORM_FEE_PERCENT || '').trim()
  const n = Number(raw)
  if (Number.isFinite(n) && n >= 0 && n <= 99.99) return { value: n, source: 'env' as const }
  return { value: DEFAULT_PLATFORM_FEE_PERCENT, source: 'default' as const }
}

export async function GET(req: Request) {
  if (!hasValidInternalSecret(req)) {
    const auth = await requireRole(['admin'])
    if (!auth.ok) return auth.response
  }

  const fee = parsePlatformFeePercent()
  const asaasBaseUrl = ((process.env.ASAAS_BASE_URL || 'https://api.asaas.com/v3') as string).trim()
  const asaasUserAgent = ((process.env.ASAAS_USER_AGENT || '') as string).trim()
  const asaasApiKey = ((process.env.ASAAS_API_KEY || '') as string).trim()

  const baseEnv = asaasBaseUrl.includes('sandbox') ? ('sandbox' as const) : ('production' as const)
  const keyEnv = asaasApiKey.startsWith('aact_hmlg_') ? ('sandbox' as const) : asaasApiKey.startsWith('aact_prod_') ? ('production' as const) : ('unknown' as const)
  const asaasEnvironmentMismatch = keyEnv !== 'unknown' && keyEnv !== baseEnv
  return NextResponse.json({
    ok: true,
    asaas_api_key_configured: !!asaasApiKey,
    asaas_webhook_secret_configured: !!(process.env.ASAAS_WEBHOOK_SECRET || '').trim(),
    asaas_base_url: asaasBaseUrl,
    asaas_user_agent_configured: !!asaasUserAgent,
    asaas_base_environment: baseEnv,
    asaas_key_environment: keyEnv,
    asaas_environment_mismatch: asaasEnvironmentMismatch,
    supabase_service_role_configured: !!(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
    platform_fee_percent: fee.value,
    platform_fee_source: fee.source,
  })
}

#!/usr/bin/env node
/**
 * scripts/check-env.ts
 * Diagnóstico de variáveis de ambiente.
 * Uso: npx tsx scripts/check-env.ts
 */

import { config } from 'dotenv'
import { existsSync } from 'fs'
import { resolve } from 'path'

// Carregar .env.local se existir
const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  config({ path: envPath })
}

interface VarSpec {
  key: string
  required: boolean
  group: string
  hint?: string
}

const VARS: VarSpec[] = [
  // Supabase
  { key: 'NEXT_PUBLIC_SUPABASE_URL', required: true, group: 'Supabase' },
  { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', required: true, group: 'Supabase' },
  { key: 'SUPABASE_SERVICE_ROLE_KEY', required: true, group: 'Supabase', hint: 'PRIVADA' },
  { key: 'SUPABASE_COOKIE_DOMAIN', required: false, group: 'Supabase', hint: 'ex: .irontracks.com.br' },
  // App URL
  { key: 'APP_BASE_URL', required: true, group: 'App URL' },
  { key: 'NEXT_PUBLIC_BASE_URL', required: false, group: 'App URL', hint: 'fallback de APP_BASE_URL' },
  { key: 'IRONTRACKS_PUBLIC_ORIGIN', required: false, group: 'App URL' },
  // Google Gemini
  { key: 'GOOGLE_GENERATIVE_AI_API_KEY', required: true, group: 'Google Gemini' },
  { key: 'GOOGLE_GENERATIVE_AI_MODEL_ID', required: false, group: 'Google Gemini', hint: 'padrão: gemini-1.5-pro' },
  // RevenueCat
  { key: 'NEXT_PUBLIC_ENABLE_IAP', required: true, group: 'RevenueCat' },
  { key: 'NEXT_PUBLIC_REVENUECAT_IOS_API_KEY', required: true, group: 'RevenueCat' },
  { key: 'NEXT_PUBLIC_REVENUECAT_API_KEY', required: false, group: 'RevenueCat' },
  { key: 'REVENUECAT_SECRET_API_KEY', required: true, group: 'RevenueCat', hint: 'PRIVADA' },
  { key: 'REVENUECAT_ENTITLEMENT_ID', required: true, group: 'RevenueCat', hint: 'valor: vip' },
  { key: 'REVENUECAT_WEBHOOK_AUTH_KEY', required: false, group: 'RevenueCat' },
  // Resend
  { key: 'RESEND_API_KEY', required: false, group: 'Resend (Email)' },
  { key: 'RESEND_FROM', required: false, group: 'Resend (Email)' },
  // FCM
  { key: 'FCM_PROJECT_ID', required: false, group: 'Firebase FCM' },
  { key: 'FCM_CLIENT_EMAIL', required: false, group: 'Firebase FCM' },
  { key: 'FCM_PRIVATE_KEY', required: false, group: 'Firebase FCM', hint: 'PRIVADA' },
  // APNs
  { key: 'APNS_KEY_ID', required: false, group: 'Apple APNs' },
  { key: 'APNS_KEY_P', required: false, group: 'Apple APNs', hint: 'PRIVADA' },
  { key: 'APNS_TEAM_ID', required: false, group: 'Apple APNs' },
  { key: 'APNS_BUNDLE_ID', required: false, group: 'Apple APNs', hint: 'valor: com.irontracks.app' },
  { key: 'APNS_PRODUCTION', required: false, group: 'Apple APNs', hint: 'true/false' },
  // Cloudinary
  { key: 'CLOUDINARY_CLOUD_NAME', required: false, group: 'Cloudinary' },
  { key: 'CLOUDINARY_API_KEY', required: false, group: 'Cloudinary' },
  { key: 'CLOUDINARY_API_SECRET', required: false, group: 'Cloudinary', hint: 'PRIVADA' },
  // MercadoPago
  { key: 'MERCADOPAGO_ACCESS_TOKEN', required: false, group: 'MercadoPago', hint: 'PRIVADA' },
  { key: 'MERCADOPAGO_WEBHOOK_SECRET', required: false, group: 'MercadoPago', hint: 'PRIVADA' },
  { key: 'MERCADOPAGO_PIX_KEY', required: false, group: 'MercadoPago' },
  { key: 'MERCADOPAGO_BASE_URL', required: false, group: 'MercadoPago', hint: 'padrão: https://api.mercadopago.com' },
  { key: 'MERCADOPAGO_USER_AGENT', required: false, group: 'MercadoPago', hint: 'padrão: IronTracks/1.0' },
  // ASAAS
  { key: 'ASAAS_API_KEY', required: false, group: 'ASAAS', hint: 'PRIVADA' },
  { key: 'ASAAS_WEBHOOK_SECRET', required: false, group: 'ASAAS', hint: 'PRIVADA' },
  { key: 'ASAAS_BASE_URL', required: false, group: 'ASAAS', hint: 'padrão: https://api.asaas.com/v3' },
  { key: 'ASAAS_USER_AGENT', required: false, group: 'ASAAS', hint: 'padrão: IronTracks/1.0' },
  // Marketplace
  { key: 'MARKETPLACE_PLATFORM_FEE_PERCENT', required: false, group: 'Marketplace', hint: 'padrão: 10' },
  // Upstash Redis
  { key: 'UPSTASH_REDIS_REST_URL', required: false, group: 'Upstash Redis', hint: 'rate limiting distribuído' },
  { key: 'UPSTASH_REDIS_REST_TOKEN', required: false, group: 'Upstash Redis', hint: 'PRIVADA' },
  // Segurança
  { key: 'CRON_SECRET', required: true, group: 'Segurança', hint: 'min 32 chars' },
  { key: 'IRONTRACKS_INTERNAL_SECRET', required: true, group: 'Segurança', hint: 'min 32 chars' },
  { key: 'IRONTRACKS_ADMIN_EMAIL', required: false, group: 'Segurança' },
  { key: 'ADMIN_EMAIL', required: false, group: 'Segurança', hint: 'alias de IRONTRACKS_ADMIN_EMAIL' },
  { key: 'TRUSTED_PROXY_DEPTH', required: false, group: 'Segurança', hint: 'padrão: 1' },
  // YouTube
  { key: 'YOUTUBE_API_KEY', required: false, group: 'YouTube' },
  // Feature Flags
  { key: 'ENABLE_EXECUTION_VIDEO', required: false, group: 'Feature Flags', hint: 'true/false' },
  { key: 'NEXT_PUBLIC_ENABLE_EXECUTION_VIDEO', required: false, group: 'Feature Flags', hint: 'true/false' },
  { key: 'NEXT_PUBLIC_STORAGE_PROVIDER', required: false, group: 'Feature Flags', hint: 'cloudinary | supabase' },
  { key: 'NEXT_PUBLIC_APPLE_IOS_CLIENT_ID', required: false, group: 'Feature Flags', hint: 'ex: com.irontracks.app' },
  { key: 'NEXT_PUBLIC_APP_VERSION', required: false, group: 'Feature Flags', hint: 'ex: 1.0.0' },
]

// Agrupar por grupo
const groups = new Map<string, VarSpec[]>()
for (const v of VARS) {
  if (!groups.has(v.group)) groups.set(v.group, [])
  groups.get(v.group)!.push(v)
}

let present = 0
let missingOptional = 0
let missingRequired = 0

for (const [group, vars] of groups) {
  console.log(`\n── ${group} ──`)
  for (const v of vars) {
    const val = process.env[v.key]
    if (val) {
      console.log(`  ✅ ${v.key}`)
      present++
    } else if (v.required) {
      console.log(`  ❌ ${v.key} — AUSENTE (OBRIGATÓRIA)${v.hint ? ` [${v.hint}]` : ''}`)
      missingRequired++
    } else {
      console.log(`  ⚠️  ${v.key} — ausente (opcional)${v.hint ? ` [${v.hint}]` : ''}`)
      missingOptional++
    }
  }
}

console.log(`\n${'─'.repeat(50)}`)
console.log(`✅ ${present} presentes | ⚠️  ${missingOptional} ausentes opcionais | ❌ ${missingRequired} ausentes críticas`)

if (missingRequired > 0) {
  console.log('\n❌ FALHA: variáveis críticas ausentes. Configure antes de fazer deploy.\n')
  process.exit(1)
} else {
  console.log('\n✅ Todas as variáveis críticas estão configuradas.\n')
}

// src/utils/env.ts
// Centraliza acesso às env vars com validação de presença
// SERVER-SIDE ONLY — não importar em Client Components

const isDev = process.env.NODE_ENV === 'development'
const isProd = process.env.NODE_ENV === 'production'
// Next.js sets NEXT_PHASE during `next build` — env vars may not exist yet
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build'

function requireEnv(key: string, fallback?: string): string {
  const val = process.env[key] ?? fallback ?? ''
  if (!val && isProd && !isBuildPhase) {
    // Em produção runtime: lançar erro (vai aparecer no Sentry)
    throw new Error(`[env] Variável obrigatória ausente: ${key}`)
  }
  if (!val && isDev) {
    // Em dev: apenas avisar
    console.warn(`[env] ⚠️  ${key} não definida — funcionalidade degradada`)
  }
  return val
}

function optionalEnv(key: string, fallback = ''): string {
  return process.env[key] ?? fallback
}

// ── Supabase ──────────────────────────────────────────────
export const env = {
  supabase: {
    url: requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    anonKey: requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    cookieDomain: optionalEnv('SUPABASE_COOKIE_DOMAIN'),
  },

  // ── App URL ──────────────────────────────────────────────
  app: {
    baseUrl: optionalEnv('APP_BASE_URL', optionalEnv('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000')),
    publicOrigin: optionalEnv('IRONTRACKS_PUBLIC_ORIGIN', optionalEnv('APP_BASE_URL', 'http://localhost:3000')),
    version: optionalEnv('NEXT_PUBLIC_APP_VERSION', '0.0.0'),
  },

  // ── Google Gemini ─────────────────────────────────────────
  gemini: {
    apiKey: requireEnv('GOOGLE_GENERATIVE_AI_API_KEY'),
    modelId: optionalEnv('GOOGLE_GENERATIVE_AI_MODEL_ID', 'gemini-1.5-pro'),
  },

  // ── RevenueCat ────────────────────────────────────────────
  revenuecat: {
    secretKey: optionalEnv('REVENUECAT_SECRET_API_KEY', optionalEnv('REVENUECAT_SECRET_KEY')),
    entitlementId: optionalEnv('REVENUECAT_ENTITLEMENT_ID', 'vip'),
    webhookAuthKey: optionalEnv('REVENUECAT_WEBHOOK_AUTH_KEY'),
    iosApiKey: optionalEnv('NEXT_PUBLIC_REVENUECAT_IOS_API_KEY'),
  },

  // ── Resend (email) ────────────────────────────────────────
  resend: {
    apiKey: optionalEnv('RESEND_API_KEY'),
    from: optionalEnv('RESEND_FROM', 'IronTracks <noreply@irontracks.com.br>'),
  },

  // ── Firebase Cloud Messaging ──────────────────────────────
  fcm: {
    projectId: optionalEnv('FCM_PROJECT_ID'),
    clientEmail: optionalEnv('FCM_CLIENT_EMAIL'),
    privateKey: optionalEnv('FCM_PRIVATE_KEY'),
  },

  // ── Apple Push Notification Service ──────────────────────
  apns: {
    keyId: optionalEnv('APNS_KEY_ID'),
    keyP8: optionalEnv('APNS_KEY_P'),
    teamId: optionalEnv('APNS_TEAM_ID'),
    bundleId: optionalEnv('APNS_BUNDLE_ID', 'com.irontracks.app'),
    production: optionalEnv('APNS_PRODUCTION', 'false') === 'true',
  },

  // ── Cloudinary ────────────────────────────────────────────
  cloudinary: {
    cloudName: optionalEnv('CLOUDINARY_CLOUD_NAME'),
    apiKey: optionalEnv('CLOUDINARY_API_KEY'),
    apiSecret: optionalEnv('CLOUDINARY_API_SECRET'),
  },

  // ── MercadoPago ───────────────────────────────────────────
  mercadopago: {
    accessToken: optionalEnv('MERCADOPAGO_ACCESS_TOKEN'),
    webhookSecret: optionalEnv('MERCADOPAGO_WEBHOOK_SECRET'),
    pixKey: optionalEnv('MERCADOPAGO_PIX_KEY'),
    baseUrl: optionalEnv('MERCADOPAGO_BASE_URL', 'https://api.mercadopago.com'),
    userAgent: optionalEnv('MERCADOPAGO_USER_AGENT', 'IronTracks/1.0'),
  },

  // ── ASAAS ─────────────────────────────────────────────────
  asaas: {
    apiKey: optionalEnv('ASAAS_API_KEY'),
    webhookSecret: optionalEnv('ASAAS_WEBHOOK_SECRET'),
    baseUrl: optionalEnv('ASAAS_BASE_URL', 'https://api.asaas.com/v3'),
    userAgent: optionalEnv('ASAAS_USER_AGENT', 'IronTracks/1.0'),
  },

  // ── Upstash Redis ─────────────────────────────────────────
  upstash: {
    restUrl: optionalEnv('UPSTASH_REDIS_REST_URL'),
    restToken: optionalEnv('UPSTASH_REDIS_REST_TOKEN'),
  },

  // ── Segurança ─────────────────────────────────────────────
  security: {
    cronSecret: requireEnv('CRON_SECRET'),
    internalSecret: requireEnv('IRONTRACKS_INTERNAL_SECRET'),
    adminEmail: optionalEnv('IRONTRACKS_ADMIN_EMAIL', optionalEnv('ADMIN_EMAIL')),
    trustedProxyDepth: parseInt(optionalEnv('TRUSTED_PROXY_DEPTH', '1'), 10),
  },

  // ── YouTube ───────────────────────────────────────────────
  youtube: {
    apiKey: optionalEnv('YOUTUBE_API_KEY'),
  },

  // ── Feature Flags ─────────────────────────────────────────
  features: {
    executionVideo: optionalEnv('ENABLE_EXECUTION_VIDEO', 'false') === 'true',
    storageProvider: optionalEnv('NEXT_PUBLIC_STORAGE_PROVIDER', 'supabase') as 'cloudinary' | 'supabase',
    marketplaceFeePercent: parseFloat(optionalEnv('MARKETPLACE_PLATFORM_FEE_PERCENT', '10')),
  },
} as const

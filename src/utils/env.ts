// src/utils/env.ts
// Centraliza acesso às env vars com validação de presença
// SERVER-SIDE ONLY — não importar em Client Components
//
// Todas as propriedades usam getters para avaliação LAZY:
// - O módulo pode ser importado sem efeitos colaterais
// - requireEnv só lança erro quando o valor é realmente acessado
// - Isso previne crashes durante build, SSR e cold start

const isDev = process.env.NODE_ENV === 'development'
const isProd = process.env.NODE_ENV === 'production'

function requireEnv(key: string, fallback?: string): string {
  const val = process.env[key] ?? fallback ?? ''
  if (!val && isProd) {
    throw new Error(`[env] Variável obrigatória ausente: ${key}`)
  }
  if (!val && isDev) {
    console.warn(`[env] ⚠️  ${key} não definida — funcionalidade degradada`)
  }
  return val
}

function optionalEnv(key: string, fallback = ''): string {
  return process.env[key] ?? fallback
}

// ── Env vars com avaliação lazy (getters) ─────────────────
export const env = {
  // ── Supabase ──────────────────────────────────────────────
  supabase: {
    get url() { return requireEnv('NEXT_PUBLIC_SUPABASE_URL') },
    get anonKey() { return requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') },
    get serviceRoleKey() { return requireEnv('SUPABASE_SERVICE_ROLE_KEY') },
    get cookieDomain() { return optionalEnv('SUPABASE_COOKIE_DOMAIN') },
  },

  // ── App URL ──────────────────────────────────────────────
  app: {
    get baseUrl() { return optionalEnv('APP_BASE_URL', optionalEnv('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000')) },
    get publicOrigin() { return optionalEnv('IRONTRACKS_PUBLIC_ORIGIN', optionalEnv('APP_BASE_URL', 'http://localhost:3000')) },
    get version() { return optionalEnv('NEXT_PUBLIC_APP_VERSION', '0.0.0') },
  },

  // ── Google Gemini ─────────────────────────────────────────
  gemini: {
    get apiKey() { return requireEnv('GOOGLE_GENERATIVE_AI_API_KEY') },
    get modelId() { return optionalEnv('GOOGLE_GENERATIVE_AI_MODEL_ID', 'gemini-1.5-pro') },
    // Fast model for heavy/long generations (meal plans, workout routines).
    // Default matches production's modelId (gemini-2.5-flash) so behaviour is
    // predictable — the REAL fix for the 30s timeout is the maxOutputTokens
    // cap set per-route in those heavy handlers, not a model change. Kept as
    // a separate getter so heavy routes can be bumped to an even-faster
    // variant in the future without touching the lighter routes.
    //
    // Do NOT default to gemini-1.5-flash — that model 404s on the current
    // API key / project. Only 2.x flash is reachable here.
    get fastModelId() { return optionalEnv('GOOGLE_GENERATIVE_AI_FAST_MODEL_ID', optionalEnv('GOOGLE_GENERATIVE_AI_MODEL_ID', 'gemini-2.5-flash')) },
  },

  // ── RevenueCat ────────────────────────────────────────────
  revenuecat: {
    get secretKey() { return optionalEnv('REVENUECAT_SECRET_API_KEY', optionalEnv('REVENUECAT_SECRET_KEY')) },
    get entitlementId() { return optionalEnv('REVENUECAT_ENTITLEMENT_ID', 'vip') },
    get webhookAuthKey() { return optionalEnv('REVENUECAT_WEBHOOK_AUTH_KEY') },
    get iosApiKey() { return optionalEnv('NEXT_PUBLIC_REVENUECAT_IOS_API_KEY') },
  },

  // ── Resend (email) ────────────────────────────────────────
  resend: {
    get apiKey() { return optionalEnv('RESEND_API_KEY') },
    get from() { return optionalEnv('RESEND_FROM', 'IronTracks <noreply@irontracks.com.br>') },
  },

  // ── Firebase Cloud Messaging ──────────────────────────────
  fcm: {
    get projectId() { return optionalEnv('FCM_PROJECT_ID') },
    get clientEmail() { return optionalEnv('FCM_CLIENT_EMAIL') },
    get privateKey() { return optionalEnv('FCM_PRIVATE_KEY') },
  },

  // ── Apple Push Notification Service ──────────────────────
  apns: {
    get keyId() { return optionalEnv('APNS_KEY_ID') },
    // APNS_KEY_P8 is the documented var (contents of the .p8 file).
    // APNS_KEY_P is accepted as a legacy fallback because earlier deploys
    // used that name — silently losing the key was causing every iOS push
    // to be skipped in production.
    get keyP8() { return optionalEnv('APNS_KEY_P8') || optionalEnv('APNS_KEY_P') },
    get teamId() { return optionalEnv('APNS_TEAM_ID') },
    get bundleId() { return optionalEnv('APNS_BUNDLE_ID', 'com.irontracks.app') },
    get production() { return optionalEnv('APNS_PRODUCTION', 'false').trim() === 'true' },
  },

  // ── Cloudinary ────────────────────────────────────────────
  cloudinary: {
    get cloudName() { return optionalEnv('CLOUDINARY_CLOUD_NAME') },
    get apiKey() { return optionalEnv('CLOUDINARY_API_KEY') },
    get apiSecret() { return optionalEnv('CLOUDINARY_API_SECRET') },
  },

  // ── MercadoPago ───────────────────────────────────────────
  mercadopago: {
    get accessToken() { return optionalEnv('MERCADOPAGO_ACCESS_TOKEN') },
    get webhookSecret() { return optionalEnv('MERCADOPAGO_WEBHOOK_SECRET') },
    get pixKey() { return optionalEnv('MERCADOPAGO_PIX_KEY') },
    get baseUrl() { return optionalEnv('MERCADOPAGO_BASE_URL', 'https://api.mercadopago.com') },
    get userAgent() { return optionalEnv('MERCADOPAGO_USER_AGENT', 'IronTracks/1.0') },
  },

  // ── ASAAS ─────────────────────────────────────────────────
  asaas: {
    get apiKey() { return optionalEnv('ASAAS_API_KEY') },
    get webhookSecret() { return optionalEnv('ASAAS_WEBHOOK_SECRET') },
    get baseUrl() { return optionalEnv('ASAAS_BASE_URL', 'https://api.asaas.com/v3') },
    get userAgent() { return optionalEnv('ASAAS_USER_AGENT', 'IronTracks/1.0') },
  },

  // ── Upstash Redis ─────────────────────────────────────────
  upstash: {
    get restUrl() { return optionalEnv('UPSTASH_REDIS_REST_URL') },
    get restToken() { return optionalEnv('UPSTASH_REDIS_REST_TOKEN') },
  },

  // ── QStash (agendamento de push com atraso — fim do descanso) ─────
  qstash: {
    get token() { return optionalEnv('QSTASH_TOKEN') },
    get currentSigningKey() { return optionalEnv('QSTASH_CURRENT_SIGNING_KEY') },
    get nextSigningKey() { return optionalEnv('QSTASH_NEXT_SIGNING_KEY') },
  },

  // ── Segurança ─────────────────────────────────────────────
  security: {
    get cronSecret() { return requireEnv('CRON_SECRET') },
    // Opcional de propósito: hasValidInternalSecret() já trata ausência com
    // `if (!secret) return false`. Como requireEnv, uma chamada sem auth a
    // qualquer rota interna/cron estourava 500 em vez de 403 limpo.
    get internalSecret() { return optionalEnv('IRONTRACKS_INTERNAL_SECRET') },
    get adminEmail() { return optionalEnv('IRONTRACKS_ADMIN_EMAIL', optionalEnv('ADMIN_EMAIL')) },
    get trustedProxyDepth() { return parseInt(optionalEnv('TRUSTED_PROXY_DEPTH', '1'), 10) },
  },

  // ── Z-API (WhatsApp) ──────────────────────────────────────
  zapi: {
    get instanceId() { return optionalEnv('ZAPI_INSTANCE_ID') },
    get token() { return optionalEnv('ZAPI_TOKEN') },
    /** Security token sent by Z-API in the "client-token" header on webhooks */
    get clientToken() { return optionalEnv('ZAPI_CLIENT_TOKEN') },
  },

  // ── YouTube ───────────────────────────────────────────────
  youtube: {
    get apiKey() { return optionalEnv('YOUTUBE_API_KEY') },
  },

  // ── Feature Flags ─────────────────────────────────────────
  features: {
    get executionVideo() { return optionalEnv('ENABLE_EXECUTION_VIDEO', 'false') === 'true' },
    get storageProvider() { return optionalEnv('NEXT_PUBLIC_STORAGE_PROVIDER', 'supabase') as 'cloudinary' | 'supabase' },
    get marketplaceFeePercent() { return parseFloat(optionalEnv('MARKETPLACE_PLATFORM_FEE_PERCENT', '10')) },
  },
}

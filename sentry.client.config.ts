import * as Sentry from "@sentry/nextjs"
import { isNoiseByName, isNoiseException } from "@/utils/sentryFilters"

// Detect Capacitor native WebView inline (sem import — Sentry init roda muito cedo).
// Em mobile native, Sentry tracing duplica spans que já cobrimos via crash reports
// nativos (TestFlight/Play). Zerar a sampleRate em mobile reduz CPU/bateria/quota.
const isNativeWebView = (): boolean => {
  try {
    if (typeof window === "undefined") return false
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    return typeof cap?.isNativePlatform === "function" ? Boolean(cap.isNativePlatform()) : false
  } catch {
    return false
  }
}

const isProd = process.env.NEXT_PUBLIC_VERCEL_ENV === "production"

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,

  // Tracing: 0% em mobile native (crash reports já cobrem); 20% prod web; 100% dev.
  // Reduz overhead de spans/I/O no fetch interceptor da WebView.
  tracesSampleRate: isNativeWebView() ? 0 : isProd ? 0.2 : 1.0,

  // 10% das sessões normais, 100% quando há erro
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  // false = não envia IP/user-agent por padrão (LGPD)
  sendDefaultPii: false,

  integrations: [],

  // Filtra erros esperados que não representam bugs reais
  beforeSend(event, hint) {
    const err = hint?.originalException
    const errName = (err instanceof Error || (err && typeof err === 'object'))
      ? (err as { name?: string }).name
      : null

    // Check hint.originalException name
    if (isNoiseByName(errName)) return null

    // Fallback: iOS Safari/WebKit pode não popular hint.originalException em
    // unhandled rejections — checar os valores de exceção do evento.
    const exValues = event.exception?.values
    if (Array.isArray(exValues)) {
      for (const val of exValues) {
        if (isNoiseException(val.type, val.value)) return null
      }
    }

    return event
  },
})

// Replay carregado de forma lazy para não impactar o bundle inicial (~80KB).
// Skip em Capacitor WebView — Replay quase nunca renderiza decentemente em
// WebView nativa e o overhead de rrweb compromete CPU/bateria.
if (!isNativeWebView()) {
  Sentry.lazyLoadIntegration('replayIntegration').then((integration) => {
    Sentry.addIntegration(integration())
  }).catch(() => { /* silently ignore if blocked */ })
}

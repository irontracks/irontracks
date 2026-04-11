import * as Sentry from "@sentry/nextjs"
import { isNoiseByName, isNoiseException } from "@/utils/sentryFilters"

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,

  // 20% das transações em produção para não estourar cota; 100% em outros ambientes
  tracesSampleRate: process.env.NEXT_PUBLIC_VERCEL_ENV === "production" ? 0.2 : 1.0,

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

// Replay carregado de forma lazy para não impactar o bundle inicial (~80KB)
Sentry.lazyLoadIntegration('replayIntegration').then((integration) => {
  Sentry.addIntegration(integration())
}).catch(() => { /* silently ignore if blocked */ })

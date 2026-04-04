import * as Sentry from "@sentry/nextjs"

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

  integrations: [
    Sentry.replayIntegration(),
  ],

  // Filtra erros esperados que não representam bugs reais
  beforeSend(event, hint) {
    const err = hint?.originalException
    const errName = (err instanceof Error || (err && typeof err === 'object'))
      ? (err as { name?: string }).name
      : null

    // AbortError: navegação/desmontagem de componente cancela fetches em andamento.
    // Comportamento esperado — não é bug acionável.
    if (errName === 'AbortError') return null

    // Fallback: iOS Safari/WebKit pode não popular hint.originalException em
    // unhandled rejections — checar também os valores de exceção do evento.
    const exValues = event.exception?.values
    if (Array.isArray(exValues)) {
      for (const val of exValues) {
        if (val.type === 'AbortError') return null
      }
    }

    // ResizeObserver loop — ruído comum em browsers, não acionável
    if (Array.isArray(exValues)) {
      for (const val of exValues) {
        if (typeof val.value === 'string' && val.value.includes('ResizeObserver loop')) return null
      }
    }

    return event
  },
})

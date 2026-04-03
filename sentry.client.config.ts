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
    const name = (err instanceof Error || (err && typeof err === 'object'))
      ? (err as { name?: string }).name
      : null
    const message = err instanceof Error
      ? err.message
      : typeof err === 'string' ? err : ''

    // AbortError: navegação/desmontagem de componente cancela fetches em andamento.
    // Comportamento esperado — não é bug acionável.
    if (name === 'AbortError') return null
    if (typeof message === 'string' && message.toLowerCase().includes('abortederror')) return null
    if (typeof message === 'string' && message.toLowerCase().includes('the operation was aborted')) return null
    if (typeof message === 'string' && message.toLowerCase().includes('signal is aborted')) return null

    return event
  },
})

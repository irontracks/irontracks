import * as Sentry from "@sentry/nextjs"

Sentry.init({
  dsn: "https://910aedd6d0464ce76c8599d29ca3368b@o4511127064412160.ingest.us.sentry.io/4511127085842432",
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  sendDefaultPii: true,
  integrations: [
    Sentry.replayIntegration(),
  ],
})

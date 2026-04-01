import * as Sentry from "@sentry/nextjs"

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,

  // 20% das transações em produção para não estourar cota; 100% em outros ambientes
  tracesSampleRate: process.env.NEXT_PUBLIC_VERCEL_ENV === "production" ? 0.2 : 1.0,

  sendDefaultPii: false,
})

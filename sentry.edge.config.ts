import * as Sentry from "@sentry/nextjs"
import { scrubSentryEvent } from "@/utils/sentryScrub"

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // VERCEL_ENV é a variável de sistema do Vercel (server-only). Fallback para
  // NEXT_PUBLIC_VERCEL_ENV (adicionada manualmente no Vercel) ou "development".
  environment: process.env.VERCEL_ENV ?? process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,

  // 20% das transações em produção para não estourar cota; 100% em outros ambientes
  tracesSampleRate: (process.env.VERCEL_ENV ?? process.env.NEXT_PUBLIC_VERCEL_ENV) === "production" ? 0.2 : 1.0,

  // Equivalente exato ao antigo `sendDefaultPii: false` (deprecated em 10.57+,
  // removido na v11). Não envia PII por padrão: IP/user-agent/headers/cookies/
  // query params filtrados, sem corpos de request/response, sem user info,
  // sem I/O de IA. (LGPD)
  dataCollection: {
    userInfo: false,
    cookies: { deny: ["forwarded", "-ip", "remote-", "via", "-user"] },
    httpHeaders: {
      request: { deny: ["forwarded", "-ip", "remote-", "via", "-user"] },
      response: { deny: ["forwarded", "-ip", "remote-", "via", "-user"] },
    },
    httpBodies: [],
    queryParams: { deny: ["forwarded", "-ip", "remote-", "via", "-user"] },
    genAI: { inputs: false, outputs: false },
    stackFrameVariables: true,
    frameContextLines: 7,
  },

  // Redige tokens/segredos das mensagens e das variáveis locais (stackFrameVariables)
  // antes de enviar — evita vazar access_token/refresh_token pro Sentry (LGPD).
  beforeSend: scrubSentryEvent,
})

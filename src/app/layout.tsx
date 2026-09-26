import type { ReactNode } from 'react'
import type { Metadata, Viewport } from 'next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { Analytics } from '@vercel/analytics/next'

/**
 * Root layout do domínio — envolve a LANDING (`(landing)/`) E o APP (`app/`).
 *
 * Por envolver os dois, aqui só entra o que é dos dois: `<html>/<body>`,
 * `metadataBase`, `manifest`, ícones e SpeedInsights/Analytics. Nada de CSS,
 * fonte ou `<style>` de um lado só — em 26/09/2026 (fase 3 da migração
 * raiz↔/comercial) o CSS da landing morou aqui por ~40 min e vazou para todas
 * as páginas do app: `html, body { height: auto !important }` por cima do
 * `height: 100%` do app, e as fontes do Google que o app removeu de propósito
 * (CSP + IP do usuário). O que é da landing vive em `(landing)/layout.tsx`; o
 * que é do app, em `app/layout.tsx`.
 *
 * Sem classe do Tailwind no `<body>`: o Tailwind só carrega dentro do app (via
 * `app/globals.css`) — na landing a classe seria letra morta.
 *
 * Guard: src/__tests__/cspPreconnectFontes.test.ts.
 */

export const metadata: Metadata = {
  title: 'IronTracks — O app de treino que funciona de verdade',
  description: 'Treinos avançados, Coach IA, Cardio GPS, Diário Nutricional e comunidade. Gratuito para iOS, Android e Web.',
  metadataBase: new URL('https://irontracks.com.br'),
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icone-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icone-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: ['/icone-192.png'],
    apple: [{ url: '/icone-192.png', sizes: '192x192', type: 'image/png' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="icon" href="/icone-192.png" sizes="192x192" type="image/png" />
        <link rel="icon" href="/icone-512.png" sizes="512x512" type="image/png" />
        <link rel="apple-touch-icon" href="/icone-192.png" />
      </head>
      <body
        suppressHydrationWarning
        style={{ margin: 0, background: '#0a0a0a', WebkitTapHighlightColor: 'transparent' }}
      >
        {children}
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  )
}

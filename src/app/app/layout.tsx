import "./globals.css";
import PlatformBodyClass from "@/components/PlatformBodyClass"
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import PerformanceReporter from "@/components/PerformanceReporter";
import SessionRecovery from "@/components/auth/SessionRecovery";
import AppLoadingOverlay from "@/components/AppLoadingOverlay";
import type { ReactNode } from 'react';
import { headers } from 'next/headers'
import { ToastProvider } from '@/contexts/ToastContext'
import { Inter } from 'next/font/google'
import Script from 'next/script'

/**
 * Layout do app (fase 3 da migração raiz↔/comercial, 26/09/2026).
 *
 * Até aqui este arquivo era `src/app/layout.tsx` — o ROOT layout de verdade,
 * com `<html>/<head>/<body>` completos. Com a landing subindo pra raiz, o
 * Next só permite UM root layout na árvore inteira (o da rota-raiz de
 * verdade, hoje em `src/app/layout.tsx`), então este virou layout ANINHADO:
 * sem `<html>/<head>/<body>` — as classes que viviam no `<body>` migraram pra
 * uma `<div>` de topo, e os `<link>` de favicon/preconnect saíram (React 19
 * faz hoisting de `<link>`/`<meta>` renderizados em qualquer nível da árvore
 * pro `<head>` real, que agora é o do root layout da raiz — mas o elemento
 * `<head>` em si só pode existir lá). `metadata`/`viewport` continuam válidos
 * aqui: o Next faz merge com os da raiz.
 *
 * `<SpeedInsights>`/`<Analytics>` subiram pro root layout novo (cobrem o
 * domínio inteiro agora). Favicon/ícones e `manifest` também vieram daqui pra
 * lá — o app e a landing os compartilham.
 */

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  // `opsz` = eixo ÓPTICO da Inter v4. Sem pedi-lo, o navegador usa o mesmo
  // desenho de letra em 32px e em 9px — e o app tem ~800 pontos com peso 900
  // em texto de 9–11px, onde os contraforms (os vazios do a, e, o) fecham e a
  // palavra vira mancha. Com o eixo carregado, `font-optical-sizing: auto`
  // (globals.css) abre esses vazios no tamanho pequeno e fecha o espacejamento
  // no grande. É o único conserto que alcança todos os 800 de uma vez.
  axes: ['opsz'],
})

export const metadata = {
  title: "IronTracks - Alta Performance",
  description: "Track your workouts and progress with IronTracks.",
  openGraph: {
    title: "IronTracks - Alta Performance",
    description: "Track your workouts and progress with IronTracks.",
    url: "https://irontracks.com.br/app",
    siteName: "IronTracks",
    type: "website",
    images: [
      {
        url: "/app/opengraph-image",
        width: 1200,
        height: 630,
        alt: "IronTracks",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "IronTracks - Alta Performance",
    description: "Track your workouts and progress with IronTracks.",
    images: ["/app/opengraph-image"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "IronTracks",
  },
};

export default async function AppLayout({ children }: { children: ReactNode }) {
  const headersList = await headers()
  const nonce = headersList?.get ? (headersList.get('x-nonce') || '') : ''
  return (
    <div className={`${inter.variable} font-sans antialiased bg-neutral-950 text-white`}>
      {process.env.NODE_ENV === 'production' && (
        <Script src="/recovery.js" strategy="afterInteractive" nonce={nonce || undefined} />
      )}
      {/* dns-prefetch/preconnect do app (Supabase, Cloudinary, Gemini) —
          renderizados aqui, o React faz hoisting pro <head> real da raiz.
          SEM preconnect para as fontes do Google: a Inter vem de
          `next/font/google`, que a SELF-HOSPEDA no build. Quem usa Google
          Fonts de verdade é a landing (`src/app/layout.tsx`), que já traz os
          próprios preconnects — duplicar aqui violaria o `connect-src` do CSP
          à toa (medido em 28/08/2026). Guard: cspPreconnectFontes.test.ts. */}
      <link rel="preconnect" href="https://enbueukmvgodngydkpzm.supabase.co" />
      <link rel="dns-prefetch" href="https://enbueukmvgodngydkpzm.supabase.co" />
      <link rel="preconnect" href="https://api.cloudinary.com" />
      <link rel="dns-prefetch" href="https://api.cloudinary.com" />
      <link rel="dns-prefetch" href="https://generativelanguage.googleapis.com" />
      <PlatformBodyClass />
      <AppLoadingOverlay />
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-yellow-500 focus:text-black focus:font-bold focus:rounded-xl focus:outline-none">
        Pular para conteúdo
      </a>
      <ServiceWorkerRegister />
      <SessionRecovery />
      <PerformanceReporter />
      <ToastProvider>
        <main id="main-content">
          {children}
        </main>
      </ToastProvider>
    </div>
  );
}

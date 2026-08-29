import "./globals.css";
import PlatformBodyClass from "@/components/PlatformBodyClass"
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import PerformanceReporter from "@/components/PerformanceReporter";
import SessionRecovery from "@/components/auth/SessionRecovery";
import AppLoadingOverlay from "@/components/AppLoadingOverlay";
import type { ReactNode } from 'react';
import { getErrorMessage } from '@/utils/errorMessage'
import { headers } from 'next/headers'
import { ToastProvider } from '@/contexts/ToastContext'
import { Inter } from 'next/font/google'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { Analytics } from '@vercel/analytics/next'
import Script from 'next/script'

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
  metadataBase: new URL("https://irontracks.com.br"),
  openGraph: {
    title: "IronTracks - Alta Performance",
    description: "Track your workouts and progress with IronTracks.",
    url: "https://irontracks.com.br",
    siteName: "IronTracks",
    type: "website",
    images: [
      {
        url: "/opengraph-image",
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
    images: ["/opengraph-image"],
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "IronTracks",
  },
  icons: {
    icon: [
      { url: "/icone-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icone-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: ["/icone-192.png"],
    apple: [{ url: "/icone-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,     // previne auto-zoom iOS em inputs < 16px
  userScalable: false, // desabilita pinch-to-zoom no webview
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const headersList = await headers()
  const nonce = headersList?.get ? (headersList.get('x-nonce') || '') : ''
  return (
    <html lang="pt-BR">
      <head>
        <link rel="icon" href="/icone-192.png" sizes="192x192" type="image/png" />
        <link rel="icon" href="/icone-512.png" sizes="512x512" type="image/png" />
        <link rel="apple-touch-icon" href="/icone-192.png" />
        <link rel="preconnect" href="https://enbueukmvgodngydkpzm.supabase.co" />
        <link rel="dns-prefetch" href="https://enbueukmvgodngydkpzm.supabase.co" />
        <link rel="preconnect" href="https://api.cloudinary.com" />
        <link rel="dns-prefetch" href="https://api.cloudinary.com" />
        {/* SEM preconnect para as fontes do Google aqui.
            A Inter vem de `next/font/google`, que a SELF-HOSPEDA no build — o
            app não pede nada ao Google em runtime. Quem usa Google Fonts de
            verdade é `/comercial` (Space Grotesk + JetBrains Mono), e o layout
            dela já traz os próprios preconnects.
            Estes eram redundantes para aquela página e inúteis para todas as
            outras, e cobravam duas vezes: `preconnect` é regido por
            `connect-src`, então virava violação de CSP em produção (medida em
            28/08/2026, depois do enforce), e abria conexão com o Google a cada
            carregamento do app — que é IP de usuário entregue à toa. */}
        <link rel="dns-prefetch" href="https://generativelanguage.googleapis.com" />
        {process.env.NODE_ENV === 'production' && (
          <Script src="/recovery.js" strategy="afterInteractive" nonce={nonce || undefined} />
        )}
      </head>
      <body suppressHydrationWarning className={`${inter.variable} font-sans antialiased bg-neutral-950 text-white`}>
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
      </body>
      <SpeedInsights />
      <Analytics />
    </html>
  );
}

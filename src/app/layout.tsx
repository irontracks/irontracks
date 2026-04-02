import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import PerformanceReporter from "@/components/PerformanceReporter";
import SessionRecovery from "@/components/auth/SessionRecovery";
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
    icon: [{ url: "/icone.png", type: "image/png" }],
    shortcut: ["/icone.png"],
    apple: [{ url: "/icone.png", type: "image/png" }],
  },
};

export const viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export const dynamic = 'force-dynamic'

export default async function RootLayout({ children }: { children: ReactNode }) {
  const headersList = await headers()
  const nonce = headersList?.get ? (headersList.get('x-nonce') || '') : ''
  return (
    <html lang="pt-BR">
      <head>
        <link rel="icon" href="/icone.png" type="image/png" />
        <link rel="apple-touch-icon" href="/icone.png" />
        <link rel="preconnect" href="https://enbueukmvgodngydkpzm.supabase.co" />
        <link rel="dns-prefetch" href="https://enbueukmvgodngydkpzm.supabase.co" />
        <link rel="preconnect" href="https://api.cloudinary.com" />
        <link rel="dns-prefetch" href="https://api.cloudinary.com" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://fonts.googleapis.com" />
        <link rel="dns-prefetch" href="https://generativelanguage.googleapis.com" />
        {process.env.NODE_ENV === 'production' && (
          <Script src="/recovery.js" strategy="afterInteractive" nonce={nonce || undefined} />
        )}
      </head>
      <body suppressHydrationWarning className={`${inter.variable} font-sans antialiased bg-neutral-950 text-white`}>
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

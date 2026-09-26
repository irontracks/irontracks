import type { ReactNode } from 'react'
import type { Metadata, Viewport } from 'next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { Analytics } from '@vercel/analytics/next'

/**
 * Root layout do domínio (fase 3 da migração raiz↔/comercial, 26/09/2026).
 *
 * Até aqui este arquivo era `src/app/comercial/layout.tsx` — um layout
 * ANINHADO, sem `<html>/<body>`, porque a raiz de verdade era o app
 * (`src/app/layout.tsx` antigo, hoje em `src/app/app/layout.tsx`). Com a
 * landing subindo pra raiz, ele é quem precisa declarar `<html>/<body>` —
 * o Next só permite UM root layout, o da rota-raiz verdadeira.
 *
 * `metadataBase`, `manifest` e os ícones vieram do root layout antigo (o app
 * precisa deles tanto quanto a landing). `SpeedInsights`/`Analytics` também
 * sobem pra cá — cobrem o domínio inteiro agora, landing incluída, que antes
 * não tinha nenhum dos dois.
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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- App Router layout: correct place for route-scoped fonts */}
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <style dangerouslySetInnerHTML={{
          __html: `
            html, body {
              height: auto !important;
              min-height: 100dvh !important;
              overflow-x: hidden !important;
              overflow-y: visible !important;
            }

            /* Live dot pulse */
            @keyframes com-livedot {
              0%, 100% { opacity: 1; transform: scale(1); }
              50% { opacity: 0.4; transform: scale(0.85); }
            }
            .com-live { animation: com-livedot 1.5s ease infinite; }

            /* Hero underline */
            @keyframes com-underline {
              from { transform: scaleX(0); }
              to { transform: scaleX(1); }
            }
            .com-hero-underline { display: inline-block; position: relative; }
            .com-hero-underline::after {
              content: '';
              display: block;
              height: 5px;
              background: #F5B800;
              border-radius: 3px;
              transform-origin: left;
              animation: com-underline 0.9s ease 0.6s both;
            }

            /* Wearables pulse rings */
            @keyframes com-pulsering {
              0% { transform: scale(1); opacity: 0.5; }
              100% { transform: scale(1.7); opacity: 0; }
            }
            .com-pulse   { animation: com-pulsering 2s ease-out infinite; }
            .com-pulse-2 { animation: com-pulsering 2s ease-out 0.65s infinite; }
            .com-pulse-3 { animation: com-pulsering 2s ease-out 1.3s infinite; }

            /* Feature cards hover */
            .com-feat {
              position: relative;
              transition: transform 0.3s ease, border-color 0.3s ease;
              border-radius: 16px;
              overflow: hidden;
            }
            .com-feat::after {
              content: '';
              position: absolute;
              inset: 0;
              border-radius: 16px;
              background: radial-gradient(
                circle at var(--mx, 50%) var(--my, 50%),
                rgba(245,184,0,0.09) 0%,
                transparent 60%
              );
              pointer-events: none;
              opacity: 0;
              transition: opacity 0.3s;
            }
            .com-feat:hover::after { opacity: 1; }
            .com-feat:hover {
              border-color: rgba(245,184,0,0.28) !important;
              transform: translateY(-4px);
            }

            /* Bento grid responsive */
            /* Card de feature com imagem: UMA coluna no celular.
               O grid interno era grid-template-columns: 1fr 1fr em style
               INLINE, e inline nenhuma media query alcança — então em mobile o
               card de 335px ficava dividido em duas faixas de 167px. Medido em
               375px de viewport: o parágrafo caía para 119px de largura (36% do
               card) e quebrava em duas ou três palavras por linha, com a coluna
               da imagem espremida ao lado. O grid EXTERNO (.com-bento) já era
               mobile-first; só o de dentro não era.
               ATENÇÃO: este CSS vive num template literal — crase aqui dentro
               encerra a string e quebra o build (aconteceu ao escrever isto). */
            .com-feat-split {
              display: grid;
              grid-template-columns: 1fr;
              /* 300px, não 190: o print é retrato (295x640) e entra com
                 object-fit: cover / position top. Numa faixa baixa o recorte
                 mostra só a barra de status do iPhone — preta — e o card parece
                 vazio. Medido: a 300px vê-se ~41% da altura do print, que é
                 header + primeiros cards do app. */
              grid-template-rows: auto 300px;
              overflow: hidden;
            }
            @media (min-width: 700px) {
              .com-feat-split {
                grid-template-columns: 1fr 1fr;
                grid-template-rows: 1fr;
              }
            }

            .com-bento {
              display: grid;
              grid-template-columns: 1fr;
              gap: 14px;
            }
            @media (min-width: 900px) {
              .com-bento { grid-template-columns: repeat(12, 1fr); }
              .com-bento-8 { grid-column: span 8; }
              .com-bento-4 { grid-column: span 4; }
              .com-bento-6 { grid-column: span 6; }
            }

            /* Hero grid responsive */
            .com-hero-grid {
              display: grid;
              grid-template-columns: 1fr;
              gap: 48px;
              align-items: center;
              max-width: 1320px;
              margin: 0 auto;
              padding: 110px 20px 80px;
              min-height: 100vh;
            }
            @media (min-width: 860px) {
              .com-hero-grid {
                grid-template-columns: 1.15fr 0.85fr;
                padding: 110px 28px 80px;
              }
            }
            .com-hero-side {
              display: none;
            }
            @media (min-width: 860px) {
              .com-hero-side { display: flex; flex-direction: column; gap: 14px; }
            }

            /* Showcase grid */
            .com-showcase {
              display: flex;
              flex-direction: column;
              gap: 48px;
            }
            @media (min-width: 900px) {
              .com-showcase {
                display: grid;
                grid-template-columns: auto 1fr;
                gap: 64px;
                align-items: start;
              }
            }

            /* Wearables grid */
            .com-wearable-grid {
              display: flex;
              flex-direction: column;
              gap: 48px;
            }
            @media (min-width: 900px) {
              .com-wearable-grid {
                display: grid;
                grid-template-columns: 1fr auto;
                gap: 64px;
                align-items: center;
              }
            }

            /* Showcase tab */
            .com-tab {
              display: flex;
              align-items: center;
              gap: 12px;
              padding: 12px 16px;
              border-radius: 10px;
              border: 1px solid rgba(255,255,255,0.06);
              background: transparent;
              color: rgba(245,245,245,0.5);
              cursor: pointer;
              transition: all 0.2s;
              text-align: left;
              width: 100%;
              font-family: inherit;
            }
            .com-tab:hover {
              background: rgba(255,255,255,0.04);
              color: rgba(245,245,245,0.8);
            }
            .com-tab.on {
              background: rgba(245,184,0,0.08) !important;
              border-color: rgba(245,184,0,0.28) !important;
              color: #F5B800 !important;
            }
            .com-tab.on .com-tab-num {
              color: #F5B800 !important;
            }

            /* Scrollbar hidden for ticker */
            .com-ticker-wrap { scrollbar-width: none; }
            .com-ticker-wrap::-webkit-scrollbar { display: none; }
          `
        }} />
      </head>
      <body
        suppressHydrationWarning
        className="antialiased bg-black text-white"
        // A landing não importa `globals.css` (exclusivo do app, evita trazer
        // as utilities do app pro bundle da landing) — antes ela herdava isso
        // do root layout antigo por tabela. Só o que a landing de fato usa.
        style={{ WebkitTapHighlightColor: 'transparent' }}
      >
        {children}
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  )
}

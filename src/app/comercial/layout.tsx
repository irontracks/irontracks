import type { ReactNode } from 'react'

export default function ComercialLayout({ children }: { children: ReactNode }) {
  return (
    <>
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
      {children}
    </>
  )
}

import type { ReactNode } from 'react'
import { Inter, JetBrains_Mono, Space_Grotesk } from 'next/font/google'
import './landing.css'

/**
 * Layout da LANDING (raiz do domínio).
 *
 * Mora num grupo de rotas `(landing)` (não muda a URL: `/` continua `/`) para
 * que CSS e fontes daqui NÃO cheguem ao app. Em 26/09/2026 o CSS da landing
 * morou por ~40 min no layout raiz, que envolve também `/app/*`, e vazou para
 * todas as páginas do app (`html, body { height: auto !important }` e as fontes
 * do Google). Guard: src/__tests__/cspPreconnectFontes.test.ts.
 *
 * Fontes por `next/font`: são baixadas no BUILD e servidas pelo próprio site —
 * o navegador do visitante não fala com o Google (o que antes exigia
 * `preconnect` e uma folha externa).
 */

const display = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--lf-display',
  display: 'swap',
})

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--lf-mono',
  display: 'swap',
})

const body = Inter({
  subsets: ['latin'],
  variable: '--lf-body',
  display: 'swap',
})

export default function LandingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* Mexe no DOCUMENTO, por isso num <style> que desmonta com a landing (e
          não no landing.css, que pode sobrar no documento após ir para /app).
          A landing rola o documento inteiro; se o usuário chegar aqui vindo do
          app, o `height: 100%` do CSS do app não pode prender a rolagem.
          `overflow-x: clip`, NÃO `hidden`: `hidden` no html/body transforma o
          body em contêiner de rolagem e quebra o `position: sticky` (o vídeo
          de "Como funciona" subia junto com a página — visto no navegador). */}
      <style
        dangerouslySetInnerHTML={{
          __html:
            'html, body { height: auto !important; min-height: 100dvh !important; overflow-x: clip !important; overflow-y: visible !important; background: #050505; }',
        }}
      />
      <div className={`${display.variable} ${mono.variable} ${body.variable} bg-ink font-sans text-white antialiased`}>
        {children}
      </div>
    </>
  )
}

import type { ReactNode } from 'react'

/**
 * Layout for /comercial — overrides the global `html, body { height: 100% }`
 * rule from globals.css which turns body into a viewport-height scroll container.
 * The marketing page needs natural document flow so sections scroll correctly.
 */
export default function ComercialLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* Scoped override: restore natural document flow for this route */}
      <style dangerouslySetInnerHTML={{ __html: `
        html, body {
          height: auto !important;
          min-height: 100dvh !important;
          overflow-x: hidden !important;
          overflow-y: visible !important;
        }
      ` }} />
      {children}
    </>
  )
}

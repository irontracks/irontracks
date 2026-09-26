export function AppleIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  )
}

export function PlayIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M3.18 23.76c.3.17.65.2.99.1L14.08 12 3.18.14c-.34-.1-.69-.07-.99.1C1.61.64 1.22 1.4 1.22 2.3v19.4c0 .9.39 1.66 1 2.06z" fill="#4285F4" />
      <path d="M17.97 15.79l2.76-1.6c.77-.44.77-1.14 0-1.58l-2.76-1.6-3.5 3.39 3.5 3.39z" fill="#FBBC04" />
      <path d="M3.18 23.76l10.9-11.76L3.18.14a1.19 1.19 0 0 0-.96.48l10.9 11.38L3.18 23.76z" fill="#34A853" />
      <path d="M3.18.14l10.9 11.76 3.89-3.76L6.1.24c-.93-.54-2.1-.46-2.92.1z" fill="#EA4335" />
    </svg>
  )
}

export function GlobeIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9M12 3C9.5 5.7 8.2 8.7 8.2 12s1.3 6.3 3.8 9" strokeLinecap="round" />
    </svg>
  )
}

export function StarIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8L12 2.5z" />
    </svg>
  )
}

export function ArrowIcon({ className = 'h-5 w-5', direcao = 'direita' }: { className?: string; direcao?: 'direita' | 'esquerda' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={direcao === 'esquerda' ? { transform: 'scaleX(-1)' } : undefined}
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

export function CrownIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 11H5L3 7zm2 13h14v2H5v-2z" />
    </svg>
  )
}

export function WatchIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="3.5" />
      <path d="M9 6l.6-3h4.8l.6 3M9 18l.6 3h4.8l.6-3M12 9.5V12l1.8 1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function WifiOffIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className={className} aria-hidden="true">
      <path d="M3 3l18 18M8.5 16.4a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 4.2-2.4M19 12.9a10 10 0 0 0-2.1-1.6M2 9.4A15 15 0 0 1 7 6.6M22 9.4a15 15 0 0 0-9.8-3.9" />
      <circle cx="12" cy="19.5" r="1" fill="currentColor" />
    </svg>
  )
}

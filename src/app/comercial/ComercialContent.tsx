'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Globe, Star } from 'lucide-react'

const APPLE = 'https://apps.apple.com/br/app/irontracks/id6758735356'
// Android em teste FECHADO (faixa Alpha) via Grupo do Google com entrada livre.
// O testador entra no grupo (sem aprovação) e depois abre o opt-in pra virar testador.
const GROUP = 'https://groups.google.com/g/irontracks-beta'
const PLAY  = 'https://play.google.com/apps/testing/com.irontracks.app'
const PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.irontracks.app'
const WEB   = 'https://irontracks.com.br'

// ── Reveal wrapper ──────────────────────────────────────────────────────────
function Reveal({
  children,
  delay = 0,
  style,
  className,
}: {
  children: React.ReactNode
  delay?: number
  style?: React.CSSProperties
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) { setVisible(true); io.disconnect() }
      },
      { threshold: 0.12 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={className}
      style={{
        ...style,
        opacity: visible ? 1 : 0,
        transform: visible ? 'none' : 'translateY(36px)',
        transition: `opacity 0.65s ease ${delay}ms, transform 0.65s ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  )
}

// ── Inline SVG icons ────────────────────────────────────────────────────────
function AppleSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 20, height: 20 }}>
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  )
}

function PlaySvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" style={{ width: 20, height: 20 }}>
      <path d="M3.18 23.76c.3.17.65.2.99.1L14.08 12 3.18.14c-.34-.1-.69-.07-.99.1C1.61.64 1.22 1.4 1.22 2.3v19.4c0 .9.39 1.66 1 2.06z" fill="#4285F4" />
      <path d="M17.97 15.79l2.76-1.6c.77-.44.77-1.14 0-1.58l-2.76-1.6-3.5 3.39 3.5 3.39z" fill="#FBBC04" />
      <path d="M3.18 23.76l10.9-11.76L3.18.14a1.19 1.19 0 0 0-.96.48l10.9 11.38L3.18 23.76z" fill="#34A853" />
      <path d="M3.18.14l10.9 11.76 3.89-3.76L6.1.24c-.93-.54-2.1-.46-2.92.1z" fill="#EA4335" />
    </svg>
  )
}

function DumbbellSvg() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 6.5l11 11" /><path d="M4 9l2-2 3 3-2 2z" /><path d="M15 17l2-2 3 3-2 2z" />
      <path d="M2 11l2 2" /><path d="M20 11l2 2" />
    </svg>
  )
}
function ChartSvg() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 6-7" />
    </svg>
  )
}
function GpsSvg() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s7-7.5 7-12a7 7 0 10-14 0c0 4.5 7 12 7 12z" /><circle cx="12" cy="9" r="2.4" />
    </svg>
  )
}
function FlameSvg() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3c2 3 4 5 4 8a4 4 0 01-8 0c0-1 .3-2 1-3-.5 4 1 5 1 5s-.5-3 2-10z" />
    </svg>
  )
}
function UsersSvg() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3" /><path d="M3 21c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="7" r="2.5" /><path d="M15 15c2-1 6 .5 6 4" />
    </svg>
  )
}
function BrainSvg() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 4a3 3 0 00-3 3 3 3 0 00-2 3 3 3 0 001 2v1a3 3 0 003 3h1v4h4v-4h1a3 3 0 003-3v-1a3 3 0 001-2 3 3 0 00-2-3 3 3 0 00-3-3 3 3 0 00-4 0z" />
    </svg>
  )
}

// ── NAV ─────────────────────────────────────────────────────────────────────
function Nav() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '16px 28px',
      background: scrolled ? 'rgba(7,7,7,0.72)' : 'transparent',
      backdropFilter: scrolled ? 'blur(14px)' : 'none',
      borderBottom: scrolled ? '1px solid rgba(255,255,255,0.08)' : '1px solid transparent',
      transition: 'background 0.3s, backdrop-filter 0.3s, border-color 0.3s',
    }}>
      <Link href={WEB} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
        <Image src="/logo-irontracks.png" alt="IronTracks" width={30} height={30} style={{ borderRadius: 8 }} />
        <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 16, color: '#f5f5f5', letterSpacing: '-0.02em' }}>
          IRON<em style={{ fontStyle: 'italic' }}>TRACKS</em>
        </span>
      </Link>

      <div className="hidden md:flex items-center" style={{ gap: 32 }}>
        {[
          { label: 'Features', href: '#features' },
          { label: 'App', href: '#showcase' },
          { label: 'Wearables', href: '#wearables' },
        ].map(l => (
          <a key={l.label} href={l.href} style={{
            color: 'rgba(245,245,245,0.6)', fontSize: 14, textDecoration: 'none',
            fontWeight: 500, transition: 'color 0.2s',
          }}
            onMouseEnter={e => { e.currentTarget.style.color = '#f5f5f5' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(245,245,245,0.6)' }}
          >{l.label}</a>
        ))}
      </div>

      <a href="#download" style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 20px', borderRadius: 12,
        background: 'linear-gradient(135deg, #FFD34D 0%, #F5B800 40%, #FF7A1A 100%)',
        color: '#000', fontWeight: 700, fontSize: 14,
        textDecoration: 'none', fontFamily: '"Space Grotesk", sans-serif',
      }}>
        Baixar grátis <ArrowRight size={14} />
      </a>
    </nav>
  )
}

// ── HERO ─────────────────────────────────────────────────────────────────────
function HudCard({ label, badge, imgSrc, imgAlt, imgPosition }: {
  label: string; badge: string; imgSrc: string; imgAlt: string; imgPosition: string
}) {
  return (
    <div style={{
      borderRadius: 16, border: '1px solid rgba(255,255,255,0.1)',
      background: '#0d0d0d', overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, letterSpacing: '0.08em', color: '#F5B800', fontWeight: 600 }}>
          {label}
        </span>
        <span style={{
          padding: '3px 10px', borderRadius: 999,
          background: 'linear-gradient(135deg, #FF7A1A, #F5B800)',
          color: '#000', fontFamily: '"JetBrains Mono", monospace', fontSize: 10, fontWeight: 700,
        }}>{badge}</span>
      </div>
      <div style={{ position: 'relative' }}>
        <Image src={imgSrc} alt={imgAlt} width={480} height={260}
          style={{ width: '100%', height: 260, objectFit: 'cover', objectPosition: imgPosition, display: 'block' }} />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.45) 0%, transparent 25%, transparent 75%, rgba(7,7,7,0.9) 100%)',
          pointerEvents: 'none',
        }} />
      </div>
    </div>
  )
}

function Hero({ onAndroidClick }: { onAndroidClick: () => void }) {
  return (
    <section className="com-hero-grid">
      {/* Left column */}
      <div>
        {/* Kicker */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '8px 16px', borderRadius: 999, marginBottom: 28,
          border: '1px solid rgba(245,184,0,0.22)', background: 'rgba(245,184,0,0.06)',
        }}>
          <span className="com-live" style={{ width: 8, height: 8, borderRadius: '50%', background: '#2AE870', flexShrink: 0, display: 'block' }} />
          <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#F5B800' }}>
            SEM DESCULPAS · SEM PREGUIÇA
          </span>
        </div>

        {/* Title */}
        <h1 style={{
          fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700,
          lineHeight: 1.0, fontSize: 'clamp(48px, 8.4vw, 118px)',
          margin: '0 0 24px', letterSpacing: '-0.03em',
        }}>
          Pare de<br />
          <span className="com-hero-underline">treinar</span><br />
          <span style={{ color: '#F5B800' }}>feito amador.</span>
        </h1>

        {/* Subtitle */}
        <p style={{
          fontSize: 'clamp(16px, 1.5vw, 18px)', color: 'rgba(245,245,245,0.65)',
          lineHeight: 1.65, marginBottom: 40, maxWidth: 500,
        }}>
          Cansou de planilha no papel e app que trava? O IronTracks não é um diário bonitinho. É a ferramenta de quem leva ferro a sério — e vai bater o próximo PR.
        </p>

        {/* CTAs */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <Link href={APPLE} style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            padding: '14px 22px', borderRadius: 14,
            background: 'linear-gradient(135deg, #FFD34D 0%, #F5B800 40%, #FF7A1A 100%)',
            color: '#000', textDecoration: 'none', fontWeight: 700,
          }}>
            <AppleSvg />
            <span>
              <small style={{ display: 'block', fontSize: 10, opacity: 0.65 }}>Baixar na</small>
              <strong style={{ fontSize: 15 }}>App Store</strong>
            </span>
          </Link>
          <button onClick={onAndroidClick} style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            padding: '14px 22px', borderRadius: 14, cursor: 'pointer',
            border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.04)',
            color: '#f5f5f5', fontWeight: 600,
          }}>
            <PlaySvg />
            <span>
              <small style={{ display: 'block', fontSize: 10, opacity: 0.65 }}>Disponível no</small>
              <strong style={{ fontSize: 15 }}>Google Play</strong>
            </span>
          </button>
          <Link href={WEB} style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            padding: '14px 22px', borderRadius: 14,
            border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.04)',
            color: '#f5f5f5', textDecoration: 'none', fontWeight: 600,
          }}>
            <Globe size={18} style={{ color: '#F5B800' }} />
            <span>
              <small style={{ display: 'block', fontSize: 10, opacity: 0.65 }}>Usar no</small>
              <strong style={{ fontSize: 15 }}>Navegador</strong>
            </span>
          </Link>
        </div>
      </div>

      {/* Right column — HUD cards (desktop only) */}
      <div className="com-hero-side">
        <HudCard label="IRON RANK · NOVOS RECORDES" badge="🔥 5d streak"
          imgSrc="/screenshot/IMG_7427.PNG" imgAlt="IronTracks Dashboard" imgPosition="center 38%" />
        <HudCard label="MAPA MUSCULAR · SEMANA" badge="5 treinos"
          imgSrc="/screenshot/IMG_7428.PNG" imgAlt="Mapa Muscular IronTracks" imgPosition="center 62%" />
      </div>
    </section>
  )
}

// ── TICKER ───────────────────────────────────────────────────────────────────
function Ticker() {
  const trackRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const timer = setTimeout(() => {
      const halfW = el.scrollWidth / 2
      const dur = (halfW / 25) * 1000
      el.animate(
        [{ transform: 'translate3d(0,0,0)' }, { transform: `translate3d(-${halfW}px,0,0)` }],
        { duration: dur, iterations: Infinity, easing: 'linear' }
      )
    }, 300)
    return () => clearTimeout(timer)
  }, [])

  const base = [
    { t: 'NOVO PR', hot: true }, { t: '×', sep: true },
    { t: 'DEADLIFT 180kg' }, { t: '×', sep: true },
    { t: 'SUPINO 120kg' }, { t: '×', sep: true },
    { t: 'DROP SET', hot: true }, { t: '×', sep: true },
    { t: 'AGACHAMENTO 140kg' }, { t: '×', sep: true },
    { t: 'HEAVY DUTY' }, { t: '×', sep: true },
    { t: 'BARRA FIXA 22', hot: true }, { t: '×', sep: true },
    { t: 'AMRAP +2' }, { t: '×', sep: true },
  ]
  const items = [...base, ...base]

  return (
    <div style={{
      overflow: 'hidden', height: 68, background: '#000',
      display: 'flex', alignItems: 'center',
      borderTop: '1px solid rgba(255,255,255,0.06)',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div ref={trackRef} style={{ display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
        {items.map((item, i) => (
          <span key={i} style={{
            padding: '0 18px',
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 13, letterSpacing: '0.06em',
            fontWeight: item.hot ? 700 : 500,
            color: item.hot ? '#F5B800' : item.sep ? 'rgba(255,255,255,0.18)' : 'rgba(245,245,245,0.6)',
          }}>{item.t}</span>
        ))}
      </div>
    </div>
  )
}

// ── MANIFESTO ────────────────────────────────────────────────────────────────
function Manifesto() {
  const ref = useRef<HTMLElement>(null)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const onScroll = () => {
      const el = ref.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const vh = window.innerHeight
      const total = rect.height + vh
      const passed = Math.min(Math.max((vh - rect.top) / total, 0), 1)
      setProgress(passed)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const words = ['Enquanto você', 'procura desculpa,', 'outro está', 'batendo seu PR.']
  const lit = Math.floor(progress * words.length * 2.5)

  return (
    <section ref={ref} style={{ padding: '120px 20px', textAlign: 'center' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <span style={{
          fontFamily: '"JetBrains Mono", monospace', fontSize: 11, letterSpacing: '0.15em',
          textTransform: 'uppercase', color: 'rgba(245,245,245,0.28)', display: 'block', marginBottom: 48,
        }}>{'// manifesto'}</span>
        <div style={{
          fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700,
          fontSize: 'clamp(46px, 7.5vw, 116px)', lineHeight: 1.06, letterSpacing: '-0.03em',
        }}>
          {words.map((w, i) => (
            <span key={i} style={{
              display: 'block',
              color: i === words.length - 1 ? '#F5B800' : i <= lit ? '#f5f5f5' : 'rgba(245,245,245,0.12)',
              transition: 'color 0.45s ease',
            }}>{w}</span>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── FEATURE BENTO GRID ───────────────────────────────────────────────────────
function FeatCard({
  span, num, icon, title, desc, imgSrc, imgPos, big, children,
}: {
  span: 4 | 6 | 8
  num: string
  icon: React.ReactNode
  title: string
  desc: string
  imgSrc?: string
  imgPos?: string
  big?: boolean
  children?: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${e.clientX - r.left}px`)
    el.style.setProperty('--my', `${e.clientY - r.top}px`)
  }

  const baseStyle: React.CSSProperties = {
    background: '#141414',
    border: '1px solid rgba(255,255,255,0.08)',
    minHeight: big ? 340 : 280,
  }

  const textContent = (
    <div style={{ padding: '24px 24px 16px', flexShrink: 0 }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(245,184,0,0.1)', border: '1px solid rgba(245,184,0,0.2)', color: '#F5B800', marginBottom: 16,
      }}>{icon}</div>
      <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: 'rgba(245,245,245,0.3)', letterSpacing: '0.1em', marginBottom: 10 }}>
        {num} — IronTracks
      </div>
      <h3 style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 18, lineHeight: 1.25, margin: '0 0 10px', letterSpacing: '-0.015em' }}>
        {title}
      </h3>
      <p style={{ fontSize: 14, color: 'rgba(245,245,245,0.55)', lineHeight: 1.6, margin: 0 }}>{desc}</p>
    </div>
  )

  if (big && imgSrc) {
    return (
      <div ref={ref}
        className={`com-feat com-bento-${span}`}
        onMouseMove={onMouseMove}
        style={{ ...baseStyle, display: 'grid', gridTemplateColumns: '1fr 1fr', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {textContent}
        </div>
        <div style={{ position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 48, background: 'linear-gradient(90deg, #141414, transparent)', zIndex: 1, pointerEvents: 'none' }} />
          <Image src={imgSrc} alt={title} fill sizes="(max-width: 768px) 50vw, 33vw" style={{ objectFit: 'cover', objectPosition: imgPos ?? 'top' }} />
        </div>
      </div>
    )
  }

  return (
    <div ref={ref}
      className={`com-feat com-bento-${span}`}
      onMouseMove={onMouseMove}
      style={{ ...baseStyle, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      {textContent}
      {children && (
        <div style={{ position: 'relative', flex: 1, minHeight: 150, overflow: 'hidden' }}>
          {children}
        </div>
      )}
      {imgSrc && !big && (
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative', minHeight: 160 }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 48, background: 'linear-gradient(180deg, #141414, transparent)', zIndex: 1, pointerEvents: 'none' }} />
          <Image src={imgSrc} alt={title} fill sizes="(max-width: 768px) 50vw, 33vw" style={{ objectFit: 'cover', objectPosition: imgPos ?? 'top center' }} />
        </div>
      )}
    </div>
  )
}

function ChartViz() {
  return (
    <svg viewBox="0 0 300 160" style={{ position: 'absolute', right: 16, bottom: 16, width: '80%' }}>
      <defs>
        <linearGradient id="gc" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#F5B800" stopOpacity="0.35" />
          <stop offset="1" stopColor="#F5B800" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M0 130 L40 115 L80 98 L120 84 L160 68 L200 52 L240 36 L280 18 L300 12 L300 160 L0 160 Z" fill="url(#gc)" />
      <path d="M0 130 L40 115 L80 98 L120 84 L160 68 L200 52 L240 36 L280 18 L300 12" stroke="#F5B800" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <circle cx="280" cy="18" r="5" fill="#F5B800" />
      <circle cx="280" cy="18" r="11" fill="#F5B800" fillOpacity="0.28" />
    </svg>
  )
}

function MapViz() {
  return (
    <svg viewBox="0 0 400 200" style={{ position: 'absolute', right: 0, bottom: 0, width: '60%' }}>
      <rect width="400" height="200" fill="rgba(255,255,255,0.02)" rx="10" />
      {Array.from({ length: 10 }).map((_, i) => (
        <line key={`v${i}`} x1={i * 40} y1="0" x2={i * 40} y2="200" stroke="rgba(255,255,255,0.04)" />
      ))}
      {Array.from({ length: 5 }).map((_, i) => (
        <line key={`h${i}`} x1="0" y1={i * 40} x2="400" y2={i * 40} stroke="rgba(255,255,255,0.04)" />
      ))}
      <path d="M40 160 Q80 110 140 120 T240 80 T340 40" stroke="#F5B800" strokeWidth="3" fill="none" strokeLinecap="round" strokeDasharray="200 200">
        <animate attributeName="stroke-dashoffset" from="400" to="0" dur="3s" repeatCount="indefinite" />
      </path>
      <circle cx="340" cy="40" r="5" fill="#F5B800" />
      <circle cx="340" cy="40" r="13" fill="#F5B800" fillOpacity="0.25">
        <animate attributeName="r" values="13;20;13" dur="1.6s" repeatCount="indefinite" />
        <animate attributeName="fill-opacity" values="0.3;0;0.3" dur="1.6s" repeatCount="indefinite" />
      </circle>
    </svg>
  )
}

function NutritionViz() {
  return (
    <svg viewBox="0 0 300 160" style={{ position: 'absolute', right: 16, bottom: 16, width: '75%' }}>
      <rect x="10" y="10" width="280" height="140" rx="12" fill="rgba(0,0,0,0.5)" stroke="rgba(245,184,0,0.25)" />
      <text x="28" y="38" fontFamily="JetBrains Mono" fontSize="10" fill="#F5B800" letterSpacing="1.5">SCAN · PROCESSADO</text>
      <text x="28" y="66" fontFamily="Inter" fontSize="13" fill="#fff">Whey Protein</text>
      <text x="280" y="66" fontFamily="JetBrains Mono" fontSize="13" fill="#F5B800" textAnchor="end" fontWeight="700">24g P</text>
      <text x="28" y="92" fontFamily="Inter" fontSize="13" fill="#fff">Carb Complex</text>
      <text x="280" y="92" fontFamily="JetBrains Mono" fontSize="13" fill="#2AE870" textAnchor="end" fontWeight="700">48g C</text>
      <text x="28" y="118" fontFamily="Inter" fontSize="13" fill="#fff">Calorias</text>
      <text x="280" y="118" fontFamily="JetBrains Mono" fontSize="13" fill="rgba(245,245,245,0.8)" textAnchor="end" fontWeight="700">312</text>
    </svg>
  )
}

function FeatureBento() {
  return (
    <section id="features" style={{ padding: '0 20px 120px' }}>
      <div style={{ maxWidth: 1320, margin: '0 auto' }}>
        <Reveal style={{ textAlign: 'center', marginBottom: 60 }}>
          <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(245,245,245,0.28)' }}>
            {'// funcionalidades'}
          </span>
          <h2 style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 'clamp(34px, 4.5vw, 60px)', letterSpacing: '-0.025em', lineHeight: 1.0, margin: '16px 0 16px' }}>
            Feito por quem treina pesado.
          </h2>
          <p style={{ color: 'rgba(245,245,245,0.6)', fontSize: 16, lineHeight: 1.65, maxWidth: 560, margin: '0 auto' }}>
            Sem firula. Cada função foi construída pra funcionar na academia — com a barra na mão, suor nos olhos e 30 segundos de descanso.
          </p>
        </Reveal>

        <div className="com-bento">
          <FeatCard span={8} big num="01" icon={<DumbbellSvg />}
            title="Treinos avançados, do jeito que o ferro pede."
            desc="Drop Set, Rest-Pause, Heavy Duty, Cluster, Mini-Sets. Métodos nativos, descanso rastreado, progressão automática."
            imgSrc="/screenshot/IMG_7431.PNG" imgPos="top" />

          <FeatCard span={4} num="02" icon={<ChartSvg />}
            title="Progresso visual."
            desc="Gráficos por exercício, PRs celebrados em tempo real, histórico infinito.">
            <ChartViz />
          </FeatCard>

          <FeatCard span={6} num="03" icon={<GpsSvg />}
            title="Cardio com GPS real, mapa ao vivo."
            desc="Distância precisa, pace, ritmo cardíaco e rota em OpenStreetMap. Corrida, bike, caminhada.">
            <MapViz />
          </FeatCard>

          <FeatCard span={6} num="04" icon={<FlameSvg />}
            title="Nutrição com IA. Foto o rótulo, pronto."
            desc="A IA lê os macros. Proteína, carboidratos e calorias sem digitar nada.">
            <NutritionViz />
          </FeatCard>

          <FeatCard span={4} num="05" icon={<UsersSvg />}
            title="Social & Desafios."
            desc="Stories, leaderboards, IronRank e treinos em grupo com amigos."
            imgSrc="/screenshot/IMG_7427.PNG" imgPos="top center" />

          <FeatCard span={8} big num="06" icon={<BrainSvg />}
            title="IA que entende seu treino."
            desc="Sugestão de carga, troca inteligente de exercício, geração de treinos personalizados. Contexto: seu histórico real."
            imgSrc="/screenshot/IMG_7430.PNG" imgPos="top" />
        </div>
      </div>
    </section>
  )
}

// ── SHOWCASE ─────────────────────────────────────────────────────────────────
const SCREENS = [
  { src: '/screenshot/IMG_7427.PNG', label: 'Home', title: 'Dashboard que te mostra onde você está.', desc: 'Iron Rank, streak, PRs recentes e atalhos para começar o treino em 1 toque.' },
  { src: '/screenshot/IMG_7430.PNG', label: 'Meus Treinos', title: 'Seus treinos, organizados como você pensa.', desc: 'Split semanal visual. Comece qualquer treino direto da lista. Edite, duplique e reordene.' },
  { src: '/screenshot/IMG_7428.PNG', label: 'Mapa Muscular', title: 'Vê exatamente quais grupos você está negligenciando.', desc: 'Mapa anatômico com intensidade por músculo. Frente, costas, dia, semana.' },
  { src: '/screenshot/IMG_7431.PNG', label: 'Execução', title: 'Um toque registra. Descanso cronometra. PR celebra.', desc: 'Peso, reps, RPE e notas por série. Instruções técnicas do exercício sempre à mão.' },
  { src: '/screenshot/IMG_7432.PNG', label: 'Cardio GPS', title: 'Cardio com mapa ao vivo e métricas em tempo real.', desc: 'Distância, pace, BPM e rota — tudo capturado durante o movimento.' },
  { src: '/screenshot/IMG_7429.PNG', label: 'Iron Rank', title: 'Compete com o mundo. Sobe o ranking.', desc: 'Iron Rank global por volume levantado. Leaderboard real com usuários reais.' },
]

function Showcase() {
  const [active, setActive] = useState(0)
  const cur = SCREENS[active]

  return (
    <section id="showcase" style={{ padding: '0 20px 120px' }}>
      <div style={{ maxWidth: 1320, margin: '0 auto' }}>
        <Reveal style={{ textAlign: 'center', marginBottom: 60 }}>
          <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(245,245,245,0.28)' }}>
            {'// o app'}
          </span>
          <h2 style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 'clamp(34px, 4.5vw, 60px)', letterSpacing: '-0.025em', lineHeight: 1.0, margin: '16px 0 0' }}>
            Abre o app. Treina. <span style={{ color: '#F5B800' }}>Fim.</span>
          </h2>
        </Reveal>

        <div className="com-showcase">
          {/* Phone mockup */}
          <div style={{ display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
            <div style={{ perspective: '1000px' }}>
              <div style={{
                transform: 'rotateY(-14deg) rotateX(6deg)',
                width: 270, height: 584,
                borderRadius: 46,
                border: '2px solid rgba(255,255,255,0.14)',
                background: '#000',
                overflow: 'hidden',
                position: 'relative',
                boxShadow: '0 0 80px rgba(245,184,0,0.18), 0 40px 80px rgba(0,0,0,0.7)',
              }}>
                {SCREENS.map((s, i) => (
                  <div key={s.src} style={{
                    position: i === 0 ? 'relative' : 'absolute',
                    inset: 0, opacity: active === i ? 1 : 0,
                    transition: 'opacity 0.4s ease',
                    width: '100%', height: '100%',
                  }}>
                    <Image src={s.src} alt={s.label} fill sizes="(max-width: 768px) 100vw, 400px" style={{ objectFit: 'cover', objectPosition: 'top' }} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Tabs + description */}
          <div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {SCREENS.map((s, i) => (
                <button key={s.label} className={`com-tab${active === i ? ' on' : ''}`}
                  onClick={() => setActive(i)}>
                  <span className="com-tab-num" style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: 'rgba(245,245,245,0.3)', fontWeight: 600, minWidth: 28 }}>
                    0{i + 1}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{s.label}</span>
                </button>
              ))}
            </div>

            <div style={{ marginTop: 32 }}>
              <h3 style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 'clamp(22px, 2.5vw, 32px)', lineHeight: 1.1, margin: '0 0 12px', letterSpacing: '-0.02em' }}>
                {cur.title}
              </h3>
              <p style={{ color: 'rgba(245,245,245,0.78)', fontSize: 15, lineHeight: 1.7, maxWidth: 480 }}>
                {cur.desc}
              </p>
            </div>

            <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 20 }}>
              {[
                { n: '01', h: 'Registro em 1 toque', p: 'Auto-complete do último peso, rep e RPE. Descansos cronometrados. Notas por série.' },
                { n: '02', h: 'Histórico sem fim', p: 'Cada treino, cada série, cada PR — buscável por exercício, filtrável por período.' },
                { n: '03', h: 'Offline first', p: 'Academia com sinal ruim? Zero problema. Sincroniza depois, sem perder um dado.' },
              ].map(item => (
                <div key={item.n} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: '#F5B800', fontWeight: 700, marginTop: 3, flexShrink: 0 }}>
                    {item.n}
                  </span>
                  <div>
                    <h4 style={{ fontWeight: 700, fontSize: 14, margin: '0 0 4px' }}>{item.h}</h4>
                    <p style={{ fontSize: 13, color: 'rgba(245,245,245,0.5)', margin: 0, lineHeight: 1.6 }}>{item.p}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── WEARABLES ────────────────────────────────────────────────────────────────
function Wearables() {
  const [bpm, setBpm] = useState(142)

  useEffect(() => {
    const id = setInterval(() => setBpm(138 + Math.floor(Math.random() * 10)), 1200)
    return () => clearInterval(id)
  }, [])

  return (
    <section id="wearables" style={{ padding: '120px 20px', background: '#0d0d0d', borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ maxWidth: 1320, margin: '0 auto' }}>
        <div className="com-wearable-grid">
          {/* Text */}
          <Reveal>
            <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(245,245,245,0.28)' }}>
              {'// wearables'}
            </span>
            <h2 style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 'clamp(34px, 4.5vw, 60px)', letterSpacing: '-0.025em', lineHeight: 1.0, margin: '16px 0 20px' }}>
              Seu punho sabe mais<br /><span style={{ color: '#F5B800' }}>que sua desculpa.</span>
            </h2>
            <p style={{ color: 'rgba(245,245,245,0.6)', fontSize: 16, lineHeight: 1.65, maxWidth: 520, marginBottom: 36 }}>
              BPM, FC de repouso, HRV, calorias e passos — do Apple Watch direto pro app, via Apple Health. Tudo sincronizado, sem precisar abrir o relógio.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Apple Watch', sub: '— Series 4+ · WatchOS 9+', active: true },
                { label: 'Apple Health', sub: '— HealthKit · iOS nativo', active: true },
                { label: 'Frequência cardíaca', sub: '— BPM em tempo real', active: true },
                { label: 'HRV & Recuperação', sub: '— SDNN · FC de repouso', active: true },
              ].map(chip => (
                <div key={chip.label} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 10,
                  padding: '10px 16px', borderRadius: 10,
                  border: chip.active ? '1px solid rgba(245,184,0,0.18)' : '1px solid rgba(255,255,255,0.1)',
                  background: chip.active ? 'rgba(245,184,0,0.04)' : 'rgba(255,255,255,0.03)',
                  width: 'fit-content',
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#2AE870', flexShrink: 0 }} />
                  <span style={{ fontSize: 14 }}>
                    <strong>{chip.label}</strong>
                    <span style={{ color: 'rgba(245,245,245,0.5)', fontSize: 13 }}> {chip.sub}</span>
                  </span>
                </div>
              ))}
            </div>
          </Reveal>

          {/* Apple Watch */}
          <Reveal delay={120} style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {/* Pulse rings */}
              <div className="com-pulse" style={{
                position: 'absolute', inset: -28, borderRadius: 76,
                border: '1px solid rgba(245,184,0,0.35)', pointerEvents: 'none',
              }} />
              <div className="com-pulse-2" style={{
                position: 'absolute', inset: -28, borderRadius: 76,
                border: '1px solid rgba(245,184,0,0.35)', pointerEvents: 'none',
              }} />
              <div className="com-pulse-3" style={{
                position: 'absolute', inset: -28, borderRadius: 76,
                border: '1px solid rgba(245,184,0,0.35)', pointerEvents: 'none',
              }} />

              {/* Watch body */}
              <div style={{
                width: 200, height: 228, borderRadius: 52,
                border: '3px solid rgba(255,255,255,0.14)',
                background: 'linear-gradient(180deg, #111 0%, #0a0a0a 100%)',
                overflow: 'hidden', position: 'relative',
                boxShadow: '0 24px 64px rgba(0,0,0,0.8)',
              }}>
                <div style={{ padding: '18px 16px 12px', color: '#f5f5f5' }}>
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', marginBottom: 6 }}>
                    19:42 · CARDIO
                  </div>
                  <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 38, lineHeight: 1, transition: 'all 0.3s' }}>
                    {bpm}
                  </div>
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.1em', marginBottom: 10 }}>
                    BPM · ZONA 4
                  </div>

                  <svg viewBox="0 0 120 120" style={{ width: 76, height: 76, display: 'block', margin: '0 auto' }}>
                    <circle cx="60" cy="60" r="50" stroke="rgba(255,255,255,0.08)" strokeWidth="8" fill="none" />
                    <circle cx="60" cy="60" r="50" stroke="#F5B800" strokeWidth="8" fill="none"
                      strokeDasharray="314" strokeDashoffset="78" strokeLinecap="round"
                      transform="rotate(-90 60 60)"
                      style={{ filter: 'drop-shadow(0 0 5px #F5B800)' }} />
                    <text x="60" y="57" textAnchor="middle" fontFamily="Space Grotesk" fontWeight="700" fontSize="22" fill="#fff">75%</text>
                    <text x="60" y="73" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="7" fill="rgba(255,255,255,0.45)" letterSpacing="1.5">ESFORÇO</text>
                  </svg>

                  <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 8 }}>
                    {[{ v: '4.2', u: 'km' }, { v: '28:14', u: '' }, { v: '312', u: 'kcal' }].map(s => (
                      <div key={s.v} style={{ textAlign: 'center' }}>
                        <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 13 }}>{s.v}</div>
                        {s.u && <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 8, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em' }}>{s.u}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

// ── STATS ────────────────────────────────────────────────────────────────────
function StatsBar() {
  const stats = [
    { num: '12', suf: '+', label: 'Métodos de treino avançados' },
    { num: '5,0', suf: '★', label: 'Rating na App Store' },
    { num: '100', suf: '%', label: 'Gratuito para baixar' },
    { num: '3', suf: '×', label: 'iOS · Android · Web' },
  ]

  return (
    <section style={{ padding: '80px 20px', background: '#070707' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '32px 0' }}>
        {stats.map((s, i) => (
          <Reveal key={s.label} delay={i * 60} style={{ textAlign: 'center', borderLeft: i % 2 === 1 ? '1px solid rgba(245,184,0,0.25)' : undefined }}>
            <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 'clamp(36px, 5vw, 60px)', lineHeight: 1, letterSpacing: '-0.03em' }}>
              <span>{s.num}</span>
              <span style={{ color: '#F5B800' }}>{s.suf}</span>
            </div>
            <div style={{ color: 'rgba(245,245,245,0.5)', fontSize: 13, marginTop: 8 }}>{s.label}</div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

// ── TESTIMONIALS ─────────────────────────────────────────────────────────────
function Testimonials() {
  const reviews = [
    { name: 'Carlos M.', role: 'Musculação há 4 anos', text: 'Tentei vários apps, mas nenhum me deu a clareza de progressão que o IronTracks dá. Ver meu PR evoluir semana a semana é viciante.', initials: 'CM', color: '#F5B800' },
    { name: 'Ana R.', role: 'Treino funcional + corrida', text: 'O cardio GPS junto com o log de musculação em um único app é o que eu precisava. A IA de nutrição então... uso todo dia.', initials: 'AR', color: '#3b82f6' },
    { name: 'Bruno S.', role: 'Personal trainer, 12 anos', text: 'Recomendo para todos os meus alunos. A organização de treinos e o histórico detalhado são exatamente o que um atleta sério precisa.', initials: 'BS', color: '#2AE870' },
  ]

  return (
    <section style={{ padding: '120px 20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <Reveal style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 12 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} size={18} fill="#F5B800" style={{ color: '#F5B800' }} />
            ))}
            <span style={{ marginLeft: 8, color: '#F5B800', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 18 }}>5,0</span>
          </div>
          <h2 style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 'clamp(24px, 3vw, 36px)', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
            O que quem treina está dizendo
          </h2>
          <p style={{ color: 'rgba(245,245,245,0.45)', fontSize: 14 }}>Avaliado com 5 estrelas na App Store Brasil</p>
        </Reveal>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {reviews.map((r, i) => (
            <Reveal key={r.name} delay={i * 80} style={{
              padding: 22, borderRadius: 16,
              background: '#141414', border: '1px solid rgba(255,255,255,0.08)',
              display: 'flex', flexDirection: 'column', gap: 16,
            }}>
              <div style={{ display: 'flex', gap: 3 }}>
                {Array.from({ length: 5 }).map((_, j) => (
                  <Star key={j} size={12} fill="#F5B800" style={{ color: '#F5B800' }} />
                ))}
              </div>
              <p style={{ fontSize: 14, color: 'rgba(245,245,245,0.75)', lineHeight: 1.65, flex: 1, margin: 0 }}>
                &ldquo;{r.text}&rdquo;
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: `${r.color}18`, border: `1px solid ${r.color}35`, color: r.color,
                  fontSize: 12, fontWeight: 700,
                }}>{r.initials}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{r.name}</div>
                  <div style={{ fontSize: 12, color: 'rgba(245,245,245,0.4)' }}>{r.role}</div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── VIP HINT ─────────────────────────────────────────────────────────────────
function VipHint() {
  return (
    <div style={{ textAlign: 'center', padding: '36px 20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <Link href={WEB} style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        padding: '12px 22px', borderRadius: 12,
        border: '1px solid rgba(245,184,0,0.2)',
        background: 'rgba(245,184,0,0.04)',
        fontSize: 14, color: 'rgba(245,245,245,0.65)', textDecoration: 'none',
        transition: 'all 0.2s',
      }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = 'rgba(245,184,0,0.4)'
          e.currentTarget.style.color = 'rgba(245,245,245,0.9)'
          e.currentTarget.style.background = 'rgba(245,184,0,0.08)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = 'rgba(245,184,0,0.2)'
          e.currentTarget.style.color = 'rgba(245,245,245,0.65)'
          e.currentTarget.style.background = 'rgba(245,184,0,0.04)'
        }}
      >
        <span style={{ fontSize: 13, color: '#F5B800' }}>♛</span>
        Quer ir além? Conheça o IronTracks VIP
        <ArrowRight size={13} style={{ color: '#F5B800' }} />
      </Link>
    </div>
  )
}

// ── FINAL CTA ────────────────────────────────────────────────────────────────
function FinalCta({ onAndroidClick }: { onAndroidClick: () => void }) {
  return (
    <section id="download" style={{ padding: '120px 20px', position: 'relative', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at 50% 50%, rgba(245,184,0,0.07) 0%, transparent 70%)',
      }} />
      <div style={{ position: 'relative', maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
        <Reveal>
          <Image src="/logo-irontracks.png" alt="IronTracks" width={100} height={100}
            style={{ borderRadius: 28, marginBottom: 28, boxShadow: '0 0 60px rgba(245,184,0,0.35)' }} />
          <h2 style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, lineHeight: 1.0, fontSize: 'clamp(52px, 9vw, 140px)', margin: '0 0 20px', letterSpacing: '-0.04em' }}>
            Chega de<br />
            planejar.<br />
            <span style={{ color: '#F5B800' }}>Treina.</span>
          </h2>
          <p style={{ color: 'rgba(245,245,245,0.75)', fontSize: 17, maxWidth: 460, margin: '0 auto 10px' }}>
            Grátis. Funciona offline. Sem anúncios.
          </p>
          <p style={{ color: 'rgba(245,245,245,0.45)', fontSize: 14, marginBottom: 44, letterSpacing: '0.05em' }}>
            iOS · Android · Navegador
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 14 }}>
            <Link href={APPLE} style={{
              display: 'inline-flex', alignItems: 'center', gap: 12, padding: '16px 28px', borderRadius: 16,
              background: 'linear-gradient(135deg, #FFD34D 0%, #F5B800 40%, #FF7A1A 100%)',
              color: '#000', textDecoration: 'none', fontWeight: 700,
            }}>
              <AppleSvg />
              <span>
                <small style={{ display: 'block', fontSize: 11, opacity: 0.6 }}>Baixar na</small>
                <strong style={{ fontSize: 16 }}>App Store</strong>
              </span>
            </Link>
            <button onClick={onAndroidClick} style={{
              display: 'inline-flex', alignItems: 'center', gap: 12, padding: '16px 28px', borderRadius: 16,
              border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.05)',
              color: '#f5f5f5', cursor: 'pointer', fontWeight: 600,
            }}>
              <PlaySvg />
              <span>
                <small style={{ display: 'block', fontSize: 11, opacity: 0.6 }}>Disponível no</small>
                <strong style={{ fontSize: 16 }}>Google Play</strong>
              </span>
            </button>
            <Link href={WEB} style={{
              display: 'inline-flex', alignItems: 'center', gap: 12, padding: '16px 28px', borderRadius: 16,
              border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.05)',
              color: '#f5f5f5', textDecoration: 'none', fontWeight: 600,
            }}>
              <Globe size={22} style={{ color: '#F5B800' }} />
              <span>
                <small style={{ display: 'block', fontSize: 11, opacity: 0.6 }}>Acessar no</small>
                <strong style={{ fontSize: 16 }}>Navegador</strong>
              </span>
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

// ── FOOTER ───────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer style={{ padding: '28px 28px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Image src="/logo-irontracks.png" alt="IronTracks" width={22} height={22} style={{ borderRadius: 6, opacity: 0.6 }} />
          <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 14, color: 'rgba(245,245,245,0.4)', letterSpacing: '-0.01em' }}>
            IRONTRACKS
          </span>
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          <Link href="/privacy" style={{ fontSize: 13, color: 'rgba(245,245,245,0.3)', textDecoration: 'none' }}>Privacidade</Link>
          <Link href={WEB} style={{ fontSize: 13, color: 'rgba(245,245,245,0.3)', textDecoration: 'none' }}>Entrar</Link>
        </div>
        <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: 'rgba(245,245,245,0.2)', letterSpacing: '0.08em' }}>
          © 2026 · IRONTRACKS
        </div>
      </div>
    </footer>
  )
}

// ── PAGE ROOT ────────────────────────────────────────────────────────────────
// ── ANDROID MODAL ────────────────────────────────────────────────────────────
function AndroidModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const bodyOverflow = document.body.style.overflow
    const rootOverflow = document.documentElement.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = bodyOverflow
      document.documentElement.style.overflow = rootOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  const steps = [
    { n: '1', title: 'Entre no grupo de testadores', desc: 'Toque em "Entrar no grupo de testadores" abaixo e clique em "Participar do grupo". É grátis e sem aprovação.' },
    { n: '2', title: 'Acesse o teste no Google Play', desc: 'Toque em "Acessar o teste", entre com sua conta Google e clique em "Tornar-se testador".' },
    { n: '3', title: 'Aguarde 1 a 2 minutos', desc: 'O Google precisa processar sua entrada no grupo antes de liberar a instalação.' },
    { n: '4', title: 'Instale o IronTracks', desc: 'Toque em "Abrir na Play Store" abaixo e depois em "Instalar". Pronto!' },
  ]

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="android-modal-title"
      data-testid="android-download-overlay"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch',
        padding: 'max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom))',
      }}
    >
      <div
        data-testid="android-download-panel"
        onClick={e => e.stopPropagation()}
        style={{
          background: '#111', borderRadius: 24,
          padding: 'clamp(20px, 6vw, 36px) clamp(18px, 5vw, 32px)',
          maxWidth: 480, width: '100%', maxHeight: 'calc(100dvh - 24px)',
          margin: 'auto 0', overflowY: 'auto', overscrollBehavior: 'contain', boxSizing: 'border-box',
          border: '1px solid rgba(245,184,0,0.2)',
          boxShadow: '0 0 80px rgba(245,184,0,0.08)',
        }}
      >
        {/* Header */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingBottom: 16, marginBottom: 12, background: '#111',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <PlaySvg />
            <span id="android-modal-title" style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 18 }}>
              Baixar para Android
            </span>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'rgba(245,245,245,0.4)', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: 4, flexShrink: 0 }}
          >
            ×
          </button>
        </div>

        {/* Tag versão beta (teste fechado) */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '5px 12px', borderRadius: 999, marginBottom: 24,
          background: 'rgba(245,184,0,0.08)', border: '1px solid rgba(245,184,0,0.25)',
          fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#F5B800',
        }}>
          ⚗ Versão Beta — Teste Fechado
        </div>

        <p style={{ color: 'rgba(245,245,245,0.55)', fontSize: 14, lineHeight: 1.6, marginBottom: 28 }}>
          O IronTracks para Android está em teste fechado. Entre no grupo de testadores, acesse o teste e instale:
        </p>

        {/* Steps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 32 }}>
          {steps.map(s => (
            <div key={s.n} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div style={{
                flexShrink: 0, width: 28, height: 28, borderRadius: '50%',
                background: 'rgba(245,184,0,0.12)', border: '1px solid rgba(245,184,0,0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 13, color: '#F5B800',
              }}>
                {s.n}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{s.title}</div>
                <div style={{ fontSize: 13, color: 'rgba(245,245,245,0.5)', lineHeight: 1.5 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA — 2 passos: 1º entrar no grupo, 2º acessar o teste */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <a
            href={GROUP}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: '15px 24px', borderRadius: 14, textDecoration: 'none',
              background: 'linear-gradient(135deg, #FFD34D 0%, #F5B800 40%, #FF7A1A 100%)',
              color: '#000', fontWeight: 700, fontSize: 15, width: '100%',
            }}
          >
            1 · Entrar no grupo de testadores
          </a>
          <a
            href={PLAY}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: '15px 24px', borderRadius: 14, textDecoration: 'none',
              background: 'transparent', border: '1px solid rgba(245,184,0,0.4)',
              color: '#F5B800', fontWeight: 700, fontSize: 15, width: '100%',
            }}
          >
            <PlaySvg />
            2 · Acessar o teste no Google Play
          </a>
          <a
            href={PLAY_STORE}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: '15px 24px', borderRadius: 14, textDecoration: 'none',
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.14)',
              color: '#f5f5f5', fontWeight: 700, fontSize: 15, width: '100%',
            }}
          >
            <PlaySvg />
            3 · Abrir na Play Store
          </a>
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: 'rgba(245,245,245,0.25)', marginTop: 14 }}>
          Já é testador? Toque no botão 3 para instalar direto. Toque fora para fechar.
        </p>
      </div>
    </div>
  )
}

export default function ComercialContent() {
  const [showAndroid, setShowAndroid] = useState(false)
  return (
    <div style={{ background: '#070707', color: '#f5f5f5', fontFamily: '"Inter", system-ui, -apple-system, sans-serif' }}>
      {showAndroid && <AndroidModal onClose={() => setShowAndroid(false)} />}
      <Nav />
      <Hero onAndroidClick={() => setShowAndroid(true)} />
      <Ticker />
      <Manifesto />
      <FeatureBento />
      <Showcase />
      <Wearables />
      <StatsBar />
      <Testimonials />
      <VipHint />
      <FinalCta onAndroidClick={() => setShowAndroid(true)} />
      <Footer />
    </div>
  )
}

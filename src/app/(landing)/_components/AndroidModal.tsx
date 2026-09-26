'use client'

import { useEffect } from 'react'
import { GROUP, PLAY, PLAY_STORE } from './links'
import { PlayIcon } from './icons'

/**
 * Passo a passo para instalar no Android (teste fechado da Play Store).
 *
 * Trazido como estava da landing anterior: texto, `data-testid`, papel de
 * diálogo e rolagem interna são cobrados pelo E2E
 * `e2e/comercial-android-modal.spec.ts` (360×640: painel rolável, "Fechar"
 * sempre visível, trava a rolagem do documento). Mudanças aqui: fontes pela
 * variável do `next/font` e o "Fechar" com alvo de 44px (era 22px de texto).
 */
export default function AndroidModal({ onClose }: { onClose: () => void }) {
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
    { n: '1', title: 'Entre no grupo de testadores', desc: 'Toque em "Entrar no grupo de testadores" e em "Participar do grupo" usando a mesma Conta Google da Play Store.' },
    { n: '2', title: 'Acesse o teste no Google Play', desc: 'Com essa mesma Conta Google, toque em "Acessar o teste" e depois em "Tornar-se testador".' },
    { n: '3', title: 'Aguarde a liberação do Google', desc: 'Normalmente leva alguns minutos. Em alguns casos, o Google pode levar algumas horas para liberar a instalação.' },
    { n: '4', title: 'Instale o IronTracks', desc: 'Toque em "Abrir na Play Store" abaixo e depois em "Instalar". Pronto!' },
  ]

  const display = 'var(--lf-display), sans-serif'

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
          background: '#111', borderRadius: 24, color: '#f5f5f5',
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
            <PlayIcon />
            <span id="android-modal-title" style={{ fontFamily: display, fontWeight: 700, fontSize: 18 }}>
              Baixar para Android
            </span>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/5 hover:text-white"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 24, lineHeight: 1, flexShrink: 0, marginRight: -10 }}
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

        <p style={{ color: 'rgba(245,245,245,0.7)', fontSize: 14, lineHeight: 1.6, marginBottom: 28 }}>
          O IronTracks para Android está em teste fechado. Use a mesma Conta Google nos 3 botões abaixo:
        </p>

        {/* Steps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 32 }}>
          {steps.map(s => (
            <div key={s.n} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div style={{
                flexShrink: 0, width: 28, height: 28, borderRadius: '50%',
                background: 'rgba(245,184,0,0.12)', border: '1px solid rgba(245,184,0,0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: display, fontWeight: 700, fontSize: 13, color: '#F5B800',
              }}>
                {s.n}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{s.title}</div>
                <div style={{ fontSize: 13, color: 'rgba(245,245,245,0.65)', lineHeight: 1.5 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{
          marginBottom: 24, padding: '12px 14px', borderRadius: 14,
          background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.1)',
          color: 'rgba(245,245,245,0.7)', fontSize: 12, lineHeight: 1.55,
        }}>
          <strong style={{ color: '#f5f5f5' }}>Apareceu “O item não foi encontrado”?</strong>{' '}
          Abra a Play Store, toque na foto do perfil e confirme que ela está usando a mesma Conta Google dos passos 1 e 2. Depois, aguarde a liberação e tente novamente pelo botão 3.
        </div>

        {/* CTA — os 3 botões devem ser abertos com a mesma Conta Google. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <a
            href={GROUP}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: '15px 24px', borderRadius: 14, textDecoration: 'none',
              background: 'linear-gradient(135deg, #FFD34D 0%, #F5B800 40%, #FF7A1A 100%)',
              color: '#000', fontWeight: 700, fontSize: 15, width: '100%', boxSizing: 'border-box',
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
              color: '#F5B800', fontWeight: 700, fontSize: 15, width: '100%', boxSizing: 'border-box',
            }}
          >
            <PlayIcon />
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
              color: '#f5f5f5', fontWeight: 700, fontSize: 15, width: '100%', boxSizing: 'border-box',
            }}
          >
            <PlayIcon />
            3 · Abrir na Play Store
          </a>
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: 'rgba(245,245,245,0.6)', marginTop: 14 }}>
          Já é testador? Toque no botão 3 para instalar direto. Toque fora para fechar.
        </p>
      </div>
    </div>
  )
}

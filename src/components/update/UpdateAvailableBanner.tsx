'use client'

import { useCallback, useState } from 'react'
import { ArrowUpCircle, X, Sparkles } from 'lucide-react'
import { useAppStoreUpdateCheck } from '@/hooks/useAppStoreUpdateCheck'
import { logWarn } from '@/lib/logger'

/**
 * Top-of-app banner that prompts iOS users to update when a newer version
 * is live on the App Store.
 *
 * - Renders nothing on web/Android (iOS native only — the hook already gates).
 * - Renders nothing while the check is in flight (no false positive flash).
 * - Dismiss hides the banner and remembers the version so it doesn't nag
 *   again until an even newer version ships.
 * - "Atualizar" deep-links to the app's App Store page via itms-apps://
 *   which opens directly in the App Store without a Safari round-trip.
 */
export function UpdateAvailableBanner() {
  const { updateAvailable, currentVersion, latestVersion, appStoreUrl, releaseNotes, dismiss } =
    useAppStoreUpdateCheck()

  const [expanded, setExpanded] = useState(false)

  const handleUpdate = useCallback(async () => {
    try {
      const url = appStoreUrl || `itms-apps://apps.apple.com/app/id0`
      // Prefer itms-apps:// on native iOS — skips Safari and opens the
      // App Store app directly. Fall back to the https trackViewUrl when
      // we don't know the native deep-link shape.
      const deepLink = url.startsWith('https://apps.apple.com/')
        ? url.replace('https://', 'itms-apps://')
        : url
      // Use Capacitor's Browser plugin if available; else window.open
      try {
        const mod = await import('@capacitor/app')
        // @capacitor/app doesn't open URLs; fall through to window.open
        void mod
      } catch (e) {
        logWarn('UpdateAvailableBanner.capApp', 'import failed', e)
      }
      try {
        window.open(deepLink, '_blank')
      } catch (e) {
        logWarn('UpdateAvailableBanner.open', 'failed', e)
      }
    } catch (e) {
      logWarn('UpdateAvailableBanner.handleUpdate', 'unexpected', e)
    }
  }, [appStoreUrl])

  if (!updateAvailable) return null

  return (
    <div
      className="mx-4 mt-3 rounded-2xl border overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(234,179,8,0.12) 0%, rgba(202,138,4,0.08) 100%)',
        borderColor: 'rgba(234,179,8,0.35)',
      }}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <div
          className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-xl"
          style={{
            background: 'linear-gradient(135deg, #facc15 0%, #eab308 100%)',
            boxShadow: '0 4px 12px rgba(234,179,8,0.25)',
          }}
        >
          <ArrowUpCircle size={18} className="text-black" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-black text-white">
              Nova versão disponível
            </span>
            <span className="text-[10px] font-mono font-bold text-yellow-400 bg-yellow-500/10 px-1.5 py-0.5 rounded">
              {latestVersion}
            </span>
          </div>
          <p className="text-xs text-white/70 mt-0.5">
            Você está na versão {currentVersion || '—'}. Atualize para receber as últimas
            melhorias e correções.
          </p>

          {releaseNotes && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1.5 text-[11px] font-bold text-yellow-400 hover:text-yellow-300 transition-colors inline-flex items-center gap-1"
            >
              <Sparkles size={11} />
              {expanded ? 'Ocultar novidades' : 'Ver o que há de novo'}
            </button>
          )}

          {expanded && releaseNotes && (
            <div
              className="mt-2 text-[11px] text-white/60 whitespace-pre-wrap rounded-lg p-2.5 max-h-48 overflow-y-auto"
              style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.05)' }}
            >
              {releaseNotes}
            </div>
          )}

          <div className="flex items-center gap-2 mt-2.5">
            <button
              type="button"
              onClick={handleUpdate}
              className="px-3.5 py-1.5 rounded-lg text-xs font-black text-black transition-transform active:scale-95"
              style={{ background: 'linear-gradient(135deg, #facc15 0%, #eab308 100%)' }}
            >
              Atualizar agora
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-white/60 hover:text-white transition-colors"
            >
              Depois
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={dismiss}
          className="flex-shrink-0 -mr-1 -mt-1 p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors"
          aria-label="Fechar aviso de atualização"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

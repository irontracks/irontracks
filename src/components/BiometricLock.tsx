'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { isIosNative } from '@/utils/platform'
import { authenticateWithBiometrics, checkBiometricsAvailable } from '@/utils/native/irontracksNative'

interface BiometricLockProps {
  /** Display name of the logged-in user, shown on the lock screen */
  userName?: string | null
  /** Called when the user successfully unlocks (biometrics or skip) */
  onUnlocked: () => void
}

/**
 * Full-screen lock that appears on iOS when the app resumes from background.
 * Automatically triggers Face ID / Touch ID on mount and on every
 * foreground resume.  Falls back to a "Login" redirect if biometrics fail
 * or are unavailable.
 */
export function BiometricLock({ userName, onUnlocked }: BiometricLockProps) {
  const [biometryType, setBiometryType] = useState<'faceID' | 'touchID' | 'none'>('faceID')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const unlockedRef = useRef(false)

  const attemptBiometrics = useCallback(async () => {
    if (unlockedRef.current) return
    setError('')
    setLoading(true)

    const { available, biometryType: type } = await checkBiometricsAvailable()
    setBiometryType(type)

    if (!available) {
      setLoading(false)
      // No biometrics — skip the lock immediately
      unlockedRef.current = true
      onUnlocked()
      return
    }

    const label = type === 'faceID' ? 'Face ID' : 'Touch ID'
    const { success, error: authError } = await authenticateWithBiometrics(
      `Use ${label} para acessar o IronTracks`
    )

    setLoading(false)

    if (success) {
      unlockedRef.current = true
      onUnlocked()
    } else {
      // Show a human-readable error; keep the lock screen visible
      const msg = String(authError || '')
      if (msg.includes('cancel') || msg.includes('Cancel') || msg.includes('dismiss')) {
        setError('Autenticação cancelada. Tente novamente.')
      } else if (msg.includes('lockout') || msg.includes('Lockout')) {
        setError('Biometria bloqueada. Use a senha do iPhone para desbloquear.')
      } else {
        setError('Falha na autenticação. Tente novamente.')
      }
    }
  }, [onUnlocked])

  // Trigger on mount
  useEffect(() => {
    const t = setTimeout(() => {
      void attemptBiometrics()
    }, 0)
    return () => clearTimeout(t)
  }, [attemptBiometrics])

  // Re-lock when app goes to background, re-trigger on foreground
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !unlockedRef.current) {
        void attemptBiometrics()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [attemptBiometrics])

  const iconLabel = biometryType === 'touchID' ? '👆' : '🔒'
  const biometryLabel = biometryType === 'touchID' ? 'Touch ID' : 'Face ID'

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-neutral-950 gap-8 px-6">
      {/* Logo / App Name */}
      <div className="flex flex-col items-center gap-3 mb-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icone.png"
          alt="IronTracks"
          className="w-20 h-20 rounded-2xl shadow-lg"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        />
        <h1 className="text-2xl font-black text-white tracking-tight">IronTracks</h1>
        {userName ? (
          <p className="text-neutral-400 text-sm">Olá, {userName.split(' ')[0]}</p>
        ) : null}
      </div>

      {/* Biometric Button */}
      <button
        onClick={() => void attemptBiometrics()}
        disabled={loading}
        className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-neutral-900 border border-neutral-800 active:scale-95 transition-transform disabled:opacity-50 w-full max-w-xs"
      >
        <span className="text-5xl">{iconLabel}</span>
        <span className="text-white font-bold text-lg">
          {loading ? 'Aguardando…' : `Desbloquear com ${biometryLabel}`}
        </span>
      </button>

      {/* Error message */}
      {error ? (
        <p className="text-red-400 text-sm text-center max-w-xs">{error}</p>
      ) : null}

      {/* Fallback: go to login */}
      <a
        href="/auth/login"
        className="text-neutral-500 text-sm underline underline-offset-4 mt-4"
      >
        Entrar com outra conta
      </a>
    </div>
  )
}

/**
 * Hook that manages the biometric lock state.
 * Returns `isLocked` and `unlock()`.
 *
 * Lock activates:
 *  - On mount (if iOS native)
 *  - Every time the app comes back from background
 */
export function useBiometricLock(enabled: boolean) {
  const [isLocked, setIsLocked] = useState(false)
  const hasInitRef = useRef(false)

  useEffect(() => {
    if (!enabled || !isIosNative()) return
    if (hasInitRef.current) return
    hasInitRef.current = true

    // Lock on first mount
    const t = setTimeout(() => setIsLocked(true), 0)

    // Re-lock every time the app comes to foreground from background
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        setIsLocked(true)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearTimeout(t)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [enabled])

  const unlock = useCallback(() => setIsLocked(false), [])

  return { isLocked, unlock }
}

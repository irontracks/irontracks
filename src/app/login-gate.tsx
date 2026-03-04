/**
 * login-gate.tsx
 *
 * LEGACY: this file is kept only so existing imports don't break.
 * LoginScreen handles the iOS WKWebView flash natively via its isLoading state.
 * Rendering a blank div here caused Guideline 2.1(a) rejection on iPad (iPadOS 26.3).
 */
'use client'

import LoginScreen from '@/components/LoginScreen'

export default function LoginGate() {
  return <LoginScreen />
}

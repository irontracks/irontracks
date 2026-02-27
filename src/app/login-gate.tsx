'use client'

import { useEffect, useState } from 'react'
import LoginScreen from '@/components/LoginScreen'

/**
 * Renderiza uma tela preta no SSR (o que fica no cache do WKWebView).
 * Após a hidratação do React no cliente, exibe o formulário de login.
 *
 * Isso elimina o flash da tela de login quando o usuário abre o app iOS
 * e o WKWebView exibe o HTML cacheado enquanto aguarda o redirect do servidor.
 */
export default function LoginGate() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line
    setReady(true)
  }, [])

  if (!ready) {
    return <div className="min-h-screen bg-neutral-950" aria-hidden="true" />
  }

  return <LoginScreen />
}

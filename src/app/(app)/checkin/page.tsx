/**
 * /checkin?token=UUID
 *
 * Landing page for QR Code gym check-in.
 * - Shows loading while calling /api/gps/qr-checkin
 * - On success: shows gym name + success message + redirects to /dashboard
 * - On error: shows error message
 */
'use client'

import React, { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { CheckCircle, XCircle, Loader2, MapPin } from 'lucide-react'

type State = 'loading' | 'success' | 'duplicate' | 'error'

export default function CheckinPage() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get('token')

  const [state, setState] = useState<State>('loading')
  const [gymName, setGymName] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!token) {
      // Use a microtask to avoid setting state synchronously in effect
      Promise.resolve().then(() => { setState('error'); setErrorMsg('Token inválido') })
      return
    }

    fetch('/api/gps/qr-checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qr_token: token }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (!json.ok) { setState('error'); setErrorMsg(json.error || 'Erro ao fazer check-in'); return }
        setGymName(json.gym?.name || 'Academia')
        setState(json.duplicate ? 'duplicate' : 'success')
        // Redirect after 2.5s
        setTimeout(() => router.push('/dashboard'), 2500)
      })
      .catch(() => { setState('error'); setErrorMsg('Falha na conexão') })
  }, [token, router])

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center p-6 gap-6">
      {/* Logo */}
      <div className="text-center mb-4">
        <div className="text-2xl font-black tracking-tight">
          <span className="text-white">IRON</span>
          <span className="text-yellow-500">TRACKS</span>
        </div>
      </div>

      {state === 'loading' && (
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={48} className="animate-spin text-yellow-500" />
          <p className="text-neutral-400 font-bold">Processando check-in...</p>
        </div>
      )}

      {state === 'success' && (
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-20 h-20 rounded-full bg-green-500/15 border-2 border-green-500/40 flex items-center justify-center">
            <CheckCircle size={40} className="text-green-400" />
          </div>
          <div>
            <p className="text-2xl font-black text-white">Check-in feito!</p>
            <div className="flex items-center justify-center gap-1.5 mt-1">
              <MapPin size={14} className="text-yellow-500" />
              <p className="text-yellow-400 font-bold">{gymName}</p>
            </div>
          </div>
          <p className="text-sm text-neutral-500">Redirecionando para o dashboard...</p>
        </div>
      )}

      {state === 'duplicate' && (
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-20 h-20 rounded-full bg-yellow-500/15 border-2 border-yellow-500/40 flex items-center justify-center">
            <CheckCircle size={40} className="text-yellow-400" />
          </div>
          <div>
            <p className="text-2xl font-black text-white">Já registrado!</p>
            <p className="text-sm text-neutral-400 mt-1">Você já fez check-in em <span className="text-yellow-400">{gymName}</span> nos últimos 5 minutos.</p>
          </div>
          <p className="text-sm text-neutral-500">Redirecionando...</p>
        </div>
      )}

      {state === 'error' && (
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-20 h-20 rounded-full bg-red-500/15 border-2 border-red-500/40 flex items-center justify-center">
            <XCircle size={40} className="text-red-400" />
          </div>
          <div>
            <p className="text-2xl font-black text-white">Erro no check-in</p>
            <p className="text-sm text-red-400 mt-1">{errorMsg}</p>
          </div>
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="px-6 py-3 rounded-2xl bg-neutral-800 text-white font-bold text-sm hover:bg-neutral-700"
          >
            Ir para o Dashboard
          </button>
        </div>
      )}
    </div>
  )
}

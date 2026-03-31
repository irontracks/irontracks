/**
 * /r/[code] — Referral landing page
 * Stores the code in sessionStorage and redirects to sign-up.
 */
'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function ReferralLandingPage() {
  const params = useParams()
  const router = useRouter()
  const code = String(params?.code || '').toUpperCase()

  useEffect(() => {
    if (code) {
      try { sessionStorage.setItem('referral_code', code) } catch { /* ignore */ }
    }
    router.replace('/')
  }, [code, router])

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
      <div className="text-center">
        <div className="text-2xl font-black tracking-tight">
          <span className="text-white">IRON</span>
          <span className="text-yellow-500">TRACKS</span>
        </div>
        <p className="text-neutral-500 text-sm mt-3">Redirecionando...</p>
      </div>
    </div>
  )
}

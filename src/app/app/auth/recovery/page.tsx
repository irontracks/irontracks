import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import AuthRecoveryClient from './recovery-client'

export const dynamic = 'force-dynamic'

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-6 text-center text-white">
      <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-8 shadow-2xl">
        <div className="w-16 h-16 bg-yellow-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-yellow-500/20">
          <Loader2 className="w-8 h-8 text-yellow-500 animate-spin" />
        </div>
        <h1 className="text-xl font-black mb-2 italic tracking-tight">CARREGANDO…</h1>
        <p className="text-neutral-400">Aguarde um instante.</p>
      </div>
    </div>
  )
}

export default function AuthRecoveryPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <AuthRecoveryClient />
    </Suspense>
  )
}

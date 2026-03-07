import MarketplaceClient from './MarketplaceClient'
import Link from 'next/link'
import { headers } from 'next/headers'

export const dynamic = 'force-dynamic'

export default async function MarketplacePage() {
  const h = await headers()
  const ua = String(h.get('user-agent') || '')
  const isIos = /iPad|iPhone|iPod/i.test(ua)
  const isCapacitor = /Capacitor/i.test(ua)
  const shouldHideVip = isIos && isCapacitor
  if (shouldHideVip) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-center">
          <h1 className="text-xl font-black text-white">Planos VIP</h1>
          <p className="mt-2 text-sm text-neutral-300">
            Assinaturas estão indisponíveis no iOS no momento.
          </p>
          <Link
            href="/dashboard"
            className="mt-5 w-full inline-flex items-center justify-center rounded-xl bg-yellow-500 text-black font-black py-3 hover:bg-yellow-400 transition-colors"
          >
            Voltar ao Dashboard
          </Link>
        </div>
      </div>
    )
  }
  return <MarketplaceClient />
}

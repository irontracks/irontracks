// dashboard/page.tsx — sub-page raiz. Retorna null porque o app inteiro vive
// em dashboard/layout.tsx (que renderiza DashboardClientEntry uma vez só).
//
// Único trabalho desta page: redirect quando ?code= chega como search param
// (OAuth callback que veio com URL canônica do projeto em vez de /auth/callback).
import { redirect } from 'next/navigation'
import { sanitizeNextParam } from '@/utils/auth/safeRedirect'

type SP = Record<string, string | string[] | undefined>

export default async function DashboardPage({ searchParams }: { searchParams?: Promise<SP> }) {
  const sp = await searchParams
  const code = typeof sp?.code === 'string' ? sp?.code : ''
  const next = typeof sp?.next === 'string' ? sp?.next : ''
  if (code) {
    const safeNext = sanitizeNextParam(next, '/dashboard')
    redirect(`/auth/callback?code=${encodeURIComponent(code)}&next=${encodeURIComponent(safeNext)}`)
  }
  return null
}

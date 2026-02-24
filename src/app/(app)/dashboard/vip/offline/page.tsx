import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/utils/supabase/server'
import { checkVipFeatureAccess } from '@/utils/vip/limits'
import VipOfflineClient from './vip-offline-client'

export default async function VipOfflinePage() {
  const h = await headers()
  const ua = String(h.get('user-agent') || '').toLowerCase()
  if (ua.includes('capacitor') || ua.includes('irontracks')) redirect('/dashboard')
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    const userId = String(data?.user?.id || '').trim()
    if (!userId) redirect('/')
    const access = await checkVipFeatureAccess(supabase, userId, 'offline')
    if (!access.allowed) redirect('/marketplace')
  } catch {
    redirect('/')
  }

  return <VipOfflineClient />
}

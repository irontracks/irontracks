import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/utils/supabase/server'
import { checkVipFeatureAccess } from '@/utils/vip/limits'
import VipChefIaClient from './vip-chef-ia-client'

export default async function VipChefIaPage() {
  const h = await headers()
  const ua = String(h.get('user-agent') || '').toLowerCase()
  if (ua.includes('capacitor') || ua.includes('irontracks')) redirect('/dashboard')
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    const userId = String(data?.user?.id || '').trim()
    if (!userId) redirect('/')
    const access = await checkVipFeatureAccess(supabase, userId, 'chef_ai')
    if (!access.allowed) redirect('/marketplace')
  } catch {
    redirect('/')
  }

  return <VipChefIaClient />
}

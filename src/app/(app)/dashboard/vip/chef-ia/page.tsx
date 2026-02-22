import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { checkVipFeatureAccess } from '@/utils/vip/limits'
import VipChefIaClient from './vip-chef-ia-client'

export default async function VipChefIaPage() {
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

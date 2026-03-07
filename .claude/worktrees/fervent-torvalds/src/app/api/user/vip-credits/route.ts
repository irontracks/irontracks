import { createClient } from '@/utils/supabase/server'
import { getVipPlanLimits } from '@/utils/vip/limits'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    // 1. Get Plan & Limits
    const { tier, limits } = await getVipPlanLimits(supabase, user.id)

    // 2. Fetch Usage Data (Last 7 days to cover weekly limits)
    const today = new Date()
    const sevenDaysAgo = new Date(today)
    sevenDaysAgo.setDate(today.getDate() - 6)
    const dateStr = sevenDaysAgo.toISOString().split('T')[0]
    const todayStr = today.toISOString().split('T')[0]

    const { data: usageRows } = await supabase
      .from('vip_usage_daily')
      .select('feature_key, day, usage_count')
      .eq('user_id', user.id)
      .gte('day', dateStr)

    // 3. Calculate Current Usage
    const calculateUsage = (key: string, period: 'day' | 'week') => {
      if (!usageRows) return 0
      
      return usageRows.reduce((sum, row) => {
        if (row.feature_key !== key) return sum
        
        if (period === 'day') {
          return row.day === todayStr ? sum + row.usage_count : sum
        } else {
          // week includes all returned rows (filtered by gte dateStr)
          return sum + row.usage_count
        }
      }, 0)
    }

    const credits = {
      chat: {
        used: calculateUsage('chat', 'day'),
        limit: limits.chat_daily,
        label: 'Mensagens Hoje'
      },
      insights: {
        used: calculateUsage('insights', 'week'),
        limit: limits.insights_weekly,
        label: 'Insights na Semana'
      },
      wizard: {
        used: calculateUsage('wizard', 'week'),
        limit: limits.wizard_weekly,
        label: 'Gerações na Semana'
      }
    }

    return NextResponse.json({
      ok: true,
      tier,
      credits,
      isVip: tier !== 'free'
    })

  } catch (error) {
    console.error('Error fetching VIP credits:', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
}

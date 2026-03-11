import { createClient } from '@/utils/supabase/server'
import { getVipPlanLimits } from '@/utils/vip/limits'
import { getWeeklyResetStart } from '@/utils/vip/weekReset'
import { NextResponse } from 'next/server'
import { getErrorMessage } from '@/utils/errorMessage'
import { logError, logWarn, logInfo } from '@/lib/logger'

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

    const today = new Date()
    const weekStartIso = getWeeklyResetStart(today).toISOString()
    const todayStr = today.toISOString().split('T')[0]

    const { data: usageRows } = await supabase
      .from('vip_usage_daily')
      .select('feature_key, day, usage_count, last_used_at')
      .eq('user_id', user.id)
      .gte('last_used_at', weekStartIso)

    // 3. Calculate Current Usage
    const calculateUsage = (key: string, period: 'day' | 'week') => {
      if (!usageRows) return 0
      
      return usageRows.reduce((sum, row) => {
        if (row.feature_key !== key) return sum
        
        if (period === 'day') {
          return row.day === todayStr ? sum + row.usage_count : sum
        } else {
          // week includes all returned rows (filtered by weekStartIso)
          return sum + row.usage_count
        }
      }, 0)
    }

    const isFree = tier === 'free'
    const chatPeriod: 'day' | 'week' = isFree ? 'week' : 'day'

    const credits = {
      chat: {
        used: calculateUsage('chat', chatPeriod),
        limit: limits.chat_daily,
        label: isFree ? 'Mensagens na Semana' : 'Mensagens Hoje'
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

  } catch (error: unknown) {
    logError('error', 'Error fetching VIP credits:', error)
    return NextResponse.json({ ok: false, error: getErrorMessage(error) }, { status: 500 })
  }
}

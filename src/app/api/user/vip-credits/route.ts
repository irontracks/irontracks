import { createClient } from '@/utils/supabase/server'
import { getVipPlanLimits } from '@/utils/vip/limits'
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

    const toTzParts = (date: Date, timeZone: string) => {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
      const parts = formatter.formatToParts(date)
      const map = parts.reduce<Record<string, string>>((acc, part) => {
        if (part.type !== 'literal') acc[part.type] = part.value
        return acc
      }, {})
      const weekday = String(map.weekday || '').toLowerCase()
      const weekdayIndex =
        weekday === 'mon' ? 1 : weekday === 'tue' ? 2 : weekday === 'wed' ? 3 : weekday === 'thu' ? 4 : weekday === 'fri' ? 5 : weekday === 'sat' ? 6 : 0
      return {
        year: Number(map.year),
        month: Number(map.month),
        day: Number(map.day),
        weekdayIndex,
      }
    }

    const tzDateToUtc = (timeZone: string, year: number, month: number, day: number, hour: number, minute: number, second: number) => {
      const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
      const tzDate = new Date(utcGuess.toLocaleString('en-US', { timeZone }))
      const offset = utcGuess.getTime() - tzDate.getTime()
      return new Date(utcGuess.getTime() + offset)
    }

    const getWeeklyResetStart = (now: Date) => {
      const timeZone = 'America/Sao_Paulo'
      const currentParts = toTzParts(now, timeZone)
      const daysSinceMonday = (currentParts.weekdayIndex + 6) % 7
      const mondayDay = currentParts.day - daysSinceMonday
      const weekStart = tzDateToUtc(timeZone, currentParts.year, currentParts.month, mondayDay, 3, 0, 0)
      if (now.getTime() < weekStart.getTime()) {
        const prevMonday = new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000)
        return prevMonday
      }
      return weekStart
    }

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

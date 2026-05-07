import type { SupabaseClient } from '@supabase/supabase-js'
import { logError } from '@/lib/logger'

/**
 * Returns the set of user_ids that currently have an active workout session.
 * Cron jobs that send motivational "go train" notifications must filter out
 * these users — they're already training.
 */
export async function getActivelyTrainingUsers(admin: SupabaseClient): Promise<Set<string>> {
  try {
    const { data, error } = await admin
      .from('active_workout_sessions')
      .select('user_id')
      .limit(10000)

    if (error) {
      logError('activeSessionFilter', error)
      return new Set()
    }

    return new Set(
      (Array.isArray(data) ? data : [])
        .map((r) => String((r as { user_id?: string })?.user_id || '').trim())
        .filter(Boolean),
    )
  } catch (e) {
    logError('activeSessionFilter', e)
    return new Set()
  }
}

import { logInfo, logError } from '@/lib/logger'

export async function runChatDiagnostics(supabase: any, userId: string) {
  const report: any = { ok: true, steps: [] }
  try {
    const { data: me, error: meErr } = await supabase
      .from('profiles')
      .select('id, display_name, photo_url, last_seen')
      .eq('id', userId)
      .single()
    report.steps.push({ name: 'profiles_select_self', ok: !meErr, error: meErr?.message })
    if (meErr) report.ok = false

    const { data: channels, error: chErr } = await supabase
      .from('direct_channels')
      .select('id, user1_id, user2_id, last_message_at')
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
      .order('last_message_at', { ascending: false })
      .limit(10)
    report.steps.push({ name: 'channels_list', ok: !chErr, count: channels?.length ?? 0, error: chErr?.message })
    if (chErr) report.ok = false

    if (channels && channels.length > 0) {
      const cid = channels[0].id
      const { data: msgs, error: msgErr } = await supabase
        .from('direct_messages')
        .select('id, sender_id, content, created_at')
        .eq('channel_id', cid)
        .order('created_at', { ascending: false })
        .limit(5)
      report.steps.push({ name: 'messages_list', ok: !msgErr, count: msgs?.length ?? 0, channel_id: cid, error: msgErr?.message })
      if (msgErr) report.ok = false
    }

    logInfo('chatDiagnostics', 'Finished', report)
  } catch (e) {
    report.ok = false
    report.error = (e as any)?.message ?? String(e)
    logError('chatDiagnostics', e)
  }
  return report
}

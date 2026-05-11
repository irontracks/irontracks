/**
 * GET /api/cron/whatsapp-reactivation
 *
 * Daily cron — fires at 14:00 UTC (11:00 BRT).
 * Finds users inactive for 7-30 days who have a phone number stored and
 * no ongoing WhatsApp conversation, then sends a personalized first message
 * via Z-API and records the conversation in whatsapp_conversations.
 *
 * The webhook at /api/webhooks/whatsapp handles subsequent replies.
 */
import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/utils/cron/auth'
import { createAdminClient } from '@/utils/supabase/admin'
import { getActivelyTrainingUsers } from '@/utils/cron/activeSessionFilter'
import { sendWhatsAppText, normalizeBrPhone } from '@/lib/whatsapp/zapi'
import { fetchUserContext, buildInitialMessage } from '@/lib/whatsapp/conversation'
import type { ConversationTurn } from '@/lib/whatsapp/conversation'
import { logError, logInfo, logWarn } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const MIN_INACTIVE_DAYS = 7
const MAX_INACTIVE_DAYS = 30
/** Max users to contact per cron run to avoid flooding the Z-API instance */
const BATCH_SIZE = 20

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  try {
    const admin = createAdminClient()
    const now = Date.now()
    // Cutoffs MIN/MAX_INACTIVE_DAYS — janelas largas (7-30 dias), então
    // a diferença UTC vs BRT (3h) é desprezível pro filtro. Mantemos
    // timestamp ISO completo pra evitar conversão implícita.
    const minAgo = new Date(now - MIN_INACTIVE_DAYS * 86_400_000).toISOString()
    const maxAgo = new Date(now - MAX_INACTIVE_DAYS * 86_400_000).toISOString()

    // 1. Find users whose last workout falls within the 7-30 day window
    const { data: workoutRows } = await admin
      .from('workouts')
      .select('user_id, date')
      .eq('is_template', false)
      .gte('date', maxAgo)
      .lte('date', minAgo)
      .order('date', { ascending: false })
      .limit(10_000)

    // Keep only the most recent workout per user
    const lastByUser = new Map<string, string>()
    for (const r of Array.isArray(workoutRows) ? workoutRows : []) {
      const uid = String((r as { user_id?: string }).user_id ?? '').trim()
      const date = String((r as { date?: string }).date ?? '').slice(0, 10)
      if (!uid || !date) continue
      if (!lastByUser.has(uid)) lastByUser.set(uid, date)
    }

    if (!lastByUser.size) return NextResponse.json({ ok: true, sent: 0, reason: 'no_inactive_users' })

    const candidateIds = Array.from(lastByUser.keys())

    // 2. Remove users currently in an active workout session
    const activeUsers = await getActivelyTrainingUsers(admin)

    // 3. Remove users already in an active WhatsApp conversation
    const { data: activeConvs } = await admin
      .from('whatsapp_conversations')
      .select('user_id')
      .eq('status', 'active')

    const alreadyInConversation = new Set(
      (Array.isArray(activeConvs) ? activeConvs : [])
        .map((c) => String((c as { user_id?: string }).user_id ?? '').trim())
        .filter(Boolean),
    )

    const toContact = candidateIds
      .filter((uid) => !activeUsers.has(uid) && !alreadyInConversation.has(uid))
      .slice(0, BATCH_SIZE)

    if (!toContact.length) {
      return NextResponse.json({ ok: true, sent: 0, reason: 'all_filtered_out' })
    }

    // 4. Fetch phone numbers from user_settings.preferences->>'phone'
    const { data: settingsRows } = await admin
      .from('user_settings')
      .select('user_id, preferences')
      .in('user_id', toContact)

    const phoneByUser = new Map<string, string>()
    for (const row of Array.isArray(settingsRows) ? settingsRows : []) {
      const uid = String((row as { user_id?: string }).user_id ?? '').trim()
      const prefs = (row as { preferences?: Record<string, unknown> }).preferences ?? {}
      const rawPhone = String(prefs.phone ?? '').trim()
      const normalized = normalizeBrPhone(rawPhone)
      if (uid && normalized) phoneByUser.set(uid, normalized)
    }

    if (!phoneByUser.size) {
      logWarn('cron:whatsapp-reactivation', 'No phone numbers found in user_settings for candidates')
      return NextResponse.json({ ok: true, sent: 0, reason: 'no_phones' })
    }

    // 5. Send first message and record conversation
    let sent = 0
    for (const [userId, phone] of phoneByUser) {
      try {
        const userCtx = await fetchUserContext(userId)
        const firstMessage = buildInitialMessage(userCtx)

        const ok = await sendWhatsAppText(phone, firstMessage)
        if (!ok) continue

        // History starts with a synthetic 'user' prompt so Gemini has the right
        // context when the real user replies (Gemini requires history[0].role === 'user').
        const initialHistory: ConversationTurn[] = [
          {
            role: 'user',
            text: `[sistema]: O usuário não abre o app há ${userCtx.daysSinceLastWorkout} dias. Envie a primeira mensagem de reativação.`,
          },
          { role: 'model', text: firstMessage },
        ]

        await admin.from('whatsapp_conversations').insert({
          user_id: userId,
          phone,
          status: 'active',
          context: initialHistory,
          last_bot_message: firstMessage,
          last_message_at: new Date().toISOString(),
        })

        logInfo('cron:whatsapp-reactivation', 'Sent initial message', {
          userId,
          phone: `****${phone.slice(-4)}`,
        })
        sent++
      } catch (e) {
        logError('cron:whatsapp-reactivation', e, { userId })
      }
    }

    return NextResponse.json({ ok: true, sent })
  } catch (e) {
    logError('cron:whatsapp-reactivation', e)
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
  }
}

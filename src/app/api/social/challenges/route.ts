import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { parseJsonBody } from '@/utils/zod'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { insertNotifications } from '@/lib/social/notifyFollowers'

export const dynamic = 'force-dynamic'

const CreateSchema = z
  .object({
    action: z.literal('create'),
    opponentId: z.string(),
    type: z.enum(['workouts_count', 'streak']),
    targetValue: z.number().min(1).max(100),
    deadlineDays: z.number().min(1).max(30).optional(),
  })
  .strip()

const RespondSchema = z
  .object({
    action: z.enum(['accept', 'decline']),
    challengeId: z.string(),
  })
  .strip()

const BodySchema = z.union([CreateSchema, RespondSchema])

/**
 * GET /api/social/challenges — list active challenges
 * POST /api/social/challenges — create or respond to challenge
 * 
 * Challenges are stored in Upstash/cache as JSON since we want to avoid
 * database migrations. Uses notifications for delivery.
 * 
 * Storage: notifications table with type='challenge_*' and metadata containing the full challenge state.
 */
export async function GET(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const userId = String(auth.user.id || '').trim()
    if (!userId) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`social:challenges:get:${userId}:${ip}`, 30, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const admin = createAdminClient()

    // Fetch all challenge notifications where I'm involved
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const { data: rows } = await admin
      .from('notifications')
      .select('id, type, title, message, sender_id, user_id, metadata, created_at, is_read')
      .or(`user_id.eq.${userId},sender_id.eq.${userId}`)
      .in('type', ['challenge_created', 'challenge_accepted', 'challenge_declined', 'challenge_completed'])
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false })
      .limit(100)

    const challenges = (Array.isArray(rows) ? rows : []).map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      message: r.message,
      senderId: r.sender_id,
      recipientId: r.user_id,
      metadata: r.metadata,
      createdAt: r.created_at,
      isRead: r.is_read,
      isCreator: r.sender_id === userId,
    }))

    // Get profiles for display
    const allIds = [...new Set(challenges.flatMap((c) => [c.senderId, c.recipientId].filter(Boolean)))]
    const profiles = new Map<string, { displayName: string; photoUrl: string | null }>()
    if (allIds.length) {
      const { data: profs } = await admin.from('profiles').select('id, display_name, photo_url').in('id', allIds).limit(200)
      for (const p of Array.isArray(profs) ? profs : []) {
        profiles.set(String(p.id), { displayName: p.display_name || 'Usuário', photoUrl: p.photo_url || null })
      }
    }

    const enriched = challenges.map((c) => {
      const meta = c.metadata && typeof c.metadata === 'object' ? c.metadata as Record<string, unknown> : {}
      return {
        ...c,
        challengeType: meta.challengeType || 'workouts_count',
        targetValue: Number(meta.targetValue || 0),
        deadline: meta.deadline || null,
        status: meta.status || 'pending',
        creatorProgress: Number(meta.creatorProgress || 0),
        opponentProgress: Number(meta.opponentProgress || 0),
        senderProfile: profiles.get(String(c.senderId)) || null,
        recipientProfile: profiles.get(String(c.recipientId)) || null,
      }
    })

    return NextResponse.json({ ok: true, challenges: enriched })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as { message?: string })?.message ?? String(e) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const userId = String(auth.user.id || '').trim()
    if (!userId) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`social:challenges:post:${userId}:${ip}`, 10, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!

    const admin = createAdminClient()

    if ('opponentId' in body && body.action === 'create') {
      const opponentId = String(body.opponentId).trim()
      if (!opponentId || opponentId === userId) {
        return NextResponse.json({ ok: false, error: 'invalid_opponent' }, { status: 400 })
      }

      // Check we follow each other
      const { data: followCheck } = await admin
        .from('social_follows')
        .select('status')
        .eq('follower_id', userId)
        .eq('following_id', opponentId)
        .eq('status', 'accepted')
        .maybeSingle()

      if (!followCheck) {
        return NextResponse.json({ ok: false, error: 'must_follow_opponent' }, { status: 403 })
      }

      const deadlineDays = body.deadlineDays || 7
      const deadline = new Date(Date.now() + deadlineDays * 24 * 60 * 60 * 1000).toISOString()

      const { data: me } = await admin.from('profiles').select('display_name').eq('id', userId).maybeSingle()
      const myName = String(me?.display_name || '').trim() || 'Seu amigo'

      const typeLabels: Record<string, string> = {
        workouts_count: 'treinos',
        streak: 'dias seguidos',
      }
      const typeLabel = typeLabels[body.type] || body.type

      const challengeId = `challenge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

      await insertNotifications([{
        user_id: opponentId,
        recipient_id: opponentId,
        sender_id: userId,
        type: 'challenge_created',
        title: 'Novo desafio!',
        message: `${myName} te desafiou: ${body.targetValue} ${typeLabel} em ${deadlineDays} dias!`,
        is_read: false,
        metadata: {
          challengeId,
          challengeType: body.type,
          targetValue: body.targetValue,
          deadline,
          deadlineDays,
          status: 'pending',
          creatorProgress: 0,
          opponentProgress: 0,
          sender_id: userId,
        },
      }])

      return NextResponse.json({ ok: true, challengeId })
    }

    if ('challengeId' in body) {
      const challengeId = String(body.challengeId).trim()
      const action = body.action

      const { data: me } = await admin.from('profiles').select('display_name').eq('id', userId).maybeSingle()
      const myName = String(me?.display_name || '').trim() || 'Seu amigo'

      if (action === 'accept') {
        // Notify the challenger
        const { data: original } = await admin
          .from('notifications')
          .select('sender_id, metadata')
          .eq('user_id', userId)
          .eq('type', 'challenge_created')
          .order('created_at', { ascending: false })
          .limit(50)

        const match = (Array.isArray(original) ? original : []).find((r) => {
          const meta = r.metadata && typeof r.metadata === 'object' ? r.metadata as Record<string, unknown> : {}
          return meta.challengeId === challengeId
        })

        if (!match) return NextResponse.json({ ok: false, error: 'challenge_not_found' }, { status: 404 })

        const challengerId = String(match.sender_id || '').trim()

        await insertNotifications([{
          user_id: challengerId,
          recipient_id: challengerId,
          sender_id: userId,
          type: 'challenge_accepted',
          title: 'Desafio aceito!',
          message: `${myName} aceitou seu desafio!`,
          is_read: false,
          metadata: {
            ...(match.metadata as Record<string, unknown>),
            status: 'active',
          },
        }])

        return NextResponse.json({ ok: true, action: 'accepted' })
      }

      if (action === 'decline') {
        const { data: original } = await admin
          .from('notifications')
          .select('sender_id, metadata')
          .eq('user_id', userId)
          .eq('type', 'challenge_created')
          .order('created_at', { ascending: false })
          .limit(50)

        const match = (Array.isArray(original) ? original : []).find((r) => {
          const meta = r.metadata && typeof r.metadata === 'object' ? r.metadata as Record<string, unknown> : {}
          return meta.challengeId === challengeId
        })

        if (match) {
          const challengerId = String(match.sender_id || '').trim()
          await insertNotifications([{
            user_id: challengerId,
            recipient_id: challengerId,
            sender_id: userId,
            type: 'challenge_declined',
            title: 'Desafio recusado',
            message: `${myName} recusou seu desafio.`,
            is_read: false,
            metadata: { ...(match.metadata as Record<string, unknown>), status: 'declined' },
          }])
        }

        return NextResponse.json({ ok: true, action: 'declined' })
      }
    }

    return NextResponse.json({ ok: false, error: 'invalid_action' }, { status: 400 })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as { message?: string })?.message ?? String(e) }, { status: 500 })
  }
}

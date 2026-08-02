import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { parseJsonBody } from '@/utils/zod'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { createAdminClient } from '@/utils/supabase/admin'
import { insertNotifications } from '@/lib/social/notifyFollowers'
import { cacheSetNx } from '@/utils/cache'

export const dynamic = 'force-dynamic'

const EMOJIS = ['🔥', '💪', '👏', '🫡', '❤️'] as const

const BodySchema = z
  .object({
    storyId: z.string().optional(),
    story_id: z.string().optional(),
    emoji: z.string(),
  })
  .strip()

/**
 * POST /api/social/stories/react — Add/toggle emoji reaction on a story.
 * Uses existing `social_story_likes` table with a naming convention:
 * Stores reaction as metadata in the likes row.
 * 
 * For now, we use notifications to deliver reactions (lightweight approach).
 * A dedicated reactions table can be added later.
 */
export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`social:react:${auth.user.id}:${ip}`, 60, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!

    const storyId = String(body?.storyId || body?.story_id || '').trim()
    const emoji = String(body?.emoji || '').trim()

    if (!storyId) return NextResponse.json({ ok: false, error: 'story_id required' }, { status: 400 })
    if (!EMOJIS.includes(emoji as typeof EMOJIS[number])) {
      return NextResponse.json({ ok: false, error: 'invalid emoji' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Get the story to find the author (coluna real é author_id, não user_id)
    const { data: story } = await admin
      .from('social_stories')
      .select('author_id')
      .eq('id', storyId)
      .maybeSingle()

    if (!story?.author_id) {
      return NextResponse.json({ ok: false, error: 'story_not_found' }, { status: 404 })
    }

    // Registra o like PRIMEIRO via auth.supabase — a RLS (can_view_story) só deixa
    // passar se o usuário PODE VER o story. Antes a notificação era emitida via admin
    // ANTES e INDEPENDENTE disto, então um não-seguidor com o storyId em mãos spammava
    // o autor com "reagiu ao seu story" mesmo sem poder ver o story.
    // Persiste o EMOJI escolhido (antes só gravava o like sem o emoji → a reação "não fixava").
    // Trocar de emoji faz upsert no mesmo (story_id,user_id) e atualiza a reação.
    const { error: likeErr } = await auth.supabase
      .from('social_story_likes')
      .upsert({ story_id: storyId, user_id: auth.user.id, emoji }, { onConflict: 'story_id,user_id' })
    if (likeErr) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })

    // Notifica o autor, com dedup de 5min por (usuário→story) — sem isto, trocar de
    // emoji em loop floodava o autor de notificações (a rota não tinha dedup, ao
    // contrário da rota /like). Não notifica a si mesmo.
    if (story.author_id !== auth.user.id) {
      const isNew = await cacheSetNx(`social:react:push:${storyId}:${auth.user.id}`, '1', 300)
      if (isNew) {
        const { data: me } = await admin
          .from('profiles')
          .select('display_name')
          .eq('id', auth.user.id)
          .maybeSingle()
        const name = String(me?.display_name || '').trim() || 'Alguém'

        await insertNotifications([{
          user_id: story.author_id,
          recipient_id: story.author_id,
          sender_id: auth.user.id,
          type: 'story_reaction',
          title: 'Nova reação',
          message: `${name} reagiu ${emoji} ao seu story.`,
          is_read: false,
          metadata: { story_id: storyId, emoji, sender_id: auth.user.id },
        }])
      }
    }

    return NextResponse.json({ ok: true, emoji, storyId })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

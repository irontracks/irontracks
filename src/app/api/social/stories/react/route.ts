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
 * POST /api/social/stories/react — reação em emoji a um story.
 *
 * Persiste em `social_story_reactions` (uma linha por story+usuário; trocar de
 * emoji é UPDATE). A tabela nasceu na migration `split_story_reactions_from_likes`
 * — o cabeçalho antigo daqui dizia "A dedicated reactions table can be added
 * later", e o "later" chegou junto com os três bugs que a gambiarra causava:
 * reagir marcava curtida, descurtir apagava a reação, e trocar de emoji batia na
 * RLS (a tabela de likes não tem policy de UPDATE) devolvendo 403.
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

    /*
     * Grava a reação PRIMEIRO via auth.supabase — a RLS (can_view_story) só deixa
     * passar se o usuário PODE VER o story. Antes a notificação era emitida via
     * admin ANTES e INDEPENDENTE disto, então um não-seguidor com o storyId em
     * mãos spammava o autor com "reagiu ao seu story" sem poder ver o story.
     *
     * A reação mora em `social_story_reactions` desde a migration
     * `split_story_reactions_from_likes`. Antes ela era um upsert em
     * `social_story_likes`, e isso trazia três problemas de uma vez:
     *   - reagir marcava o usuário como tendo CURTIDO (a listagem conta qualquer
     *     linha daquela tabela) e somava +1 no contador de curtidas;
     *   - descurtir fazia DELETE da linha e apagava a reação junto;
     *   - `social_story_likes` NÃO tem policy de UPDATE, e upsert vira
     *     `INSERT ... ON CONFLICT DO UPDATE` — então TROCAR de emoji, ou reagir
     *     depois de já ter curtido, batia na RLS e voltava 403. A tabela nova
     *     nasceu com a policy de UPDATE.
     */
    const { error: likeErr } = await auth.supabase
      .from('social_story_reactions')
      .upsert({ story_id: storyId, user_id: auth.user.id, emoji, updated_at: new Date().toISOString() }, { onConflict: 'story_id,user_id' })
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

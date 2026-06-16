import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonBody } from '@/utils/zod'
import { editEntryCore } from '@/lib/nutrition/mutations'

export const dynamic = 'force-dynamic'

/** Edita uma entry. Usada pela fila offline (`nutrition_edit`). */

const ItemSchema = z.object({
  label: z.string().transform((s) => s.slice(0, 120)),
  grams: z.coerce.number().nonnegative(),
  calories: z.coerce.number().nonnegative(),
  protein: z.coerce.number().nonnegative(),
  carbs: z.coerce.number().nonnegative(),
  fat: z.coerce.number().nonnegative(),
})

// macros opcionais: a edição por ITENS manda só { food_name, items }; jobs
// offline antigos (macro-only) seguem válidos.
const BodySchema = z
  .object({
    entryId: z.string().min(1),
    draft: z.object({
      food_name: z.string().transform((s) => s.slice(0, 120)),
      calories: z.coerce.number().nonnegative().optional(),
      protein: z.coerce.number().nonnegative().optional(),
      carbs: z.coerce.number().nonnegative().optional(),
      fat: z.coerce.number().nonnegative().optional(),
      items: z.array(ItemSchema).optional(),
    }),
  })
  .strip()

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const userId = String(auth.user.id || '').trim()

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`nutrition:edit-entry:${userId}:${ip}`, 30, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response) return parsed.response

    const { entryId, draft } = parsed.data!
    const { totals } = await editEntryCore(auth.supabase, userId, entryId, draft)
    return NextResponse.json({ ok: true, totals })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: message || 'nutrition_edit_entry_failed' }, { status: 500 })
  }
}

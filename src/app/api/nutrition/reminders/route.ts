/**
 * POST /api/nutrition/reminders
 * Body: { reminders: [{hour, minute, label, enabled}] }
 *
 * Replaces the user's reminder schedule (upsert).
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { getErrorMessage } from '@/utils/errorMessage'

export const dynamic = 'force-dynamic'

const ReminderSchema = z.object({
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59).default(0),
  label: z.string().min(1).max(50).default('Refeição'),
  enabled: z.boolean().default(true),
})

const BodySchema = z.object({
  reminders: z.array(ReminderSchema).max(10),
})

export async function GET(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const userId = auth.user.id
    const { data, error } = await auth.supabase
      .from('nutrition_meal_reminders')
      .select('id, hour, minute, label, enabled')
      .eq('user_id', userId)
      .order('hour')
      .order('minute')
    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true, reminders: data || [] })
  } catch (e) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const userId = auth.user.id

    const body = await req.json()
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 })
    }

    const { reminders } = parsed.data

    // Delete all existing then insert new ones (clean replace)
    await auth.supabase
      .from('nutrition_meal_reminders')
      .delete()
      .eq('user_id', userId)

    if (reminders.length > 0) {
      const { error } = await auth.supabase
        .from('nutrition_meal_reminders')
        .insert(
          reminders.map(r => ({
            user_id: userId,
            hour: r.hour,
            minute: r.minute,
            label: r.label,
            enabled: r.enabled,
          }))
        )
      if (error) throw new Error(error.message)
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { parseJsonBody } from '@/utils/zod'
import { requireUser } from '@/utils/auth/route'
import { checkRateLimitAsync } from '@/utils/rateLimit'
// NEEDS ADMIN: RLS bypass required for cross-user data operations
import { createAdminClient } from '@/utils/supabase/admin'
import { checkVipFeatureAccess } from '@/utils/vip/limits'
import { errorResponse } from '@/utils/api'
import type { VipPeriodizationQuestionnaire } from '@/utils/vip/periodization'
import { createPeriodizationProgram } from '@/lib/vip/periodizationCreate'

export const dynamic = 'force-dynamic'

const BodySchema = z
  .object({
    model: z.enum(['linear', 'undulating']),
    weeks: z.union([z.literal(4), z.literal(6), z.literal(8)]),
    goal: z.enum(['hypertrophy', 'strength', 'recomp']).default('hypertrophy'),
    level: z.enum(['beginner', 'intermediate', 'advanced']).default('intermediate'),
    daysPerWeek: z.number().int().min(2).max(6).default(4),
    timeMinutes: z.number().int().min(30).max(90).default(60),
    equipment: z.array(z.string()).default([]),
    limitations: z.string().default(''),
    preferredSplit: z.string().optional(),
    focusMuscles: z.array(z.string()).optional(),
    startDate: z.string().optional().nullable(),
  })
  .strict()

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const userId = String(auth.user.id || '').trim()
    const access = await checkVipFeatureAccess(auth.supabase, userId, 'wizard_weekly')
    if (!access.allowed) {
      return NextResponse.json(
        { ok: false, error: 'limit_reached', upgradeRequired: true, message: 'Limite de gerações do Wizard atingido. Faça upgrade para continuar.' },
        { status: 403 },
      )
    }

    const rl = await checkRateLimitAsync(`vip-periodization:${userId}`, 3, 3_600_000)
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: 'rate_limit_exceeded' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
      )
    }

    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response) return parsed.response
    const q = parsed.data as VipPeriodizationQuestionnaire

    // Self-service: o próprio usuário é dono E autor.
    const admin = createAdminClient()
    // namePrefix 'VIP' preserva o nome histórico dos treinos do self-service.
    const result = await createPeriodizationProgram(admin, { ownerUserId: userId, authorUserId: userId, questionnaire: q, namePrefix: 'VIP' })

    return NextResponse.json({
      ok: true,
      program: { id: result.programId, createdWorkoutIds: result.createdWorkoutIds },
      split: result.split,
      weeks: result.weeks,
    })
  } catch (e: unknown) {
    return errorResponse(e)
  }
}

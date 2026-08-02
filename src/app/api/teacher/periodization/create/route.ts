import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseJsonBody } from '@/utils/zod'
import { requireRole } from '@/utils/auth/route'
import { canCoachStudent } from '@/utils/auth/studentAccess'
import { checkRateLimitAsync } from '@/utils/rateLimit'
// NEEDS ADMIN: grava a periodização na conta do ALUNO (cross-user) via service-role.
import { createAdminClient } from '@/utils/supabase/admin'
import { checkVipFeatureAccess, incrementVipUsage } from '@/utils/vip/limits'
import { errorResponse } from '@/utils/api'
import type { VipPeriodizationQuestionnaire } from '@/utils/vip/periodization'
import { createPeriodizationProgram } from '@/lib/vip/periodizationCreate'

export const dynamic = 'force-dynamic'

// Professor monta uma periodização PRO ALUNO. Mesmo motor do self-service VIP
// (createPeriodizationProgram), mas dono = aluno, autor = professor. Gate canCoachStudent
// (só aluno DELE) + cota na conta do professor.
const BodySchema = z
  .object({
    studentId: z.string().min(1),
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
  .strip()

export async function POST(req: Request) {
  try {
    const auth = await requireRole(['admin', 'teacher'])
    if (!auth.ok) return auth.response
    const teacherId = String(auth.user.id || '').trim()

    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response) return parsed.response
    const body = parsed.data as { studentId: string } & VipPeriodizationQuestionnaire
    const studentId = String(body.studentId || '').trim()

    // Só o professor DAQUELE aluno (ou admin) pode montar a periodização dele.
    if (!(await canCoachStudent({ id: teacherId, email: auth.user.email }, studentId))) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    // Cota conta na conta de QUEM gera (o professor).
    const access = await checkVipFeatureAccess(auth.supabase, teacherId, 'wizard_weekly')
    if (!access.allowed) {
      return NextResponse.json(
        { ok: false, error: 'limit_reached', upgradeRequired: true, message: 'Limite de gerações atingido. Faça upgrade para continuar.' },
        { status: 403 },
      )
    }

    const rl = await checkRateLimitAsync(`teacher-periodization:${teacherId}`, 5, 3_600_000)
    if (!rl.allowed) {
      return NextResponse.json({ ok: false, error: 'rate_limit_exceeded' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } })
    }

    const admin = createAdminClient()
    const result = await createPeriodizationProgram(admin, {
      ownerUserId: studentId,   // o programa é do ALUNO
      authorUserId: teacherId,  // criado pelo professor (created_by nos treinos + config)
      questionnaire: body,
    })

    await incrementVipUsage(auth.supabase, teacherId, 'wizard')

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

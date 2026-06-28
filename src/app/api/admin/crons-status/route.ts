/**
 * GET /api/admin/crons-status
 *
 * Retorna o status de cada cron job baseado no rastro que cada um deixa
 * na tabela `notifications`. Não tem uma tabela dedicada de cron-logs
 * (nem precisa) — todos os crons que importam inserem rows com `type`
 * específico, então a presença de uma row recente é prova de que o
 * cron rodou.
 *
 * Resposta:
 *   {
 *     ok: true,
 *     crons: [
 *       { id, path, schedule, label, lastRunAt, expectedWithin, status }
 *     ]
 *   }
 *
 * Status:
 *   'ok'      → rodou dentro da janela esperada
 *   'stale'   → rodou um dia, mas faz mais que o esperado
 *   'silent'  → nunca rodou ou faz dias/semanas (a tabela não tem trace)
 *   'unknown' → cron não popula notifications direto (ex: teacher-plan-suspend
 *               que só faz UPDATE/DELETE silencioso)
 */
import { NextResponse } from 'next/server'
import { requireRoleOrBearer } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { getErrorMessage } from '@/utils/errorMessage'
import { respondDbError } from '@/utils/api/dbError'

export const dynamic = 'force-dynamic'

/** Catálogo dos crons configurados em vercel.json. Cada um descreve
 *  como detectar se rodou e o que esperar como janela. */
const CRON_CATALOG = [
  {
    id: 'birthday',
    path: '/api/cron/birthday',
    schedule: '0 11 * * *',
    label: 'Aniversariantes',
    /** Tipo de notification que esse cron insere. Null = sem trace direto. */
    notificationType: 'birthday',
    /** Tolerância em horas além do schedule pra considerar OK. */
    toleranceHours: 36,
  },
  {
    id: 'streak-at-risk',
    path: '/api/cron/streak-at-risk',
    schedule: '0 0 * * *',
    label: 'Streak em risco',
    notificationType: 'streak_at_risk',
    toleranceHours: 36,
  },
  {
    id: 'inactivity-nudge',
    path: '/api/cron/inactivity-nudge',
    schedule: '0 12 * * *',
    label: 'Aluno inativo',
    notificationType: 'inactivity_nudge',
    toleranceHours: 36,
  },
  {
    id: 'morning-briefing',
    path: '/api/cron/morning-briefing',
    schedule: '0 10 * * *',
    label: 'Bom dia',
    notificationType: 'morning_briefing',
    toleranceHours: 36,
  },
  {
    id: 'weekly-recap',
    path: '/api/cron/weekly-recap',
    schedule: '0 11 * * 1',
    label: 'Resumo semanal',
    notificationType: 'weekly_recap',
    /** Cron weekly → 8 dias de tolerância. */
    toleranceHours: 192,
  },
  {
    id: 'friends-trained-today',
    path: '/api/cron/friends-trained-today',
    schedule: '0 23 * * *',
    label: 'Amigos treinaram hoje',
    notificationType: 'friends_trained_today',
    toleranceHours: 36,
  },
  {
    id: 'water-reminder',
    path: '/api/cron/water-reminder',
    schedule: '0 17 * * *',
    label: 'Lembrete de água',
    notificationType: 'water_reminder',
    toleranceHours: 36,
  },
  {
    id: 'trial-ending',
    path: '/api/cron/trial-ending',
    schedule: '0 13 * * *',
    label: 'Trial acabando',
    notificationType: 'trial_ending',
    toleranceHours: 48,
  },
  {
    id: 'teacher-plan-expiring',
    path: '/api/cron/teacher-plan-expiring',
    schedule: '0 13 * * *',
    label: 'Plano do prof expirando',
    notificationType: 'teacher_plan_expiring',
    toleranceHours: 48,
  },
  {
    id: 'teacher-plan-suspend',
    path: '/api/cron/teacher-plan-suspend',
    schedule: '0 6 * * *',
    label: 'Suspender prof inadimplente',
    // Esse cron faz UPDATE direto na tabela teacher_plans, não insere
    // notificação. Marcamos 'unknown' como status default.
    notificationType: null,
    toleranceHours: 36,
  },
  {
    id: 'whatsapp-reactivation',
    path: '/api/cron/whatsapp-reactivation',
    schedule: '0 14 * * *',
    label: 'WhatsApp — Reativação',
    // Insere em whatsapp_conversations, não em notifications.
    notificationType: null,
    toleranceHours: 36,
  },
] as const

type CronStatus = 'ok' | 'stale' | 'silent' | 'unknown'

interface CronStatusResult {
  id: string
  path: string
  schedule: string
  label: string
  /** ISO timestamp da última execução detectada, ou null. */
  lastRunAt: string | null
  /** Horas desde a última execução, ou null se nunca. */
  hoursSinceLastRun: number | null
  status: CronStatus
}

export async function GET(req: Request) {
  try {
    const auth = await requireRoleOrBearer(req, ['admin'])
    if (!auth.ok) return auth.response

    const admin = createAdminClient()

    // Busca a notification mais recente de cada tipo em 1 query agregada.
    // Cron rodando há mais de 30 dias = tratamos como silent.
    const lookbackIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const typesNeeded: string[] = CRON_CATALOG
      .map(c => c.notificationType)
      .filter((t): t is NonNullable<typeof t> => !!t)

    const { data: rows, error } = await admin
      .from('notifications')
      .select('type, created_at')
      .in('type', typesNeeded)
      .gte('created_at', lookbackIso)
      .order('created_at', { ascending: false })
      .limit(500)

    if (error) {
      return respondDbError('admin:crons-status', error)
    }

    // Pra cada tipo, encontra o mais recente.
    const lastByType = new Map<string, string>()
    for (const row of rows || []) {
      const t = String((row as { type?: string })?.type || '')
      const at = String((row as { created_at?: string })?.created_at || '')
      if (!t || !at) continue
      if (!lastByType.has(t)) lastByType.set(t, at)
    }

    const now = Date.now()
    const results: CronStatusResult[] = CRON_CATALOG.map(c => {
      const lastRunAtRaw = c.notificationType ? lastByType.get(c.notificationType) ?? null : null
      const lastRunMs = lastRunAtRaw ? new Date(lastRunAtRaw).getTime() : null
      const hours = lastRunMs ? (now - lastRunMs) / (1000 * 60 * 60) : null

      let status: CronStatus
      if (!c.notificationType) {
        status = 'unknown'
      } else if (hours == null) {
        status = 'silent'
      } else if (hours <= c.toleranceHours) {
        status = 'ok'
      } else {
        status = 'stale'
      }

      return {
        id: c.id,
        path: c.path,
        schedule: c.schedule,
        label: c.label,
        lastRunAt: lastRunAtRaw,
        hoursSinceLastRun: hours == null ? null : Math.round(hours * 10) / 10,
        status,
      }
    })

    return NextResponse.json({ ok: true, crons: results })
  } catch (e) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}

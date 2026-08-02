import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseJsonBody } from '@/utils/zod'
import { requireRole } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { checkRateLimitAsync } from '@/utils/rateLimit'
import { respondDbError } from '@/utils/api/dbError'
import { safeEmailLike } from '@/utils/safePgFilter'
import { logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/* ──────────────────────────────────────────────────────────
 * POST /api/teacher/students/invite
 *
 * O professor CADASTRA um aluno (email + nome) — este é o convite E a aprovação de uma vez.
 * Cria a linha `students` (com teacher_id = professor) + um access_request PRÉ-APROVADO, para
 * que quando o aluno fizer o "primeiro acesso" (OTP por email) o handle_new_user já marque
 * is_approved=true e vincule a conta — pulando o wait-approval.
 *
 * Segurança (espelha o consent-gate de admin/students/assign-teacher):
 *  - só admin/teacher;
 *  - o professor só convida email SEM conta (`profiles`) existente — reivindicar conta já
 *    cadastrada exige consentimento do aluno/admin (anti-sequestro);
 *  - respeita o limite de alunos do plano do professor (teacher_can_add_student);
 *  - se a linha `students` já existe e é de OUTRO professor, recusa.
 * Tudo via service-role (o professor não tem escrita direta nessas tabelas).
 * ────────────────────────────────────────────────────────── */

const BodySchema = z
  .object({
    email: z.preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() : ''), z.string().email()),
    fullName: z.preprocess((v) => (typeof v === 'string' ? v.trim() : ''), z.string().min(2, 'Nome muito curto').transform((s) => s.slice(0, 120))),
    phone: z.preprocess((v) => (typeof v === 'string' ? v.trim() : ''), z.string().max(30)).optional(),
    birthDate: z.string().optional().nullable(),
  })
  .strip()

export async function POST(req: Request) {
  try {
    const auth = await requireRole(['admin', 'teacher'])
    if (!auth.ok) return auth.response
    const callerId = String(auth.user.id || '').trim()

    const rl = await checkRateLimitAsync(`teacher-invite:${callerId}`, 30, 60_000)
    if (!rl.allowed) {
      return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } })
    }

    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response) return parsed.response
    const { email, fullName } = parsed.data as { email: string; fullName: string; phone?: string; birthDate?: string | null }
    const phone = String((parsed.data as { phone?: string }).phone || '').trim() || null
    const birthDate = (parsed.data as { birthDate?: string | null }).birthDate || null

    const admin = createAdminClient()

    // Consent-gate (anti-sequestro): convidar é pra email NOVO. Se já existe uma conta real
    // (`profiles`), o professor NÃO pode "reivindicá-la" — o aluno faz login normal, ou o
    // admin vincula. Mesmo racional de admin/students/assign-teacher.
    const { data: existingProfile } = await admin
      .from('profiles')
      .select('id')
      .ilike('email', safeEmailLike(email))
      .maybeSingle()
    if (existingProfile?.id) {
      return NextResponse.json(
        { ok: false, error: 'already_registered', message: 'Este email já tem uma conta no app. Peça pro aluno fazer login normalmente.' },
        { status: 409 },
      )
    }

    // Linha `students`: se já existe e é de OUTRO professor, recusa; senão vincula ao caller.
    const { data: existingStudent } = await admin
      .from('students')
      .select('id, teacher_id, user_id')
      .ilike('email', safeEmailLike(email))
      .maybeSingle()

    if (existingStudent?.id) {
      const owner = String(existingStudent.teacher_id || '').trim()
      if (owner && owner !== callerId) {
        return NextResponse.json({ ok: false, error: 'belongs_to_other_teacher', message: 'Este aluno já pertence a outro professor.' }, { status: 403 })
      }
    }

    // Limite de alunos do plano — SÓ pro professor. O admin é isento (não tem plano; a RPC
    // teacher_can_add_student cairia no 'free' max=2 e travaria o admin no 3º cadastro). Isso
    // espelha o override is_admin() do trigger e a lógica da rota admin/students/assign-teacher.
    const isTeacherCaller = auth.role === 'teacher'
    const isNewLink = !existingStudent?.id || String(existingStudent.teacher_id || '') !== callerId
    if (isTeacherCaller && isNewLink) {
      const { data: canAdd, error: limitErr } = await admin.rpc('teacher_can_add_student', { p_teacher_user_id: callerId })
      if (limitErr) return respondDbError('teacher:invite:limit', limitErr)
      if (!canAdd) {
        return NextResponse.json(
          { ok: false, error: 'limit_reached', upgrade_required: true, message: 'Limite de alunos atingido. Faça upgrade do seu plano para adicionar mais alunos.' },
          { status: 402 },
        )
      }
    }

    // Upsert da linha `students` (placeholder sem user_id — o vínculo com a conta acontece
    // no handle_new_user quando o aluno faz o primeiro acesso).
    const STUDENT_COLS = 'id, email, name, teacher_id, user_id, status'
    let studentRow: Record<string, unknown> | null = null
    if (existingStudent?.id) {
      const { data, error: updErr } = await admin
        .from('students')
        .update({ name: fullName, teacher_id: callerId, status: 'ativo' })
        .eq('id', existingStudent.id)
        .select(STUDENT_COLS)
        .maybeSingle()
      if (updErr) return respondDbError('teacher:invite:student-update', updErr)
      studentRow = data ?? null
    } else {
      const { data, error: insErr } = await admin
        .from('students')
        .insert({ email, name: fullName, teacher_id: callerId, status: 'ativo' })
        .select(STUDENT_COLS)
        .single()
      if (insErr) return respondDbError('teacher:invite:student-insert', insErr)
      studentRow = data ?? null
    }

    // Access_request PRÉ-APROVADO: é o que faz o handle_new_user marcar is_approved=true no
    // primeiro acesso (pulando o wait-approval). Upsert por email (uma solicitação por email).
    const { data: existingReq } = await admin
      .from('access_requests')
      .select('id')
      .ilike('email', safeEmailLike(email))
      .maybeSingle()

    const reqPayload = {
      email,
      full_name: fullName,
      phone,
      birth_date: birthDate,
      role_requested: 'student',
      status: 'approved',
      updated_at: new Date().toISOString(),
    }
    if (existingReq?.id) {
      const { error: reqErr } = await admin.from('access_requests').update(reqPayload).eq('id', existingReq.id)
      if (reqErr) return respondDbError('teacher:invite:req-update', reqErr)
    } else {
      const { error: reqErr } = await admin.from('access_requests').insert(reqPayload)
      if (reqErr) return respondDbError('teacher:invite:req-insert', reqErr)
    }

    // Trilha de auditoria — quem convidou/pré-aprovou quem (best-effort).
    try {
      await admin.from('audit_events').insert({
        actor_id: callerId,
        actor_email: String(auth.user.email || '').trim() || null,
        actor_role: String(auth.role || 'teacher'),
        action: 'teacher_invite_student',
        entity_type: 'access_request',
        entity_id: email,
        metadata: { email, full_name: fullName },
      })
    } catch (e) { logError('teacher:invite:audit', e) }

    return NextResponse.json({ ok: true, student: studentRow, message: 'Aluno cadastrado. Ele já pode fazer o primeiro acesso com o email.' })
  } catch (e: unknown) {
    logError('teacher:invite', e)
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 })
  }
}

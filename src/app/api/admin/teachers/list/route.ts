import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { jsonError, requireRole, resolveRoleByUser } from '@/utils/auth/route'
import { z } from 'zod'
import { parseSearchParams } from '@/utils/zod'

export const dynamic = 'force-dynamic'

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().max(100).optional(),
})

export async function GET(req: Request) {
  try {
    const admin = createAdminClient()
    const auth = await requireRole(['admin'])
    if (!auth.ok) {
      const token = String(req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
      if (!token) return auth.response
      const { data, error } = await admin.auth.getUser(token)
      const user = data?.user ?? null
      if (error || !user?.id) return auth.response
      const { role } = await resolveRoleByUser({ id: user.id, email: user.email })
      if (role !== 'admin') return jsonError(403, 'forbidden')
    }

    const { data: q, response } = parseSearchParams(req, QuerySchema)
    if (response) return response

    let query = admin
      .from('teachers')
      .select('id, name, email, status, created_at, user_id, asaas_wallet_id, asaas_account_id, asaas_account_status')
      .order('name')
      .range(q?.offset || 0, (q?.offset || 0) + (q?.limit || 50) - 1)

    if (q?.search) {
      query = query.ilike('name', `%${q.search}%`)
    }

    const { data: rows, error } = await query

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    const teachers = rows || []
    const emails = Array.from(new Set(teachers.map((t) => (t.email || '').toLowerCase()).filter(Boolean)))
    let idByEmail = new Map<string, string>()
    if (emails.length) {
      const { data: profiles } = await admin.from('profiles').select('id, email').in('email', emails)
      for (const p of profiles || []) {
        if (p.email) idByEmail.set(p.email.toLowerCase(), p.id)
      }
    }
    const normalizeKey = (t: Record<string, unknown>) => {
      const uid = String(t?.user_id || '').trim()
      if (uid) return `user:${uid}`
      const e = String(t?.email || '').toLowerCase().trim()
      if (e) return `email:${e}`
      const n = String(t?.name || '').toLowerCase().trim()
      return n ? `name:${n}` : `id:${String(t?.id || '')}`
    }

    const toComparableTime = (value: unknown) => {
      const ts = Date.parse(String(value || ''))
      return Number.isFinite(ts) ? ts : 0
    }

    const scoreTeacher = (t: Record<string, unknown>) => {
      const hasWallet = Boolean(String(t?.asaas_wallet_id || '').trim())
      const hasAccount = Boolean(String(t?.asaas_account_id || '').trim())
      const hasUser = Boolean(String(t?.user_id || '').trim())
      const createdAt = toComparableTime(t?.created_at)
      return {
        score: (hasWallet ? 100 : 0) + (hasAccount ? 10 : 0) + (hasUser ? 1 : 0),
        createdAt,
      }
    }

    const bestByKey = new Map<string, any>()
    for (const t of teachers) {
      const enriched = {
        ...t,
        user_id: t.user_id || (t.email ? idByEmail.get(String(t.email).toLowerCase()) || null : null),
      }
      const key = normalizeKey(enriched)
      const current = bestByKey.get(key)
      if (!current) {
        bestByKey.set(key, enriched)
        continue
      }
      const a = scoreTeacher(enriched)
      const b = scoreTeacher(current)
      if (a.score > b.score) {
        bestByKey.set(key, enriched)
        continue
      }
      if (a.score === b.score && a.createdAt > b.createdAt) {
        bestByKey.set(key, enriched)
      }
    }

    const result = Array.from(bestByKey.values()).sort((a, b) => {
      const an = String(a?.name || a?.email || '').toLowerCase()
      const bn = String(b?.name || b?.email || '').toLowerCase()
      return an.localeCompare(bn)
    })

    return NextResponse.json({ ok: true, teachers: result })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole } from '@/utils/auth/route'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const auth = await requireRole(['admin'])
    if (!auth.ok) return auth.response

    const admin = createAdminClient()
    const { data: rows, error } = await admin
      .from('teachers')
      .select('id, name, email, status, created_at, user_id, asaas_wallet_id, asaas_account_id, asaas_account_status')
      .order('name')
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    const teachers = rows || []
    const emails = Array.from(new Set(teachers.map(t => (t.email || '').toLowerCase()).filter(Boolean)))
    let idByEmail = new Map<string, string>()
    if (emails.length) {
      const { data: profiles } = await admin
        .from('profiles')
        .select('id, email')
        .in('email', emails)
      for (const p of profiles || []) {
        if (p.email) idByEmail.set(p.email.toLowerCase(), p.id)
      }
    }
    const normalizeKey = (t: any) => {
      const uid = String(t?.user_id || '').trim()
      if (uid) return `user:${uid}`
      const e = String(t?.email || '').toLowerCase().trim()
      if (e) return `email:${e}`
      const n = String(t?.name || '').toLowerCase().trim()
      return n ? `name:${n}` : `id:${String(t?.id || '')}`
    }

    const toComparableTime = (value: any) => {
      const ts = Date.parse(String(value || ''))
      return Number.isFinite(ts) ? ts : 0
    }

    const scoreTeacher = (t: any) => {
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
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

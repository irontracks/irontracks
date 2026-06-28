/**
 * GET /api/teachers/my-invoices
 *
 * Lists every IronTracks plan invoice the calling teacher has, ordered by
 * created_at DESC. Returns pending PIX invoices (with QR code + payload still
 * attached so the teacher can pay them straight from the screen) and historical
 * approved / refunded / cancelled invoices.
 *
 * Schema source: `app_payments` rows where `raw.scope = 'teacher_plan'`. The
 * checkout route writes the pending invoice; the MercadoPago webhook updates
 * status. This endpoint just reads.
 *
 * Used by the "Faturas" tab inside TeacherUpgradeModal.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { getErrorMessage } from '@/utils/errorMessage'
import { respondDbError } from '@/utils/api/dbError'

export const dynamic = 'force-dynamic'

interface RawShape {
  scope?: string
  tier_key?: string
  plan_name?: string
}

const PAGE_SIZE = 50

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const admin = createAdminClient()

    // Filter by JSON column: raw->>scope = 'teacher_plan'
    // Postgrest syntax: .filter('raw->>scope', 'eq', 'teacher_plan')
    const { data, error } = await admin
      .from('app_payments')
      .select(`
        id, amount_cents, currency, status, provider, provider_payment_id,
        pix_qr_code, pix_payload, invoice_url, due_date, paid_at, created_at, raw
      `)
      .eq('user_id', user.id)
      .filter('raw->>scope', 'eq', 'teacher_plan')
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)

    if (error) {
      return respondDbError('teacher:my_invoices', error)
    }

    const invoices = (data ?? []).map((row) => {
      const rawObj = (row.raw ?? {}) as RawShape
      return {
        id: String(row.id),
        amount_cents: Number(row.amount_cents) || 0,
        currency: String(row.currency || 'BRL'),
        status: String(row.status || 'unknown'),
        provider: String(row.provider || ''),
        provider_payment_id: row.provider_payment_id ? String(row.provider_payment_id) : null,
        // We only expose PIX data while the invoice is still payable. Hide
        // for closed invoices so the UI can't accidentally re-prompt PIX.
        pix_qr_code: row.status === 'pending' ? row.pix_qr_code : null,
        pix_payload: row.status === 'pending' ? row.pix_payload : null,
        invoice_url: row.invoice_url ? String(row.invoice_url) : null,
        due_date: row.due_date ? String(row.due_date) : null,
        paid_at: row.paid_at ? String(row.paid_at) : null,
        created_at: row.created_at ? String(row.created_at) : null,
        tier_key: rawObj.tier_key ?? null,
        plan_name: rawObj.plan_name ?? null,
      }
    })

    return NextResponse.json({ ok: true, invoices })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}

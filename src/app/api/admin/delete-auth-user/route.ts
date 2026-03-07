import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { getErrorMessage } from '@/utils/errorMessage'

export const dynamic = 'force-dynamic'

/**
 * Minimal route: deletes a user from auth.users using service_role key.
 * Expects: POST { user_id: string, token: string }
 * The token is the caller's access_token — validated to ensure the caller
 * is a real authenticated user with admin or teacher role.
 */
export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({})) as Record<string, unknown>
        const userId = String(body?.user_id || '').trim()
        const token = String(body?.token || '').trim()

        if (!userId) return NextResponse.json({ ok: false, error: 'user_id required' }, { status: 400 })
        if (!token) return NextResponse.json({ ok: false, error: 'token required' }, { status: 400 })

        const admin = createAdminClient()

        // Validate the caller's token
        const { data: caller, error: callerErr } = await admin.auth.getUser(token)
        if (callerErr || !caller?.user?.id) {
            return NextResponse.json({ ok: false, error: 'invalid token' }, { status: 401 })
        }

        // Check that caller is admin or teacher
        const callerId = caller.user.id
        const callerEmail = String(caller.user.email || '').trim().toLowerCase()
        const adminEmail = (process.env.IRONTRACKS_ADMIN_EMAIL || process.env.ADMIN_EMAIL || '').trim().toLowerCase()
        let isAllowed = false

        // Check env admin email
        if (adminEmail && callerEmail === adminEmail) isAllowed = true

        // Check profiles.role
        if (!isAllowed) {
            try {
                const { data: profile } = await admin.from('profiles').select('role').eq('id', callerId).maybeSingle()
                const role = String(profile?.role || '').toLowerCase()
                if (role === 'admin' || role === 'teacher') isAllowed = true
            } catch { }
        }

        // Check teachers table
        if (!isAllowed) {
            try {
                const { data: t } = await admin.from('teachers').select('id').eq('user_id', callerId).maybeSingle()
                if (t?.id) isAllowed = true
            } catch { }
        }

        if (!isAllowed) {
            return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
        }

        // Don't allow deleting yourself
        if (userId === callerId) {
            return NextResponse.json({ ok: false, error: 'cannot delete yourself' }, { status: 400 })
        }

        // Delete the user from auth.users
        const { error: deleteErr } = await admin.auth.admin.deleteUser(userId)
        if (deleteErr) {
            return NextResponse.json({ ok: false, error: String(deleteErr.message || 'failed') }, { status: 400 })
        }

        return NextResponse.json({ ok: true })
    } catch (e: unknown) {
        return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
    }
}

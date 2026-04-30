/**
 * @module utils/admin/resolveStudent
 *
 * Single source of truth for resolving an "AdminUser" identifier into a real
 * `students` row. Used by every admin route that mutates student data.
 *
 * Why this exists
 * ───────────────
 * The admin panel's student list is a UNION of two sources:
 *
 *   1. Real students (rows in `students` table) — `AdminUser.id = students.id`
 *   2. Pending profiles (users that signed up but don't have a `students` row
 *      yet) — `AdminUser.id = "pending_<profile.id>"`, where `profile.id` is
 *      the auth uid.
 *
 * Every mutation route used to assume "id = students.id", so any action on a
 * pending profile would silently fail with `student_not_found` or insert with
 * `name=null`, hitting the NOT NULL constraint on `students.name`. This bug
 * was patched piecemeal in assign-teacher, status, and delete — and kept
 * regressing because each route reinvented the resolver.
 *
 * This helper centralizes the resolution logic so the bug can only be fixed
 * (or broken) in ONE place. It also auto-creates the `students` row from the
 * matching profile data when the AdminUser came from the pending fallback,
 * so subsequent operations succeed.
 *
 * Behavior
 * ────────
 * - Strips the `pending_` prefix and treats the remainder as a profile UUID.
 * - Tries `students.id`, `students.user_id`, then email lookup, in order.
 * - If none match AND we have a profile UUID or an email, auto-creates a
 *   minimal `students` row with `name` filled from `profile.display_name`,
 *   the email's local-part, or the email itself — so the NOT NULL constraint
 *   never trips.
 * - Returns `null` only if every avenue is exhausted (truly invalid input).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { safePgLike } from '@/utils/safePgFilter'

export interface ResolvedStudent {
    id: string
    user_id: string | null
    teacher_id: string | null
    email: string | null
    name: string | null
    status: string | null
    /** True when the row was just created by this resolver. */
    created: boolean
}

interface ResolveOpts {
    /** Caller-supplied identifier — may be students.id, profiles.id, or `pending_<uuid>`. */
    id?: string | null
    /** Optional explicit email fallback (taken from AdminUser.email on the client). */
    email?: string | null
    /** When true, auto-create a `students` row from profile data if no match. Defaults to true. */
    autoCreate?: boolean
}

const SELECT_COLS = 'id, user_id, teacher_id, email, name, status'

/**
 * Strip the "pending_" prefix from an AdminUser id, if present.
 * Returns the bare profile UUID, or the input unchanged.
 */
export function unwrapPendingId(rawId: string): string {
    return rawId.startsWith('pending_') ? rawId.slice('pending_'.length) : rawId
}

/**
 * Build a safe `name` from whatever data is available, in priority order.
 * Guarantees a non-empty string — never returns null.
 */
function deriveName(profileDisplayName: unknown, email: string | null | undefined): string {
    const displayName = String(profileDisplayName ?? '').trim()
    if (displayName) return displayName
    const emailStr = String(email ?? '').trim()
    if (emailStr) {
        const local = emailStr.split('@')[0]?.trim()
        if (local) return local
        return emailStr
    }
    return 'Aluno'
}

/**
 * Resolve an AdminUser identifier into a concrete `students` row.
 *
 * @returns The resolved row, or `null` if no row exists and auto-create
 *   couldn't run (no profile data and no email available).
 */
export async function resolveStudentRow(
    admin: SupabaseClient,
    opts: ResolveOpts,
): Promise<ResolvedStudent | null> {
    const rawId = String(opts.id || '').trim()
    const email = String(opts.email || '').trim()
    const autoCreate = opts.autoCreate !== false

    if (!rawId && !email) return null

    const unwrappedId = rawId ? unwrapPendingId(rawId) : ''

    const fetchByColumn = async (column: 'id' | 'user_id', value: string) => {
        if (!value) return null
        const { data } = await admin.from('students').select(SELECT_COLS).eq(column, value).maybeSingle()
        return (data as Record<string, unknown> | null) ?? null
    }

    const fetchByEmail = async (value: string) => {
        if (!value) return null
        const { data } = await admin.from('students').select(SELECT_COLS).ilike('email', safePgLike(value)).maybeSingle()
        return (data as Record<string, unknown> | null) ?? null
    }

    // ── 1. Try every lookup avenue against an existing row ───────────────
    let row =
        (await fetchByColumn('id', unwrappedId))
        ?? (await fetchByColumn('user_id', unwrappedId))
        ?? (await fetchByEmail(email))

    if (row) {
        return {
            id: String(row.id || ''),
            user_id: row.user_id ? String(row.user_id) : null,
            teacher_id: row.teacher_id ? String(row.teacher_id) : null,
            email: row.email ? String(row.email) : null,
            name: row.name ? String(row.name) : null,
            status: row.status ? String(row.status) : null,
            created: false,
        }
    }

    if (!autoCreate) return null

    // ── 2. No match — try to materialize from the profile ────────────────
    // Look up the profile by either the unwrapped id (when caller sent
    // `pending_<uuid>` or a raw profiles.id) or by email.
    type ProfileRow = { id?: unknown; email?: unknown; display_name?: unknown }
    let profile: ProfileRow | null = null

    if (unwrappedId) {
        const { data } = await admin
            .from('profiles')
            .select('id, email, display_name')
            .eq('id', unwrappedId)
            .maybeSingle()
        profile = (data as ProfileRow | null) ?? null
    }
    if (!profile && email) {
        const { data } = await admin
            .from('profiles')
            .select('id, email, display_name')
            .ilike('email', safePgLike(email))
            .maybeSingle()
        profile = (data as ProfileRow | null) ?? null
    }

    const profileId: string = profile?.id ? String(profile.id) : ''
    const profileEmail: string = profile?.email ? String(profile.email).trim() : email
    const profileDisplayName: unknown = profile?.display_name ?? null

    if (!profileId && !profileEmail) return null

    // Build INSERT payload with a guaranteed non-null `name`. The NOT NULL
    // constraint on `students.name` was the root of the recurring
    // "null value in column 'name'" error — derive a sensible fallback
    // (display_name → email local-part → email → "Aluno").
    const payload: Record<string, unknown> = {
        name: deriveName(profileDisplayName, profileEmail),
        status: 'pendente',
    }
    if (profileEmail) payload.email = profileEmail
    if (profileId) payload.user_id = profileId

    const { data: insertedRaw, error: insErr } = await admin
        .from('students')
        .insert(payload)
        .select(SELECT_COLS)
        .single()

    if (insErr || !insertedRaw) return null

    const inserted = insertedRaw as Record<string, unknown>
    return {
        id: String(inserted.id || ''),
        user_id: inserted.user_id ? String(inserted.user_id) : null,
        teacher_id: inserted.teacher_id ? String(inserted.teacher_id) : null,
        email: inserted.email ? String(inserted.email) : null,
        name: inserted.name ? String(inserted.name) : null,
        status: inserted.status ? String(inserted.status) : null,
        created: true,
    }
}

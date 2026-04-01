import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'
import { safePg, safePgLike } from '@/utils/safePgFilter'
import { logError } from '@/lib/logger'

export type IrontracksRole = 'admin' | 'teacher' | 'user'
export type RouteAuthFail = { ok: false; response: NextResponse<{ ok: false; error: string }>; supabase?: undefined; user?: undefined; role?: undefined }
export type RouteAuthOk = { ok: true; supabase: SupabaseClient; user: User; role: IrontracksRole; response?: undefined }

const getAdminEmail = () => {
  const envEmail = (process.env.IRONTRACKS_ADMIN_EMAIL || process.env.ADMIN_EMAIL || '').trim().toLowerCase()
  return envEmail || ''
}

export const jsonError = (status: number, error: string) => {
  return NextResponse.json({ ok: false as const, error }, { status })
}

export const getInternalSecret = () => {
  return (process.env.IRONTRACKS_INTERNAL_SECRET || '').trim()
}

export const hasValidInternalSecret = (req: Request) => {
  const secret = getInternalSecret()
  if (!secret) return false
  const provided = (req.headers.get('x-internal-secret') || '').trim()
  return provided === secret
}

export async function requireUser() {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.getUser()
    const user = data?.user ?? null
    if (error || !user?.id) {
      return { ok: false as const, response: jsonError(401, 'unauthorized') }
    }
    return { ok: true as const, supabase, user }
  } catch (e) {
    logError('requireUser', e)
    return { ok: false as const, response: jsonError(401, 'unauthorized') }
  }
}

export async function resolveRoleByUser(user: { id?: string | null; email?: string | null }) {
  const userId = user?.id ? String(user.id) : ''
  const email = String(user?.email || '').trim().toLowerCase()
  if (!userId) return { role: 'user' as IrontracksRole }
  if (email && email === getAdminEmail()) return { role: 'admin' as IrontracksRole }

  const admin = createAdminClient()

  try {
    const { data: profile } = await admin.from('profiles').select('role').eq('id', userId).maybeSingle()
    const role = String(profile?.role || '').toLowerCase()
    if (role === 'admin' || role === 'teacher') return { role: role as IrontracksRole }
  } catch (e) { logError('resolveRoleByUser.profileRole', e) }

  try {
    const { data: teacherById } = await admin.from('teachers').select('id').eq('user_id', userId).maybeSingle()
    if (teacherById?.id) return { role: 'teacher' as IrontracksRole }
  } catch (e) { logError('resolveRoleByUser.teacherById', e) }

  try {
    if (email) {
      const { data: teacherByEmail } = await admin.from('teachers').select('id').ilike('email', safePgLike(email)).maybeSingle()
      if (teacherByEmail?.id) return { role: 'teacher' as IrontracksRole }
    }
  } catch (e) { logError('resolveRoleByUser.teacherByEmail', e) }

  return { role: 'user' as IrontracksRole }
}

export async function requireRole(allowed: IrontracksRole[]): Promise<RouteAuthFail | RouteAuthOk> {
  const auth = await requireUser()
  if (!auth.ok) return auth as RouteAuthFail

  const { role } = await resolveRoleByUser({ id: auth.user.id, email: auth.user.email })
  const allowedSet = new Set((Array.isArray(allowed) ? allowed : []).filter(Boolean))
  if (!allowedSet.has(role)) {
    return { ok: false as const, response: jsonError(403, 'forbidden') }
  }

  return { ok: true as const, supabase: auth.supabase, user: auth.user, role }
}

/**
 * Cookie session auth with automatic Bearer token fallback.
 * Replaces the 8-line inline pattern repeated across admin routes.
 *
 * Usage:
 *   const auth = await requireRoleOrBearer(req, ['admin'])
 *   if (!auth.ok) return auth.response
 */
export async function requireRoleOrBearer(req: Request, allowed: IrontracksRole[]): Promise<RouteAuthFail | RouteAuthOk> {
  const cookieAuth = await requireRole(allowed)
  if (cookieAuth.ok) return cookieAuth
  return requireRoleWithBearer(req, allowed)
}

export async function requireRoleWithBearer(req: Request, allowed: IrontracksRole[]): Promise<RouteAuthFail | RouteAuthOk> {
  try {
    const token = String(req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
    if (!token) return { ok: false as const, response: jsonError(401, 'unauthorized') }

    const admin = createAdminClient()
    const { data, error } = await admin.auth.getUser(token)
    const user = data?.user ?? null
    if (error || !user?.id) {
      return { ok: false as const, response: jsonError(401, 'unauthorized') }
    }

    const { role } = await resolveRoleByUser({ id: user.id, email: user.email })
    const allowedSet = new Set((Array.isArray(allowed) ? allowed : []).filter(Boolean))
    if (!allowedSet.has(role)) {
      return { ok: false as const, response: jsonError(403, 'forbidden') }
    }

    // Return a user-scoped client (not the admin client) so RLS policies apply.
    // The admin client was only needed to validate the Bearer token and resolve the role.
    const userScoped = await createClient()
    return { ok: true as const, supabase: userScoped, user, role }
  } catch (e) {
    logError('requireRoleWithBearer', e)
    return { ok: false as const, response: jsonError(401, 'unauthorized') }
  }
}

export const isSafeStoragePath = (path: unknown) => {
  const p = typeof path === 'string' ? path.trim() : ''
  if (!p) return { ok: false as const, error: 'path required' }
  if (p.length > 512) return { ok: false as const, error: 'path too long' }
  if (p.includes('..') || p.includes('\\') || p.includes('\0')) return { ok: false as const, error: 'invalid path' }
  if (p.startsWith('/')) return { ok: false as const, error: 'invalid path' }
  const parts = p.split('/').filter(Boolean)
  if (parts.length < 2) return { ok: false as const, error: 'invalid path' }
  const channelId = parts[0]
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (!uuidRe.test(channelId)) return { ok: false as const, error: 'invalid channel' }
  return { ok: true as const, path: p, channelId }
}

export async function canUploadToChatMediaPath(userId: string, channelId: string) {
  const uid = String(userId || '').trim()
  const cid = String(channelId || '').trim()
  if (!uid || !cid) return false

  const admin = createAdminClient()

  try {
    const { data: direct } = await admin
      .from('direct_channels')
      .select('id')
      .eq('id', cid)
      .or(`user1_id.eq.${safePg(uid)},user2_id.eq.${safePg(uid)}`)
      .maybeSingle()
    if (direct?.id) return true
  } catch (e) { logError('canUploadToChatMediaPath.directChannel', e) }

  try {
    const { data: member } = await admin.from('chat_members').select('id').eq('channel_id', cid).eq('user_id', uid).maybeSingle()
    if (member?.id) return true
  } catch (e) { logError('canUploadToChatMediaPath.chatMember', e) }

  return false
}

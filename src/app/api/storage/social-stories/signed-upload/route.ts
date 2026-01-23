import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { isSafeStoragePath, requireUser } from '@/utils/auth/route'

export const dynamic = 'force-dynamic'

const isAllowedStoryPath = (userId: string, path: string) => {
  const uid = String(userId || '').trim()
  const p = String(path || '').trim()
  if (!uid || !p) return false
  const parts = p.split('/').filter(Boolean)
  if (parts.length < 3) return false
  if (parts[0] !== uid) return false
  if (parts[1] !== 'stories') return false
  return true
}

export async function POST(request: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => ({}))
    const { path } = body || {}
    const bucket = 'social-stories'

    const safe = isSafeStoragePath(path)
    if (!safe.ok) return NextResponse.json({ ok: false, error: safe.error }, { status: 400 })
    if (!isAllowedStoryPath(auth.user.id, safe.path)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })

    const admin = createAdminClient()
    const b = await admin.storage.getBucket(bucket)
    if (!b?.data) await admin.storage.createBucket(bucket, { public: false })

    const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(safe.path)
    if (error || !data) return NextResponse.json({ ok: false, error: error?.message || 'failed to sign' }, { status: 400 })

    return NextResponse.json({ ok: true, bucket, path: safe.path, token: data.token })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}


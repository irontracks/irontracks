import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { canUploadToChatMediaPath, isSafeStoragePath, requireUser } from '@/utils/auth/route'

export async function POST(request: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const admin = createAdminClient()
    const body = await request.json()
    const { bucket = 'chat-media', path } = body || {}
    if (bucket !== 'chat-media') return NextResponse.json({ ok: false, error: 'invalid bucket' }, { status: 400 })

    const safe = isSafeStoragePath(path)
    if (!safe.ok) return NextResponse.json({ ok: false, error: safe.error }, { status: 400 })

    const allowed = await canUploadToChatMediaPath(auth.user.id, safe.channelId)
    if (!allowed) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })

    const b = await admin.storage.getBucket(bucket)
    if (!b?.data) await admin.storage.createBucket(bucket, { public: true })

    const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(safe.path)
    if (error || !data) return NextResponse.json({ ok: false, error: error?.message || 'failed to sign' }, { status: 400 })

    return NextResponse.json({ ok: true, path: safe.path, token: data.token })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

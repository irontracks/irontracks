import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

export async function POST(request: Request) {
  try {
    const admin = createAdminClient()
    const body = await request.json()
    const { bucket = 'chat-media', path } = body || {}
    if (!path) return NextResponse.json({ ok: false, error: 'path required' }, { status: 400 })

    const b = await admin.storage.getBucket(bucket)
    if (!b?.data) await admin.storage.createBucket(bucket, { public: true })

    const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(path)
    if (error || !data) return NextResponse.json({ ok: false, error: error?.message || 'failed to sign' }, { status: 400 })

    return NextResponse.json({ ok: true, path, token: data.token })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}


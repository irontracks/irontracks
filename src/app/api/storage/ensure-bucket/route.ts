import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

export async function POST(request: Request) {
  try {
    const admin = createAdminClient()
    const body = await request.json().catch(() => ({}))
    const name = body?.name || 'chat-media'

    const existing = await admin.storage.getBucket(name)
    if (!existing?.data) {
      await admin.storage.createBucket(name, { public: true })
    } else {
      // Ensure bucket is public for cross-user access to media
      if (!existing.data.public) {
        await admin.storage.updateBucket(name, { public: true })
      }
    }
    return NextResponse.json({ ok: true, name })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}


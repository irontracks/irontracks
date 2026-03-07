import { NextResponse } from 'next/server'
import { parseJsonBody } from '@/utils/zod'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireUser } from '@/utils/auth/route'
import { getErrorMessage } from '@/utils/errorMessage'

const ZodBodySchema = z
  .object({
    name: z.string().optional(),
  })
  .strip()

export async function POST(request: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const admin = createAdminClient()
    const parsedBody = await parseJsonBody(request, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = (parsedBody.data ?? {}) as z.infer<typeof ZodBodySchema>
    const name = body?.name || 'chat-media'
    if (name !== 'chat-media') return NextResponse.json({ ok: false, error: 'invalid bucket' }, { status: 400 })

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
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}

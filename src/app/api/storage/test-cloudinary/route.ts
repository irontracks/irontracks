import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { requireUser } from '@/utils/auth/route'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET
  const provider = process.env.NEXT_PUBLIC_STORAGE_PROVIDER

  if (!cloudName || !apiKey || !apiSecret) {
    return NextResponse.json({
      ok: false,
      provider,
      missing: [
        !cloudName && 'CLOUDINARY_CLOUD_NAME',
        !apiKey && 'CLOUDINARY_API_KEY',
        !apiSecret && 'CLOUDINARY_API_SECRET',
      ].filter(Boolean),
    })
  }

  // Test signature computation
  const timestamp = Math.round(Date.now() / 1000)
  const folder = 'irontracks/stories'
  const publicId = 'test/ping'
  const params = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}`
  const signature = createHash('sha1').update(params + apiSecret).digest('hex')

  // Ping Cloudinary API to validate credentials
  const form = new FormData()
  form.append('api_key', apiKey)
  form.append('timestamp', String(timestamp))
  form.append('signature', signature)
  form.append('folder', folder)
  form.append('public_id', publicId)

  try {
    const pingRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: form,
    })
    const pingJson = await pingRes.json() as { secure_url?: string; error?: { message?: string } }

    if (pingRes.ok && pingJson.secure_url) {
      return NextResponse.json({ ok: true, provider, cloudName, message: 'Credentials valid', url: pingJson.secure_url })
    }
    return NextResponse.json({ ok: false, provider, cloudName, error: pingJson.error?.message || `HTTP ${pingRes.status}` })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, provider, cloudName, error: String(e) })
  }
}

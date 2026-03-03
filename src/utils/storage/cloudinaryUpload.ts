import { logWarn } from '@/lib/logger'

interface CloudinaryUploadResult {
  /** Full public CDN URL — stored directly in social_stories.media_path */
  url: string
  publicId: string
}

/**
 * Upload a Blob to Cloudinary using a server-signed request.
 * Uses fetch (not XHR) — XHR fails on iOS Capacitor WKWebView with remote server.url.
 * Progress is simulated: 0% → 50% on start → 100% on completion.
 * The server signs the request — API secret never touches the client.
 */
export async function uploadToCloudinary(
  blob: Blob,
  uid: string,
  mimeType: string,
  onProgress?: (bytesUploaded: number, bytesTotal: number) => void
): Promise<CloudinaryUploadResult> {
  const ext = mimeType.includes('video') ? 'mp4' : 'jpg'
  const publicId = `${uid}/${crypto.randomUUID()}`
  const folder = 'irontracks/stories'

  // Step 1: Get signature from our server (keeps API secret server-side)
  const signRes = await fetch('/api/storage/sign-cloudinary', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ publicId, folder }),
  })
  if (!signRes.ok) {
    const err = await signRes.json().catch(() => ({}))
    throw new Error(String((err as { error?: string }).error || 'Falha ao assinar upload Cloudinary'))
  }
  const sign = await signRes.json() as {
    signature: string; timestamp: number; apiKey: string
    cloudName: string; folder: string; publicId: string; uploadUrl: string
  }

  // Simulate progress start (fetch doesn't support upload progress events)
  onProgress?.(0, blob.size)

  // Step 2: Upload directly to Cloudinary CDN via fetch
  const form = new FormData()
  form.append('file', blob, `story.${ext}`)
  form.append('api_key', sign.apiKey)
  form.append('timestamp', String(sign.timestamp))
  form.append('signature', sign.signature)
  form.append('folder', sign.folder)
  form.append('public_id', sign.publicId)

  const res = await fetch(sign.uploadUrl, { method: 'POST', body: form })
  const data = await res.json().catch(() => ({})) as { secure_url?: string; error?: { message?: string } }

  if (!res.ok || !data.secure_url) {
    const msg = data.error?.message || `Cloudinary error ${res.status}`
    logWarn('cloudinaryUpload', msg)
    throw new Error(msg)
  }

  return { url: data.secure_url, publicId: `${folder}/${sign.publicId}` }
}

/** Returns true if a media_path value is a Cloudinary URL (not a Supabase relative path) */
export function isCloudinaryUrl(mediaPath: string): boolean {
  return mediaPath.startsWith('https://res.cloudinary.com/')
}

import { logError, logWarn } from '@/lib/logger'

interface CloudinaryUploadResult {
  /** Full public CDN URL — stored directly in social_stories.media_path */
  url: string
  publicId: string
}

/**
 * Upload a Blob to Cloudinary using a server-signed request.
 * Uses XMLHttpRequest so we get real upload progress (fetch doesn't support this).
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

  // Step 2: Upload directly to Cloudinary CDN (bypasses our server = faster)
  const form = new FormData()
  form.append('file', blob, `story.${ext}`)
  form.append('api_key', sign.apiKey)
  form.append('timestamp', String(sign.timestamp))
  form.append('signature', sign.signature)
  form.append('folder', sign.folder)
  form.append('public_id', sign.publicId)

  const url = await new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', sign.uploadUrl)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded, e.total)
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText) as { secure_url?: string }
          if (data.secure_url) return resolve(data.secure_url)
        } catch { /* fall through */ }
        reject(new Error('Resposta inválida do Cloudinary'))
      } else {
        let msg = `Cloudinary error ${xhr.status}`
        try { msg = (JSON.parse(xhr.responseText) as { error?: { message?: string } }).error?.message || msg } catch { }
        logWarn('cloudinaryUpload', msg)
        reject(new Error(msg))
      }
    }

    xhr.onerror = () => reject(new Error('Falha de rede no upload Cloudinary'))
    xhr.ontimeout = () => reject(new Error('Timeout no upload Cloudinary'))
    xhr.timeout = 120_000 // 2 min
    xhr.send(form)
  })

  return { url, publicId: `${folder}/${sign.publicId}` }
}

/** Returns true if a media_path value is a Cloudinary URL (not a Supabase relative path) */
export function isCloudinaryUrl(mediaPath: string): boolean {
  return mediaPath.startsWith('https://res.cloudinary.com/')
}

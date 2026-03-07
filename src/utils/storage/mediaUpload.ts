/**
 * Unified story media upload abstraction.
 *
 * Provider is controlled by NEXT_PUBLIC_STORAGE_PROVIDER:
 *   'cloudinary' → uploads to Cloudinary CDN, returns full URL
 *   'supabase'   → uploads via TUS to Supabase Storage, returns relative path (default)
 *
 * Reverting to Supabase: set NEXT_PUBLIC_STORAGE_PROVIDER=supabase in Vercel env vars.
 * Existing Cloudinary URLs remain valid (they're stored as full https:// in the DB).
 */

import { uploadWithTus } from '@/utils/storage/tusUpload'
import { uploadToCloudinary } from '@/utils/storage/cloudinaryUpload'
import { createClient } from '@/utils/supabase/client'
import { logWarn } from '@/lib/logger'

type ProgressCallback = (bytesUploaded: number, bytesTotal: number) => void

function getProvider(): 'cloudinary' | 'supabase' {
  const raw = String(process.env.NEXT_PUBLIC_STORAGE_PROVIDER || '').trim().toLowerCase()
  return raw === 'cloudinary' ? 'cloudinary' : 'supabase'
}

/**
 * Upload story media blob.
 * @returns media_path — Cloudinary full URL OR Supabase relative path
 *
 * This value is stored directly in social_stories.media_path.
 * The /api/social/stories/media route handles both formats.
 */
export async function uploadStoryMedia(
  blob: Blob,
  uid: string,
  mimeType: string,
  onProgress?: ProgressCallback
): Promise<string> {
  const provider = getProvider()

  if (provider === 'cloudinary') {
    try {
      const { url } = await uploadToCloudinary(blob, uid, mimeType, onProgress)
      // Simulate 100% progress at the end (XHR doesn't fire a final onprogress at exactly 100%)
      onProgress?.(blob.size, blob.size)
      return url
    } catch (err) {
      logWarn('mediaUpload', 'Cloudinary upload failed, falling back to Supabase', err)
    }
  }

  // Supabase TUS upload (default or fallback)
  const ext = mimeType.includes('video')
    ? (mimeType.includes('webm') ? '.webm' : '.mp4')
    : '.jpg'
  const storyId = crypto.randomUUID()
  const path = `${uid}/stories/${storyId}${ext}`

  await uploadWithTus(blob, 'social-stories', path, mimeType, onProgress)
  return path // relative path — same format as before
}

/**
 * Upload story media via Supabase signed URL (used by StoriesBar).
 * @returns media_path — Cloudinary full URL OR Supabase relative path
 */
export async function uploadStoryFile(
  file: File,
  uid: string,
  onProgress?: ProgressCallback
): Promise<string> {
  const provider = getProvider()
  const mimeType = file.type || (file.name.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg')

  if (provider === 'cloudinary') {
    try {
      const { url } = await uploadToCloudinary(file, uid, mimeType, onProgress)
      onProgress?.(file.size, file.size)
      return url
    } catch (err) {
      logWarn('mediaUpload', 'Cloudinary upload failed, falling back to Supabase', err)
    }
  }

  // Supabase signed URL upload (original StoriesBar flow)
  const rawName = String(file?.name || '').trim().toLowerCase()
  const extMatch = rawName.match(/\.(mp4|mov|webm|jpg|jpeg|png|gif|webp)$/)
  const ext = extMatch ? `.${extMatch[1]}` : (mimeType.includes('video') ? '.mp4' : '.jpg')
  const storyId = crypto.randomUUID()
  const path = `${uid}/stories/${storyId}${ext}`

  const signRes = await fetch('/api/storage/social-stories/signed-upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path, contentType: mimeType }),
  })
  const signJson = await signRes.json() as { ok?: boolean; token?: string; error?: string }
  if (!signRes.ok || !signJson?.ok || !signJson?.token) {
    throw new Error(String(signJson?.error || 'Falha ao obter URL de upload'))
  }

  const supabase = createClient()
  const { error: upErr } = await supabase.storage
    .from('social-stories')
    .uploadToSignedUrl(path, String(signJson.token), file, { contentType: mimeType })
  if (upErr) throw upErr

  return path // relative path — same format as before
}

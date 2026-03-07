import * as tus from 'tus-js-client'
import { createClient } from '@/utils/supabase/client'
import { logInfo, logError, logWarn } from '@/lib/logger'

// 2-minute hard timeout — prevents hanging forever on bad network / iOS WKWebView quirks
const TUS_TIMEOUT_MS = 120_000

export async function uploadWithTus(
  file: Blob | File,
  bucketName: string,
  fileName: string,
  contentType: string,
  onProgress?: (bytesUploaded: number, bytesTotal: number) => void
): Promise<void> {
  const supabase = createClient()
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()

  if (sessionError || !session) {
    throw new Error('User must be logged in to upload')
  }

  const uploadPromise = new Promise<void>((resolve, reject) => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    if (!supabaseUrl) {
      return reject(new Error('NEXT_PUBLIC_SUPABASE_URL is missing'))
    }
    const endpoint = `${supabaseUrl}/storage/v1/upload/resumable`

    const upload = new tus.Upload(file, {
      endpoint,
      retryDelays: [0, 3000, 5000, 10000],
      headers: {
        authorization: `Bearer ${session.access_token}`,
        'x-upsert': 'true',
      },
      uploadDataDuringCreation: true,
      metadata: {
        bucketName,
        objectName: fileName,
        contentType,
        cacheControl: '3600',
      },
      chunkSize: 6 * 1024 * 1024, // 6MB
      onError: (error) => {
        logError('TUS', 'Upload error', error)
        reject(error)
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        onProgress?.(bytesUploaded, bytesTotal)
      },
      onSuccess: () => {
        logInfo('TUS', `Upload success: ${fileName}`)
        resolve()
      },
    })

    // findPreviousUploads uses IndexedDB which can hang in some WKWebView setups.
    // If it fails, just start fresh — don't reject.
    upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads.length) {
        upload.resumeFromPreviousUpload(previousUploads[0])
      }
      upload.start()
    }).catch((err) => {
      logWarn('TUS', 'findPreviousUploads failed, starting fresh', err)
      upload.start()
    })
  })

  return Promise.race([
    uploadPromise,
    new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error(`Upload timeout after ${TUS_TIMEOUT_MS / 1000}s`)), TUS_TIMEOUT_MS)
    ),
  ])
}

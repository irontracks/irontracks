import * as tus from 'tus-js-client'
import { createClient } from '@/utils/supabase/client'
import { logInfo, logError } from '@/lib/logger'

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

  return new Promise((resolve, reject) => {
    // Determine endpoints from env
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    if (!supabaseUrl) {
      return reject(new Error('NEXT_PUBLIC_SUPABASE_URL is missing'))
    }
    const endpoint = `${supabaseUrl}/storage/v1/upload/resumable`

    const upload = new tus.Upload(file, {
      endpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
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
        logError('error', 'TUS upload error:', error)
        reject(error)
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        if (onProgress) {
          onProgress(bytesUploaded, bytesTotal)
        }
      },
      onSuccess: () => {
        logInfo('info', `TUS upload success: ${fileName}`)
        resolve()
      },
    })

    upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads.length) {
        upload.resumeFromPreviousUpload(previousUploads[0])
      }
      upload.start()
    }).catch((error) => {
      logError('error', 'Failed to find previous TUS uploads:', error)
      reject(error)
    })
  })
}

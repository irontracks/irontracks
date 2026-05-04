/**
 * High-level wrapper for the native iOS story-video composer.
 *
 * Pipeline:
 *   1. Write source video Blob → Cache directory (so AVFoundation can read it)
 *   2. Write transparent overlay PNG Blob → Cache directory
 *   3. Call IronTracksNative.composeStoryVideo (AVMutableComposition + VideoToolbox)
 *   4. Read resulting MP4 back as a Blob via Capacitor.convertFileSrc + fetch
 *   5. Delete temp files
 *
 * Why bother with disk round-trips? AVFoundation operates on file URLs, not
 * in-memory buffers — passing a 100 MB video through the JS↔native bridge as
 * base64 would be slower than the export itself. File paths cost a few ms.
 *
 * Caller must verify `isIosNative()` before invoking. Falls back gracefully
 * (returns null) on any failure so the JS Canvas+MediaRecorder path can take
 * over without UX disruption.
 */

import { Capacitor } from '@capacitor/core'
import { isIosNative } from '@/utils/platform'
import {
  composeStoryVideoNative,
  addStoryComposeProgressListener,
  cancelStoryComposeNative,
} from '@/utils/native/irontracksNative'
import { logWarn } from '@/lib/logger'

interface ComposeStoryNativeInput {
  videoBlob: Blob
  videoExt: string
  overlayBlob: Blob
  outputWidth: number
  outputHeight: number
  trimStartSec: number
  trimEndSec: number
  onProgress?: (progress: number) => void
}

interface ComposeStoryNativeResult {
  blob: Blob
  filename: string
  mime: string
  durationSec: number
}

/**
 * Convert Blob → base64 string in chunks (avoids stack overflow on big buffers).
 * Same pattern as saveBlobToPhotos in irontracksNative.ts.
 */
const blobToBase64 = async (blob: Blob): Promise<string> => {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

/**
 * Try to compose the story video natively on iOS. Returns null on any failure
 * (caller should fall back to the JS pipeline).
 */
export const composeStoryVideoOnIos = async (
  input: ComposeStoryNativeInput,
): Promise<ComposeStoryNativeResult | null> => {
  if (!isIosNative()) return null

  let videoTempPath: string | null = null
  let overlayTempPath: string | null = null
  let outputNativePath: string | null = null
  let progressUnsubscribe: (() => void) | null = null

  try {
    // Lazy-import to avoid bundling Filesystem on web builds where it's unused.
    const { Filesystem, Directory } = await import('@capacitor/filesystem')

    const timestamp = Date.now()
    const safeExt = (input.videoExt || '.mp4').replace(/^\.+/, '').toLowerCase()
    const videoFilename = `irontracks-source-${timestamp}.${safeExt}`
    const overlayFilename = `irontracks-overlay-${timestamp}.png`

    // 1. Write source video to Cache
    const videoB64 = await blobToBase64(input.videoBlob)
    const videoWrite = await Filesystem.writeFile({
      path: videoFilename,
      data: videoB64,
      directory: Directory.Cache,
    })
    videoTempPath = String(videoWrite.uri || '').replace(/^file:\/\//, '')
    if (!videoTempPath) throw new Error('write_video_failed')

    // 2. Write overlay PNG to Cache
    const overlayB64 = await blobToBase64(input.overlayBlob)
    const overlayWrite = await Filesystem.writeFile({
      path: overlayFilename,
      data: overlayB64,
      directory: Directory.Cache,
    })
    overlayTempPath = String(overlayWrite.uri || '').replace(/^file:\/\//, '')
    if (!overlayTempPath) throw new Error('write_overlay_failed')

    // 3. Subscribe to progress + invoke native composer
    if (input.onProgress) {
      progressUnsubscribe = addStoryComposeProgressListener(input.onProgress)
    }

    const result = await composeStoryVideoNative({
      videoPath: videoTempPath,
      overlayPath: overlayTempPath,
      outputWidth: input.outputWidth,
      outputHeight: input.outputHeight,
      trimStartSec: input.trimStartSec,
      trimEndSec: input.trimEndSec,
    })

    if (result.error || !result.outputPath) {
      throw new Error(`native_compose_failed: ${result.error || 'no_output_path'}`)
    }
    outputNativePath = result.outputPath

    // 4. Read result back via WKWebView-accessible URL (no base64 round-trip)
    const webPath = Capacitor.convertFileSrc(outputNativePath)
    const fetchResponse = await fetch(webPath)
    if (!fetchResponse.ok) {
      throw new Error(`fetch_output_failed: ${fetchResponse.status}`)
    }
    const blob = await fetchResponse.blob()
    if (!blob || blob.size === 0) {
      throw new Error('output_blob_empty')
    }

    return {
      blob,
      filename: `irontracks-story-${timestamp}.mp4`,
      mime: 'video/mp4',
      durationSec: Number(result.durationSec) || 0,
    }
  } catch (e) {
    logWarn('warn', 'Native story compose failed, will fall back to JS pipeline', e)
    return null
  } finally {
    try { progressUnsubscribe?.() } catch { /* swallow */ }

    // Cleanup all temp files (output included — caller already has the Blob in memory)
    if (videoTempPath || overlayTempPath || outputNativePath) {
      try {
        const { Filesystem, Directory } = await import('@capacitor/filesystem')
        const removeQuiet = async (path: string | null) => {
          if (!path) return
          const filename = path.split('/').pop() || ''
          if (!filename) return
          try {
            await Filesystem.deleteFile({ path: filename, directory: Directory.Cache })
          } catch { /* already gone */ }
        }
        await Promise.all([
          removeQuiet(videoTempPath),
          removeQuiet(overlayTempPath),
          removeQuiet(outputNativePath),
        ])
      } catch { /* swallow */ }
    }
  }
}

/**
 * Cancel an in-flight native composition. Safe to call when nothing is running.
 */
export const cancelNativeStoryCompose = async () => {
  try { await cancelStoryComposeNative() } catch { /* swallow */ }
}

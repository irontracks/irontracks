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
 * Diagnostic outcome for the caller. `path` is "native" when AVFoundation ran
 * end-to-end, "fallback" when we returned null and the JS pipeline takes over.
 * `stage` indicates where the native pipeline stopped (for debugging).
 */
export type NativeComposeDiagnostic = {
  path: 'native' | 'fallback'
  durationMs: number
  stage?: 'write_video' | 'write_overlay' | 'native_export' | 'read_output' | 'precondition'
  error?: string
}

/**
 * Read a Blob slice as base64 using the native WebKit FileReader.
 * Far faster than a JS String.fromCharCode + btoa loop because the conversion
 * runs in WebKit's C code (single call for the whole slice).
 */
const readBlobSliceAsBase64 = (slice: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader()
      reader.onloadend = () => {
        try {
          const dataUrl = String(reader.result ?? '')
          const commaIdx = dataUrl.indexOf(',')
          resolve(commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl)
        } catch (e) {
          reject(e)
        }
      }
      reader.onerror = () => reject(new Error('reader_failed'))
      reader.readAsDataURL(slice)
    } catch (e) {
      reject(e)
    }
  })
}

/**
 * Stream a Blob to a Cache file via Filesystem.writeFile + appendFile.
 *
 * The Capacitor bridge serializes plugin calls as JSON, which is slow + memory-
 * heavy for a single 70 MB base64 string. By splitting the blob into 2 MB
 * binary chunks (~2.7 MB base64 each), every cross-bridge call stays small and
 * fast. FileReader.readAsDataURL handles the binary→base64 conversion natively
 * inside WebKit, so the per-chunk overhead is dominated by the disk write
 * (which is also fast on internal flash).
 *
 * Net result for a 100 MB video: ~1-2s vs 15-30s for a single base64 round-trip.
 */
const writeBlobToCacheChunked = async (
  blob: Blob,
  filename: string,
): Promise<string> => {
  const { Filesystem, Directory } = await import('@capacitor/filesystem')

  const CHUNK_SIZE = 2 * 1024 * 1024 // 2 MB binary → ~2.7 MB base64
  const total = blob.size
  let resultUri = ''

  if (total === 0) {
    const r = await Filesystem.writeFile({ path: filename, data: '', directory: Directory.Cache })
    return String(r.uri || '')
  }

  for (let offset = 0, idx = 0; offset < total; offset += CHUNK_SIZE, idx++) {
    const end = Math.min(offset + CHUNK_SIZE, total)
    const slice = blob.slice(offset, end)
    const base64 = await readBlobSliceAsBase64(slice)

    if (idx === 0) {
      const r = await Filesystem.writeFile({
        path: filename,
        data: base64,
        directory: Directory.Cache,
      })
      resultUri = String(r.uri || '')
    } else {
      await Filesystem.appendFile({
        path: filename,
        data: base64,
        directory: Directory.Cache,
      })
    }
  }

  return resultUri
}

/**
 * Try to compose the story video natively on iOS. Returns null on any failure
 * (caller should fall back to the JS pipeline). When `onDiagnostic` is provided,
 * emits where the pipeline stopped + total wall time — useful for diagnosing
 * why the fast path didn't take.
 */
export const composeStoryVideoOnIos = async (
  input: ComposeStoryNativeInput & { onDiagnostic?: (d: NativeComposeDiagnostic) => void },
): Promise<ComposeStoryNativeResult | null> => {
  const t0 = Date.now()
  const emitDiag = (d: Omit<NativeComposeDiagnostic, 'durationMs'>) => {
    try { input.onDiagnostic?.({ ...d, durationMs: Date.now() - t0 }) } catch { /* swallow */ }
  }

  if (!isIosNative()) {
    emitDiag({ path: 'fallback', stage: 'precondition', error: 'not_ios_native' })
    return null
  }

  let videoTempPath: string | null = null
  let overlayTempPath: string | null = null
  let outputNativePath: string | null = null
  let progressUnsubscribe: (() => void) | null = null

  try {
    const timestamp = Date.now()
    const safeExt = (input.videoExt || 'mp4').replace(/^\.+/, '').toLowerCase()
    const videoFilename = `irontracks-source-${timestamp}.${safeExt}`
    const overlayFilename = `irontracks-overlay-${timestamp}.png`

    // ── 1. Stream source video to Cache (chunked base64) ───────────────────
    // The Capacitor iOS Filesystem only accepts string data despite the TS
    // types claiming Blob support. Chunked writes via FileReader keep each
    // bridge call small and fast.
    let videoUri = ''
    try {
      videoUri = await writeBlobToCacheChunked(input.videoBlob, videoFilename)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'write_failed'
      emitDiag({ path: 'fallback', stage: 'write_video', error: msg })
      return null
    }
    videoTempPath = String(videoUri || '').replace(/^file:\/\//, '')
    if (!videoTempPath) {
      emitDiag({ path: 'fallback', stage: 'write_video', error: 'empty_uri' })
      return null
    }

    // ── 2. Stream overlay PNG to Cache (same chunked path; tiny file = 1 chunk) ──
    let overlayUri = ''
    try {
      overlayUri = await writeBlobToCacheChunked(input.overlayBlob, overlayFilename)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'write_failed'
      emitDiag({ path: 'fallback', stage: 'write_overlay', error: msg })
      return null
    }
    overlayTempPath = String(overlayUri || '').replace(/^file:\/\//, '')
    if (!overlayTempPath) {
      emitDiag({ path: 'fallback', stage: 'write_overlay', error: 'empty_uri' })
      return null
    }

    // ── 3. Subscribe to progress + invoke native composer ──────────────────
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
      emitDiag({ path: 'fallback', stage: 'native_export', error: result.error || 'no_output_path' })
      return null
    }
    outputNativePath = result.outputPath

    // ── 4. Read result back via WKWebView-accessible URL (no base64) ───────
    const webPath = Capacitor.convertFileSrc(outputNativePath)
    let blob: Blob
    try {
      const fetchResponse = await fetch(webPath)
      if (!fetchResponse.ok) {
        emitDiag({ path: 'fallback', stage: 'read_output', error: `http_${fetchResponse.status}` })
        return null
      }
      blob = await fetchResponse.blob()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'fetch_failed'
      emitDiag({ path: 'fallback', stage: 'read_output', error: msg })
      return null
    }
    if (!blob || blob.size === 0) {
      emitDiag({ path: 'fallback', stage: 'read_output', error: 'empty_blob' })
      return null
    }

    emitDiag({ path: 'native' })

    return {
      blob,
      filename: `irontracks-story-${timestamp}.mp4`,
      mime: 'video/mp4',
      durationSec: Number(result.durationSec) || 0,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown'
    logWarn('warn', 'Native story compose failed, will fall back to JS pipeline', e)
    emitDiag({ path: 'fallback', stage: 'native_export', error: msg })
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

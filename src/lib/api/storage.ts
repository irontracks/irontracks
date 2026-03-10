/**
 * src/lib/api/storage.ts
 * Typed API client for storage/upload endpoints.
 */
import { apiPost } from './_fetch'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SignedUploadResult {
  ok: boolean
  url: string
  publicUrl?: string
  path?: string
  token?: string
  [key: string]: unknown
}

export interface EnsureBucketResult {
  ok: boolean
}

export interface PrepareVideoResult {
  ok: boolean
  videoId?: string
  uploadUrl?: string
}

// ─── Client ───────────────────────────────────────────────────────────────────

export const apiStorage = {
  /** Get a signed upload URL for a given storage path */
  getSignedUpload: (path: string, contentType?: string) =>
    apiPost<SignedUploadResult>('/api/storage/signed-upload', { path, contentType }),

  /** Ensure a storage bucket exists */
  ensureBucket: (name: string) =>
    apiPost<EnsureBucketResult>('/api/storage/ensure-bucket', { name }),

  /** Prepare an execution video record before upload */
  prepareExecutionVideo: (payload: {
    exercise_name: string
    workout_id?: string
    exercise_id?: string
    exercise_library_id?: string
  }) =>
    apiPost<PrepareVideoResult>('/api/execution-videos/prepare', payload),
}

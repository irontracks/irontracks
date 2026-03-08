/**
 * Story Processing Worker — Item 14 (Block 4)
 *
 * Pops jobs from the Redis queue and processes them:
 * 1. Fetch story from DB
 * 2. Inspect file metadata from Supabase Storage
 * 3. Update the story `meta` column with enriched info
 *
 * Triggered by Vercel Cron every 30s.
 * Protected by CRON_SECRET header.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { dequeueStoryJobs, getQueueDepth, type StoryJobPayload } from '@/lib/queue/storyQueue'
import { logError, logInfo, logWarn } from '@/lib/logger'
import { getErrorMessage } from '@/utils/errorMessage'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Give the worker up to 30s to finish all jobs in a batch
export const maxDuration = 30

const JOBS_PER_BATCH = 5

/** Verify the request comes from Vercel Cron or an authorised internal caller. */
function isAuthorised(req: Request): boolean {
    const secret = process.env.CRON_SECRET
    if (!secret) return false
    const auth = req.headers.get('authorization') ?? ''
    return auth === `Bearer ${secret}`
}

async function processJob(job: StoryJobPayload): Promise<'ok' | 'skip' | 'error'> {
    const admin = createAdminClient()

    // 1. Fetch story — skip if deleted / expired
    const { data: story, error: storyErr } = await admin
        .from('social_stories')
        .select('id, media_path, is_deleted, expires_at, meta')
        .eq('id', job.storyId)
        .maybeSingle()

    if (storyErr || !story) {
        logWarn('StoryWorker', `Story ${job.storyId} not found, skipping`, { error: getErrorMessage(storyErr) })
        return 'skip'
    }
    if (story.is_deleted) return 'skip'
    if (story.expires_at && new Date(String(story.expires_at)).getTime() <= Date.now()) return 'skip'

    // 2. Inspect file metadata from storage
    const mediaPath = String(story.media_path ?? job.mediaPath)
    const pathParts = mediaPath.split('/')
    const fileName = pathParts.at(-1) ?? ''
    const folderPath = pathParts.slice(0, -1).join('/')

    const { data: fileList } = await admin.storage
        .from('social-stories')
        .list(folderPath, { search: fileName, limit: 1 })

    const fileMeta = fileList?.[0]?.metadata ?? {}
    const fileSize = Number(fileMeta.size ?? 0)
    const mimeType = String(fileMeta.mimetype ?? '').toLowerCase()

    // 3. Merge enriched metadata into story.meta
    const existingMeta = (story.meta && typeof story.meta === 'object' ? story.meta : {}) as Record<string, unknown>
    const enriched = {
        ...existingMeta,
        processed: true,
        processedAt: new Date().toISOString(),
        fileSize: fileSize || existingMeta.fileSize,
        mimeType: mimeType || existingMeta.mimeType,
        mediaType: job.mediaType,
    }

    const { error: updateErr } = await admin
        .from('social_stories')
        .update({ meta: enriched })
        .eq('id', job.storyId)

    if (updateErr) {
        logError('StoryWorker', `Failed to update meta for story ${job.storyId}`, updateErr)
        return 'error'
    }

    logInfo('StoryWorker', `Processed story ${job.storyId}`, { mediaType: job.mediaType, fileSize })
    return 'ok'
}

export async function POST(req: Request) {
    if (!isAuthorised(req)) {
        return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    try {
        const depthBefore = await getQueueDepth()
        if (depthBefore === 0) {
            return NextResponse.json({ ok: true, processed: 0, remaining: 0 })
        }

        const jobs = await dequeueStoryJobs(JOBS_PER_BATCH)
        const results = { ok: 0, skip: 0, error: 0 }

        for (const job of jobs) {
            const result = await processJob(job)
            results[result]++
        }

        const remaining = await getQueueDepth()
        logInfo('StoryWorker', 'Batch complete', { ...results, remaining })

        return NextResponse.json({ ok: true, processed: jobs.length, results, remaining })
    } catch (e: unknown) {
        logError('StoryWorker', 'Worker error', e)
        return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
    }
}

// Also allow GET for health-check / queue depth inspection
export async function GET(req: Request) {
    if (!isAuthorised(req)) {
        return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }
    const depth = await getQueueDepth()
    return NextResponse.json({ ok: true, queueDepth: depth })
}

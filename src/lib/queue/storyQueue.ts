/**
 * Story Job Queue — Item 14 (Block 4)
 *
 * Uses Upstash Redis REST API as a lightweight FIFO queue for async story processing.
 * Uses the same fetch-based pattern as the rest of the codebase (no extra dependencies).
 *
 * Queue key: "queue:story-process"
 * Operations: RPUSH to enqueue (tail), LPOP to dequeue (head) → FIFO.
 */

export interface StoryJobPayload {
    storyId: string
    mediaPath: string
    userId: string
    mediaType: 'image' | 'video' | 'unknown'
    /** Unix ms timestamp when the job was enqueued */
    enqueuedAt: number
}

function getUpstashCfg(): { url: string; token: string } | null {
    const url = String(process.env.UPSTASH_REDIS_REST_URL || '').trim()
    const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || '').trim()
    if (!url || !token) return null
    return { url, token }
}

async function redisCmd(cmd: string[]): Promise<unknown> {
    const cfg = getUpstashCfg()
    if (!cfg) throw new Error('Upstash Redis not configured')
    const res = await fetch(`${cfg.url}/${cmd.map(encodeURIComponent).join('/')}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${cfg.token}` },
        cache: 'no-store',
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) throw new Error(`Redis error ${res.status}: ${JSON.stringify(json)}`)
    // Upstash REST API returns { result: ... }
    return (json as Record<string, unknown>)?.result ?? null
}

const QUEUE_KEY = 'queue:story-process'

/** Add a story processing job to the tail of the queue (RPUSH = FIFO). */
export async function enqueueStoryJob(payload: StoryJobPayload): Promise<void> {
    await redisCmd(['RPUSH', QUEUE_KEY, JSON.stringify(payload)])
}

/** Pop up to `count` jobs from the head of the queue. Returns [] if empty. */
export async function dequeueStoryJobs(count: number = 5): Promise<StoryJobPayload[]> {
    const jobs: StoryJobPayload[] = []

    for (let i = 0; i < count; i++) {
        let raw: unknown
        try {
            raw = await redisCmd(['LPOP', QUEUE_KEY])
        } catch {
            break
        }
        if (raw === null || raw === undefined) break
        try {
            const str = typeof raw === 'string' ? raw : JSON.stringify(raw)
            const parsed = JSON.parse(str)
            if (parsed && typeof parsed === 'object' && typeof (parsed as Record<string, unknown>).storyId === 'string') {
                jobs.push(parsed as StoryJobPayload)
            }
        } catch {
            // malformed job — skip
        }
    }

    return jobs
}

/** Get the current queue depth (non-destructive). */
export async function getQueueDepth(): Promise<number> {
    try {
        const result = await redisCmd(['LLEN', QUEUE_KEY])
        return Number(result) || 0
    } catch {
        return 0
    }
}

/** Guess media type from file path extension. */
export function guessMediaType(path: string): StoryJobPayload['mediaType'] {
    const p = String(path || '').toLowerCase()
    if (p.endsWith('.mp4') || p.endsWith('.mov') || p.endsWith('.webm')) return 'video'
    if (p.endsWith('.jpg') || p.endsWith('.jpeg') || p.endsWith('.png') || p.endsWith('.gif') || p.endsWith('.webp')) return 'image'
    return 'unknown'
}

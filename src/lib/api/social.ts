/**
 * src/lib/api/social.ts
 * Typed API client for social/stories endpoints.
 */
import { apiGet, apiPost } from './_fetch'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StoryComment {
  id: string
  story_id: string
  user_id: string
  content: string
  created_at: string
  author?: { display_name: string; photo_url?: string | null }
  [key: string]: unknown
}

export interface StoryView {
  user_id: string
  viewed_at: string
  [key: string]: unknown
}

export interface StoryCommentsResult {
  ok: boolean
  comments?: StoryComment[]
  data?: unknown[]
  [key: string]: unknown
}

export interface StoryViewsResult {
  ok: boolean
  views?: StoryView[]
  data?: unknown[]
  count?: number
  [key: string]: unknown
}

// ─── Client ───────────────────────────────────────────────────────────────────

export const apiSocial = {
  /** POST mark a story as viewed (fire-and-forget) */
  viewStory: (storyId: string) =>
    apiPost<{ ok: boolean }>('/api/social/stories/view', { storyId }),

  /** POST like/unlike a story */
  likeStory: (storyId: string, like: boolean) =>
    apiPost<{ ok: boolean; liked: boolean }>('/api/social/stories/like', { storyId, like }),

  /** POST delete a story */
  deleteStory: (storyId: string) =>
    apiPost<{ ok: boolean }>('/api/social/stories/delete', { storyId }),

  /** GET comments for a story */
  getStoryComments: (storyId: string, limit = 200) =>
    apiGet<StoryCommentsResult>(
      `/api/social/stories/comments?storyId=${encodeURIComponent(storyId)}&limit=${limit}`
    ),

  /** POST add a comment to a story */
  addStoryComment: (storyId: string, body: string) =>
    apiPost<{ ok: boolean; data?: StoryComment }>('/api/social/stories/comments', {
      storyId,
      body,
    }),

  /** GET views for a story */
  getStoryViews: (storyId: string) =>
    apiGet<StoryViewsResult>(`/api/social/stories/views?storyId=${encodeURIComponent(storyId)}`),
}

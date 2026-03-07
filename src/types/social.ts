import { z } from 'zod'

// ─── Zod Validation Schemas (API layer) ─────────────────────────────────────

export const StoryCreateSchema = z.object({
  caption: z.string().max(500).nullable().optional(),
  media_url: z.string().url('URL de mídia inválida').nullable().optional(),
  media_kind: z.enum(['image', 'video']).optional(),
})
export type StoryCreate = z.infer<typeof StoryCreateSchema>

export const StoryCommentSchema = z.object({
  story_id: z.string().uuid('story_id inválido'),
  text: z.string().min(1, 'Comentário não pode ser vazio').max(1000),
})
export type StoryComment = z.infer<typeof StoryCommentSchema>

export const FollowRequestSchema = z.object({
  target_user_id: z.string().uuid('target_user_id inválido'),
})
export type FollowRequest = z.infer<typeof FollowRequestSchema>

export const FollowRespondSchema = z.object({
  follow_id: z.string().uuid('follow_id inválido'),
  action: z.enum(['accept', 'reject']),
})
export type FollowRespond = z.infer<typeof FollowRespondSchema>

export const DirectMessageSchema = z.object({
  channel_id: z.string().min(1, 'channel_id obrigatório'),
  text: z.string().min(1, 'Mensagem não pode ser vazia').max(2000),
})
export type DirectMessage = z.infer<typeof DirectMessageSchema>

export const ChatMessagesQuerySchema = z.object({
  channel_id: z.string().min(1, 'channel_id obrigatório'),
  limit: z.coerce.number().int().min(1).max(500).default(200),
})
export type ChatMessagesQuery = z.infer<typeof ChatMessagesQuerySchema>

// ─── Domain Types (component layer) ─────────────────────────────────────────

export type SocialFollowStatus = 'pending' | 'accepted'

export type SocialNotificationType =
  | 'follow_request'
  | 'follow_accepted'
  | 'friend_online'
  | 'friend_pr'
  | 'friend_streak'
  | 'friend_goal'
  | 'workout_start'
  | 'workout_finish'
  | 'workout_create'
  | 'workout_edit'
  | 'broadcast'
  | 'invite'
  | 'message'
  | 'info'

export type SocialFollow = {
  follower_id: string
  following_id: string
  status: SocialFollowStatus
  created_at: string
}

export type AppNotification = {
  id: string
  created_at: string
  user_id: string
  title: string
  message: string
  type: SocialNotificationType | string
  read: boolean
  recipient_id?: string
  sender_id?: string | null
  metadata?: Record<string, unknown> | null
  is_read?: boolean
}

export type Story = {
  id: string
  createdAt: string
  expiresAt: string
  caption: string | null
  mediaUrl: string | null
  mediaKind?: 'image' | 'video'
  viewed: boolean
  likeCount: number
  hasLiked: boolean
  commentCount: number
}

export type StoryGroup = {
  authorId: string
  displayName: string | null
  photoUrl: string | null
  role: string | null
  hasStories?: boolean
  hasUnseen?: boolean
  stories: Story[]
}

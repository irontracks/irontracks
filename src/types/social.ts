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
  metadata?: Record<string, any> | null
  is_read?: boolean
}

export type Story = {
  id: string
  createdAt: string
  expiresAt: string
  caption: string | null
  mediaUrl: string | null
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

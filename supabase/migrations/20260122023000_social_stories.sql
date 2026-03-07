CREATE TABLE IF NOT EXISTS public.social_stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  media_path text NOT NULL,
  caption text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  is_deleted boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS social_stories_author_created_idx ON public.social_stories(author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS social_stories_expires_idx ON public.social_stories(expires_at DESC);

CREATE TABLE IF NOT EXISTS public.social_story_views (
  story_id uuid NOT NULL REFERENCES public.social_stories(id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, viewer_id)
);

CREATE INDEX IF NOT EXISTS social_story_views_viewer_idx ON public.social_story_views(viewer_id, viewed_at DESC);

CREATE TABLE IF NOT EXISTS public.social_story_likes (
  story_id uuid NOT NULL REFERENCES public.social_stories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, user_id)
);

CREATE INDEX IF NOT EXISTS social_story_likes_user_idx ON public.social_story_likes(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.social_story_comments (
  id bigserial PRIMARY KEY,
  story_id uuid NOT NULL REFERENCES public.social_stories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS social_story_comments_story_idx ON public.social_story_comments(story_id, created_at ASC);
CREATE INDEX IF NOT EXISTS social_story_comments_user_idx ON public.social_story_comments(user_id, created_at DESC);

ALTER TABLE public.social_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_story_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_story_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_story_comments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_view_story(viewer uuid, author uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    viewer IS NOT NULL
    AND (
      viewer = author
      OR EXISTS (
        SELECT 1
        FROM public.social_follows f
        WHERE f.follower_id = viewer
          AND f.following_id = author
          AND f.status = 'accepted'::public.social_follow_status
      )
    );
$$;

REVOKE ALL ON FUNCTION public.can_view_story(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_story(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS social_stories_select ON public.social_stories;
CREATE POLICY social_stories_select
ON public.social_stories
FOR SELECT
TO authenticated
USING (
  NOT is_deleted
  AND expires_at > now()
  AND (public.can_view_story(auth.uid(), author_id) OR public.is_admin())
);

DROP POLICY IF EXISTS social_stories_insert ON public.social_stories;
CREATE POLICY social_stories_insert
ON public.social_stories
FOR INSERT
TO authenticated
WITH CHECK (author_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS social_stories_update ON public.social_stories;
CREATE POLICY social_stories_update
ON public.social_stories
FOR UPDATE
TO authenticated
USING (author_id = auth.uid() OR public.is_admin())
WITH CHECK (author_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS social_stories_delete ON public.social_stories;
CREATE POLICY social_stories_delete
ON public.social_stories
FOR DELETE
TO authenticated
USING (author_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS social_story_views_select ON public.social_story_views;
CREATE POLICY social_story_views_select
ON public.social_story_views
FOR SELECT
TO authenticated
USING (viewer_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS social_story_views_insert ON public.social_story_views;
CREATE POLICY social_story_views_insert
ON public.social_story_views
FOR INSERT
TO authenticated
WITH CHECK (
  viewer_id = auth.uid()
  AND (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.social_stories s
      WHERE s.id = story_id
        AND NOT s.is_deleted
        AND s.expires_at > now()
        AND public.can_view_story(auth.uid(), s.author_id)
    )
  )
);

DROP POLICY IF EXISTS social_story_likes_select ON public.social_story_likes;
CREATE POLICY social_story_likes_select
ON public.social_story_likes
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS social_story_likes_insert ON public.social_story_likes;
CREATE POLICY social_story_likes_insert
ON public.social_story_likes
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.social_stories s
      WHERE s.id = story_id
        AND NOT s.is_deleted
        AND s.expires_at > now()
        AND public.can_view_story(auth.uid(), s.author_id)
    )
  )
);

DROP POLICY IF EXISTS social_story_likes_delete ON public.social_story_likes;
CREATE POLICY social_story_likes_delete
ON public.social_story_likes
FOR DELETE
TO authenticated
USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS social_story_comments_select ON public.social_story_comments;
CREATE POLICY social_story_comments_select
ON public.social_story_comments
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.social_stories s
    WHERE s.id = story_id
      AND NOT s.is_deleted
      AND s.expires_at > now()
      AND public.can_view_story(auth.uid(), s.author_id)
  )
);

DROP POLICY IF EXISTS social_story_comments_insert ON public.social_story_comments;
CREATE POLICY social_story_comments_insert
ON public.social_story_comments
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.social_stories s
      WHERE s.id = story_id
        AND NOT s.is_deleted
        AND s.expires_at > now()
        AND public.can_view_story(auth.uid(), s.author_id)
    )
  )
);


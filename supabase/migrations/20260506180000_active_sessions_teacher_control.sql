-- Teacher control columns on active_workout_sessions
-- controlled_by: UUID of the teacher currently controlling this session
-- control_status: 'requested' (teacher sent request, waiting student consent)
--                 'active'    (student accepted, teacher has full control)

ALTER TABLE public.active_workout_sessions
  ADD COLUMN IF NOT EXISTS controlled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS control_status TEXT
    CHECK (control_status IN ('requested', 'active'));

COMMENT ON COLUMN public.active_workout_sessions.controlled_by IS 'Teacher user_id controlling this session; NULL = not controlled';
COMMENT ON COLUMN public.active_workout_sessions.control_status IS 'requested = teacher waiting student consent, active = teacher in full control';

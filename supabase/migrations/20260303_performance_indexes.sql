-- =====================================================
-- IronTracks — Performance Indexes
-- Run these in the Supabase SQL Editor
-- =====================================================

-- 1. Workouts by user + template (used on every app open)
CREATE INDEX IF NOT EXISTS idx_workouts_user_template
ON workouts (user_id, is_template)
WHERE is_template = true;

-- 2. Exercises by workout + order (hydration query)
CREATE INDEX IF NOT EXISTS idx_exercises_workout_order
ON exercises (workout_id, "order");

-- 3. Sets by exercise + set_number (hydration query)
CREATE INDEX IF NOT EXISTS idx_sets_exercise_number
ON sets (exercise_id, set_number);

-- 4. Notifications by user + created_at (notification center)
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
ON notifications (user_id, created_at DESC);

-- 5. (Removed: history table does not exist in current schema)
-- 6. Students by teacher (teacher dashboard)
CREATE INDEX IF NOT EXISTS idx_students_teacher
ON students (teacher_id);

-- 7. Device push tokens by user (push notifications)
CREATE INDEX IF NOT EXISTS idx_device_push_tokens_user
ON device_push_tokens (user_id);

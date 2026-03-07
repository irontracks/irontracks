-- SECURE RLS FOR DEPLOYMENT
-- Replaces the "Public Access" emergency policy with proper role-based access

-- WORKOUTS
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Access" ON workouts;
DROP POLICY IF EXISTS "Teachers can view their own workouts" ON workouts;
DROP POLICY IF EXISTS "Teachers can insert their own workouts" ON workouts;
DROP POLICY IF EXISTS "Teachers can update their own workouts" ON workouts;
DROP POLICY IF EXISTS "Teachers can delete their own workouts" ON workouts;

-- 1. View: Teachers see what they created OR what is assigned to them (if they use the app as athlete too).
--    Students see what is assigned to them.
CREATE POLICY "Workouts Visibility" 
ON workouts FOR SELECT 
USING (auth.uid() = created_by OR auth.uid() = user_id);

-- 2. Insert: Teachers can create for themselves or others. Students usually don't create templates, but might create logs.
--    We allow creation if the user is authenticated.
CREATE POLICY "Workouts Creation" 
ON workouts FOR INSERT 
WITH CHECK (auth.uid() = created_by OR auth.uid() = user_id);

-- 3. Update/Delete: Only the creator or the owner (assignee) can modify.
CREATE POLICY "Workouts Modification" 
ON workouts FOR UPDATE 
USING (auth.uid() = created_by OR auth.uid() = user_id);

CREATE POLICY "Workouts Deletion" 
ON workouts FOR DELETE 
USING (auth.uid() = created_by OR auth.uid() = user_id);


-- STUDENTS
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Access" ON students;
DROP POLICY IF EXISTS "Teachers can view their students" ON students;
DROP POLICY IF EXISTS "Teachers can insert students" ON students;
DROP POLICY IF EXISTS "Teachers can update students" ON students;
DROP POLICY IF EXISTS "Teachers can delete students" ON students;

-- 1. View: Teachers see their students. Students see themselves (if we link user_id).
CREATE POLICY "Students Visibility" 
ON students FOR SELECT 
USING (auth.uid() = teacher_id OR auth.uid() = user_id);

-- 2. Manage: Only teachers manage students.
CREATE POLICY "Students Management" 
ON students FOR ALL 
USING (auth.uid() = teacher_id)
WITH CHECK (auth.uid() = teacher_id);


-- EXERCISES
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Access" ON exercises;
DROP POLICY IF EXISTS "Teachers can view exercises" ON exercises;

-- 1. Access based on parent workout visibility
CREATE POLICY "Exercises Access"
ON exercises FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM workouts
    WHERE workouts.id = exercises.workout_id
    AND (workouts.created_by = auth.uid() OR workouts.user_id = auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM workouts
    WHERE workouts.id = exercises.workout_id
    AND (workouts.created_by = auth.uid() OR workouts.user_id = auth.uid())
  )
);

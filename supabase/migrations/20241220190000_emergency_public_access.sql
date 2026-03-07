-- EMERGENCY: RESET RLS TO PUBLIC FOR DEBUGGING
-- This allows ALL operations for authenticated users (or even anon if not restricted elsewhere, but we usually want auth)
-- Actually user asked for "FOR ALL USING (true)" which is very permissive.

-- WORKOUTS
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;

-- Drop restrictive policies that might be conflicting or confusing (optional but good for clean slate debugging)
DROP POLICY IF EXISTS "Teachers can view their own workouts" ON workouts;
DROP POLICY IF EXISTS "Teachers can insert their own workouts" ON workouts;
DROP POLICY IF EXISTS "Teachers can update their own workouts" ON workouts;
DROP POLICY IF EXISTS "Teachers can delete their own workouts" ON workouts;
DROP POLICY IF EXISTS "Public Access" ON workouts;

CREATE POLICY "Public Access" ON workouts FOR ALL USING (true) WITH CHECK (true);

-- STUDENTS
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Teachers can view their students" ON students;
DROP POLICY IF EXISTS "Teachers can insert students" ON students;
DROP POLICY IF EXISTS "Teachers can update students" ON students;
DROP POLICY IF EXISTS "Teachers can delete students" ON students;
DROP POLICY IF EXISTS "Public Access" ON students;

CREATE POLICY "Public Access" ON students FOR ALL USING (true) WITH CHECK (true);

-- EXERCISES (Child table often blocks if parent is visible but child isnt)
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Teachers can view exercises" ON exercises;
DROP POLICY IF EXISTS "Teachers can insert exercises" ON exercises;
DROP POLICY IF EXISTS "Teachers can update exercises" ON exercises;
DROP POLICY IF EXISTS "Teachers can delete exercises" ON exercises;
DROP POLICY IF EXISTS "Public Access" ON exercises;

CREATE POLICY "Public Access" ON exercises FOR ALL USING (true) WITH CHECK (true);

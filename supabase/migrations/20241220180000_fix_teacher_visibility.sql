-- Enable RLS for students and workouts if not already enabled
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;

-- Policy: Teachers can view their own data (workouts created by them)
-- Dropping first to ensure update
DROP POLICY IF EXISTS "Teachers can view their own workouts" ON workouts;
CREATE POLICY "Teachers can view their own workouts" 
ON workouts 
FOR SELECT 
USING (auth.uid() = created_by OR auth.uid() = user_id);

-- Policy: Teachers can insert their own workouts
DROP POLICY IF EXISTS "Teachers can insert their own workouts" ON workouts;
CREATE POLICY "Teachers can insert their own workouts" 
ON workouts 
FOR INSERT 
WITH CHECK (auth.uid() = created_by OR auth.uid() = user_id);

-- Policy: Teachers can update their own workouts
DROP POLICY IF EXISTS "Teachers can update their own workouts" ON workouts;
CREATE POLICY "Teachers can update their own workouts" 
ON workouts 
FOR UPDATE 
USING (auth.uid() = created_by OR auth.uid() = user_id);

-- Policy: Teachers can delete their own workouts
DROP POLICY IF EXISTS "Teachers can delete their own workouts" ON workouts;
CREATE POLICY "Teachers can delete their own workouts" 
ON workouts 
FOR DELETE 
USING (auth.uid() = created_by OR auth.uid() = user_id);


-- Policy: Teachers can view their students
DROP POLICY IF EXISTS "Teachers can view their students" ON students;
CREATE POLICY "Teachers can view their students" 
ON students 
FOR SELECT 
USING (auth.uid() = teacher_id);

-- Policy: Teachers can insert students
DROP POLICY IF EXISTS "Teachers can insert students" ON students;
CREATE POLICY "Teachers can insert students" 
ON students 
FOR INSERT 
WITH CHECK (auth.uid() = teacher_id);

-- Policy: Teachers can update students
DROP POLICY IF EXISTS "Teachers can update students" ON students;
CREATE POLICY "Teachers can update students" 
ON students 
FOR UPDATE 
USING (auth.uid() = teacher_id);

-- Policy: Teachers can delete students
DROP POLICY IF EXISTS "Teachers can delete students" ON students;
CREATE POLICY "Teachers can delete students" 
ON students 
FOR DELETE 
USING (auth.uid() = teacher_id);

-- Policy: Teachers can view/edit exercises linked to their workouts
DROP POLICY IF EXISTS "Teachers can view exercises" ON exercises;
CREATE POLICY "Teachers can view exercises"
ON exercises
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM workouts
    WHERE workouts.id = exercises.workout_id
    AND (workouts.created_by = auth.uid() OR workouts.user_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Teachers can insert exercises" ON exercises;
CREATE POLICY "Teachers can insert exercises"
ON exercises
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM workouts
    WHERE workouts.id = exercises.workout_id
    AND (workouts.created_by = auth.uid() OR workouts.user_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Teachers can update exercises" ON exercises;
CREATE POLICY "Teachers can update exercises"
ON exercises
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM workouts
    WHERE workouts.id = exercises.workout_id
    AND (workouts.created_by = auth.uid() OR workouts.user_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Teachers can delete exercises" ON exercises;
CREATE POLICY "Teachers can delete exercises"
ON exercises
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM workouts
    WHERE workouts.id = exercises.workout_id
    AND (workouts.created_by = auth.uid() OR workouts.user_id = auth.uid())
  )
);

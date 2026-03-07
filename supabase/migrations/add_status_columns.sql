-- Ensure status columns exist for teachers and students
ALTER TABLE IF EXISTS public.teachers ADD COLUMN IF NOT EXISTS status text DEFAULT 'pendente';
ALTER TABLE IF EXISTS public.students ADD COLUMN IF NOT EXISTS status text DEFAULT 'pendente';

-- Optional: create index for quick filtering by status
CREATE INDEX IF NOT EXISTS idx_teachers_status ON public.teachers(status);
CREATE INDEX IF NOT EXISTS idx_students_status ON public.students(status);

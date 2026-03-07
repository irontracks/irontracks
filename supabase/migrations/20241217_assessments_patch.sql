BEGIN;

CREATE TABLE IF NOT EXISTS public.assessments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  trainer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assessment_date date NOT NULL,
  weight numeric(5,2) NOT NULL,
  height numeric(5,2) NOT NULL,
  age integer NOT NULL,
  gender varchar(1) CHECK (gender IN ('M','F')),
  body_fat_percentage numeric(5,2),
  lean_mass numeric(5,2),
  fat_mass numeric(5,2),
  bmr numeric(6,2),
  bmi numeric(4,2),
  observations text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS student_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS trainer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS assessment_date date;
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS weight numeric(5,2);
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS height numeric(5,2);
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS age integer;
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS gender varchar(1);
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS body_fat_percentage numeric(5,2);
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS lean_mass numeric(5,2);
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS fat_mass numeric(5,2);
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS bmr numeric(6,2);
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS bmi numeric(4,2);
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS observations text;
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_assessments_student_id ON public.assessments(student_id);
CREATE INDEX IF NOT EXISTS idx_assessments_date ON public.assessments(assessment_date);

ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Students view own assessments" ON public.assessments
    FOR SELECT USING (auth.uid() = student_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Trainers manage student assessments" ON public.assessments
    FOR ALL USING (trainer_id = auth.uid()) WITH CHECK (trainer_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;


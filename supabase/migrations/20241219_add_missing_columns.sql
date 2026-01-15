-- Add missing columns to assessments table
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS arm_circ DECIMAL(5,2);
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS chest_circ DECIMAL(5,2);
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS waist_circ DECIMAL(5,2);
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS hip_circ DECIMAL(5,2);
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS thigh_circ DECIMAL(5,2);
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS calf_circ DECIMAL(5,2);

ALTER TABLE assessments ADD COLUMN IF NOT EXISTS triceps_skinfold DECIMAL(4,1);
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS biceps_skinfold DECIMAL(4,1);
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS subscapular_skinfold DECIMAL(4,1);
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS suprailiac_skinfold DECIMAL(4,1);
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS abdominal_skinfold DECIMAL(4,1);
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS thigh_skinfold DECIMAL(4,1);
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS calf_skinfold DECIMAL(4,1);

ALTER TABLE assessments ADD COLUMN IF NOT EXISTS tdee DECIMAL(6,2);
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS pdf_url TEXT;

-- Also check for user_id vs student_id confusion.
-- The original migration used student_id. The code might be using user_id.
-- Let's check the code in useAssessment hook.

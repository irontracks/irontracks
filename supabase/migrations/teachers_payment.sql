-- Add payment status tracking for teachers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='teachers' AND column_name='payment_status'
  ) THEN
    ALTER TABLE public.teachers ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'pending';
  END IF;
END $$;


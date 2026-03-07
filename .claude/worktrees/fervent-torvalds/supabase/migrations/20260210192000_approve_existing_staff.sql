-- Garantir que todos os admins e professores atuais já estejam aprovados
UPDATE public.profiles
SET is_approved = true
WHERE role IN ('admin', 'teacher');

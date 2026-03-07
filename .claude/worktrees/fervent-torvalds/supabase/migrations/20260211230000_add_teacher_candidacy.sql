-- Adicionar colunas para candidatura de professor
ALTER TABLE access_requests 
ADD COLUMN IF NOT EXISTS role_requested TEXT DEFAULT 'student',
ADD COLUMN IF NOT EXISTS cref TEXT;

-- Garantir que role_requested seja 'student' ou 'teacher'
ALTER TABLE access_requests 
ADD CONSTRAINT check_role_requested CHECK (role_requested IN ('student', 'teacher'));

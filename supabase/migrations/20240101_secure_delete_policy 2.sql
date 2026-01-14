-- SECURE DELETE POLICY
-- Garante que apenas o DONO do treino (user_id) possa deletá-lo.
-- Isso impede que alunos deletem templates de admins, mesmo que tenham o ID.

ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;

-- Remove policy permissiva antiga se existir
DROP POLICY IF EXISTS "Users can delete their own workouts" ON workouts;
DROP POLICY IF EXISTS "Delete own workouts" ON workouts;

-- Cria policy estrita
CREATE POLICY "Users can delete their own workouts"
ON workouts
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Opcional: Proteger também o UPDATE
CREATE POLICY "Users can update their own workouts"
ON workouts
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

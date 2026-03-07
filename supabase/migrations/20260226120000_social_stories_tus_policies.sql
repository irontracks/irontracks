-- Garante a criação de políticas necessárias para o bucket 'social-stories' funcionar com uploads TUS da Web 

-- Deleta as antigas se existirem (para evitar duplicate name) 
DROP POLICY IF EXISTS "Stories Select" ON storage.objects; 
DROP POLICY IF EXISTS "Stories Insert" ON storage.objects; 
DROP POLICY IF EXISTS "Stories Update" ON storage.objects; 

-- Permite que usuários autenticados vejam arquivos existentes do bucket social-stories 
CREATE POLICY "Stories Select" 
ON storage.objects FOR SELECT 
TO authenticated 
USING ( bucket_id = 'social-stories' ); 

-- Permite que usuários autenticados criem e continuem novos arquivos no bucket social-stories 
CREATE POLICY "Stories Insert" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK ( bucket_id = 'social-stories' ); 

-- Permite que o upload do TUS atualize o arquivo em partes (resumable upload) caso precise 
CREATE POLICY "Stories Update" 
ON storage.objects FOR UPDATE 
TO authenticated 
USING ( bucket_id = 'social-stories' );

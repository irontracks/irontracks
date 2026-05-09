-- Anexo do PDF/foto da bioimpedância.
--
-- O aluno tira o resultado da máquina (geralmente um PDF impresso ou
-- enviado por e-mail). Persistir o URL pra ter o documento original
-- vinculado ao registro — útil pra auditoria, dúvidas posteriores e
-- pra o personal conferir os números digitados batendo com o que a
-- máquina retornou.
--
-- A URL aponta para o Storage bucket 'bioimpedance-files' (criado
-- on-demand pelo endpoint de signed-upload). Coluna nullable, nada
-- quebra para registros antigos.

ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS bia_attachment_url text;

COMMENT ON COLUMN public.assessments.bia_attachment_url IS
  'URL pública (ou path do Storage) do PDF/imagem da bioimpedância anexado pelo usuário. Bucket: bioimpedance-files. Nullable.';

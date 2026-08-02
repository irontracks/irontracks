-- Fecha o vetor MÉDIA-ALTA: o bucket chat-media era PÚBLICO (public=true) e o cliente salvava
-- getPublicUrl no direct_messages.content → a mídia de DMs (pode ser foto corporal/pessoal)
-- ficava em URL pública permanente, sem checagem de participante (só o segredo do UUID do
-- canal protegia). A mídia agora é servida pela rota /api/chat/media (signed URL de
-- service-role + canUploadToChatMediaPath), e o cliente resolve tudo por ela (chatMediaSrc).
-- Uploads seguem via signed upload token (não dependem de leitura pública).
--
-- ⚠️ ORDEM: aplicar SÓ DEPOIS que o cliente (rota + chatMediaSrc) já estiver em produção e
-- verificado — senão a mídia de DMs JÁ ENVIADAS quebra até o novo JS carregar em cada device.
update storage.buckets set public = false where id = 'chat-media';

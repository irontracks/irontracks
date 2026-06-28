-- 2ª auditoria — limpeza do cluster legado users+tracks+sessions (autorizado pelo dono).
--
-- public.users (id,email,name,avatar_url,...), public.tracks (bpm,key,duration,storage_path,...)
-- e public.sessions (tracks_config,...) são leftover de OUTRO app (domínio de DJ/áudio —
-- bpm/key/tracks_config), que ficaram órfãos neste projeto Supabase do IronTracks. Verificado
-- antes do drop: todas VAZIAS (0 linhas), sem FK de entrada além das internas (tracks→users,
-- sessions→users), sem triggers/funções/views que as referenciem, e ZERO referências no código
-- do app (grep .from('users'|'tracks'|'sessions') = vazio).
--
-- Ordem: sessions e tracks primeiro (têm FK -> users), depois users. Sem CASCADE de propósito:
-- se houvesse dependência inesperada, o DROP falharia (seguro) em vez de propagar silenciosamente.
--
-- Rollback: recriar as tabelas (definições perdidas — eram vazias, sem perda de dados).

DROP TABLE IF EXISTS public.sessions;
DROP TABLE IF EXISTS public.tracks;
DROP TABLE IF EXISTS public.users;
